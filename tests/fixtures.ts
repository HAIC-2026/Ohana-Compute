import { expect, test as base } from '@playwright/test'

export const communityProfile = {
  acs: {
    geography: {
      name: 'Census Tract 1.20, Honolulu County',
    },
    population: {
      estimate: 2361,
      margin_of_error: 140,
    },
    no_vehicle_households: {
      estimate: 80,
      margin_of_error: 15,
      percent: 8.5,
      percent_margin_of_error: 1.8,
    },
    limited_english_population: {
      estimate: 150,
      margin_of_error: 40,
      percent: 6.4,
      percent_margin_of_error: 1.7,
    },
    population_with_disability: {
      estimate: 220,
      margin_of_error: 50,
      percent: 9.3,
      percent_margin_of_error: 2.1,
    },
    population_below_poverty: {
      estimate: 120,
      margin_of_error: 35,
      percent: 5.1,
      percent_margin_of_error: 1.5,
    },
    source: {
      id: 'acs-5-year',
      authority: 'U.S. Census Bureau',
      vintage: '2024 ACS 5-year',
      status: 'fresh',
    },
  },
  empower: {
    county: 'Honolulu',
    zip_code: '96816',
    medicare_beneficiaries: {
      value: 410,
      may_represent_masked_cell: false,
    },
    power_dependent_dme: {
      value: 11,
      may_represent_masked_cell: true,
    },
    facility_dialysis_any_dme: {
      value: 18,
      may_represent_masked_cell: false,
    },
    oxygen_services_any_dme: {
      value: 23,
      may_represent_masked_cell: false,
    },
    home_health_services_any_dme: {
      value: 31,
      may_represent_masked_cell: false,
    },
    at_home_hospice_any_dme: {
      value: 12,
      may_represent_masked_cell: false,
    },
    any_healthcare_service_any_dme: {
      value: 75,
      may_represent_masked_cell: false,
    },
    source: {
      id: 'hhs-empower',
      authority: 'U.S. Department of Health and Human Services',
      vintage: 'Current public aggregate',
      status: 'fresh',
    },
  },
  svi: {
    location: 'Census Tract 1.20; Honolulu County; Hawaii',
    population: 2361,
    age_65_or_older: 410,
    with_disability: 220,
    limited_english: 150,
    no_vehicle_households: 80,
    overall_percentile: 0.1185,
    housing_transportation_percentile: 0.11,
    source: {
      id: 'cdc-svi-2022',
      authority: 'CDC/ATSDR',
      status: 'fresh',
    },
  },
  fema_national_risk: {
    risk_rating: 'Relatively Moderate',
    expected_annual_loss_rating: 'Relatively Moderate',
    social_vulnerability_rating: 'Relatively Low',
    community_resilience_rating: 'Relatively High',
    source: {
      id: 'fema-nri',
      authority: 'Federal Emergency Management Agency',
      status: 'fresh',
    },
  },
  disclaimer:
    "All values describe aggregate planning geographies. They must not be used to infer an individual's disability, language, medical equipment, income, transportation access, or evacuation behavior.",
}

export const countyShelterPlans = {
  generated_at: '2026-10-27T00:00:00Z',
  status: 'partial',
  summary: {
    counties_with_published_plan: 1,
    counties_total: 4,
    official_facility_records: 0,
    counties_requiring_review: 4,
  },
  counties: [
    {
      id: 'honolulu',
      name: 'City and County of Honolulu',
      islands: ['Oʻahu'],
      coverage: 'published',
      ingestion_status: 'curated',
      validation_status: 'local_validation_required',
      plan_records: [
        {
          id: 'honolulu-emergency-shelter-handbook-2024',
          title: 'Emergency Shelter Handbook',
          record_type: 'county_shelter_handbook',
          jurisdiction: 'City and County of Honolulu',
          authority: 'Honolulu Department of Emergency Management',
          source_url: 'https://example.test/honolulu-shelter-handbook.pdf',
          source_status: 'published',
          retrieved_at: '2026-10-26T00:00:00Z',
          fresh_until: '2027-01-24T00:00:00Z',
          freshness: 'fresh',
          operational_use: 'planning_reference_only',
          notes:
            'The handbook informs County shelter planning but does not report current openings, capacity, or facility readiness.',
        },
      ],
      facility_records: [],
      gaps: [
        'No authorized machine-readable County shelter roster is available.',
        'Facility capability and opening status require County validation.',
      ],
    },
    {
      id: 'maui',
      name: 'County of Maui',
      islands: ['Maui', 'Molokaʻi', 'Lānaʻi'],
      coverage: 'partial',
      ingestion_status: 'reference_only',
      validation_status: 'local_validation_required',
      plan_records: [
        {
          id: 'maui-integrated-preparedness-plan',
          title: 'Integrated Preparedness Plan',
          record_type: 'county_preparedness_plan',
          jurisdiction: 'County of Maui',
          authority: 'Maui Emergency Management Agency',
          source_url: 'https://example.test/maui-preparedness-plan',
          source_status: 'reference_only',
          retrieved_at: '2026-10-26T00:00:00Z',
          fresh_until: '2027-01-24T00:00:00Z',
          freshness: 'fresh',
          operational_use: 'planning_reference_only',
          notes:
            'The public preparedness plan provides capability context, not an authoritative shelter roster.',
        },
      ],
      facility_records: [],
      gaps: [
        'No supported public County shelter plan or machine-readable facility roster was located.',
        'Coverage for Maui, Molokaʻi, and Lānaʻi must be validated separately.',
      ],
    },
    {
      id: 'hawaii',
      name: 'County of Hawaiʻi',
      islands: ['Hawaiʻi'],
      coverage: 'unavailable',
      ingestion_status: 'reference_only',
      validation_status: 'local_validation_required',
      plan_records: [
        {
          id: 'hawaii-civil-defense-reference',
          title: 'Hawaiʻi County Civil Defense',
          record_type: 'agency_reference',
          jurisdiction: 'County of Hawaiʻi',
          authority: 'Hawaiʻi County Civil Defense Agency',
          source_url: 'https://example.test/hawaii-civil-defense',
          source_status: 'reference_only',
          retrieved_at: '2026-10-26T00:00:00Z',
          fresh_until: '2027-01-24T00:00:00Z',
          freshness: 'fresh',
          operational_use: 'agency_reference_only',
          notes:
            'The agency page is a validation path, not an ingested shelter plan.',
        },
      ],
      facility_records: [],
      gaps: [
        'No supported public County shelter plan or facility roster was located.',
        'County review is required before operational use.',
      ],
    },
    {
      id: 'kauai',
      name: 'County of Kauaʻi',
      islands: ['Kauaʻi', 'Niʻihau'],
      coverage: 'unavailable',
      ingestion_status: 'reference_only',
      validation_status: 'local_validation_required',
      plan_records: [
        {
          id: 'kauai-ema-reference',
          title: 'Kauaʻi Emergency Management Agency',
          record_type: 'agency_reference',
          jurisdiction: 'County of Kauaʻi',
          authority: 'Kauaʻi Emergency Management Agency',
          source_url: 'https://example.test/kauai-ema',
          source_status: 'reference_only',
          retrieved_at: '2026-10-26T00:00:00Z',
          fresh_until: '2027-01-24T00:00:00Z',
          freshness: 'fresh',
          operational_use: 'agency_reference_only',
          notes:
            'The agency page is a validation path, not an ingested shelter plan.',
        },
      ],
      facility_records: [],
      gaps: [
        'No supported public County shelter plan or facility roster was located.',
        'Coverage for Kauaʻi and Niʻihau requires County validation.',
      ],
    },
  ],
}

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route('**/api/v1/community/profile?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(communityProfile),
      })
    })
    await page.route('**/api/v1/shelter-plans', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(countyShelterPlans),
      })
    })
    await use(page)
  },
})

export { expect }
