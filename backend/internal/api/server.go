package api

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/catalog"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/nws"
)

type AlertReader interface {
	ActiveAlerts(context.Context) (nws.Snapshot, error)
}

type Config struct {
	Alerts         AlertReader
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

func writeJSON(writer http.ResponseWriter, status int, value any) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(status)
	if err := json.NewEncoder(writer).Encode(value); err != nil {
		slog.Error("write JSON response", "status", status, "error", fmt.Errorf("%w", err))
	}
}
