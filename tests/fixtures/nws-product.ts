import type { NWSProduct } from '../../src/lib/nws-product'
import type { EventTriggerSnapshot } from '../../src/lib/event-triggers'
import { sourceSnapshot } from './lifecycle-source'

export const weatherTime = '2026-10-30T18:00:00Z'

export function nwsProduct(at = weatherTime): NWSProduct {
  const now = Date.parse(at)
  const time = (minutes: number) =>
    new Date(now + minutes * 60_000).toISOString()
  return {
    id: 'urn:oid:fixture-nws-product',
    url: 'https://api.weather.gov/alerts/urn:oid:fixture-nws-product',
    sender: 'w-nws.webmaster@noaa.gov',
    sender_name: 'NWS Honolulu',
    sent: time(-20),
    effective: time(-10),
    onset: time(-5),
    expires: time(2),
    ends: time(5),
    status: 'Actual',
    message_type: 'Alert',
    scope: 'Public',
    event: 'Flood Warning',
    headline: 'Fixture Flood Warning',
    severity: 'Severe',
    certainty: 'Observed',
    urgency: 'Immediate',
    response: 'Avoid',
    area_desc: 'Reported source area, not planning-location applicability',
    references: [
      {
        url: 'https://api.weather.gov/alerts/previous-b',
        identifier: 'previous-b',
        sender: 'source-b',
        sent: time(-40),
      },
      {
        url: 'https://api.weather.gov/alerts/previous-a',
        identifier: 'previous-a',
        sender: 'source-a',
        sent: time(-60),
      },
    ],
    affected_zones: [
      {
        url: 'https://api.weather.gov/zones/forecast/HIZ001',
        id: 'HIZ001',
        type: 'forecast',
      },
    ],
    geocode: { ugc: ['HIZ001'], same: ['015003'] },
    geometry: { status: 'absent', type: null, shape: null },
    query_scope: {
      area: 'HI',
      coverage: 'statewide',
      url: 'https://api.weather.gov/alerts/active?area=HI',
    },
    applicability: 'unknown',
    eligibility: 'eligible',
    validity: 'current',
    relationship: 'initial',
  }
}

export function weatherSnapshot(product = nwsProduct()) {
  const snapshot = sourceSnapshot()
  snapshot.generated_at = weatherTime
  snapshot.valid_until = '2026-10-30T18:05:00Z'
  snapshot.event_triggers.data = {
    schema_version: 'event-trigger-snapshot.v1',
    generated_at: weatherTime,
    status: 'complete',
    triggers: [
      {
        source: 'nws',
        lifecycle: 'active',
        planning_state: 'official_warning',
        title: 'Fixture Flood Warning',
        nws_product: product,
      },
    ],
    source_states: [
      {
        id: 'nws-hi-alerts',
        status: 'fresh',
        retrieved_at: weatherTime,
        fresh_until: '2026-10-30T18:05:00Z',
      },
    ],
  }
  return snapshot
}

export function weatherLegacySnapshot(
  product = nwsProduct(),
): EventTriggerSnapshot {
  return {
    schema_version: 'event-trigger-snapshot.v1',
    generated_at: weatherTime,
    status: 'complete',
    planning_disclaimer: 'Planning context only.',
    county_order_notice: 'County evacuation-order data unavailable',
    unavailable_meaning: 'Unavailable does not mean no order.',
    triggers: [
      {
        schema_version: 'event-trigger-snapshot.v1',
        generated_at: weatherTime,
        source: 'nws',
        hazard_event_kind: 'flood',
        jurisdiction_scope: 'unknown',
        lifecycle: 'active',
        planning_state: 'official_warning',
        authority_kind: 'federal_warning_center',
        legal_order_status: 'not_an_evacuation_order',
        authority_limitation: 'Not an evacuation order.',
        planning_consequence: 'Verify official instructions independently.',
        title: 'Fixture Flood Warning',
        facts: {},
        provenance: {
          source_authority: 'NOAA National Weather Service',
          product_id: product.id!,
          product_type: 'Flood Warning',
          issued_at: product.sent!,
          effective_at: product.effective!,
          expires_at: product.expires!,
          retrieved_at: weatherTime,
          fresh_until: '2026-10-30T18:05:00Z',
          source_status: 'fresh',
          official_instructions_url: product.url!,
        },
        nws_product: product,
      },
    ],
  }
}
