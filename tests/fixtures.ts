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

export const eventTriggerSnapshot = {
  schema_version: 'event-trigger-snapshot.v1',
  generated_at: '2026-10-27T08:00:00Z',
  status: 'complete',
  planning_disclaimer: 'Planning context — not an evacuation order',
  county_order_notice: 'County evacuation-order data unavailable',
  unavailable_meaning: 'Unavailable does not mean no order.',
  triggers: [
    {
      schema_version: 'event-trigger-snapshot.v1',
      generated_at: '2026-10-27T08:00:00Z',
      source: 'nws',
      hazard_event_kind: 'flood',
      jurisdiction_scope: 'multi_county',
      lifecycle: 'active',
      planning_state: 'prepare',
      authority_kind: 'federal_warning_center',
      legal_order_status: 'not_an_evacuation_order',
      authority_limitation:
        'Planning context only. A CAP response type is not a legal evacuation order.',
      planning_consequence:
        'Monitor the official source and prepare without inferring an evacuation order.',
      title: 'Fixture Flood Advisory',
      facts: {
        severity: 'Minor',
        certainty: 'Likely',
        urgency: 'Expected',
        response_type: 'Evacuate',
      },
      provenance: {
        source_authority: 'NOAA National Weather Service',
        product_id: 'fixture-nws-advisory',
        product_type: 'Flood Advisory',
        issued_at: '2026-10-27T07:45:00Z',
        effective_at: '2026-10-27T07:45:00Z',
        expires_at: '2026-10-27T09:30:00Z',
        retrieved_at: '2026-10-27T08:00:00Z',
        fresh_until: '2026-10-27T08:05:00Z',
        source_status: 'fresh',
        official_instructions_url: 'https://www.weather.gov/hfo/',
      },
    },
    {
      schema_version: 'event-trigger-snapshot.v1',
      generated_at: '2026-10-27T08:00:00Z',
      source: 'usgs_hans',
      hazard_event_kind: 'volcano',
      jurisdiction_scope: 'statewide',
      lifecycle: 'unavailable',
      planning_state: 'unavailable',
      authority_kind: 'federal_science_agency',
      legal_order_status: 'unavailable',
      authority_limitation:
        'Production ingestion is disabled. Web pages are not scraped.',
      planning_consequence:
        'Verify volcano status directly with USGS HVO and local authorities.',
      title: 'USGS HANS operational feed unavailable',
      facts: {},
      provenance: {
        source_authority: 'U.S. Geological Survey',
        product_type: 'volcano_notification',
        retrieved_at: '2026-10-27T08:00:00Z',
        source_status: 'unavailable',
        official_instructions_url: 'https://volcanoes.usgs.gov/hans-public/',
      },
    },
    {
      schema_version: 'event-trigger-snapshot.v1',
      generated_at: '2026-10-27T08:00:00Z',
      source: 'county_order',
      hazard_event_kind: 'all_hazards',
      jurisdiction_scope: 'county',
      lifecycle: 'unavailable',
      planning_state: 'unavailable',
      authority_kind: 'county_emergency_management',
      legal_order_status: 'unavailable',
      authority_limitation:
        'County evacuation-order data unavailable. Unavailable does not mean no order.',
      planning_consequence:
        'Check official County and State channels before making order assumptions.',
      title: 'County evacuation-order data unavailable',
      facts: {},
      provenance: {
        source_authority: 'Hawaiʻi emergency-management authorities',
        product_type: 'evacuation_order',
        retrieved_at: '2026-10-27T08:00:00Z',
        source_status: 'unavailable',
        official_instructions_url: 'https://dod.hawaii.gov/hiema/get-ready/',
      },
    },
  ],
}

export const operationalStatusSnapshot = {
  schema_version: 'live-operational-status.v1',
  generated_at: '2026-10-27T08:00:00Z',
  status: 'partial',
  disclaimer:
    'Reported live status is source-specific. Unavailable never means normal, open, passable, restored, contained, or all clear.',
  domains: [
    unavailableOperationalDomain(
      'evacuation_order',
      'Authorized Hawaiʻi governor and county mayors',
      'No verified public statewide machine-readable contract for attributable current legal evacuation orders',
    ),
    unavailableOperationalDomain(
      'road_transport',
      'Hawaiʻi Department of Transportation and County road authorities',
      'No verified public statewide machine-readable emergency closure and passability contract',
      'planned_reference',
    ),
    {
      domain: 'shelter',
      status: 'reported_live',
      reference_kind: 'operational',
      summary:
        'FEMA National Shelter System records reported open by participating authorities.',
      coverage: {
        scope: 'statewide_reported_records',
        areas: ['Hawaiʻi'],
        notes: 'Coverage depends on participating reporting authorities.',
      },
      freshness: {
        retrieved_at: '2026-10-27T08:00:00Z',
        fresh_until: '2026-10-27T08:05:00Z',
      },
      provenance: {
        source_id: 'fema-open-shelters',
        authority: 'Federal Emergency Management Agency and reporting partners',
        source_url:
          'https://gis.fema.gov/arcgis/rest/services/NSS/OpenShelters/MapServer/0',
        access: 'ArcGIS REST / GeoJSON',
        checked_at: '2026-10-27',
        decision: 'ADOPT',
        data_class: 'reported_live',
      },
      limitations: [
        'FEMA records remain separate from County shelter-plan provenance and practice facilities.',
      ],
      shelters: [
        {
          id: 'fixture-live-shelter',
          name: 'Fixture reported open shelter',
          address: 'Official fixture address',
          city: 'Honolulu',
          reported_status: 'OPEN',
          capacity: 85,
          wheelchair_accessible: 'YES',
          pet_accommodations_code: 'HOUSEHOLD_PETS',
          reporting_organization: 'Fixture reporting authority',
          distance_miles: 3.2,
        },
      ],
    },
    unavailableOperationalDomain(
      'transit_paratransit',
      'County transit and paratransit operators',
      'No verified public statewide machine-readable disruption and paratransit operational-status contract',
      'reference_only',
    ),
    unavailableOperationalDomain(
      'utility_outage',
      'Hawaiian Electric and Kauaʻi Island Utility Cooperative',
      'No documented supported public machine-readable statewide outage contract',
    ),
    unavailableOperationalDomain(
      'wildfire',
      'Hawaiʻi fire authorities and land-management agencies',
      'No verified Hawaiʻi-authoritative machine contract for complete incident, containment, protective-action, and evacuation status',
      'reference_only',
    ),
  ],
}

function unavailableOperationalDomain(
  domain: string,
  authority: string,
  missingArtifact: string,
  referenceKind = 'none',
) {
  return {
    domain,
    status: 'unavailable',
    reference_kind: referenceKind,
    summary: `${domain.replaceAll('_', ' ')} operational status unavailable.`,
    coverage: {
      scope: 'unavailable',
      areas: ['Hawaiʻi'],
      notes: 'Unsupported coverage remains explicit.',
    },
    freshness: {},
    provenance: {
      source_id: `${domain.replaceAll('_', '-')}-boundary`,
      authority,
      source_url: 'https://example.test/checked-source',
      access: 'Public source review; no supported runtime contract',
      checked_at: '2026-10-27',
      decision: 'SKIP',
      data_class: 'unavailable',
    },
    limitations: [
      'Unavailable never means normal, open, passable, restored, contained, or all clear.',
    ],
    unavailable_boundary: {
      missing_artifact: missingArtifact,
      owning_authority: authority,
      verification: 'Checked official public channels.',
    },
  }
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

export function resourceDemandFixture(request: {
  geography: { id: string; kind: 'planning_area' }
  population:
    | {
        status: 'available'
        estimate: number
        margin_of_error?: number
        source: { id: 'acs-5-year'; freshness: 'fresh' | 'stale' }
      }
    | {
        status: 'unavailable'
        source: { id: 'unavailable'; freshness: 'unavailable' }
      }
  medical_power: {
    status: 'available' | 'unavailable'
    masked: boolean
    value?: number
    source_id: 'hhs-empower' | 'unavailable'
  }
  scenario: {
    service_days: number
    shelter_standard: 'evacuation' | 'short_term'
  }
  practice_supplies: Array<{
    category: string
    unit: string
    quantity: number
    geography_id: string
    validation_status: string
  }>
}) {
  const unavailableLine = (
    id: string,
    label: string,
    reason: string,
    basis: string,
  ) => ({
    id,
    label,
    status: 'unavailable',
    unit: 'local_planning_factor',
    basis,
    evidence: ['mass-care-scenario-v0.1'],
    notes: [],
    unavailable_reason: reason,
  })
  const assessments = request.practice_supplies.map((supply) => {
    const status =
      supply.validation_status === 'practice_confirmed' &&
      supply.geography_id === request.geography.id &&
      supply.category === 'shelter_spaces' &&
      supply.unit === 'people'
        ? 'applied'
        : 'excluded'
    return {
      category: supply.category,
      unit: supply.unit,
      quantity: supply.quantity,
      status,
      ...(status === 'excluded'
        ? {
            reason:
              supply.validation_status !== 'practice_confirmed'
                ? 'not_confirmed'
                : supply.geography_id !== request.geography.id
                  ? 'geography_mismatch'
                  : 'unit_mismatch',
          }
        : {}),
    }
  })
  const appliedShelterSupply = assessments
    .filter((assessment) => assessment.status === 'applied')
    .reduce((total, assessment) => total + assessment.quantity, 0)
  const appliedRecords = assessments.filter(
    (assessment) => assessment.status === 'applied',
  ).length

  if (request.population.status === 'unavailable') {
    return {
      schema_version: 'resource-demand-response.v1',
      model_version: 'mass-care-demand-v0.1',
      assumption_version: 'hawaii-mass-care-scenario-v0.1',
      calculation_id: 'fixture-unavailable',
      status: 'unavailable',
      geography: request.geography,
      population: request.population,
      scenario: request.scenario,
      assumptions: [],
      lines: [
        unavailableLine(
          'service_population',
          'People requiring mass-care services',
          'population_unavailable',
          'Aggregate planning population is required.',
        ),
      ],
      supply_assessments: assessments,
      sources: [],
      disclaimers: ['Missing evidence is unavailable, not zero.'],
    }
  }

  const margin = request.population.margin_of_error ?? 0
  const population = {
    low: Math.max(0, request.population.estimate - margin),
    planning: request.population.estimate,
    high: request.population.estimate + margin,
  }
  const servicePopulation = {
    low: Math.ceil(population.low * 0.11),
    planning: Math.ceil(population.planning * 0.23),
    high: Math.ceil(population.high * 0.35),
  }
  const scale = (factor: number) => ({
    low: servicePopulation.low * factor,
    planning: servicePopulation.planning * factor,
    high: servicePopulation.high * factor,
  })
  const floorArea =
    request.scenario.shelter_standard === 'evacuation'
      ? scale(20)
      : {
          low: servicePopulation.low * 40,
          planning: servicePopulation.planning * 50,
          high: servicePopulation.high * 60,
        }
  const meals = scale(3 * request.scenario.service_days)
  const water = {
    low: Math.ceil(servicePopulation.low * 3 * request.scenario.service_days),
    planning: Math.ceil(
      servicePopulation.planning * 3.4 * request.scenario.service_days,
    ),
    high: Math.ceil(
      servicePopulation.high * 3.785 * request.scenario.service_days,
    ),
  }
  const withGap = (
    id: string,
    label: string,
    unit: string,
    demand: typeof servicePopulation,
    supply = 0,
    records = 0,
  ) => ({
    id,
    label,
    status: 'modeled',
    unit,
    demand,
    supply: { applied_quantity: supply, applied_records: records },
    gap: {
      low: Math.max(0, demand.low - supply),
      planning: Math.max(0, demand.planning - supply),
      high: Math.max(0, demand.high - supply),
    },
    basis: 'Versioned deterministic fixture.',
    evidence: ['mass-care-scenario-v0.1'],
    notes: [],
  })

  return {
    schema_version: 'resource-demand-response.v1',
    model_version: 'mass-care-demand-v0.1',
    assumption_version: 'hawaii-mass-care-scenario-v0.1',
    calculation_id: `fixture-${request.geography.id}-${request.scenario.service_days}-${appliedShelterSupply}`,
    status: 'partial',
    geography: request.geography,
    population: {
      ...request.population,
      range: population,
    },
    scenario: request.scenario,
    assumptions: [
      {
        id: 'mass-care-service-envelope',
        label: 'Mass-care service population',
        unit: 'share_of_aggregate_population',
        values: [0.11, 0.23, 0.35],
        basis: 'Versioned scenario assumption.',
        evidence: ['mass-care-scenario-v0.1'],
      },
    ],
    lines: [
      {
        id: 'service_population',
        label: 'People requiring mass-care services',
        status: 'modeled',
        unit: 'people',
        demand: servicePopulation,
        basis: 'Versioned deterministic fixture.',
        evidence: ['mass-care-scenario-v0.1'],
        notes: [],
      },
      withGap(
        'shelter_spaces',
        'Shelter service spaces',
        'people',
        servicePopulation,
        appliedShelterSupply,
        appliedRecords,
      ),
      {
        id: 'shelter_floor_area_sq_ft',
        label:
          request.scenario.shelter_standard === 'evacuation'
            ? 'Evacuation shelter floor area'
            : 'Short-term shelter floor area',
        status: 'modeled',
        unit: 'square_feet',
        demand: floorArea,
        basis: 'Versioned deterministic fixture.',
        evidence: ['fema-p785'],
        notes: [],
      },
      withGap('cots', 'Cots or sleeping places', 'cots', servicePopulation),
      withGap('meals', 'Meal equivalents', 'meals', meals),
      withGap('potable_water_liters', 'Potable water', 'liters', water),
      unavailableLine(
        'sanitation_support',
        'Sanitation support',
        'local_assumption_required',
        'No statewide approved coefficient is encoded.',
      ),
      unavailableLine(
        'shelter_staff',
        'Role-specific shelter staffing',
        'local_assumption_required',
        'Staffing must be modeled by role.',
      ),
      unavailableLine(
        'medical_power_support',
        'Medical equipment power continuity',
        request.medical_power.masked
          ? 'privacy_masked'
          : 'local_assumption_required',
        'Aggregate evidence does not establish equipment demand.',
      ),
      unavailableLine(
        'accessible_transport',
        'Accessible transportation',
        'coefficient_unavailable',
        'No defensible public uptake coefficient is available.',
      ),
      unavailableLine(
        'backup_power_sites',
        'Backup-power sites',
        'coefficient_unavailable',
        'Facility loads and duration are required.',
      ),
      unavailableLine(
        'pet_service_animal_spaces',
        'Pet and service-animal spaces',
        'coefficient_unavailable',
        'No authorized aggregate factor is available.',
      ),
    ],
    supply_assessments: assessments,
    sources: [
      {
        id: 'hawaii-sesf6-2025',
        title: 'State Emergency Support Function #6 Annex',
        authority: 'Hawaiʻi Emergency Management Agency',
        url: 'https://example.test/sesf6.pdf',
        reviewed_at: '2026-10-26',
        fresh_until: '2027-01-24',
        use: 'Mass-care scope and roles; not a demand forecast.',
      },
      {
        id: 'mass-care-scenario-v0.1',
        title: 'Hawaiʻi Mass Care Planner scenario assumptions',
        authority: 'Planner model',
        url: 'https://example.test/model',
        reviewed_at: '2026-10-26',
        fresh_until: '2027-01-24',
        use: 'Explicit versioned stress-test assumptions.',
      },
    ],
    disclaimers: ['Scenario ranges are not forecasts or allocations.'],
  }
}

export function partnerMatchFixture(
  jurisdiction: string,
  capabilities: string[],
) {
  const partners = {
    'mass-care-coordination': [
      {
        id: 'hiema',
        name: 'Hawaiʻi Emergency Management Agency',
        organization_type: 'state_agency',
        capability: 'mass-care-coordination',
        role: 'State ESF-6 coordination and resource-request coordination.',
        coverage: ['statewide'],
        validation_state: 'official_plan_role',
        source_id: 'hawaii-sesf6-2025',
        source_title: 'State Emergency Support Function #6 Annex',
        source_publisher: 'Hawaiʻi Emergency Management Agency',
      },
    ],
    sheltering: [
      ...(jurisdiction === 'honolulu'
        ? [
            {
              id: 'honolulu-dem',
              name: 'Honolulu Department of Emergency Management',
              organization_type: 'county_agency',
              capability: 'sheltering',
              role: 'County emergency-shelter planning and coordination.',
              coverage: ['honolulu'],
              validation_state: 'official_county_role',
              source_id: 'honolulu-dem-shelter-guidance',
              source_title: 'Emergency shelters',
              source_publisher: 'Honolulu Department of Emergency Management',
            },
          ]
        : []),
      {
        id: 'red-cross-pacific-islands',
        name: 'American Red Cross Pacific Islands Region',
        organization_type: 'nonprofit',
        capability: 'sheltering',
        role: 'State-plan temporary-shelter support association.',
        coverage: ['statewide'],
        validation_state: 'official_plan_role',
        source_id: 'hawaii-sesf6-2025',
        source_title: 'State Emergency Support Function #6 Annex',
        source_publisher: 'Hawaiʻi Emergency Management Agency',
      },
    ],
    'feeding-production': [
      {
        id: 'salvation-army-hawaii',
        name: 'The Salvation Army Hawaiian & Pacific Islands',
        organization_type: 'nonprofit',
        capability: 'feeding-production',
        role: 'State-plan feeding support association.',
        coverage: ['statewide'],
        validation_state: 'official_plan_role',
        source_id: 'hawaii-sesf6-2025',
        source_title: 'State Emergency Support Function #6 Annex',
        source_publisher: 'Hawaiʻi Emergency Management Agency',
      },
    ],
    'feeding-distribution': [
      {
        id: 'salvation-army-hawaii',
        name: 'The Salvation Army Hawaiian & Pacific Islands',
        organization_type: 'nonprofit',
        capability: 'feeding-distribution',
        role: 'State-plan feeding and distribution support association.',
        coverage: ['statewide'],
        validation_state: 'official_plan_role',
        source_id: 'hawaii-sesf6-2025',
        source_title: 'State Emergency Support Function #6 Annex',
        source_publisher: 'Hawaiʻi Emergency Management Agency',
      },
    ],
    'emergency-supplies-distribution': [
      {
        id: 'salvation-army-hawaii',
        name: 'The Salvation Army Hawaiian & Pacific Islands',
        organization_type: 'nonprofit',
        capability: 'emergency-supplies-distribution',
        role: 'Self-described disaster supply and distribution support.',
        coverage: ['statewide'],
        validation_state: 'organization_self_described',
        source_id: 'salvation-army-disaster-relief',
        source_title: 'Disaster relief',
        source_publisher: 'The Salvation Army Hawaiian & Pacific Islands',
      },
    ],
    'information-referral': [
      {
        id: 'aloha-united-way-211',
        name: 'Aloha United Way 211',
        organization_type: 'nonprofit',
        capability: 'information-referral',
        role: 'Self-described statewide disaster information and referral service.',
        coverage: ['statewide'],
        validation_state: 'organization_self_described',
        source_id: 'auw-211-about',
        source_title: 'About 211',
        source_publisher: 'Aloha United Way',
      },
    ],
    'human-services': [
      {
        id: 'hawaii-dhs',
        name: 'Hawaiʻi Department of Human Services',
        organization_type: 'state_agency',
        capability: 'human-services',
        role: 'State human-services and ESF-6 co-primary coordination.',
        coverage: ['statewide'],
        validation_state: 'official_plan_role',
        source_id: 'hawaii-sesf6-2025',
        source_title: 'State Emergency Support Function #6 Annex',
        source_publisher: 'Hawaiʻi Emergency Management Agency',
      },
    ],
    'access-functional-needs-support': [
      {
        id: 'hawaii-dhs',
        name: 'Hawaiʻi Department of Human Services',
        organization_type: 'state_agency',
        capability: 'access-functional-needs-support',
        role: 'Human-services coordination relevant to AFN planning.',
        coverage: ['statewide'],
        validation_state: 'official_plan_role',
        source_id: 'hawaii-sesf6-2025',
        source_title: 'State Emergency Support Function #6 Annex',
        source_publisher: 'Hawaiʻi Emergency Management Agency',
      },
    ],
  } as Record<string, Array<Record<string, unknown>>>
  const matches = capabilities.map((capability) => {
    const records = partners[capability] ?? []
    return {
      capability,
      status: records.length > 0 ? 'matched' : 'unmatched',
      partners: records.map((partner) => ({
        ...partner,
        operational_status: 'not_validated',
        capacity_status: 'not_reported',
        activation_status: 'not_reported',
        match_basis: 'documented_role_and_geographic_scope',
        evidence: {
          source_id: partner.source_id,
          title: partner.source_title,
          publisher: partner.source_publisher,
          source_url: `https://example.test/${partner.source_id}`,
          claim: `Documented planning association for ${capability}.`,
          accessed_at: '2026-10-26T00:00:00Z',
          fresh_until: '2027-04-24T00:00:00Z',
          freshness: 'fresh',
        },
        required_validation: [
          'Confirm current activation and incident assignment.',
        ],
        source_id: undefined,
        source_title: undefined,
        source_publisher: undefined,
      })),
      ...(records.length === 0
        ? {
            gap: 'No current sourced association covers this capability and planning jurisdiction.',
          }
        : {}),
    }
  })
  const matchedCapabilities = matches.filter(
    (match) => match.status === 'matched',
  ).length
  return {
    schema_version: 'partner-match-response.v1',
    generated_at: '2026-10-26T00:00:00Z',
    status:
      matchedCapabilities === matches.length
        ? 'complete'
        : matchedCapabilities > 0
          ? 'partial'
          : 'unavailable',
    jurisdiction_id: jurisdiction,
    summary: {
      requested_capabilities: matches.length,
      matched_capabilities: matchedCapabilities,
      unmatched_capabilities: matches.length - matchedCapabilities,
      partner_associations: matches.reduce(
        (total, match) => total + match.partners.length,
        0,
      ),
    },
    matches,
    disclaimers: [
      'Matches are sourced planning associations, not operational recommendations.',
    ],
  }
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
    await page.route('**/api/v1/planning/event-triggers', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(eventTriggerSnapshot),
      })
    })
    await page.route('**/api/v1/planning-areas', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(planningAreaCatalog),
      })
    })
    await page.route('**/api/v1/planning/live-status?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(operationalStatusSnapshot),
      })
    })
    await page.route('**/api/v1/planning/resource-demand', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          resourceDemandFixture(route.request().postDataJSON()),
        ),
      })
    })
    await page.route('**/api/v1/planning/partner-matches?*', async (route) => {
      const url = new URL(route.request().url())
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          partnerMatchFixture(
            url.searchParams.get('jurisdiction') ?? 'honolulu',
            url.searchParams.getAll('capability'),
          ),
        ),
      })
    })
    await use(page)
  },
})

export { expect }
