import type { PartnerCapability } from './partner-matching'
import {
  evidenceFreshnessKey,
  parseContributions,
  planningEvidencePacket,
} from './planning-evidence'
import type {
  EvidenceScenario,
  PlanningContribution,
} from './planning-evidence'

export const caseStorageKey = 'waianae-assisted-planning.v1'
export const practiceLocation: [number, number] = [-158.193546, 21.450442]
export const accessConcerns = [
  {
    id: 'H1',
    longitude: -158.1900636120798,
    latitude: 21.448965580650423,
    label: 'Assumed bridge / pinch-point disruption',
  },
  {
    id: 'H2',
    longitude: -158.181,
    latitude: 21.432,
    label: 'Assumed flooded-road access disruption',
  },
]

export function waianaeEvidenceScenario(runtime = 3): EvidenceScenario {
  return {
    id: 'waianae-practice',
    modelRevision: `afn-v1-transfer-${runtime}h`,
    targets: [
      {
        id: 'vehicle-a',
        kind: 'transport',
        label: 'Candidate vehicle A (fictional)',
      },
      {
        id: 'equipment-a',
        kind: 'power',
        label: 'Equipment continuity A (fictional)',
      },
      {
        id: 'site-a',
        kind: 'receiving',
        label: 'Candidate receiving site A (fictional, unmapped)',
      },
      ...accessConcerns.map((item) => ({
        id: item.id,
        kind: 'access' as const,
        label: `${item.id} · ${item.label}`,
        mapAnchor: item.id,
      })),
    ],
    requirements: [
      {
        id: 'assisted-transfer',
        targetId: 'vehicle-a',
        label: 'Can the candidate carry both passengers and equipment?',
        criteria: [
          {
            field: 'places',
            expected: 2,
            description: 'At least 2 passenger places, including caregiver',
          },
          {
            field: 'boarding',
            expected: 'yes',
            description: 'Assisted step-free boarding',
          },
          {
            field: 'mobility',
            expected: 'yes',
            description: 'Mobility-device space',
          },
        ],
        action:
          'Transportation coordinator: verify this vehicle, crew, transfer method, operating window and agreement. Do not combine counts from different reports.',
      },
      {
        id: 'power-continuity',
        targetId: 'equipment-a',
        label: 'Does the reported power plan span the exercise transfer?',
        criteria: [
          {
            field: 'hours',
            expected: runtime,
            description: `At least ${runtime}h backup for assumed transfer/travel plus buffer; not a clinical runtime requirement`,
          },
          {
            field: 'compatible',
            expected: 'yes',
            description: 'Equipment-specific compatibility assessed',
          },
        ],
        action:
          'Health / medical coordinator: confirm actual equipment, load, runtime, medication continuity and clinical needs across pickup, travel and reception. This arithmetic is not medical advice.',
      },
      {
        id: 'receiving-support',
        targetId: 'site-a',
        label: 'Is the receiving candidate a supported option for review?',
        criteria: [
          {
            field: 'acceptance',
            expected: 'yes',
            description: 'Acceptance reported for this exercise candidate',
          },
          {
            field: 'stepFree',
            expected: 'yes',
            description: 'Step-free access',
          },
          {
            field: 'caregiver',
            expected: 'yes',
            description: 'Caregiver accompaniment',
          },
          {
            field: 'power',
            expected: 'yes',
            description: 'Equipment power support',
          },
        ],
        action:
          'Mass-care coordinator: directly confirm opening, acceptance, accessibility, equipment support, safeguarding and service-animal/pet arrangements. This fictional site has no certified location.',
      },
      ...accessConcerns.map((item) => ({
        id: `access-${item.id}`,
        targetId: item.id,
        label: `${item.id}: what access uncertainty needs County review?`,
        criteria: [
          {
            field: 'condition',
            expected: 'no-concern',
            description:
              'No concern reported is only an observation, never road clearance',
          },
        ],
        action:
          'County operations: obtain current official road and crossing conditions, pickup access and instructions. Do not infer a closure, safe route, bridge failure or dispatch from a local claim.',
      })),
    ],
  }
}

export const timingFields = [
  {
    id: 'arrival',
    label: 'Assumed storm arrival (hours from now)',
    min: 1,
    max: 168,
  },
  {
    id: 'accessLoss',
    label: 'Assumed access loss (hours before arrival)',
    min: 0,
    max: 168,
  },
  {
    id: 'mobilise',
    label: 'Assumed coordination and mobilisation (hours)',
    min: 1,
    max: 48,
  },
  {
    id: 'travel',
    label: 'Assumed transfer and travel (hours)',
    min: 1,
    max: 24,
  },
  { id: 'buffer', label: 'Planning buffer (hours)', min: 0, max: 24 },
] as const
export type TimingId = (typeof timingFields)[number]['id']
export type TimingInputs = Record<TimingId, string>
export const defaultTiming: TimingInputs = {
  arrival: '24',
  accessLoss: '6',
  mobilise: '2',
  travel: '1',
  buffer: '2',
}

export const caseChecks = [
  {
    id: 'communication',
    name: 'Communication',
    assumption: 'Preferred language and accessible format not yet confirmed.',
    requirement: '1 two-way communication plan, plus a trusted contact',
    question:
      'County public information / trusted community liaison: confirm language, interpreter, large-print/audio and phone-free contact options. Include visitors and caregivers in messaging where relevant.',
    capability: 'information-referral',
  },
  {
    id: 'medical',
    name: 'Medical',
    assumption:
      'Exercise assumes power-dependent equipment; equipment and runtime are unspecified.',
    requirement: '1 equipment-specific power and medication continuity check',
    question:
      'County health / medical coordinator: verify equipment, backup runtime, medication continuity and whether a clinician is needed. A generator or general AFN role is not a clinical care plan.',
    capability: 'access-functional-needs-support',
  },
  {
    id: 'independence',
    name: 'Independence',
    assumption:
      'Exercise assumes assisted step-free boarding and caregiver accompaniment.',
    requirement: '1 assisted transfer plan; caregiver travels with Kupuna A',
    question:
      'County AFN / transportation coordinator: assess transfer method, boarding, mobility equipment, personal assistance and caregiver continuity before selecting a team.',
    capability: 'access-functional-needs-support',
  },
  {
    id: 'safety',
    name: 'Safety / support',
    assumption:
      'Safe receiving location, service-animal and pet needs are unknown.',
    requirement:
      '1 accessible receiving-site acceptance and safeguarding check',
    question:
      'County mass-care coordinator: verify receiving-site accessibility, acceptance, caregiver support, safeguarding, service-animal access and separate pet arrangements. No shelter opening or capacity is assumed.',
    capability: 'pet-service-animal-support',
  },
  {
    id: 'transportation',
    name: 'Transportation',
    assumption:
      'Exercise assumes no car: Kupuna A plus one caregiver need transport.',
    requirement:
      '2 passenger places; accessible boarding and mobility-device space',
    question:
      'County incident command / transportation: confirm passability, pickup access, vehicle, qualified crew, travel time and destination. Assess whether firefighter or specialist help is appropriate; request through authorized channels only.',
    capability: 'access-functional-needs-support',
  },
] as const satisfies ReadonlyArray<{
  id: string
  name: string
  assumption: string
  requirement: string
  question: string
  capability: PartnerCapability
}>
export type CaseCheckId = (typeof caseChecks)[number]['id']
export type PreparedChecks = Record<CaseCheckId, boolean>
export const emptyChecks: PreparedChecks = {
  communication: false,
  medical: false,
  independence: false,
  safety: false,
  transportation: false,
}

export function evaluateTiming(inputs: TimingInputs) {
  const errors: Partial<Record<TimingId, string>> = {}
  const values = {
    arrival: 0,
    accessLoss: 0,
    mobilise: 0,
    travel: 0,
    buffer: 0,
  }
  for (const field of timingFields) {
    const raw = inputs[field.id]
    const value = Number(raw)
    if (
      !/^\d+$/.test(raw) ||
      !Number.isSafeInteger(value) ||
      value < field.min ||
      value > field.max
    ) {
      errors[field.id] =
        `Enter a whole number from ${field.min} to ${field.max}.`
    } else {
      values[field.id] = value
    }
  }
  if (!Object.keys(errors).length && values.accessLoss > values.arrival) {
    errors.accessLoss =
      'Access loss cannot be earlier than now. Reduce this lead time or increase assumed arrival time.'
  }
  if (Object.keys(errors).length) return { errors, result: null }
  const accessWindow = values.arrival - values.accessLoss
  const preparation = values.mobilise + values.travel + values.buffer
  return {
    errors,
    result: {
      ...values,
      accessWindow,
      preparation,
      margin: accessWindow - preparation,
    },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function restoreCase(
  value: unknown,
  now = Date.now(),
): {
  timing: TimingInputs
  checks: PreparedChecks
  contributions: PlanningContribution[]
} | null {
  if (!isRecord(value) || !isRecord(value.timing) || !isRecord(value.checks))
    return null
  const timing = { ...defaultTiming }
  const checks = { ...emptyChecks }
  for (const { id } of timingFields) {
    const raw = value.timing[id]
    if (typeof raw !== 'string') return null
    timing[id] = raw
  }
  for (const { id } of caseChecks) {
    const prepared = value.checks[id]
    if (typeof prepared !== 'boolean') return null
    checks[id] = prepared
  }
  const contributions =
    value.contributions === undefined
      ? []
      : parseContributions(value.contributions, waianaeEvidenceScenario())
  if (!evaluateTiming(timing).result || !contributions) return null
  const assessedAt =
    typeof value.assessedAt === 'string' ? Date.parse(value.assessedAt) : NaN
  const changedFreshness =
    contributions.length > 0 &&
    (!Number.isFinite(assessedAt) ||
      evidenceFreshnessKey(
        waianaeEvidenceScenario(),
        contributions,
        assessedAt,
      ) !== evidenceFreshnessKey(waianaeEvidenceScenario(), contributions, now))
  return {
    timing,
    checks: changedFreshness ? { ...emptyChecks } : checks,
    contributions,
  }
}

export const residentDraft = `FICTIONAL EXERCISE DRAFT - County and community review required. Not a current alert, evacuation order, pickup confirmation or instruction to travel.

Kupuna A is a fictional person at an illustrative map point, not a real home or address. In this exercise a storm may interrupt access. The goal is to arrange support before the assumed access-loss window, subject to official advice and safe conditions.

Before any movement, the County must confirm a receiving location, safe access, appropriate transport, qualified assistance and a way to stay in contact. Firefighter, vehicle and specialist-team availability, assignment and activation are unconfirmed. This example makes no commitment. Do not travel or attempt a rescue based on this example.

Discuss preferred language, plain-language/large-print/audio options, a trusted contact and a phone-free backup. Include medicines, equipment power, mobility support, a caregiver and service animals or pets as applicable. A service animal and a pet may need different arrangements.

Follow current Honolulu Department of Emergency Management guidance and official alerts: https://www.honolulu.gov/dem/. This exercise does not establish a legal evacuation zone or order.`

export function createAssistancePacket(input: {
  timing: TimingInputs
  checks: PreparedChecks
  evidence: string
  partners: string
  contributions?: PlanningContribution[]
  now?: number
}) {
  const { result } = evaluateTiming(input.timing)
  if (!result)
    throw new Error('Resolve timing errors before preparing a request.')
  return `# Waiʻanae pre-arrival assistance request - FICTIONAL EXERCISE

County review required. NOT SENT. Team availability, assignment and activation are unconfirmed. This example does not select or dispatch a team. County leads; State ESF6 supports. Public deidentified context only.

## Person-story boundary
Kupuna A is fictional. Marker ${practiceLocation.join(', ')} is illustrative, not a home, resident address or registry. All individual needs below are exercise assumptions, never inferred from demographics or flood geography.

## Source risk versus exercise access disruption
${input.evidence}
The two map disruption areas and access-loss timing are hypothetical. H1 uses the location of bridge inventory objectid 391 (FARR HWY / KAUPUNI STRM) only as crossing context; no failure is inferred. H2 is an illustrative access-concern area, not a confirmed road segment or flooded extent. Neither bridge collapse nor flooded-road closure is predicted by a connected feed. Flood-zone classes are not a storm forecast, road passability, evacuation zone, order or destination. No road-level route is certified.

## Editable before-storm window (hours from exercise now)
Assumed storm arrival: ${result.arrival}h. Assumed access loss: ${result.accessLoss}h before arrival = ${result.accessWindow}h from now.
Preparation allowance: ${result.mobilise}h coordination/mobilisation + ${result.travel}h transfer/travel + ${result.buffer}h buffer = ${result.preparation}h.
Planning margin: ${result.accessWindow} - ${result.preparation} = ${result.margin}h. ${result.margin > 0 ? 'Positive exercise margin does not establish a safe departure time.' : 'Exercise window exhausted: escalate County review; do not assume travel is safe.'}
No actual forecast, route, throughput or rescue-time claim.

${planningEvidencePacket(waianaeEvidenceScenario(result.travel + result.buffer), input.contributions ?? [], input.now ?? Date.now())}

## Five CMIST requirements and County questions
${caseChecks.map((check) => `### ${check.name}\nAssumption: ${check.assumption}\nRequirement: ${check.requirement}. Capacity and acceptance unverified.\nQuestion: ${check.question}\nAgenda question: ${input.checks[check.id] ? 'prepared; answer unresolved' : 'not prepared'}.`).join('\n\n')}

## Specialist assistance request
County to assess whether firefighters or another qualified specialist team are appropriate for the transfer and access conditions. Verify authority, qualifications, crew, equipment, vehicle, operating window, safe access, receiving-site acceptance and agreement before any tasking. No autonomous assignments, dispatch or resource allocation.

## Sourced associations - not operational availability
${input.partners}

## Resident communication draft
${residentDraft}

Publication checks: County release approval; trusted-community validation of language priorities; human-reviewed translations; plain-language print, large print, audio and visual versions; authorized phone-free/offline contact. No translated alert is supplied.

## AI
This example uses deterministic arithmetic and a fixed template, not AI. No case inputs were sent to a provider. The existing opt-in grounded-plan assistant is separate; its server-owned evidence contract does not include this case.
`
}
