package api

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"math"
	"mime"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/chokevin/hawaii-resilience-map/backend/internal/catalog"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/census"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/collaboration"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/community"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/cphc"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/eventtriggers"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/geoapplicability"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/groundedplanning"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/identity"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/nws"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/official"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/operationalstatus"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/partnermatching"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/planningareas"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/ptwc"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/resourcedemand"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/shelterplans"
	"github.com/chokevin/hawaii-resilience-map/backend/internal/staffidentity"
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

type AFNLayerReader interface {
	AFNLayer(context.Context, string) (community.AFNLayer, error)
}

type TransportationReader interface {
	PlannedClosures(context.Context, float64, float64) (transportation.Snapshot, error)
}

type ShelterPlanReader interface {
	Snapshot(context.Context) (shelterplans.Snapshot, error)
}

type PlanningAreaReader interface {
	Snapshot(context.Context) (planningareas.Snapshot, error)
}

type ResourceDemandCalculator interface {
	Calculate(context.Context, resourcedemand.Request) (resourcedemand.Response, error)
}

type PartnerMatcher interface {
	Match(context.Context, partnermatching.Query) (partnermatching.Response, error)
}

type EventTriggerReader interface {
	Snapshot(context.Context) (eventtriggers.Snapshot, error)
}

type ZoneApplicabilityReader interface {
	EvaluateZones(
		[]nws.Zone,
		*string,
		geoapplicability.Point,
	) nws.ZoneApplicability
}

type OperationalStatusReader interface {
	Snapshot(context.Context, float64, float64) (operationalstatus.Snapshot, error)
}

type Config struct {
	Alerts            AlertReader
	Cyclones          CycloneReader
	TsunamiProducts   TsunamiProductReader
	Official          OfficialReader
	Community         CommunityReader
	AFNLayer          AFNLayerReader
	Transportation    TransportationReader
	ShelterPlans      ShelterPlanReader
	PlanningAreas     PlanningAreaReader
	ResourceDemand    ResourceDemandCalculator
	PartnerMatching   PartnerMatcher
	EventTriggers     EventTriggerReader
	ZoneApplicability ZoneApplicabilityReader
	OperationalStatus OperationalStatusReader
	Identity          identity.Authenticator
	Collaboration     collaboration.Store
	Staff             *staffidentity.Service
	GroundedPlanning  *groundedplanning.Service
	AllowedOrigins    []string
	Logger            *slog.Logger
	Registry          *prometheus.Registry
	TelemetryRate     int
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
	if config.AFNLayer == nil {
		config.AFNLayer, _ = config.Community.(AFNLayerReader)
	}
	if config.Transportation == nil {
		panic("api: Transportation is required")
	}
	if config.ShelterPlans == nil {
		defaultCatalog := shelterplans.NewCatalog()
		config.ShelterPlans = defaultCatalog
	}
	if config.PlanningAreas == nil {
		defaultCatalog := planningareas.NewCatalog()
		config.PlanningAreas = defaultCatalog
	}
	if config.ResourceDemand == nil {
		defaultCalculator := resourcedemand.NewCalculator()
		config.ResourceDemand = defaultCalculator
	}
	if config.PartnerMatching == nil {
		defaultMatcher := partnermatching.NewMatcher()
		config.PartnerMatching = defaultMatcher
	}
	if config.EventTriggers == nil {
		config.EventTriggers = unavailableEventTriggerReader{}
	}
	if config.OperationalStatus == nil {
		config.OperationalStatus = unavailableOperationalStatusReader{}
	}
	if config.Identity == nil {
		var err error
		config.Identity, err = identity.NewService(identity.Config{}, nil)
		if err != nil {
			panic("api: create disabled identity service: " + err.Error())
		}
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
	sourceHealth := newSourceHealth()
	mux.Handle("GET /api/v1/sources/health", sourceHealth)
	mux.Handle("GET /metrics", promhttp.HandlerFor(registry, promhttp.HandlerOpts{}))
	mux.HandleFunc("GET /healthz", func(writer http.ResponseWriter, request *http.Request) {
		writeJSON(writer, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.Handle(
		"GET /api/v1/identity/session",
		identity.SessionHandler(config.Identity),
	)
	registerCollaborationRoutes(
		mux,
		config.Collaboration,
		config.Identity,
		logger,
		metrics,
	)
	var operations OperationsStore
	if config.Collaboration != nil {
		operations, _ = config.Collaboration.(OperationsStore)
		if reader, ok := config.Collaboration.(operationsMetricReader); ok {
			registry.MustRegister(newOperationsCollector(reader))
		}
	}
	var staff operationsIdentity
	if config.Staff != nil {
		config.Staff.Register(mux)
		staff = config.Staff
	} else {
		mux.HandleFunc("GET /api/v1/staff/session", func(w http.ResponseWriter, r *http.Request) {
			writeSensitiveJSON(w, http.StatusOK, map[string]bool{"enabled": false, "authenticated": false})
		})
	}
	registerOperationsRoutes(mux, operations, staff, logger)
	if config.GroundedPlanning == nil {
		config.GroundedPlanning = groundedplanning.NewService(
			groundedplanning.Config{Store: config.Collaboration},
		)
	}
	registerGroundedPlanningRoutes(
		mux,
		config.GroundedPlanning,
		config.Identity,
		logger,
		metrics,
	)
	mux.Handle(
		"POST /api/v1/identity/authorization-check",
		identity.RequireCapability(
			config.Identity,
			identity.CapabilityCollaborationWrite,
			metrics.observeIdentityAuthorization,
		)(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
			writer.Header().Set("Cache-Control", "no-store")
			writer.WriteHeader(http.StatusNoContent)
		})),
	)
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
			writeAPIError(
				writer,
				http.StatusBadGateway,
				"active event source unavailable",
				"nws-hi-alerts",
			)
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
	mux.HandleFunc("GET /api/v1/shelter-plans", feedHandler(
		logger,
		"county-shelter-plans",
		config.ShelterPlans.Snapshot,
	))
	mux.HandleFunc("GET /api/v1/planning-areas", feedHandler(
		logger,
		"statewide-planning-areas",
		config.PlanningAreas.Snapshot,
	))
	mux.HandleFunc(
		"POST /api/v1/planning/resource-demand",
		resourceDemandHandler(logger, config.ResourceDemand),
	)
	mux.HandleFunc(
		"GET /api/v1/planning/partner-matches",
		partnerMatchHandler(logger, config.PartnerMatching),
	)
	mux.HandleFunc(
		"GET /api/v1/planning/event-triggers",
		eventTriggerHandler(logger, metrics, config.EventTriggers),
	)
	mux.HandleFunc(
		"GET /api/v1/planning/live-status",
		operationalStatusHandler(logger, metrics, config.OperationalStatus),
	)
	mux.HandleFunc(
		"GET /api/v1/lifecycle/evidence",
		lifecycleEvidenceHandler(
			logger,
			metrics,
			config.EventTriggers,
			config.OperationalStatus,
			time.Now,
			config.ZoneApplicability,
		),
	)
	mux.HandleFunc("GET /api/v1/community/acs", coordinateHandler(
		logger,
		"acs-5-year",
		config.Community.ACS,
	))
	mux.HandleFunc("GET /api/v1/community/afn-layer", afnLayerHandler(logger, metrics, config.AFNLayer))
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
	mux.HandleFunc("GET /api/v1/community/profile", communityProfileHandler(
		logger,
		metrics,
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
		instrumentHTTP(metrics, cors(config.AllowedOrigins, sourceHealth.observeRequests(mux))),
	)
	return &Server{handler: handler}
}

type unavailableEventTriggerReader struct{}

func (unavailableEventTriggerReader) Snapshot(
	context.Context,
) (eventtriggers.Snapshot, error) {
	return eventtriggers.Snapshot{}, eventtriggers.ErrNoOperationalSources
}

type unavailableOperationalStatusReader struct{}

func (unavailableOperationalStatusReader) Snapshot(
	context.Context,
	float64,
	float64,
) (operationalstatus.Snapshot, error) {
	return operationalstatus.Snapshot{}, operationalstatus.ErrInvalidSnapshot
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
			writer.Header().Set(
				"Access-Control-Allow-Headers",
				"Authorization, Content-Type, If-None-Match",
			)
			writer.Header().Set("Access-Control-Expose-Headers", "ETag")
			writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
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
			"route", boundedRoute(request.Pattern),
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
			writeAPIError(
				writer,
				http.StatusBadGateway,
				"live source unavailable",
				sourceID,
			)
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
			writeAPIError(
				writer,
				http.StatusBadRequest,
				"invalid coordinates",
				"",
			)
			return
		}

		result, err := load(request.Context(), latitude, longitude)
		if err != nil {
			logger.Error(
				"load official source",
				"source", sourceID,
				"error", err,
			)
			writeAPIError(
				writer,
				http.StatusBadGateway,
				"official source unavailable",
				sourceID,
			)
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

func resourceDemandHandler(
	logger *slog.Logger,
	calculator ResourceDemandCalculator,
) http.HandlerFunc {
	const maxBodyBytes = 64 << 10

	return func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Cache-Control", "no-store")
		mediaType, _, err := mime.ParseMediaType(
			request.Header.Get("Content-Type"),
		)
		if err != nil || mediaType != "application/json" {
			writeAPIError(
				writer,
				http.StatusUnsupportedMediaType,
				"Content-Type must be application/json",
				"",
			)
			return
		}

		request.Body = http.MaxBytesReader(writer, request.Body, maxBodyBytes)
		decoder := json.NewDecoder(request.Body)
		decoder.DisallowUnknownFields()
		var input resourcedemand.Request
		if err := decoder.Decode(&input); err != nil {
			var maxBytesError *http.MaxBytesError
			if errors.As(err, &maxBytesError) {
				writeAPIError(
					writer,
					http.StatusRequestEntityTooLarge,
					"resource demand request is too large",
					"",
				)
				return
			}
			writeAPIError(
				writer,
				http.StatusBadRequest,
				"invalid resource demand request",
				"",
			)
			return
		}
		if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
			writeAPIError(
				writer,
				http.StatusBadRequest,
				"resource demand request must contain one JSON object",
				"",
			)
			return
		}
		if err := resourcedemand.Validate(input); err != nil {
			writeAPIError(
				writer,
				http.StatusBadRequest,
				"invalid resource demand request",
				"",
			)
			return
		}

		response, err := calculator.Calculate(request.Context(), input)
		if err != nil {
			logger.Error("calculate resource demand", "error", err)
			writeAPIError(
				writer,
				http.StatusBadGateway,
				"resource demand model unavailable",
				"",
			)
			return
		}
		writeJSON(writer, http.StatusOK, response)
	}
}

func decodeJSONWithLimit(
	writer http.ResponseWriter,
	request *http.Request,
	target any,
	maxBodyBytes int64,
	requestName string,
) bool {
	mediaType, _, err := mime.ParseMediaType(request.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		writeAPIError(
			writer,
			http.StatusUnsupportedMediaType,
			"Content-Type must be application/json",
			"",
		)
		return false
	}
	request.Body = http.MaxBytesReader(writer, request.Body, maxBodyBytes)
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		var maxBytesError *http.MaxBytesError
		if errors.As(err, &maxBytesError) {
			writeAPIError(
				writer,
				http.StatusRequestEntityTooLarge,
				requestName+" is too large",
				"",
			)
			return false
		}
		writeAPIError(
			writer,
			http.StatusBadRequest,
			"invalid "+requestName,
			"",
		)
		return false
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		writeAPIError(
			writer,
			http.StatusBadRequest,
			requestName+" must contain one JSON object",
			"",
		)
		return false
	}
	return true
}

func partnerMatchHandler(
	logger *slog.Logger,
	matcher PartnerMatcher,
) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Cache-Control", "no-store")
		values := request.URL.Query()
		for key := range values {
			if key != "jurisdiction" && key != "capability" {
				writeAPIError(
					writer,
					http.StatusBadRequest,
					"invalid partner match query",
					"",
				)
				return
			}
		}
		jurisdictions := values["jurisdiction"]
		query := partnermatching.Query{
			Capabilities: values["capability"],
		}
		if len(jurisdictions) == 1 {
			query.JurisdictionID = jurisdictions[0]
		}
		if len(jurisdictions) != 1 || partnermatching.Validate(query) != nil {
			writeAPIError(
				writer,
				http.StatusBadRequest,
				"invalid partner match query",
				"",
			)
			return
		}

		response, err := matcher.Match(request.Context(), query)
		if err != nil {
			logger.Error("match response partners", "error", err)
			writeAPIError(
				writer,
				http.StatusBadGateway,
				"partner matching unavailable",
				"",
			)
			return
		}
		writeJSON(writer, http.StatusOK, response)
	}
}

func writeJSON(writer http.ResponseWriter, status int, value any) {
	if observer, ok := writer.(*healthWriter); ok {
		observer.observe(status, value)
	}
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(status)
	if err := json.NewEncoder(writer).Encode(value); err != nil {
		slog.Error("write JSON response", "status", status, "error", err)
	}
}

func writeAPIError(
	writer http.ResponseWriter,
	status int,
	message string,
	source string,
) {
	writer.Header().Set("Cache-Control", "no-store")
	payload := map[string]string{"error": message}
	if source != "" {
		payload["source"] = source
	}
	writeJSON(writer, status, payload)
}
