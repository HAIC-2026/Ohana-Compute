package api

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/catalog"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/nws"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/official"
)

type AlertReader interface {
	ActiveAlerts(context.Context) (nws.Snapshot, error)
}

type OfficialReader interface {
	TsunamiRisk(context.Context, float64, float64) (official.TsunamiRisk, error)
	FloodRisk(context.Context, float64, float64) (official.FloodRisk, error)
	WildfireRisk(context.Context, float64, float64) (official.WildfireRisk, error)
	OpenShelters(context.Context, float64, float64) (official.OpenShelters, error)
}

type Config struct {
	Alerts         AlertReader
	Official       OfficialReader
	AllowedOrigins []string
	Logger         *slog.Logger
}

type Server struct {
	handler http.Handler
}

func NewServer(config Config) *Server {
	if config.Alerts == nil {
		panic("api: Alerts is required")
	}
	if config.Official == nil {
		panic("api: Official is required")
	}
	logger := config.Logger
	if logger == nil {
		logger = slog.Default()
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(writer http.ResponseWriter, request *http.Request) {
		writeJSON(writer, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /api/v1/sources", func(writer http.ResponseWriter, request *http.Request) {
		writeJSON(writer, http.StatusOK, map[string]any{
			"sources":      catalog.All(),
			"generated_at": time.Now().UTC(),
		})
	})
	mux.HandleFunc("GET /api/v1/events", func(writer http.ResponseWriter, request *http.Request) {
		snapshot, err := config.Alerts.ActiveAlerts(request.Context())
		if err != nil {
			logger.Error("load active events", "error", err)
			writeJSON(writer, http.StatusBadGateway, map[string]any{
				"error":  "active event source unavailable",
				"source": "nws-hi-alerts",
				"detail": err.Error(),
			})
			return
		}
		writeJSON(writer, http.StatusOK, snapshot)
	})
	mux.HandleFunc("GET /api/v1/risk/tsunami", coordinateHandler(
		logger,
		"state-tsunami-zones",
		config.Official.TsunamiRisk,
	))
	mux.HandleFunc("GET /api/v1/risk/flood", coordinateHandler(
		logger,
		"state-dfirm",
		config.Official.FloodRisk,
	))
	mux.HandleFunc("GET /api/v1/risk/wildfire", coordinateHandler(
		logger,
		"state-fire-risk",
		config.Official.WildfireRisk,
	))
	mux.HandleFunc("GET /api/v1/shelters/open", coordinateHandler(
		logger,
		"fema-open-shelters",
		config.Official.OpenShelters,
	))

	handler := requestLogger(logger, cors(config.AllowedOrigins, mux))
	return &Server{handler: handler}
}

func (server *Server) Handler() http.Handler {
	return server.handler
}

func cors(allowedOrigins []string, next http.Handler) http.Handler {
	allowed := make(map[string]struct{}, len(allowedOrigins))
	for _, origin := range allowedOrigins {
		trimmed := strings.TrimSpace(origin)
		if trimmed != "" {
			allowed[trimmed] = struct{}{}
		}
	}

	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		origin := request.Header.Get("Origin")
		if _, ok := allowed[origin]; ok {
			writer.Header().Set("Access-Control-Allow-Origin", origin)
			writer.Header().Set("Vary", "Origin")
			writer.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			writer.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		}
		if request.Method == http.MethodOptions {
			writer.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(writer, request)
	})
}

func requestLogger(logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		started := time.Now()
		next.ServeHTTP(writer, request)
		logger.Info(
			"http request",
			"method", request.Method,
			"path", request.URL.Path,
			"duration", time.Since(started),
		)
	})
}

func coordinateHandler[T any](
	logger *slog.Logger,
	sourceID string,
	load func(context.Context, float64, float64) (T, error),
) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		latitude, longitude, err := parseCoordinates(request)
		if err != nil {
			writeJSON(writer, http.StatusBadRequest, map[string]string{
				"error":  "invalid coordinates",
				"detail": err.Error(),
			})
			return
		}

		result, err := load(request.Context(), latitude, longitude)
		if err != nil {
			logger.Error(
				"load official source",
				"source", sourceID,
				"latitude", latitude,
				"longitude", longitude,
				"error", err,
			)
			writeJSON(writer, http.StatusBadGateway, map[string]string{
				"error":  "official source unavailable",
				"source": sourceID,
				"detail": err.Error(),
			})
			return
		}
		writeJSON(writer, http.StatusOK, result)
	}
}

func parseCoordinates(request *http.Request) (float64, float64, error) {
	latitude, err := strconv.ParseFloat(request.URL.Query().Get("lat"), 64)
	if err != nil || math.IsNaN(latitude) || math.IsInf(latitude, 0) {
		return 0, 0, errors.New("lat must be a finite number")
	}
	longitude, err := strconv.ParseFloat(request.URL.Query().Get("lon"), 64)
	if err != nil || math.IsNaN(longitude) || math.IsInf(longitude, 0) {
		return 0, 0, errors.New("lon must be a finite number")
	}
	if latitude < -90 || latitude > 90 {
		return 0, 0, errors.New("lat must be between -90 and 90")
	}
	if longitude < -180 || longitude > 180 {
		return 0, 0, errors.New("lon must be between -180 and 180")
	}
	return latitude, longitude, nil
}

func writeJSON(writer http.ResponseWriter, status int, value any) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(status)
	if err := json.NewEncoder(writer).Encode(value); err != nil {
		slog.Error("write JSON response", "status", status, "error", err)
	}
}
