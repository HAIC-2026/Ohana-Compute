package catalog

import "strings"

type Source struct {
	ID              string   `json:"id"`
	Name            string   `json:"name"`
	Authority       string   `json:"authority"`
	Phase           string   `json:"phase"`
	DataClass       string   `json:"data_class"`
	Access          string   `json:"access"`
	URL             string   `json:"url"`
	UpdateCadence   string   `json:"update_cadence"`
	Integration     string   `json:"integration"`
	Enables         []string `json:"enables"`
	Limitations     []string `json:"limitations"`
	CheckedAt       string   `json:"checked_at,omitempty"`
	Decision        string   `json:"decision,omitempty"`
	MissingArtifact string   `json:"missing_artifact,omitempty"`
	OwningAuthority string   `json:"owning_authority,omitempty"`
}

var sources = []Source{
	{
		ID:            "nws-hi-alerts",
		Name:          "NWS active alerts for Hawaiʻi",
		Authority:     "NOAA National Weather Service",
		Phase:         "P0",
		DataClass:     "live",
		Access:        "GeoJSON/CAP API",
		URL:           "https://api.weather.gov/alerts/active?area=HI",
		UpdateCadence: "Event-driven; backend refreshes at most every five minutes",
		Integration:   "integrated",
		Enables: []string{
			"Current flood, wind, severe-weather, and fire-weather alert context",
			"Alert timing, severity, certainty, urgency, instructions, and affected zones",
		},
		Limitations: []string{
			"Rate limits are not published",
			"Feed silence is not proof that conditions are safe",
			"Forecasts, watches, advisories, warnings, and CAP response types are not legal evacuation orders",
			"An alert alone is not a confirmed road closure",
		},
	},
	{
		ID:            "nhc-cphc-gis",
		Name:          "Central Pacific hurricane advisory GIS",
		Authority:     "NOAA National Hurricane Center / Central Pacific Hurricane Center",
		Phase:         "P0",
		DataClass:     "live",
		Access:        "RSS plus advisory GIS downloads",
		URL:           "https://www.nhc.noaa.gov/gis-cp.xml",
		UpdateCadence: "Advisory-driven, normally every six hours and more often during threats",
		Integration:   "integrated-backend",
		Enables: []string{
			"Storm track, cone, wind radii, probabilities, and arrival-time planning",
		},
		Limitations: []string{
			"GIS products are a convenience feed and may not always receive timely support",
			"Advisory versions must be retained rather than overwritten",
		},
	},
	{
		ID:            "ptwc-cap",
		Name:          "Pacific Tsunami Warning Center products",
		Authority:     "NOAA Pacific Tsunami Warning Center",
		Phase:         "P0",
		DataClass:     "live",
		Access:        "Atom and CAP feeds",
		URL:           "https://www.tsunami.gov/events/xml/PHEBCAP.xml",
		UpdateCadence: "Event-driven",
		Integration:   "integrated-backend",
		Enables: []string{
			"Canonical Hawaiʻi tsunami watch, advisory, warning, and cancellation status",
		},
		Limitations: []string{
			"Must be joined to evacuation-zone geometry",
			"Feed silence must never be treated as an all-clear",
			"Products and CAP response types are planning facts, not legal evacuation orders",
		},
	},
	{
		ID:            "usgs-comcat",
		Name:          "USGS ComCat Hawaiʻi-region earthquakes",
		Authority:     "U.S. Geological Survey",
		Phase:         "P0",
		DataClass:     "live",
		Access:        "FDSN Event GeoJSON API",
		URL:           "https://earthquake.usgs.gov/fdsnws/event/1/query",
		UpdateCadence: "Near-real-time; backend refreshes at most every two minutes",
		Integration:   "integrated-backend",
		Enables: []string{
			"Bounded recent earthquake facts, magnitude, review status, and tsunami flag",
		},
		Limitations: []string{
			"The tsunami flag directs planners to PTWC; it is not a local warning or evacuation order",
			"Earthquake records older than six hours remain visible as expired history within the 24-hour query window",
		},
	},
	{
		ID:            "usgs-hans",
		Name:          "USGS HANS volcano notifications",
		Authority:     "U.S. Geological Survey Hawaiian Volcano Observatory",
		Phase:         "P0",
		DataClass:     "live",
		Access:        "Provisional machine-contract review",
		URL:           "https://volcanoes.usgs.gov/hans-public/",
		UpdateCadence: "Event-driven when a supported contract is available",
		Integration:   "production-disabled-unavailable",
		Enables: []string{
			"Future bounded volcano notification and warning-level context",
		},
		Limitations: []string{
			"No stable supported public machine-readable contract is configured",
			"Web pages are not scraped and production remains explicitly unavailable",
			"Volcano levels are not legal evacuation orders",
		},
	},
	{
		ID:              "county-evacuation-orders",
		Name:            "County and State evacuation orders",
		Authority:       "Authorized Hawaiʻi governor and county mayors",
		Phase:           "P0",
		DataClass:       "live",
		Access:          "No verified machine-readable statewide source",
		URL:             "https://dod.hawaii.gov/hiema/get-ready/",
		UpdateCadence:   "Incident-dependent",
		Integration:     "unavailable-manual-path-not-implemented",
		CheckedAt:       "2026-10-27",
		Decision:        "FURTHER-RESEARCH",
		MissingArtifact: "Verified public statewide machine-readable contract for attributable current legal evacuation orders",
		OwningAuthority: "Authorized Hawaiʻi governor and county mayors",
		Enables: []string{
			"Future explicit attributable authorized order records",
		},
		Limitations: []string{
			"Missing data is unavailable and never means no order",
			"Forecasts, warnings, CAP response types, earthquake flags, and volcano levels cannot be promoted into an order",
		},
	},
	{
		ID:            "state-tsunami-zones",
		Name:          "Statewide tsunami evacuation zones",
		Authority:     "Hawaiʻi Statewide GIS Program and counties",
		Phase:         "P0",
		DataClass:     "planning",
		Access:        "ArcGIS REST / GeoJSON",
		URL:           "https://geodata.hawaii.gov/arcgis/rest/services/Hazards/MapServer/11",
		UpdateCadence: "Source vintages vary by county",
		Integration:   "integrated-backend; frontend migration pending",
		Enables: []string{
			"Point-in-zone classification and evacuation-route avoidance",
		},
		Limitations: []string{
			"Maui County geometry is older than Oʻahu, Hawaiʻi, and Kauaʻi data",
			"County validation is required before operational use",
		},
	},
	{
		ID:            "state-dfirm",
		Name:          "Statewide FEMA DFIRM",
		Authority:     "FEMA National Flood Hazard Layer via Hawaiʻi Statewide GIS",
		Phase:         "P0",
		DataClass:     "planning",
		Access:        "ArcGIS REST / GeoJSON",
		URL:           "https://geodata.hawaii.gov/arcgis/rest/services/Hazards/MapServer/6",
		UpdateCadence: "State mirror reports monthly refreshes",
		Integration:   "integrated-backend; frontend migration pending",
		Enables: []string{
			"Regulatory flood classification and nearby 1% and 0.2% annual-chance boundaries",
		},
		Limitations: []string{
			"Not a live inundation forecast",
			"Mapped boundaries do not determine road passability",
		},
	},
	{
		ID:            "fema-open-shelters",
		Name:          "FEMA ESF6 open shelters",
		Authority:     "Federal Emergency Management Agency and reporting partners",
		Phase:         "P0",
		DataClass:     "live",
		Access:        "ArcGIS REST / GeoJSON",
		URL:           "https://gis.fema.gov/arcgis/rest/services/NSS/OpenShelters/MapServer/0",
		UpdateCadence: "Incident-dependent",
		Integration:   "integrated-live-operational-status",
		CheckedAt:     "2026-10-27",
		Decision:      "ADOPT",
		Enables: []string{
			"Officially reported open-shelter status, capacity, accessibility, pets, address, and operator context",
		},
		Limitations: []string{
			"No returned shelter does not prove that no county shelter is open",
			"County operational feeds and announcements remain necessary",
		},
	},
	{
		ID:              "hdot-planned-lane-closures",
		Name:            "HDOT planned lane closures",
		Authority:       "Hawaiʻi Department of Transportation",
		Phase:           "P0",
		DataClass:       "operational-planning",
		Access:          "ArcGIS FeatureServer",
		URL:             "https://services.arcgis.com/HQ0xoN0EzDPBOEci/arcgis/rest/services/Lane_Closure_WFL1_View_NoEd/FeatureServer/0",
		UpdateCadence:   "Published weekly and updated as planned work changes",
		Integration:     "integrated-backend",
		CheckedAt:       "2026-10-27",
		Decision:        "ADAPT",
		MissingArtifact: "Verified public statewide machine-readable emergency closure and passability contract",
		OwningAuthority: "HDOT Highways and County road authorities",
		Enables: []string{
			"Scheduled route restrictions and construction detours",
		},
		Limitations: []string{
			"Planned closures are not emergency road status",
			"GoAkamai removed its prior real-time flow, incident, and travel-time features; no supported replacement API is documented",
		},
	},
	{
		ID:            "acs-5-year",
		Name:          "American Community Survey 5-year estimates",
		Authority:     "U.S. Census Bureau",
		Phase:         "P0",
		DataClass:     "planning",
		Access:        "API with free Census API key",
		URL:           "https://api.census.gov/data/2024/acs/acs5",
		UpdateCadence: "Annual",
		Integration:   "integrated-backend-key-required",
		Enables: []string{
			"Aggregate language, disability, age, poverty, and vehicle-access planning",
			"Tract screening of kūpuna 65+ living alone, housing units in 50+ unit structures, incomplete plumbing, and households without internet subscriptions",
		},
		Limitations: []string{
			"Margins of error must be retained",
			"Aggregate demographics must never be used to infer an individual's needs",
			"Structure size, plumbing, internet subscription, and living-alone measures are explicitly limited CMIST planning proxies",
		},
	},
	{
		ID:            "census-tigerweb-tracts",
		Name:          "Census TIGERweb ACS2024 tract boundaries",
		Authority:     "U.S. Census Bureau",
		Phase:         "P0",
		DataClass:     "planning",
		Access:        "Public ArcGIS REST / GeoJSON",
		URL:           "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_ACS2024/MapServer/8/query",
		UpdateCadence: "Annual geography vintage; backend caches at most 24 hours",
		Integration:   "integrated-backend",
		Enables:       []string{"Real tract-level AFN screening geometry across all five Hawaii counties, including Kalawao"},
		Limitations:   []string{"2024 ACS and 2022 SVI use different vintages; exact FIPS joins may leave unknown values", "Water and unpopulated tracts may have no ACS or SVI estimates; no geometry or estimates are fabricated"},
	},
	{
		ID:            "state-fire-risk",
		Name:          "DLNR-DOFAW community fire risk areas",
		Authority:     "Hawaiʻi DLNR Division of Forestry and Wildlife",
		Phase:         "P2",
		DataClass:     "planning",
		Access:        "ArcGIS REST / GeoJSON",
		URL:           "https://geodata.hawaii.gov/arcgis/rest/services/Hazards/MapServer/7",
		UpdateCadence: "2007 source; boundaries re-reviewed in 2017 and 2022",
		Integration:   "integrated-backend-context; frontend migration pending",
		Enables: []string{
			"Community-scale planning susceptibility context",
		},
		Limitations: []string{
			"Not a live fire location or perimeter",
			"Must be visually and verbally separated from current evacuation status",
		},
	},
	{
		ID:            "usgs-stream-gauges",
		Name:          "USGS instantaneous stream observations",
		Authority:     "U.S. Geological Survey",
		Phase:         "P1",
		DataClass:     "live",
		Access:        "Water Services API",
		URL:           "https://waterservices.usgs.gov/docs/instantaneous-values/instantaneous-values-details/",
		UpdateCadence: "Near-real-time sensor updates",
		Integration:   "planned",
		Enables: []string{
			"Observed stream height and discharge near monitored waterways",
		},
		Limitations: []string{
			"Values are provisional",
			"Gauge coverage is incomplete and sensors can fail during storms",
		},
	},
	{
		ID:              "wfigs-fire-perimeters",
		Name:            "WFIGS current wildfire incidents and perimeters",
		Authority:       "National Interagency Fire Center",
		Phase:           "P1",
		DataClass:       "live",
		Access:          "ArcGIS FeatureServer",
		URL:             "https://www.arcgis.com/sharing/rest/content/items/d1c32af3212341869b3c810f1a215824?f=pjson",
		UpdateCadence:   "Service refreshes every five minutes; perimeter edits can lag",
		Integration:     "blocked-external-reference-only",
		CheckedAt:       "2026-10-27",
		Decision:        "FURTHER-RESEARCH",
		MissingArtifact: "Hawaiʻi-authoritative contract for complete incident, containment, protective-action, and evacuation status",
		OwningAuthority: "County fire departments, Hawaiʻi DLNR-DOFAW, and authorized emergency-management authorities",
		Enables: []string{
			"Current wildfire incident locations and available perimeter context",
		},
		Limitations: []string{
			"Not every incident has a perimeter",
			"County evacuation orders and road closures remain authoritative",
		},
	},
	{
		ID:              "thebus-gtfs-avl",
		Name:            "TheBus schedules and vehicle arrivals",
		Authority:       "City and County of Honolulu Department of Transportation Services",
		Phase:           "P1",
		DataClass:       "live-and-scheduled",
		Access:          "GTFS plus AppID-gated AVL API",
		URL:             "https://hea.thebus.org/api_info.asp",
		UpdateCadence:   "Schedule publications plus real-time vehicle updates",
		Integration:     "blocked-external-for-operational-status; static GTFS remains planning reference",
		CheckedAt:       "2026-10-27",
		Decision:        "ADAPT",
		MissingArtifact: "Statewide public disruption and paratransit operational-status contract",
		OwningAuthority: "County transit and paratransit operators",
		Enables: []string{
			"Oʻahu no-car routing, stops, trips, arrivals, and vehicle context",
		},
		Limitations: []string{
			"Requires an AppID for live data",
			"Outer-island transit feeds need separate verification",
		},
	},
	{
		ID:              "county-transit-paratransit-status",
		Name:            "County transit and paratransit operational status",
		Authority:       "Hawaiʻi County, Honolulu, Kauaʻi, and Maui transit operators",
		Phase:           "P0",
		DataClass:       "live",
		Access:          "No verified statewide supported public contract",
		URL:             "https://hidot.hawaii.gov/mobility/transit/",
		UpdateCadence:   "Provider- and incident-dependent",
		Integration:     "blocked-external",
		CheckedAt:       "2026-10-27",
		Decision:        "FURTHER-RESEARCH",
		MissingArtifact: "Documented public machine-readable service disruption and paratransit availability contract across all counties",
		OwningAuthority: "County transit and paratransit operators",
		Enables: []string{
			"Future explicit fixed-route disruption and paratransit availability status",
		},
		Limitations: []string{
			"Schedules and vehicle arrivals do not establish emergency service availability",
			"Paratransit operations require provider-specific authority and coverage",
			"Unsupported islands and providers remain unavailable rather than inheriting Oʻahu status",
		},
	},
	{
		ID:            "hhs-empower",
		Name:          "HHS emPOWER aggregates",
		Authority:     "U.S. Department of Health and Human Services",
		Phase:         "P1",
		DataClass:     "planning",
		Access:        "Public REST service and downloads",
		URL:           "https://services2.arcgis.com/ZQ4jTQn6k7VPXEwO/arcgis/rest/services/HHS_emPOWER_REST_Service_Public/FeatureServer/1",
		UpdateCadence: "Monthly",
		Integration:   "integrated-backend",
		Enables: []string{
			"Aggregate electricity-dependent medical-equipment and service planning",
		},
		Limitations: []string{
			"Small cells are suppressed",
			"Data must never be used for re-identification or household-level claims",
		},
	},
	{
		ID:            "cdc-svi",
		Name:          "CDC/ATSDR Social Vulnerability Index",
		Authority:     "CDC / Agency for Toxic Substances and Disease Registry",
		Phase:         "P1",
		DataClass:     "planning",
		Access:        "Bulk download",
		URL:           "https://onemap.cdc.gov/onemapservices/rest/services/SVI/CDC_ATSDR_Social_Vulnerability_Index_2022_USA/FeatureServer/2",
		UpdateCadence: "Periodic releases",
		Integration:   "integrated-backend",
		Enables: []string{
			"Equity review and resource-prioritization context",
		},
		Limitations: []string{
			"Use component variables rather than one composite score for resident decisions",
			"Releases and tract boundaries are not directly comparable over time",
		},
	},
	{
		ID:            "county-shelters",
		Name:          "County emergency shelter and resource status",
		Authority:     "Hawaiʻi, Honolulu, Kauaʻi, and Maui county emergency-management agencies",
		Phase:         "P1",
		DataClass:     "live",
		Access:        "County-specific feed or data-sharing agreement",
		URL:           "https://dod.hawaii.gov/hiema/get-ready/",
		UpdateCadence: "Incident-dependent",
		Integration:   "agreement-required",
		Enables: []string{
			"Official open/closed status, activation time, capacity, AFN, pet, and contact details",
		},
		Limitations: []string{
			"No verified unified statewide API",
			"Each county controls its own emergency alerts and operations",
		},
	},
	{
		ID:            "fema-nri",
		Name:          "FEMA National Risk Index",
		Authority:     "Federal Emergency Management Agency",
		Phase:         "P2",
		DataClass:     "planning",
		Access:        "Versioned bulk downloads",
		URL:           "https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/National_Risk_Index_Census_Tracts/FeatureServer/0",
		UpdateCadence: "Versioned periodic releases",
		Integration:   "integrated-backend-planning-only",
		Enables: []string{
			"Mitigation prioritization and historical evaluation",
		},
		Limitations: []string{
			"Composite tract risk does not direct a resident around today's incident",
		},
	},
	{
		ID:              "utility-outages",
		Name:            "Electric utility outage status",
		Authority:       "Hawaiian Electric and Kauaʻi Island Utility Cooperative",
		Phase:           "P2",
		DataClass:       "live",
		Access:          "Data-sharing agreement",
		URL:             "https://www.hawaiianelectric.com/safety-and-outages/power-outages/oahu-outage-map",
		UpdateCadence:   "Near-real-time maps with documented delay and estimation",
		Integration:     "blocked-external-agreement-required",
		CheckedAt:       "2026-10-27",
		Decision:        "FURTHER-RESEARCH",
		MissingArtifact: "Documented supported public machine-readable outage and restoration contract with provider/island coverage",
		OwningAuthority: "Hawaiian Electric and Kauaʻi Island Utility Cooperative",
		Enables: []string{
			"Power-dependent resident support and restoration planning",
		},
		Limitations: []string{
			"No documented public API",
			"Do not scrape utility maps",
			"Counts and restoration estimates can be delayed or approximate",
		},
	},
	{
		ID:            "hawaii-geoportal",
		Name:          "Hawaiʻi Statewide GIS Geoportal",
		Authority:     "Hawaiʻi Statewide GIS Program",
		Phase:         "skip",
		DataClass:     "catalog",
		Access:        "ArcGIS Hub catalog",
		URL:           "https://geoportal.hawaii.gov/",
		UpdateCadence: "Catalog-dependent",
		Integration:   "discovery-only",
		Enables: []string{
			"Finding State GIS datasets and their underlying service URLs",
		},
		Limitations: []string{
			"Not a canonical runtime API",
			"Backend adapters should call the underlying service directly",
		},
	},
	{
		ID:            "hdot-climate-resilience",
		Name:          "HDOT Climate Insights for Infrastructure",
		Authority:     "Hawaiʻi Department of Transportation",
		Phase:         "skip",
		DataClass:     "planning-application",
		Access:        "JavaScript/CARTO web application",
		URL:           "https://climate-resilience.hidot.hawaii.gov/",
		UpdateCadence: "Application-dependent",
		Integration:   "agreement-or-export-required",
		Enables: []string{
			"Discovery of transportation climate-resilience analyses",
		},
		Limitations: []string{
			"No documented supported public bulk or API contract",
			"Do not scrape the application; obtain an HDOT-supported export or service agreement",
		},
	},
	{
		ID:            "haic-hub",
		Name:          "HAIC State GIS Hub",
		Authority:     "Hawaiʻi State GIS / Esri challenge hub",
		Phase:         "skip",
		DataClass:     "catalog",
		Access:        "Hub catalog",
		URL:           "https://esri-haic-histategis.hub.arcgis.com/",
		UpdateCadence: "Catalog-dependent",
		Integration:   "discovery-only",
		Enables: []string{
			"Finding challenge examples and underlying item identifiers",
		},
		Limitations: []string{
			"Not a production authority or canonical API",
			"Items overlap with the State GIS organization and must be de-duplicated by service URL",
		},
	},
}

func All() []Source {
	result := make([]Source, len(sources))
	copy(result, sources)
	return result
}

func Find(id string) (Source, bool) {
	normalized := normalizeID(id)
	for _, source := range sources {
		if source.ID == normalized {
			return source, true
		}
	}
	return Source{}, false
}

func normalizeID(id string) string {
	switch strings.ToLower(strings.TrimSpace(id)) {
	case "acs-2024":
		return "acs-5-year"
	case "svi-2022":
		return "cdc-svi"
	case "hhs-empower":
		return "hhs-empower"
	case "fema-nri":
		return "fema-nri"
	case "state-gis-demo":
		return "hawaii-geoportal"
	default:
		return strings.ToLower(strings.TrimSpace(id))
	}
}
