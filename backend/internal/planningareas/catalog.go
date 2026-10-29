package planningareas

import (
	"context"
	"time"
)

type Summary struct {
	PlanningJurisdictionsTotal int `json:"planning_jurisdictions_total"`
	PoliticalCountiesTotal     int `json:"political_counties_total"`
	RepresentativeWorkflows    int `json:"representative_workflows"`
}

type Provenance struct {
	DatasetMode string    `json:"dataset_mode"`
	Methodology string    `json:"methodology"`
	ReviewedAt  time.Time `json:"reviewed_at"`
	FreshUntil  time.Time `json:"fresh_until"`
	Freshness   string    `json:"freshness"`
}

type Resource struct {
	ID                 string     `json:"id"`
	Name               string     `json:"name"`
	Kind               string     `json:"kind"`
	Coordinates        [2]float64 `json:"coordinates"`
	Capacity           int        `json:"capacity"`
	Capabilities       []string   `json:"capabilities"`
	VerificationStatus string     `json:"verification_status"`
}

type Route struct {
	Name               string `json:"name"`
	Purpose            string `json:"purpose"`
	VerificationStatus string `json:"verification_status"`
}

type Decision struct {
	Label   string `json:"label"`
	Action  string `json:"action"`
	Reason  string `json:"reason"`
	Trigger string `json:"trigger"`
}

type ClosestResource struct {
	Name     string `json:"name"`
	Kind     string `json:"kind"`
	Distance string `json:"distance"`
	Note     string `json:"note"`
}

type Coordination struct {
	DecisionOwner     string   `json:"decision_owner"`
	CommunicationPath string   `json:"communication_path"`
	AFNActions        []string `json:"afn_actions"`
}

type Evidence struct {
	Status     string `json:"status"`
	Basis      string `json:"basis"`
	Updated    string `json:"updated"`
	Validation string `json:"validation"`
}

type Briefing struct {
	ID               string              `json:"id"`
	Name             string              `json:"name"`
	Summary          string              `json:"summary"`
	ClosestResources []ClosestResource   `json:"closest_resources"`
	Routes           []Route             `json:"routes"`
	TrafficHazards   []string            `json:"traffic_hazards"`
	Coordination     Coordination        `json:"coordination"`
	Evidence         Evidence            `json:"evidence"`
	Decisions        map[string]Decision `json:"decisions"`
}

type Area struct {
	ID                        string            `json:"id"`
	Name                      string            `json:"name"`
	Island                    string            `json:"island"`
	JurisdictionID            string            `json:"jurisdiction_id"`
	Communities               []string          `json:"communities"`
	Summary                   string            `json:"summary"`
	ResponseFocus             map[string]string `json:"response_focus"`
	AFNFixtureKey             string            `json:"afn_fixture_key"`
	ShelterPlanJurisdictionID string            `json:"shelter_plan_jurisdiction_id"`
	Briefing                  Briefing          `json:"briefing"`
	PracticeResources         []Resource        `json:"practice_resources"`
	PracticeRoutes            []Route           `json:"practice_routes"`
}

type Jurisdiction struct {
	ID                string   `json:"id"`
	Name              string   `json:"name"`
	Islands           []string `json:"islands"`
	PoliticalCounties []string `json:"political_counties"`
	Coverage          string   `json:"coverage"`
	ScopeNote         string   `json:"scope_note"`
	Areas             []Area   `json:"areas"`
}

type Snapshot struct {
	GeneratedAt      time.Time       `json:"generated_at"`
	Status           string          `json:"status"`
	Summary          Summary         `json:"summary"`
	Provenance       Provenance      `json:"provenance"`
	Jurisdictions    []Jurisdiction  `json:"jurisdictions"`
	UnsupportedAreas []string        `json:"unsupported_areas"`
	ScreeningAreas   []ScreeningArea `json:"screening_areas"`
}

// ScreeningArea supplies geography only; it has no invented AFN inventory,
// capacities, scenario, or practice briefing.
type ScreeningArea struct {
	ID             string     `json:"id"`
	Name           string     `json:"name"`
	Island         string     `json:"island"`
	JurisdictionID string     `json:"jurisdiction_id"`
	CountyCode     string     `json:"county_code"`
	Coordinates    [2]float64 `json:"coordinates"`
	ScreeningOnly  bool       `json:"screening_only"`
	ScopeNote      string     `json:"scope_note"`
}

type Catalog struct {
	Now func() time.Time
}

func NewCatalog() Catalog {
	return Catalog{Now: time.Now}
}

func (catalog Catalog) Snapshot(context.Context) (Snapshot, error) {
	now := catalog.Now
	if now == nil {
		now = time.Now
	}
	generatedAt := now().UTC()
	reviewedAt := time.Date(2026, time.October, 27, 0, 0, 0, 0, time.UTC)
	freshUntil := reviewedAt.Add(180 * 24 * time.Hour)
	freshness := "fresh"
	if !generatedAt.Before(freshUntil) {
		freshness = "stale"
	}

	jurisdictions := curatedJurisdictions()
	return Snapshot{
		GeneratedAt: generatedAt,
		Status:      "complete",
		Summary: Summary{
			PlanningJurisdictionsTotal: len(jurisdictions),
			PoliticalCountiesTotal:     5,
			RepresentativeWorkflows:    4,
		},
		Provenance: Provenance{
			DatasetMode: "practice",
			Methodology: "Deterministic representative workflows curated for product testing; every resource and route requires local validation before operational use.",
			ReviewedAt:  reviewedAt,
			FreshUntil:  freshUntil,
			Freshness:   freshness,
		},
		Jurisdictions: jurisdictions,
		ScreeningAreas: []ScreeningArea{
			{"molokai-kaunakakai", "Kaunakakai", "Molokaʻi", "maui", "009", [2]float64{-157.0206, 21.0903}, true, "Public tract screening only. No local operational inventory or practice workflow is supplied."},
			{"lanai-city", "Lānaʻi City", "Lānaʻi", "maui", "009", [2]float64{-156.917, 20.8283}, true, "Public tract screening only. No local operational inventory or practice workflow is supplied."},
			{"molokai-kalaupapa", "Kalaupapa", "Molokaʻi (Kalawao)", "kalawao", "005", [2]float64{-156.984, 21.189}, true, "Kalawao is a separate county administered by State DOH. Public aggregate tract screening is not a resident registry or Maui operational authority."},
		},
		UnsupportedAreas: []string{
			"Niʻihau",
		},
	}, nil
}

func curatedJurisdictions() []Jurisdiction {
	return []Jurisdiction{
		{
			ID:                "honolulu",
			Name:              "City and County of Honolulu",
			Islands:           []string{"Oʻahu"},
			PoliticalCounties: []string{"Honolulu"},
			Coverage:          "representative",
			ScopeNote:         "Urban Honolulu is the representative workflow; other Oʻahu planning areas retain existing practice depth.",
			Areas: []Area{
				area(
					"oahu-town",
					"Urban Honolulu",
					"Oʻahu",
					"honolulu",
					[]string{"Downtown Honolulu", "Ala Moana", "Waikīkī"},
					"Dense high-rise communities depend on vertical mass-care planning, transit continuity, and multiple medical-access corridors.",
					map[string]string{
						"tsunami":   "Move shoreline populations mauka while preserving accessible transit and vertical-evacuation options.",
						"hurricane": "Stage high-rise wellness checks, backup power support, and accessible transportation before wind arrival.",
					},
					"oahu-town-highrise-transit",
					[]Resource{
						resource("oahu-town-powered-shelter", "Urban Honolulu practice powered shelter", "shelter", -157.858, 21.307, 300, []string{"Accessible entry", "Backup power", "Language assistance"}, "practice_confirmed"),
						resource("oahu-town-medical-power", "Kakaʻako practice medical-power hub", "medical-power", -157.865, 21.3, 80, []string{"Equipment charging", "Medication refrigeration"}, "needs_confirmation"),
						resource("oahu-town-transport", "Urban Honolulu accessible transport staging", "transport", -157.849, 21.313, 24, []string{"Wheelchair transport", "Transit coordination"}, "practice_confirmed"),
					},
					[]Route{
						route("H-1 urban corridor", "Cross-district logistics and medical access", "needs_confirmation"),
						route("Ala Moana–Waikīkī shoreline route", "Coastal evacuation and responder access", "needs_confirmation"),
						route("Pali Highway medical access", "Windward medical mutual aid", "practice_confirmed"),
					},
					briefing(
						"oahu-town-county-workflow",
						"Urban Honolulu vertical mass-care workflow",
						"Coordinate high-rise wellness checks, accessible transportation, and backup-power support without treating practice facilities as open shelters.",
						[]string{"Gridlock around shoreline evacuation routes", "Elevator outages in high-rise buildings", "Transit disruption for residents without vehicles"},
						"Honolulu Department of Emergency Management district coordination",
						"County alerts, multilingual public information, and building-manager relays",
						[]string{"Pre-identify accessible pickup staging", "Prioritize powered-equipment and elevator-outage checks", "Use multilingual high-rise outreach"},
						map[string]Decision{
							"tsunami":   decision("Move inland", "Move shoreline residents mauka and support high-rise residents who cannot self-evacuate.", "Dense coastal exposure and limited accessible transportation increase clearance time.", "When an official tsunami warning includes Oʻahu"),
							"hurricane": decision("Prepare to leave", "Stage wellness-check teams and powered-equipment support before winds restrict travel.", "High-rise elevator and utility failures can isolate residents.", "Before tropical-storm-force winds reach Oʻahu"),
						},
					),
				),
			},
		},
		{
			ID:                "maui",
			Name:              "County of Maui",
			Islands:           []string{"Maui", "Molokaʻi", "Lānaʻi"},
			PoliticalCounties: []string{"Maui", "Kalawao"},
			Coverage:          "representative",
			ScopeNote:         "Central and West Maui is representative. Molokaʻi, Lānaʻi, and State DOH-administered Kalawao require separate local validation.",
			Areas: []Area{
				area(
					"maui-central",
					"Central & West Maui",
					"Maui",
					"maui",
					[]string{"Kahului", "Wailuku", "West Maui"},
					"Central services support communities separated by long coastal corridors, wildfire exposure, and limited alternate access.",
					map[string]string{
						"wildfire":  "Pre-stage accessible transport and medical continuity support before West Maui access degrades.",
						"hurricane": "Protect cross-island supply movement and identify communities that could be isolated by closures.",
					},
					"maui-central-wildfire-continuity",
					[]Resource{
						resource("maui-central-reception", "Central Maui practice reception site", "shelter", -156.471, 20.89, 220, []string{"Accessible entry", "Language assistance"}, "practice_confirmed"),
						resource("maui-central-power", "Wailuku practice medical-power hub", "medical-power", -156.507, 20.892, 60, []string{"Backup power", "Medication refrigeration"}, "needs_confirmation"),
						resource("maui-central-transport", "Maui accessible transport staging", "transport", -156.479, 20.882, 20, []string{"Wheelchair transport", "Long-distance coordination"}, "practice_confirmed"),
					},
					[]Route{
						route("Honoapiʻilani Highway west access", "West Maui evacuation and supply access", "needs_confirmation"),
						route("Kaʻahumanu Avenue medical corridor", "Hospital and reception-site access", "practice_confirmed"),
						route("Piʻilani Highway south bypass", "Alternate south-side movement", "needs_confirmation"),
					},
					briefing(
						"maui-central-county-workflow",
						"Maui corridor continuity workflow",
						"Pre-stage mass-care support before wildfire smoke or coastal highway closures isolate West Maui communities.",
						[]string{"Single-corridor dependence to West Maui", "Wind-driven wildfire and smoke", "Long accessible-transport travel times"},
						"Maui Emergency Management Agency area coordination",
						"County alerts, radio relays, hotel/community partners, and multilingual outreach",
						[]string{"Stage accessible vehicles before corridor restrictions", "Protect medication and powered-equipment continuity", "Plan overnight support for isolated communities"},
						map[string]Decision{
							"wildfire":  decision("Prepare to leave", "Stage transport and medical continuity support before smoke or closures restrict movement.", "Long travel times and limited alternate access make late movement unsafe.", "When wildfire warnings or closures threaten West Maui access"),
							"hurricane": decision("Seek shelter", "Move residents needing accessible shelter support before islandwide travel deteriorates.", "High winds and flooding can disrupt both coastal and cross-island routes.", "Before tropical-storm-force winds reach Maui"),
						},
					),
				),
			},
		},
		{
			ID:                "hawaii",
			Name:              "County of Hawaiʻi",
			Islands:           []string{"Hawaiʻi"},
			PoliticalCounties: []string{"Hawaiʻi"},
			Coverage:          "representative",
			ScopeNote:         "Hilo and Lower Puna is the representative workflow; other Hawaiʻi Island districts require local validation.",
			Areas: []Area{
				area(
					"hawaii-hilo",
					"Hilo & Lower Puna",
					"Hawaiʻi",
					"hawaii",
					[]string{"Hilo", "Keaʻau", "Pāhoa"},
					"Flood, tsunami, and hurricane exposure overlap with rural distance and medical-power continuity needs.",
					map[string]string{
						"hurricane": "Stage medical-power and accessible transport support before long rural routes become unreliable.",
						"flood":     "Protect Hilo crossings and preserve alternate access between Hilo, Keaʻau, and Lower Puna.",
					},
					"hawaii-hilo-medical-power",
					[]Resource{
						resource("hawaii-hilo-shelter", "Hilo district practice shelter", "shelter", -155.08, 19.714, 200, []string{"Accessible entry", "Language assistance"}, "practice_confirmed"),
						resource("hawaii-puna-power", "Puna practice medical-power support hub", "medical-power", -155.039, 19.62, 70, []string{"Backup power", "Oxygen support", "Equipment charging"}, "needs_confirmation"),
						resource("hawaii-hilo-transport", "East Hawaiʻi accessible transport staging", "transport", -155.095, 19.7, 18, []string{"Wheelchair transport", "Rural pickup coordination"}, "practice_confirmed"),
					},
					[]Route{
						route("Hawaiʻi Belt Road Hilo–Puna access", "District evacuation and supply movement", "needs_confirmation"),
						route("Daniel K. Inouye Highway medical access", "Cross-island medical mutual aid", "practice_confirmed"),
						route("Pāhoa bypass and Highway 130", "Lower Puna accessible pickup route", "needs_confirmation"),
					},
					briefing(
						"hawaii-hilo-county-workflow",
						"East Hawaiʻi medical continuity workflow",
						"Coordinate rural pickup, powered-equipment continuity, and alternate routing before flooding or wind isolates Lower Puna.",
						[]string{"Long rural pickup distances", "Flood-prone crossings", "Power restoration delays for remote communities"},
						"Hawaiʻi County Civil Defense district coordination",
						"County alerts, radio, community hubs, and multilingual outreach",
						[]string{"Prioritize oxygen and powered-equipment registries", "Stage rural accessible pickup teams", "Confirm refrigeration and generator support"},
						map[string]Decision{
							"hurricane": decision("Prepare to leave", "Stage medical-power support and rural pickup before high winds restrict travel.", "Distance and power dependence increase the consequences of delayed movement.", "Before tropical-storm-force winds reach Hawaiʻi Island"),
							"flood":     decision("Follow local alert", "Use confirmed alternate routes and avoid moving residents through flooded crossings.", "Hilo and Lower Puna access can fragment during heavy rain.", "When County alerts identify flooding or road closures"),
						},
					),
				),
			},
		},
		{
			ID:                "kauai",
			Name:              "County of Kauaʻi",
			Islands:           []string{"Kauaʻi", "Niʻihau"},
			PoliticalCounties: []string{"Kauaʻi"},
			Coverage:          "representative",
			ScopeNote:         "East Kauaʻi is the representative workflow; Niʻihau requires separate locally authorized planning.",
			Areas: []Area{
				area(
					"kauai-east",
					"East Kauaʻi",
					"Kauaʻi",
					"kauai",
					[]string{"Kapaʻa", "Wailua", "Līhuʻe"},
					"Flood-prone crossings and a single coastal highway make early staging and community-hub coordination essential.",
					map[string]string{
						"flood":     "Stage resources on both sides of vulnerable crossings before water cuts the coastal corridor.",
						"hurricane": "Move supplies and accessible transport before islandwide wind and debris restrictions.",
					},
					"kauai-east-flood-isolation",
					[]Resource{
						resource("kauai-east-shelter", "East Kauaʻi practice shelter", "shelter", -159.347, 22.061, 160, []string{"Accessible entry", "Language assistance"}, "practice_confirmed"),
						resource("kauai-lihue-power", "Līhuʻe practice medical-power staging", "medical-power", -159.372, 21.98, 50, []string{"Backup power", "Equipment charging"}, "needs_confirmation"),
						resource("kauai-kapaa-transport", "Kapaʻa accessible transport staging", "transport", -159.321, 22.074, 16, []string{"Wheelchair transport", "Community-hub pickup"}, "practice_confirmed"),
					},
					[]Route{
						route("Kūhiō Highway Wailua crossing", "East-side evacuation and supply movement", "needs_confirmation"),
						route("Kaumualiʻi Highway cross-island support", "West-side mutual aid", "practice_confirmed"),
						route("Līhuʻe alternate access", "Medical and airport logistics", "needs_confirmation"),
					},
					briefing(
						"kauai-east-county-workflow",
						"East Kauaʻi flood-isolation workflow",
						"Pre-position accessible transport and mass-care supplies before vulnerable crossings divide east-side communities.",
						[]string{"Single coastal highway dependence", "Flood-prone stream crossings", "Limited alternate staging locations"},
						"Kauaʻi Emergency Management Agency area coordination",
						"County alerts, radio, community hubs, and multilingual outreach",
						[]string{"Stage support on both sides of vulnerable crossings", "Use community hubs for no-car pickup", "Confirm backup communications before heavy rain"},
						map[string]Decision{
							"flood":     decision("Prepare to leave", "Move residents needing assistance before crossings or Kūhiō Highway become unsafe.", "Early movement avoids isolation when streams rise.", "When County alerts warn of flooding or crossing closures"),
							"hurricane": decision("Seek shelter", "Complete accessible transport and supply staging before wind and debris restrict travel.", "Islandwide route redundancy is limited.", "Before tropical-storm-force winds reach Kauaʻi"),
						},
					),
				),
			},
		},
	}
}

func area(
	id string,
	name string,
	island string,
	jurisdictionID string,
	communities []string,
	summary string,
	responseFocus map[string]string,
	afnFixtureKey string,
	resources []Resource,
	routes []Route,
	areaBriefing Briefing,
) Area {
	areaBriefing.ClosestResources = []ClosestResource{
		{Name: resources[0].Name, Kind: resources[0].Kind, Distance: "Representative area resource", Note: "Practice record; opening status is not reported."},
		{Name: resources[1].Name, Kind: resources[1].Kind, Distance: "Representative area resource", Note: "Requires local capacity and readiness validation."},
	}
	areaBriefing.Routes = routes
	return Area{
		ID:                        id,
		Name:                      name,
		Island:                    island,
		JurisdictionID:            jurisdictionID,
		Communities:               communities,
		Summary:                   summary,
		ResponseFocus:             responseFocus,
		AFNFixtureKey:             afnFixtureKey,
		ShelterPlanJurisdictionID: jurisdictionID,
		Briefing:                  areaBriefing,
		PracticeResources:         resources,
		PracticeRoutes:            routes,
	}
}

func resource(
	id string,
	name string,
	kind string,
	longitude float64,
	latitude float64,
	capacity int,
	capabilities []string,
	verificationStatus string,
) Resource {
	return Resource{
		ID:                 id,
		Name:               name,
		Kind:               kind,
		Coordinates:        [2]float64{longitude, latitude},
		Capacity:           capacity,
		Capabilities:       capabilities,
		VerificationStatus: verificationStatus,
	}
}

func route(name string, purpose string, verificationStatus string) Route {
	return Route{
		Name:               name,
		Purpose:            purpose,
		VerificationStatus: verificationStatus,
	}
}

func briefing(
	id string,
	name string,
	summary string,
	trafficHazards []string,
	decisionOwner string,
	communicationPath string,
	afnActions []string,
	decisions map[string]Decision,
) Briefing {
	return Briefing{
		ID:             id,
		Name:           name,
		Summary:        summary,
		TrafficHazards: trafficHazards,
		Coordination: Coordination{
			DecisionOwner:     decisionOwner,
			CommunicationPath: communicationPath,
			AFNActions:        afnActions,
		},
		Evidence: Evidence{
			Status:     "Practice estimate",
			Basis:      "Deterministic representative workflow for statewide product testing.",
			Updated:    "2026-10-27",
			Validation: "County validation required before operational use.",
		},
		Decisions: decisions,
	}
}

func decision(label string, action string, reason string, trigger string) Decision {
	return Decision{
		Label:   label,
		Action:  action,
		Reason:  reason,
		Trigger: trigger,
	}
}
