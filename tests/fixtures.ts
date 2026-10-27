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

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route('**/api/v1/community/profile?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(communityProfile),
      })
    })
    await use(page)
  },
})

export { expect }
