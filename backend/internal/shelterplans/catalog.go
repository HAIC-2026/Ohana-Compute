package shelterplans

import (
	"context"
	"time"
)

type Summary struct {
	JurisdictionsWithPublishedPlan int `json:"jurisdictions_with_published_plan"`
	PlanningJurisdictionsTotal     int `json:"planning_jurisdictions_total"`
	PoliticalCountiesTotal         int `json:"political_counties_total"`
	OfficialFacilityRecords        int `json:"official_facility_records"`
	JurisdictionsRequiringReview   int `json:"jurisdictions_requiring_review"`
}

type PlanRecord struct {
	ID             string     `json:"id"`
	Title          string     `json:"title"`
	RecordType     string     `json:"record_type"`
	Jurisdiction   string     `json:"jurisdiction"`
	Authority      string     `json:"authority"`
	SourceURL      string     `json:"source_url"`
	SourceStatus   string     `json:"source_status"`
	EffectiveDate  *time.Time `json:"effective_date,omitempty"`
	RetrievedAt    time.Time  `json:"retrieved_at"`
	FreshUntil     time.Time  `json:"fresh_until"`
	Freshness      string     `json:"freshness"`
	OperationalUse string     `json:"operational_use"`
	Notes          string     `json:"notes"`
}

type FacilityRecord struct {
	ID                 string   `json:"id"`
	Name               string   `json:"name"`
	Capacity           *int     `json:"capacity"`
	Capabilities       []string `json:"capabilities"`
	OpeningStatus      string   `json:"opening_status"`
	ValidationStatus   string   `json:"validation_status"`
	SourcePlanRecordID string   `json:"source_plan_record_id"`
}

type JurisdictionSource struct {
	Title     string `json:"title"`
	SourceURL string `json:"source_url"`
}

type SpecialJurisdiction struct {
	Title       string               `json:"title"`
	Description string               `json:"description"`
	Sources     []JurisdictionSource `json:"sources"`
}

type JurisdictionPlan struct {
	ID                  string               `json:"id"`
	Name                string               `json:"name"`
	Islands             []string             `json:"islands"`
	PoliticalCounties   []string             `json:"political_counties"`
	Coverage            string               `json:"coverage"`
	IngestionStatus     string               `json:"ingestion_status"`
	ValidationStatus    string               `json:"validation_status"`
	SpecialJurisdiction *SpecialJurisdiction `json:"special_jurisdiction,omitempty"`
	PlanRecords         []PlanRecord         `json:"plan_records"`
	FacilityRecords     []FacilityRecord     `json:"facility_records"`
	Gaps                []string             `json:"gaps"`
}

type Snapshot struct {
	GeneratedAt   time.Time          `json:"generated_at"`
	Status        string             `json:"status"`
	Summary       Summary            `json:"summary"`
	Jurisdictions []JurisdictionPlan `json:"jurisdictions"`
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
	retrievedAt := time.Date(2026, time.October, 26, 0, 0, 0, 0, time.UTC)
	freshUntil := retrievedAt.Add(90 * 24 * time.Hour)
	freshness := "fresh"
	if !generatedAt.Before(freshUntil) {
		freshness = "stale"
	}

	jurisdictions := []JurisdictionPlan{
		{
			ID:                "honolulu",
			Name:              "City and County of Honolulu",
			Islands:           []string{"Oʻahu"},
			PoliticalCounties: []string{"Honolulu"},
			Coverage:          "published",
			IngestionStatus:   "curated",
			ValidationStatus:  "local_validation_required",
			PlanRecords: []PlanRecord{
				{
					ID:             "honolulu-emergency-shelter-handbook-2024",
					Title:          "Emergency Shelter Handbook",
					RecordType:     "county_shelter_handbook",
					Jurisdiction:   "City and County of Honolulu",
					Authority:      "Honolulu Department of Emergency Management",
					SourceURL:      "https://www.honolulu.gov/dem/wp-content/uploads/sites/64/2025/06/DEM_Shelter_Handbook_Jan_2024.pdf",
					SourceStatus:   "published",
					RetrievedAt:    retrievedAt,
					FreshUntil:     freshUntil,
					Freshness:      freshness,
					OperationalUse: "planning_reference_only",
					Notes:          "The handbook informs County shelter planning but does not report current openings, capacity, or facility readiness.",
				},
			},
			FacilityRecords: []FacilityRecord{},
			Gaps: []string{
				"No authorized machine-readable County shelter roster is available.",
				"Facility capacity, accessibility, backup power, pet support, and opening status require County validation.",
			},
		},
		{
			ID:                "maui",
			Name:              "County of Maui",
			Islands:           []string{"Maui", "Molokaʻi", "Lānaʻi"},
			PoliticalCounties: []string{"Maui", "Kalawao"},
			Coverage:          "partial",
			IngestionStatus:   "reference_only",
			ValidationStatus:  "local_validation_required",
			SpecialJurisdiction: &SpecialJurisdiction{
				Title:       "Kalawao County emergency-management scope",
				Description: "Kalawao remains a separate political county under State Department of Health administration. For emergency management under HRS Chapter 127A, Maui includes Kalawao.",
				Sources: []JurisdictionSource{
					{
						Title:     "HRS §127A-2 emergency-management scope",
						SourceURL: "https://data.capitol.hawaii.gov/hrscurrent/Vol03_Ch0121-0200D/HRS0127A/HRS_0127A-0002.htm",
					},
					{
						Title:     "HRS §326-34 Kalawao governance",
						SourceURL: "https://data.capitol.hawaii.gov/hrscurrent/Vol06_Ch0321-0344/HRS0326/HRS_0326-0034.htm",
					},
				},
			},
			PlanRecords: []PlanRecord{
				{
					ID:             "maui-integrated-preparedness-plan",
					Title:          "Integrated Preparedness Plan",
					RecordType:     "county_preparedness_plan",
					Jurisdiction:   "County of Maui",
					Authority:      "Maui Emergency Management Agency",
					SourceURL:      "https://www.mauicounty.gov/DocumentCenter/View/151888/Integrated-Preparedness-Plan",
					SourceStatus:   "reference_only",
					RetrievedAt:    retrievedAt,
					FreshUntil:     freshUntil,
					Freshness:      freshness,
					OperationalUse: "planning_reference_only",
					Notes:          "The public preparedness plan provides exercise and capability context, not an authoritative shelter roster.",
				},
			},
			FacilityRecords: []FacilityRecord{},
			Gaps: []string{
				"No supported public County shelter plan or machine-readable facility roster was located.",
				"Coverage for Maui, Molokaʻi, Lānaʻi, and State DOH-administered Kalawao must be validated separately.",
			},
		},
		{
			ID:                "hawaii",
			Name:              "County of Hawaiʻi",
			Islands:           []string{"Hawaiʻi"},
			PoliticalCounties: []string{"Hawaiʻi"},
			Coverage:          "unavailable",
			IngestionStatus:   "reference_only",
			ValidationStatus:  "local_validation_required",
			PlanRecords: []PlanRecord{
				{
					ID:             "hawaii-civil-defense-reference",
					Title:          "Hawaiʻi County Civil Defense",
					RecordType:     "agency_reference",
					Jurisdiction:   "County of Hawaiʻi",
					Authority:      "Hawaiʻi County Civil Defense Agency",
					SourceURL:      "https://www.hawaiicounty.gov/departments/civil-defense",
					SourceStatus:   "reference_only",
					RetrievedAt:    retrievedAt,
					FreshUntil:     freshUntil,
					Freshness:      freshness,
					OperationalUse: "agency_reference_only",
					Notes:          "The agency page is retained as a validation path; it is not ingested as a shelter plan.",
				},
			},
			FacilityRecords: []FacilityRecord{},
			Gaps: []string{
				"No supported public County shelter plan or facility roster was located.",
				"County review is required before using any practice facility in an operational plan.",
			},
		},
		{
			ID:                "kauai",
			Name:              "County of Kauaʻi",
			Islands:           []string{"Kauaʻi", "Niʻihau"},
			PoliticalCounties: []string{"Kauaʻi"},
			Coverage:          "unavailable",
			IngestionStatus:   "reference_only",
			ValidationStatus:  "local_validation_required",
			PlanRecords: []PlanRecord{
				{
					ID:             "kauai-ema-reference",
					Title:          "Kauaʻi Emergency Management Agency",
					RecordType:     "agency_reference",
					Jurisdiction:   "County of Kauaʻi",
					Authority:      "Kauaʻi Emergency Management Agency",
					SourceURL:      "https://www.kauai.gov/Government/Departments-Agencies/Emergency-Management-Agency",
					SourceStatus:   "reference_only",
					RetrievedAt:    retrievedAt,
					FreshUntil:     freshUntil,
					Freshness:      freshness,
					OperationalUse: "agency_reference_only",
					Notes:          "The agency page is retained as a validation path; it is not ingested as a shelter plan.",
				},
			},
			FacilityRecords: []FacilityRecord{},
			Gaps: []string{
				"No supported public County shelter plan or facility roster was located.",
				"Coverage for Kauaʻi and Niʻihau requires County validation.",
			},
		},
	}

	return Snapshot{
		GeneratedAt: generatedAt,
		Status:      "partial",
		Summary: Summary{
			JurisdictionsWithPublishedPlan: 1,
			PlanningJurisdictionsTotal:     len(jurisdictions),
			PoliticalCountiesTotal:         5,
			OfficialFacilityRecords:        0,
			JurisdictionsRequiringReview:   len(jurisdictions),
		},
		Jurisdictions: jurisdictions,
	}, nil
}
