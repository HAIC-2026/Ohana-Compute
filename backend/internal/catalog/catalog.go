package catalog

type Source struct {
	ID            string   `json:"id"`
	Name          string   `json:"name"`
	Authority     string   `json:"authority"`
	Phase         string   `json:"phase"`
	DataClass     string   `json:"data_class"`
	Access        string   `json:"access"`
	URL           string   `json:"url"`
	UpdateCadence string   `json:"update_cadence"`
	Integration   string   `json:"integration"`
	Enables       []string `json:"enables"`
	Limitations   []string `json:"limitations"`
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
		Integration:   "planned",
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
		URL:           "https://www.tsunami.gov/?page=productRetrieval",
		UpdateCadence: "Event-driven",
		Integration:   "planned",
		Enables: []string{
			"Canonical Hawaiʻi tsunami watch, advisory, warning, and cancellation status",
		},
		Limitations: []string{
			"Must be joined to evacuation-zone geometry",
			"Feed silence must never be treated as an all-clear",
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
		Integration:   "planned-backend; currently used directly by the frontend",
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
		Integration:   "planned-backend; currently used directly by the frontend",
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
		Integration:   "planned-backend; currently used directly by the frontend",
		Enables: []string{
			"Officially reported open-shelter status, capacity, accessibility, pets, address, and operator context",
		},
		Limitations: []string{
			"No returned shelter does not prove that no county shelter is open",
			"County operational feeds and announcements remain necessary",
		},
	},
	{
		ID:            "hdot-planned-lane-closures",
		Name:          "HDOT planned lane closures",
		Authority:     "Hawaiʻi Department of Transportation",
		Phase:         "P0",
		DataClass:     "operational-planning",
		Access:        "ArcGIS FeatureServer",
		URL:           "https://geoportal.hawaii.gov/datasets/HiStateGIS::lane-closures/about",
		UpdateCadence: "Published weekly and updated as planned work changes",
		Integration:   "planned",
		Enables: []string{
			"Scheduled route restrictions and construction detours",
		},
		Limitations: []string{
			"Planned closures are not emergency road status",
			"Real-time Oʻahu traffic is directed to GoAkamai",
		},
	},
	{
		ID:            "acs-5-year",
		Name:          "American Community Survey 5-year estimates",
		Authority:     "U.S. Census Bureau",
		Phase:         "P0",
		DataClass:     "planning",
		Access:        "API and bulk downloads",
		URL:           "https://www.census.gov/programs-surveys/acs/data/data-via-api.html",
		UpdateCadence: "Annual",
		Integration:   "planned",
		Enables: []string{
			"Aggregate language, disability, age, poverty, and vehicle-access planning",
		},
		Limitations: []string{
			"Margins of error must be retained",
			"Aggregate demographics must never be used to infer an individual's needs",
		},
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
		Integration:   "context-only; currently used directly by the frontend",
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
		ID:            "wfigs-fire-perimeters",
		Name:          "WFIGS current wildfire incidents and perimeters",
		Authority:     "National Interagency Fire Center",
		Phase:         "P1",
		DataClass:     "live",
		Access:        "ArcGIS FeatureServer",
		URL:           "https://www.arcgis.com/sharing/rest/content/items/d1c32af3212341869b3c810f1a215824?f=pjson",
		UpdateCadence: "Service refreshes every five minutes; perimeter edits can lag",
		Integration:   "planned",
		Enables: []string{
			"Current wildfire incident locations and available perimeter context",
		},
		Limitations: []string{
			"Not every incident has a perimeter",
			"County evacuation orders and road closures remain authoritative",
		},
	},
	{
		ID:            "thebus-gtfs-avl",
		Name:          "TheBus schedules and vehicle arrivals",
		Authority:     "City and County of Honolulu Department of Transportation Services",
		Phase:         "P1",
		DataClass:     "live-and-scheduled",
		Access:        "GTFS plus AppID-gated AVL API",
		URL:           "https://hea.thebus.org/api_info.asp",
		UpdateCadence: "Schedule publications plus real-time vehicle updates",
		Integration:   "planned-backend; static GTFS is currently used by the frontend example",
		Enables: []string{
			"Oʻahu no-car routing, stops, trips, arrivals, and vehicle context",
		},
		Limitations: []string{
			"Requires an AppID for live data",
			"Outer-island transit feeds need separate verification",
		},
	},
	{
		ID:            "hhs-empower",
		Name:          "HHS emPOWER aggregates",
		Authority:     "U.S. Department of Health and Human Services",
		Phase:         "P1",
		DataClass:     "planning",
		Access:        "Public REST service and downloads",
		URL:           "https://empowerprogram.hhs.gov/empowermap/",
		UpdateCadence: "Monthly",
		Integration:   "planned",
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
		URL:           "https://www.atsdr.cdc.gov/place-health/php/svi/svi-data-documentation-download.html",
		UpdateCadence: "Periodic releases",
		Integration:   "planned",
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
		URL:           "https://www.fema.gov/about/openfema/data-sets/national-risk-index-data",
		UpdateCadence: "Versioned periodic releases",
		Integration:   "optional",
		Enables: []string{
			"Mitigation prioritization and historical evaluation",
		},
		Limitations: []string{
			"Composite tract risk does not direct a resident around today's incident",
		},
	},
	{
		ID:            "utility-outages",
		Name:          "Electric utility outage status",
		Authority:     "Hawaiian Electric and Kauaʻi Island Utility Cooperative",
		Phase:         "P2",
		DataClass:     "live",
		Access:        "Data-sharing agreement",
		URL:           "https://www.hawaiianelectric.com/safety-and-outages/power-outages/oahu-outage-map",
		UpdateCadence: "Near-real-time maps with documented delay and estimation",
		Integration:   "agreement-required",
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
