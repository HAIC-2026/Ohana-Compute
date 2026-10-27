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
    jurisdictions_with_published_plan: 1,
    planning_jurisdictions_total: 4,
    political_counties_total: 5,
    official_facility_records: 0,
    jurisdictions_requiring_review: 4,
  },
  jurisdictions: [
    {
      id: 'honolulu',
      name: 'City and County of Honolulu',
      islands: ['Oʻahu'],
      political_counties: ['Honolulu'],
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
      political_counties: ['Maui', 'Kalawao'],
      coverage: 'partial',
      ingestion_status: 'reference_only',
      validation_status: 'local_validation_required',
      special_jurisdiction: {
        title: 'Kalawao County emergency-management scope',
        description:
          'Kalawao remains a separate political county under State Department of Health administration. For emergency management under HRS Chapter 127A, Maui includes Kalawao.',
        sources: [
          {
            title: 'HRS §127A-2 emergency-management scope',
            source_url: 'https://example.test/hrs-127a-2',
          },
          {
            title: 'HRS §326-34 Kalawao governance',
            source_url: 'https://example.test/hrs-326-34',
          },
        ],
      },
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
        'Coverage for Maui, Molokaʻi, Lānaʻi, and State DOH-administered Kalawao must be validated separately.',
      ],
    },
    {
      id: 'hawaii',
      name: 'County of Hawaiʻi',
      islands: ['Hawaiʻi'],
      political_counties: ['Hawaiʻi'],
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
      political_counties: ['Kauaʻi'],
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

function practiceArea({
  id,
  name,
  island,
  jurisdiction,
  communities,
  briefingName,
  resourceNames,
  routeNames,
  afnFixture,
}: {
  id: string
  name: string
  island: string
  jurisdiction: 'honolulu' | 'maui' | 'hawaii' | 'kauai'
  communities: string[]
  briefingName: string
  resourceNames: [string, string, string]
  routeNames: [string, string, string]
  afnFixture: string
}) {
  const coordinatesByIsland: Record<string, [number, number]> = {
    Oʻahu: [-157.858, 21.307],
    Maui: [-156.49, 20.86],
    Hawaiʻi: [-155.08, 19.71],
    Kauaʻi: [-159.35, 22.05],
  }
  const center = coordinatesByIsland[island]
  const routes = routeNames.map((routeName, index) => ({
    name: routeName,
    purpose: index === 0 ? 'Primary practice access' : 'Practice alternate',
    verification_status:
      index === 1 ? 'practice_confirmed' : 'needs_confirmation',
  }))

  return {
    id,
    name,
    island,
    jurisdiction_id: jurisdiction,
    communities,
    summary: `${briefingName} uses distinct local practice resources and routes.`,
    response_focus: {
      hurricane: `Stage ${island} support before travel conditions deteriorate.`,
      flood: `Protect ${island} access before low crossings close.`,
      wildfire: `Move early when ${island} smoke or closures threaten access.`,
      tsunami: `Follow official ${island} evacuation-zone guidance.`,
    },
    afn_fixture_key: afnFixture,
    shelter_plan_jurisdiction_id: jurisdiction,
    briefing: {
      id: `${id}-workflow`,
      name: briefingName,
      summary: `${briefingName} coordinates accessible transport, medical continuity, and local route validation.`,
      closest_resources: resourceNames.slice(0, 2).map((resourceName) => ({
        name: resourceName,
        kind: 'Practice resource',
        distance: 'Representative area resource',
        note: 'Practice record; opening status is not reported.',
      })),
      routes,
      traffic_hazards: [
        `${island} routes can lose redundancy during severe weather.`,
      ],
      coordination: {
        decision_owner: `${name} County practice coordination`,
        communication_path: `${island} County alerts and community relays`,
        afn_actions: [
          `Stage accessible transportation for ${communities[0]}.`,
          'Confirm powered-equipment and language support.',
        ],
      },
      evidence: {
        status: 'Practice estimate',
        basis: 'Deterministic representative workflow fixture.',
        updated: '2026-10-27',
        validation: 'County validation required before operational use.',
      },
      decisions: {
        hurricane: {
          label: 'Prepare to leave',
          action: `Stage ${island} accessible transport and continuity support before damaging winds.`,
          reason: 'Travel and utility conditions can deteriorate quickly.',
          trigger: `Before tropical-storm-force winds reach ${island}.`,
        },
        flood: {
          label: 'Follow local alert',
          action: `Use confirmed ${island} routes and avoid flooded crossings.`,
          reason: 'Flooding can isolate individual communities.',
          trigger: 'When County alerts identify flooding or closures.',
        },
        wildfire: {
          label: 'Prepare to leave',
          action: `Leave early when official alerts include this ${island} area.`,
          reason: 'Smoke and closures can remove safe travel options.',
          trigger: 'When wildfire warnings threaten local access.',
        },
        tsunami: {
          label: 'Move inland',
          action: `Move out of official ${island} tsunami evacuation zones.`,
          reason: 'Official zone status determines whether residents move.',
          trigger: `When an official tsunami warning includes ${island}.`,
        },
      },
    },
    practice_resources: resourceNames.map((resourceName, index) => ({
      id: `${id}-resource-${index + 1}`,
      name: resourceName,
      kind:
        index === 0 ? 'shelter' : index === 1 ? 'medical-power' : 'transport',
      coordinates: [center[0] + index * 0.01, center[1] + index * 0.01],
      capacity: 180 - index * 50,
      capabilities:
        index === 0
          ? ['Accessible entry', 'Language assistance']
          : index === 1
            ? ['Backup power', 'Equipment charging']
            : ['Wheelchair transport', 'Pickup coordination'],
      verification_status:
        index === 1 ? 'needs_confirmation' : 'practice_confirmed',
    })),
    practice_routes: routes,
  }
}

export const planningAreaCatalog = {
  generated_at: '2026-10-28T00:00:00Z',
  status: 'complete',
  summary: {
    planning_jurisdictions_total: 4,
    political_counties_total: 5,
    representative_workflows: 4,
  },
  provenance: {
    dataset_mode: 'practice',
    methodology:
      'Deterministic representative workflows; local validation required.',
    reviewed_at: '2026-10-27T00:00:00Z',
    fresh_until: '2027-04-25T00:00:00Z',
    freshness: 'fresh',
  },
  jurisdictions: [
    {
      id: 'honolulu',
      name: 'City and County of Honolulu',
      islands: ['Oʻahu'],
      political_counties: ['Honolulu'],
      coverage: 'representative',
      scope_note:
        'Urban Honolulu is representative; other Oʻahu areas retain existing practice depth.',
      areas: [
        practiceArea({
          id: 'oahu-town',
          name: 'Urban Honolulu',
          island: 'Oʻahu',
          jurisdiction: 'honolulu',
          communities: ['Downtown Honolulu', 'Ala Moana', 'Waikīkī'],
          briefingName: 'Urban Honolulu vertical mass-care workflow',
          resourceNames: [
            'Urban Honolulu practice powered shelter',
            'Kakaʻako practice medical-power hub',
            'Urban Honolulu accessible transport staging',
          ],
          routeNames: [
            'H-1 urban corridor',
            'Ala Moana–Waikīkī shoreline route',
            'Pali Highway medical access',
          ],
          afnFixture: 'oahu-town-highrise-transit',
        }),
      ],
    },
    {
      id: 'maui',
      name: 'County of Maui',
      islands: ['Maui', 'Molokaʻi', 'Lānaʻi'],
      political_counties: ['Maui', 'Kalawao'],
      coverage: 'representative',
      scope_note:
        'Central and West Maui is representative. Molokaʻi, Lānaʻi, and State DOH-administered Kalawao require separate validation.',
      areas: [
        practiceArea({
          id: 'maui-central',
          name: 'Central & West Maui',
          island: 'Maui',
          jurisdiction: 'maui',
          communities: ['Kahului', 'Wailuku', 'West Maui'],
          briefingName: 'Maui corridor continuity workflow',
          resourceNames: [
            'Central Maui practice reception site',
            'Wailuku practice medical-power hub',
            'Maui accessible transport staging',
          ],
          routeNames: [
            'Honoapiʻilani Highway west access',
            'Kaʻahumanu Avenue medical corridor',
            'Piʻilani Highway south bypass',
          ],
          afnFixture: 'maui-central-wildfire-continuity',
        }),
      ],
    },
    {
      id: 'hawaii',
      name: 'County of Hawaiʻi',
      islands: ['Hawaiʻi'],
      political_counties: ['Hawaiʻi'],
      coverage: 'representative',
      scope_note:
        'Hilo and Lower Puna is representative; other Hawaiʻi Island districts require local validation.',
      areas: [
        practiceArea({
          id: 'hawaii-hilo',
          name: 'Hilo & Lower Puna',
          island: 'Hawaiʻi',
          jurisdiction: 'hawaii',
          communities: ['Hilo', 'Keaʻau', 'Pāhoa'],
          briefingName: 'East Hawaiʻi medical continuity workflow',
          resourceNames: [
            'Hilo district practice shelter',
            'Puna practice medical-power support hub',
            'East Hawaiʻi accessible transport staging',
          ],
          routeNames: [
            'Hawaiʻi Belt Road Hilo–Puna access',
            'Daniel K. Inouye Highway medical access',
            'Pāhoa bypass and Highway 130',
          ],
          afnFixture: 'hawaii-hilo-medical-power',
        }),
      ],
    },
    {
      id: 'kauai',
      name: 'County of Kauaʻi',
      islands: ['Kauaʻi', 'Niʻihau'],
      political_counties: ['Kauaʻi'],
      coverage: 'representative',
      scope_note:
        'East Kauaʻi is representative; Niʻihau requires locally authorized planning.',
      areas: [
        practiceArea({
          id: 'kauai-east',
          name: 'East Kauaʻi',
          island: 'Kauaʻi',
          jurisdiction: 'kauai',
          communities: ['Kapaʻa', 'Wailua', 'Līhuʻe'],
          briefingName: 'East Kauaʻi flood-isolation workflow',
          resourceNames: [
            'East Kauaʻi practice shelter',
            'Līhuʻe practice medical-power staging',
            'Kapaʻa accessible transport staging',
          ],
          routeNames: [
            'Kūhiō Highway Wailua crossing',
            'Kaumualiʻi Highway cross-island support',
            'Līhuʻe alternate access',
          ],
          afnFixture: 'kauai-east-flood-isolation',
        }),
      ],
    },
  ],
  unsupported_areas: ['Molokaʻi', 'Lānaʻi', 'Niʻihau', 'Kalawao'],
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
    await page.route('**/api/v1/planning-areas', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(planningAreaCatalog),
      })
    })
    await use(page)
  },
})

export { expect }
