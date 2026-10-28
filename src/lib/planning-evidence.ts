export type EvidenceKind = 'transport' | 'power' | 'receiving' | 'access'
export type EvidenceField = {
  id: string
  label: string
  max?: number
  choices?: ReadonlyArray<{ value: string; label: string }>
}

const yesNo = [
  { value: 'yes', label: 'Yes · local claim' },
  { value: 'no', label: 'No · local claim' },
]
export const evidenceKinds: Record<
  EvidenceKind,
  { label: string; fields: EvidenceField[] }
> = {
  transport: {
    label: 'Accessible transport',
    fields: [
      { id: 'places', label: 'Passenger places (not vehicles)', max: 20 },
      { id: 'boarding', label: 'Assisted step-free boarding', choices: yesNo },
      { id: 'mobility', label: 'Mobility-device space', choices: yesNo },
    ],
  },
  power: {
    label: 'Equipment power continuity',
    fields: [
      { id: 'hours', label: 'Backup runtime (whole hours)', max: 72 },
      {
        id: 'compatible',
        label: 'Equipment-specific compatibility assessed',
        choices: yesNo,
      },
    ],
  },
  receiving: {
    label: 'Receiving-site support',
    fields: [
      { id: 'acceptance', label: 'Acceptance reported', choices: yesNo },
      { id: 'stepFree', label: 'Step-free access', choices: yesNo },
      { id: 'caregiver', label: 'Caregiver accompaniment', choices: yesNo },
      { id: 'power', label: 'Equipment power support', choices: yesNo },
    ],
  },
  access: {
    label: 'Access concern',
    fields: [
      {
        id: 'condition',
        label: 'Reported observation (not road clearance)',
        choices: [
          { value: 'concern', label: 'Access concern reported' },
          { value: 'no-concern', label: 'No concern reported; not clearance' },
        ],
      },
    ],
  },
}

export const evidenceRoles = [
  'Exercise facilitator',
  'Transportation coordinator',
  'Health / medical coordinator',
  'Mass-care coordinator',
  'Field / community liaison',
] as const
export const validityHours = [1, 6, 12, 24] as const
export const maxContributions = 32

export type EvidenceTarget = {
  id: string
  kind: EvidenceKind
  label: string
  mapAnchor?: string
}
export type EvidenceRequirement = {
  id: string
  targetId: string
  label: string
  criteria: Array<{
    field: string
    expected: string | number
    description: string
  }>
  action: string
}
export type EvidenceScenario = {
  id: string
  modelRevision: string
  targets: EvidenceTarget[]
  requirements: EvidenceRequirement[]
}
export type PlanningContribution = {
  id: string
  scenarioId: string
  targetId: string
  kind: EvidenceKind
  basis: 'assumption' | 'reported'
  sourceRole: (typeof evidenceRoles)[number]
  observedAt: string
  validForHours: (typeof validityHours)[number]
  values: Record<string, string>
  suppressed: boolean
}
export type EvidenceState =
  'missing' | 'incomplete' | 'gap' | 'conflict' | 'assumed' | 'reported'
export const evidenceStateLabels: Record<EvidenceState, string> = {
  missing: 'Missing evidence',
  incomplete: 'Unknowns remain',
  gap: 'Criteria gap',
  conflict: 'Conflicting claims',
  assumed: 'Assumption only',
  reported: 'Reported criteria covered',
}
export type ContributionState =
  'current' | 'stale' | 'future' | 'suppressed' | 'mismatched'

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function parseContribution(
  raw: unknown,
  scenario: EvidenceScenario,
): PlanningContribution | null {
  if (!record(raw)) return null
  const target = scenario.targets.find((item) => item.id === raw.targetId)
  const role = evidenceRoles.find((item) => item === raw.sourceRole)
  const validity = validityHours.find((item) => item === raw.validForHours)
  if (
    !target ||
    raw.kind !== target.kind ||
    raw.scenarioId !== scenario.id ||
    typeof raw.id !== 'string' ||
    !/^[a-zA-Z0-9-]{1,64}$/.test(raw.id) ||
    !role ||
    !validity ||
    (raw.basis !== 'assumption' && raw.basis !== 'reported') ||
    typeof raw.suppressed !== 'boolean' ||
    typeof raw.observedAt !== 'string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(raw.observedAt) ||
    !Number.isFinite(Date.parse(raw.observedAt)) ||
    new Date(raw.observedAt).toISOString() !== raw.observedAt ||
    !record(raw.values)
  )
    return null
  const fields = evidenceKinds[target.kind].fields
  if (Object.keys(raw.values).some((key) => !fields.some((f) => f.id === key)))
    return null
  const values: Record<string, string> = {}
  for (const field of fields) {
    const value = raw.values[field.id]
    if (typeof value !== 'string') return null
    if (
      value !== 'unknown' &&
      !(field.choices
        ? field.choices.some((choice) => choice.value === value)
        : /^\d+$/.test(value) &&
          Number.isSafeInteger(Number(value)) &&
          Number(value) <= (field.max ?? 0))
    )
      return null
    values[field.id] =
      value !== 'unknown' && !field.choices ? String(Number(value)) : value
  }
  return {
    id: raw.id,
    scenarioId: scenario.id,
    targetId: target.id,
    kind: target.kind,
    sourceRole: role,
    validForHours: validity,
    basis: raw.basis,
    observedAt: raw.observedAt,
    suppressed: raw.suppressed,
    values,
  }
}

export function parseContributions(
  value: unknown,
  scenario: EvidenceScenario,
): PlanningContribution[] | null {
  if (!Array.isArray(value) || value.length > maxContributions) return null
  const result: PlanningContribution[] = []
  for (const raw of value) {
    const parsed = parseContribution(raw, scenario)
    if (!parsed || result.some((item) => item.id === parsed.id)) return null
    result.push(parsed)
  }
  return result
}

export function contributionState(
  item: PlanningContribution,
  scenario: EvidenceScenario,
  now: number,
): ContributionState {
  if (!parseContribution(item, scenario)) return 'mismatched'
  if (item.suppressed) return 'suppressed'
  const age = now - Date.parse(item.observedAt)
  if (age < 0) return 'future'
  return age >= item.validForHours * 3_600_000 ? 'stale' : 'current'
}

export function evaluatePlanningEvidence(
  scenario: EvidenceScenario,
  contributions: PlanningContribution[],
  now: number,
) {
  return scenario.requirements.map((requirement) => {
    const relevant = contributions.filter(
      (item) => item.targetId === requirement.targetId,
    )
    const current = relevant.filter(
      (item) => contributionState(item, scenario, now) === 'current',
    )
    // Exercise assumptions never resolve or contradict operational reports.
    const reports = current.filter((item) => item.basis === 'reported')
    const candidates = reports.length ? reports : current
    const criteria = requirement.criteria.map((criterion) => {
      const claims = candidates
        .map((item) => item.values[criterion.field])
        .filter((value) => value !== 'unknown')
      const distinct = new Set(claims)
      const covered =
        claims.length > 0 &&
        claims.every((value) =>
          typeof criterion.expected === 'number'
            ? Number(value) >= criterion.expected
            : value === criterion.expected,
        )
      return {
        ...criterion,
        state:
          distinct.size > 1
            ? ('conflict' as const)
            : claims.length === 0
              ? ('unknown' as const)
              : covered
                ? ('covered' as const)
                : ('gap' as const),
      }
    })
    let state: EvidenceState = 'missing'
    if (candidates.length) {
      state = criteria.some((item) => item.state === 'conflict')
        ? 'conflict'
        : criteria.some((item) => item.state === 'gap')
          ? 'gap'
          : criteria.some((item) => item.state === 'unknown')
            ? 'incomplete'
            : reports.length
              ? 'reported'
              : 'assumed'
    }
    return {
      ...requirement,
      state,
      criteria,
      evidenceIds: candidates.map((item) => item.id),
      excluded: relevant.length - current.length,
      assumptionsNotUsed: reports.length ? current.length - reports.length : 0,
    }
  })
}

export function evidenceFreshnessKey(
  scenario: EvidenceScenario,
  items: PlanningContribution[],
  now: number,
) {
  return items
    .map((item) => `${item.id}:${contributionState(item, scenario, now)}`)
    .join('|')
}

export function planningEvidencePacket(
  scenario: EvidenceScenario,
  contributions: PlanningContribution[],
  now: number,
) {
  const insights = evaluatePlanningEvidence(scenario, contributions, now)
  return `## Local planning evidence - deterministic review, not verification
Evaluated at ${new Date(now).toISOString()}. Local browser contributions only; not shared records, official observations, resource availability or movement approval. No personal data or arbitrary source links.
Freshness is measured from the entered observation time; the author-selected review interval is not an authority's validity guarantee. Unknown is never zero, safe or unavailable. Counts are never added across reports. Assumptions do not resolve reported claims; conflicting current reports are not auto-reconciled.

${insights
  .map(
    (insight) => `### ${insight.label}: ${evidenceStateLabels[insight.state]}
${insight.criteria.map((criterion) => `- ${criterion.description}: ${criterion.state}`).join('\n')}
Evidence: ${insight.evidenceIds.join(', ') || 'none eligible'}. Excluded stale/future/suppressed/mismatched: ${insight.excluded}. Assumptions set aside: ${insight.assumptionsNotUsed}.
County next question: ${insight.action}`,
  )
  .join('\n\n')}

### Contribution register
${
  contributions.length
    ? contributions
        .map((item) => {
          const target = scenario.targets.find(
            (entry) => entry.id === item.targetId,
          )
          return `${item.id} | ${target?.label ?? 'Mismatched target'} | ${item.basis} local claim | source category: ${item.sourceRole} (author-entered, not authenticated) | observed ${item.observedAt} | review interval ${item.validForHours}h | ${contributionState(item, scenario, now)}\n${evidenceKinds[item.kind].fields.map((field) => `${field.label}: ${item.values[field.id]}`).join('; ')}`
        })
        .join('\n\n')
    : 'No local contributions. No operational facts are inferred.'
}

Even when every reported criterion is covered, County must verify current access, resource suitability, authority, acceptance and agreements. This is a review checklist, not permission to move. Communication, medication, clinical needs, safeguarding, service-animal/pet arrangements and all five CMIST questions still require review.
`
}
