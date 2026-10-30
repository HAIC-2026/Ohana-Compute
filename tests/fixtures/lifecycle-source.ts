import { contentDigest } from '../../src/lib/record-digest'
import {
  sourceDerivationVersion,
  sourceGeography,
  sourceId,
  sourceProduct,
  sourceScope,
  sourceUrl,
} from '../../src/lib/source-evidence'
import type {
  SourceClaim,
  SourceReading,
  ShelterContext,
} from '../../src/lib/source-evidence'
import type { LifecycleEvidenceSnapshot } from '../../src/lib/lifecycle-evidence'

export const sourceTestTime = '2026-10-30T16:00:00Z'

export function sourceClaim(status = 'OPEN', id = 'shelter-a'): SourceClaim {
  const facts: Omit<SourceClaim, 'content_digest'> = {
    item_id: id,
    source_id: sourceId,
    product: sourceProduct,
    authority: 'Federal Emergency Management Agency and reporting partners',
    url: sourceUrl,
    geography: sourceGeography,
    scope: sourceScope,
    name: 'Reported shelter A',
    city: 'Honolulu',
    facts: {
      reported_status: status,
      reported_capacity: 85,
      wheelchair_accessible: 'YES',
      pet_accommodations: 'HOUSEHOLD_PETS',
    },
    source_updated_at: null,
    source_expires_at: null,
    limitations: [
      'Reported facts, not admission, available beds, or current accessibility verification.',
      'Not complete County coverage, a service condition, restoration, or planning-location applicability.',
    ],
    derivation_version: sourceDerivationVersion,
  }
  return { ...facts, content_digest: contentDigest(facts) }
}

export function shelterContext(items = [sourceClaim()]): ShelterContext {
  return {
    derivation_version: sourceDerivationVersion,
    source_id: sourceId,
    query_scope: sourceScope,
    state: 'fresh',
    coverage: 'complete',
    retrieved_at: sourceTestTime,
    fresh_until: '2026-10-30T16:05:00Z',
    items,
  }
}

export function displayedSource(
  claim: SourceClaim | null = sourceClaim(),
): SourceReading {
  const { items: _items, ...context } = shelterContext()
  return {
    snapshotId: 'snapshot-source-a',
    generatedAt: sourceTestTime,
    checkedAt: sourceTestTime,
    transport: 'ok',
    context,
    claim,
  }
}

export function sourceSnapshot(): LifecycleEvidenceSnapshot {
  return {
    schema_version: 'lifecycle-evidence.v1',
    snapshot_id: 'snapshot-source-a',
    generated_at: sourceTestTime,
    valid_until: '2026-10-30T16:05:00Z',
    status: 'partial',
    planning_disclaimer:
      'Public planning context only; no operational authority.',
    planning_location: {
      point: [-158.193546, 21.450442],
      algorithm_version: 'rfc7946-planar-rational-v1',
    },
    event_triggers: {
      state: 'fresh',
      status: 'complete',
      unavailable_count: 0,
      data: {
        schema_version: 'event-trigger-snapshot.v1',
        generated_at: sourceTestTime,
        status: 'complete',
        triggers: [],
      },
    },
    operational_status: {
      state: 'fresh',
      status: 'partial',
      unavailable_count: 5,
      data: {
        schema_version: 'live-operational-status.v1',
        generated_at: sourceTestTime,
        status: 'partial',
        domains: [
          {
            domain: 'shelter',
            status: 'reported_live',
            freshness: {
              retrieved_at: sourceTestTime,
              fresh_until: '2026-10-30T16:05:00Z',
            },
          },
        ],
      },
    },
    shelter_context: shelterContext(),
  }
}
