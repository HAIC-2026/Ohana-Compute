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
	"github.com/chokevin/hawaii-resilience-map/backend/internal/collaboration"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/community"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/cphc"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/eventtriggers"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/groundedplanning"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/hans"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/identity"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/nws"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/official"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/operationalstatus"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/partnermatching"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/planningareas"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/ptwc"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/resourcedemand"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/shelterplans"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/transportation"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/usgs"
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
	identityConfig, err := identityConfigFromEnvironment()
	if err != nil {
		logger.Error("invalid identity configuration", "error", err)
		os.Exit(1)
	}
	identityService, err := identity.NewService(identityConfig, nil)
	if err != nil {
		logger.Error("initialize identity boundary", "error", err)
		os.Exit(1)
	}
	collaborationStore, err := collaborationStoreFromEnvironment()
	if err != nil {
		logger.Error("invalid collaboration persistence configuration", "error", err)
		os.Exit(1)
	}
	if collaborationStore != nil {
		defer collaborationStore.Close()
	}
	groundedPlanningProvider, err := groundedPlanningProviderFromEnvironment()
	if err != nil {
		logger.Error("invalid grounded planning configuration", "error", err)
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
	comCatEvents := usgs.NewClient(usgs.Config{
		HTTPClient: &http.Client{Timeout: 10 * time.Second},
	})
	hansProducts := hans.NewClient(nil)
	eventTriggerService := eventtriggers.NewService(eventtriggers.Config{
		NWS: alerts, PTWC: tsunamiProducts, ComCat: comCatEvents, HANS: hansProducts,
	})
	operationalStatusService := operationalstatus.NewService(operationalstatus.Config{
		Shelters: officialSources,
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
		Alerts:            alerts,
		Cyclones:          cyclones,
		TsunamiProducts:   tsunamiProducts,
		Official:          officialSources,
		Community:         communitySources,
		Transportation:    transportationSources,
		ShelterPlans:      shelterPlanCatalog,
		PlanningAreas:     planningAreaCatalog,
		ResourceDemand:    resourceDemandCalculator,
		PartnerMatching:   partnerMatcher,
		EventTriggers:     eventTriggerService,
		OperationalStatus: operationalStatusService,
		Identity:          identityService,
		Collaboration:     collaborationStore,
		GroundedPlanning: groundedplanning.NewService(groundedplanning.Config{
			Provider: groundedPlanningProvider,
			Store:    collaborationStore,
		}),
		AllowedOrigins: allowedOrigins,
		Logger:         logger,
		Registry:       registry,
		TelemetryRate:  telemetryRate,
	})
	httpServer := &http.Server{
		Addr:              ":" + port,
		Handler:           apiServer.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      35 * time.Second,
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

func groundedPlanningProviderFromEnvironment() (
	groundedplanning.Provider,
	error,
) {
	mode := strings.TrimSpace(os.Getenv("GROUNDED_AI_MODE"))
	settingNames := []string{
		"GROUNDED_AI_ENDPOINT",
		"GROUNDED_AI_ALLOWED_ENDPOINTS",
		"GROUNDED_AI_MODEL",
		"GROUNDED_AI_ALLOWED_MODELS",
		"GROUNDED_AI_API_KEY",
		"GROUNDED_AI_API_KEY_FILE",
		"GROUNDED_AI_TIMEOUT",
		"GROUNDED_AI_MAX_OUTPUT_TOKENS",
	}
	if mode == "" || mode == "disabled" {
		for _, name := range settingNames {
			if strings.TrimSpace(os.Getenv(name)) != "" {
				return nil, fmt.Errorf("%s requires GROUNDED_AI_MODE=openai-compatible", name)
			}
		}
		return nil, nil
	}
	if mode != "openai-compatible" {
		return nil, fmt.Errorf("unsupported GROUNDED_AI_MODE %q", mode)
	}
	apiKey, err := secretFromEnvironmentOrFile(
		"GROUNDED_AI_API_KEY",
		"GROUNDED_AI_API_KEY_FILE",
	)
	if err != nil {
		return nil, err
	}
	timeout, err := requiredDuration("GROUNDED_AI_TIMEOUT")
	if err != nil {
		return nil, err
	}
	maxOutputTokens, err := requiredPositiveInt(
		"GROUNDED_AI_MAX_OUTPUT_TOKENS",
	)
	if err != nil {
		return nil, err
	}
	return groundedplanning.NewOpenAICompatibleProvider(
		groundedplanning.OpenAICompatibleConfig{
			Endpoint: strings.TrimSpace(os.Getenv("GROUNDED_AI_ENDPOINT")),
			AllowedEndpoints: splitRequiredList(
				os.Getenv("GROUNDED_AI_ALLOWED_ENDPOINTS"),
			),
			Model: strings.TrimSpace(os.Getenv("GROUNDED_AI_MODEL")),
			AllowedModels: splitRequiredList(
				os.Getenv("GROUNDED_AI_ALLOWED_MODELS"),
			),
			APIKey:          apiKey,
			Timeout:         timeout,
			MaxOutputTokens: maxOutputTokens,
		},
	)
}

func requiredDuration(name string) (time.Duration, error) {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return 0, fmt.Errorf("%s is required", name)
	}
	parsed, err := time.ParseDuration(value)
	if err != nil || parsed <= 0 {
		return 0, fmt.Errorf("%s must be a positive duration", name)
	}
	return parsed, nil
}

func requiredPositiveInt(name string) (int, error) {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return 0, fmt.Errorf("%s is required", name)
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed <= 0 {
		return 0, fmt.Errorf("%s must be a positive integer", name)
	}
	return parsed, nil
}

func splitRequiredList(value string) []string {
	result := []string{}
	for _, item := range strings.Split(value, ",") {
		if trimmed := strings.TrimSpace(item); trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}

func collaborationStoreFromEnvironment() (collaboration.Store, error) {
	mode := strings.TrimSpace(os.Getenv("COLLABORATION_PERSISTENCE"))
	if mode == "" || mode == "disabled" {
		if strings.TrimSpace(os.Getenv("COLLABORATION_SQLITE_PATH")) != "" {
			return nil, errors.New(
				"COLLABORATION_SQLITE_PATH requires COLLABORATION_PERSISTENCE=sqlite",
			)
		}
		return nil, nil
	}
	if mode != "sqlite" {
		return nil, fmt.Errorf(
			"unsupported COLLABORATION_PERSISTENCE %q",
			mode,
		)
	}
	path := strings.TrimSpace(os.Getenv("COLLABORATION_SQLITE_PATH"))
	if path == "" {
		return nil, errors.New(
			"COLLABORATION_SQLITE_PATH is required for SQLite persistence",
		)
	}
	return collaboration.OpenSQLite(path)
}

func identityConfigFromEnvironment() (identity.Config, error) {
	config := identity.Config{
		Mode: identity.Mode(strings.TrimSpace(os.Getenv("IDENTITY_MODE"))),
		OIDC: identity.OIDCConfig{
			IssuerURL:  strings.TrimSpace(os.Getenv("OIDC_ISSUER_URL")),
			Audience:   strings.TrimSpace(os.Getenv("OIDC_AUDIENCE")),
			ClientID:   strings.TrimSpace(os.Getenv("OIDC_CLIENT_ID")),
			RolesClaim: strings.TrimSpace(os.Getenv("OIDC_ROLES_CLAIM")),
		},
	}
	if err := config.Validate(); err != nil {
		return identity.Config{}, err
	}
	return config, nil
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
