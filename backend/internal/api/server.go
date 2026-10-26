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
	"github.com/chokevin/hawaii-resilience-map/backend/internal/census"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/community"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/cphc"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/nws"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/official"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/ptwc"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/transportation"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

type AlertReader interface {
	ActiveAlerts(context.Context) (nws.Snapshot, error)
}

type CycloneReader interface {
	ActiveCyclones(context.Context) (cphc.Snapshot, error)
}

type TsunamiProductReader interface {
	LatestProduct(context.Context) (ptwc.Snapshot, error)
}

type OfficialReader interface {
	TsunamiRisk(context.Context, float64, float64) (official.TsunamiRisk, error)
	FloodRisk(context.Context, float64, float64) (official.FloodRisk, error)
	WildfireRisk(context.Context, float64, float64) (official.WildfireRisk, error)
	OpenShelters(context.Context, float64, float64) (official.OpenShelters, error)
}

type CommunityReader interface {
	ACS(context.Context, float64, float64) (census.Profile, error)
	SVI(context.Context, float64, float64) (community.SVI, error)
	EmPOWER(context.Context, float64, float64) (community.EmPOWER, error)
	NationalRisk(context.Context, float64, float64) (community.NationalRisk, error)
	Profile(context.Context, float64, float64) (community.Profile, error)
}

type TransportationReader interface {
	PlannedClosures(context.Context, float64, float64) (transportation.Snapshot, error)
}

type Config struct {
	Alerts          AlertReader
	Cyclones        CycloneReader
	TsunamiProducts TsunamiProductReader
	Official        OfficialReader
	Community       CommunityReader
	Transportation  TransportationReader
	AllowedOrigins  []string
	Logger          *slog.Logger
	Registry        *prometheus.Registry
	TelemetryRate   int
}

type Server struct {
	handler http.Handler
}

func NewServer(config Config) *Server {
	if config.Alerts == nil {
		panic("api: Alerts is required")
	}
	if config.Cyclones == nil {
		panic("api: Cyclones is required")
	}
	if config.TsunamiProducts == nil {
		panic("api: TsunamiProducts is required")
	}
	if config.Official == nil {
		panic("api: Official is required")
	}
	if config.Community == nil {
		panic("api: Community is required")
	}
	if config.Transportation == nil {
		panic("api: Transportation is required")
	}
	logger := config.Logger
	if logger == nil {
		logger = slog.Default()
	}
	registry := config.Registry
	if registry == nil {
		registry = prometheus.NewRegistry()
	}
	metrics := newMetrics(registry)
	telemetryLimiter := newTelemetryRateLimiter(config.TelemetryRate, time.Minute)

	mux := http.NewServeMux()
	mux.Handle("GET /metrics", promhttp.HandlerFor(registry, promhttp.HandlerOpts{}))
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
	mux.HandleFunc("GET /api/v1/events/hurricanes", feedHandler(
		logger,
		"nhc-cphc-gis",
		config.Cyclones.ActiveCyclones,
	))
	mux.HandleFunc("GET /api/v1/events/tsunami", feedHandler(
		logger,
		"ptwc-cap",
		config.TsunamiProducts.LatestProduct,
	))
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
	mux.HandleFunc("GET /api/v1/community/acs", coordinateHandler(
		logger,
		"acs-5-year",
		config.Community.ACS,
	))
	mux.HandleFunc("GET /api/v1/community/svi", coordinateHandler(
		logger,
		"cdc-svi-2022",
		config.Community.SVI,
	))
	mux.HandleFunc("GET /api/v1/community/empower", coordinateHandler(
		logger,
		"hhs-empower",
		config.Community.EmPOWER,
	))
	mux.HandleFunc("GET /api/v1/community/fema-risk", coordinateHandler(
		logger,
		"fema-nri",
		config.Community.NationalRisk,
	))
	mux.HandleFunc("GET /api/v1/community/profile", coordinateHandler(
		logger,
		"community-profile",
		config.Community.Profile,
	))
	mux.HandleFunc("GET /api/v1/transportation/planned-closures", coordinateHandler(
		logger,
		"hdot-planned-lane-closures",
		config.Transportation.PlannedClosures,
	))
	mux.HandleFunc(
		"POST /api/v1/telemetry/browser",
		browserTelemetryHandler(metrics, telemetryLimiter),
	)

	handler := requestLogger(
		logger,
		instrumentHTTP(metrics, cors(config.AllowedOrigins, mux)),
	)
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
			writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
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

func feedHandler[T any](
	logger *slog.Logger,
	sourceID string,
	load func(context.Context) (T, error),
) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		result, err := load(request.Context())
		if err != nil {
			logger.Error("load live feed", "source", sourceID, "error", err)
			writeJSON(writer, http.StatusBadGateway, map[string]string{
				"error":  "live source unavailable",
				"source": sourceID,
				"detail": err.Error(),
			})
			return
		}
		writeJSON(writer, http.StatusOK, result)
	}
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
