package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/api"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/arcgis"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/census"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/community"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/cphc"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/nws"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/official"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/partnermatching"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/planningareas"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/ptwc"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/resourcedemand"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/shelterplans"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/transportation"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	censusAPIKey, err := secretFromEnvironmentOrFile(
		"CENSUS_API_KEY",
		"CENSUS_API_KEY_FILE",
	)
	if err != nil {
		logger.Error("failed to load Census API key", "error", err)
		os.Exit(1)
	}

	port := envOrDefault("PORT", "8080")
	allowedOrigins := strings.Split(
		envOrDefault(
			"ALLOWED_ORIGINS",
			"http://127.0.0.1:3000,http://localhost:3000",
		),
		",",
	)
	cacheTTL := durationOrDefault("NWS_CACHE_TTL", 5*time.Minute, logger)
	telemetryRate := positiveIntOrDefault(
		"TELEMETRY_RATE_LIMIT_PER_MINUTE",
		1200,
		logger,
	)

	alerts := nws.NewClient(nws.Config{
		HTTPClient: &http.Client{Timeout: 10 * time.Second},
		CacheTTL:   cacheTTL,
	})
	arcGISClient := arcgis.NewClient(arcgis.Config{
		HTTPClient: &http.Client{Timeout: 12 * time.Second},
	})
	officialSources := official.NewClient(arcGISClient)
	communitySources := community.NewClient(
		arcGISClient,
		census.NewClient(census.Config{
			HTTPClient: &http.Client{Timeout: 12 * time.Second},
			APIKey:     censusAPIKey,
		}),
	)
	cyclones := cphc.NewClient(cphc.Config{
		HTTPClient: &http.Client{Timeout: 10 * time.Second},
	})
	tsunamiProducts := ptwc.NewClient(ptwc.Config{
		HTTPClient: &http.Client{Timeout: 10 * time.Second},
	})
	transportationSources := transportation.NewClient(
		arcGISClient,
		transportation.Config{},
	)
	shelterPlanCatalog := shelterplans.NewCatalog()
	planningAreaCatalog := planningareas.NewCatalog()
	resourceDemandCalculator := resourcedemand.NewCalculator()
	partnerMatcher := partnermatching.NewMatcher()
	registry := prometheus.NewRegistry()
	registry.MustRegister(
		collectors.NewGoCollector(),
		collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}),
	)
	apiServer := api.NewServer(api.Config{
		Alerts:          alerts,
		Cyclones:        cyclones,
		TsunamiProducts: tsunamiProducts,
		Official:        officialSources,
		Community:       communitySources,
		Transportation:  transportationSources,
		ShelterPlans:    shelterPlanCatalog,
		PlanningAreas:   planningAreaCatalog,
		ResourceDemand:  resourceDemandCalculator,
		PartnerMatching: partnerMatcher,
		AllowedOrigins:  allowedOrigins,
		Logger:          logger,
		Registry:        registry,
		TelemetryRate:   telemetryRate,
	})
	httpServer := &http.Server{
		Addr:              ":" + port,
		Handler:           apiServer.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    1 << 20,
	}

	shutdownContext, stop := signal.NotifyContext(
		context.Background(),
		os.Interrupt,
		syscall.SIGTERM,
	)
	defer stop()

	go func() {
		<-shutdownContext.Done()
		context, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := httpServer.Shutdown(context); err != nil {
			logger.Error("graceful shutdown failed", "error", err)
		}
	}()

	logger.Info("backend listening", "address", httpServer.Addr)
	if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		logger.Error("backend stopped unexpectedly", "error", err)
		os.Exit(1)
	}
}

func envOrDefault(name string, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(name)); value != "" {
		return value
	}
	return fallback
}

func secretFromEnvironmentOrFile(environmentName string, fileEnvironmentName string) (string, error) {
	if value := strings.TrimSpace(os.Getenv(environmentName)); value != "" {
		return value, nil
	}

	path := strings.TrimSpace(os.Getenv(fileEnvironmentName))
	if path == "" {
		return "", nil
	}

	value, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("read %s: %w", fileEnvironmentName, err)
	}
	return strings.TrimSpace(string(value)), nil
}

func durationOrDefault(name string, fallback time.Duration, logger *slog.Logger) time.Duration {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return fallback
	}
	duration, err := time.ParseDuration(value)
	if err != nil || duration <= 0 {
		logger.Warn(
			"invalid duration environment variable; using default",
			"name", name,
			"value", value,
			"default", fallback,
		)
		return fallback
	}
	return duration
}

func positiveIntOrDefault(name string, fallback int, logger *slog.Logger) int {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed <= 0 {
		logger.Warn(
			"invalid integer environment variable; using default",
			"name", name,
			"value", value,
			"default", fallback,
		)
		return fallback
	}
	return parsed
}
