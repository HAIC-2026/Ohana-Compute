export type StaffMember = {
  organization: string
  role: 'county' | 'state' | 'transport' | 'receiving'
  counties: Array<string>
}

export type StaffSession = {
  enabled: boolean
  authenticated: boolean
  member?: StaffMember
}

export type Organization = {
  id: string
  name: string
  role: StaffMember['role']
  counties: Array<string>
}

export type HandoffEvent = {
  action: string
  organization: string
  at: string
  target?: string
  reason?: string
}

export type AssistanceRequest = {
  id: string
  revision: number
  mode: 'exercise' | 'operational'
  county: string
  hazard: string
  intake_ref: string
  incident_ref: string
  people: number
  assistance: string
  coordinator: string
  receiving: string
  receiving_ready: boolean
  transport: string
  status: string
  verified: boolean
  released: boolean
  escalated: boolean
  blocker: string
  due_at: string
  eta?: string
  created_at: string
  updated_at: string
  events: Array<HandoffEvent>
}

export type ReadinessTask = {
  id: string
  request_id: string
  source_ref: string
  source_kind?:
    'request' | 'public_evidence' | 'agency_assessment' | 'exercise_finding'
  hazard?: string
  incident_ref: string
  revision: number
  mode: string
  county: string
  coordinator: string
  organization: string
  gap: string
  status: string
  due_at: string
  evidence_ref: string
  events: Array<HandoffEvent>
}

export type OperationsBoard = {
  requests: Array<AssistanceRequest>
  tasks: Array<ReadinessTask>
  organizations: Array<Organization>
  server_time: string
}

export class StaffApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

export async function staffApi<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/v1/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers:
      body === undefined
        ? { Accept: 'application/json' }
        : {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) {
    // Error content is bounded server-authored text, never an echo of inputs.
    const error = (await response.json()) as { error?: string; detail?: string }
    throw new StaffApiError(
      error.detail ??
        error.error ??
        'Shared state unavailable. Refresh before retrying.',
      response.status,
    )
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const countyNames: Record<string, string> = {
  '001': 'Hawaiʻi',
  '003': 'Honolulu',
  '007': 'Kauaʻi',
  '009': 'Maui',
}

export function label(value: string) {
  return value.replaceAll('_', ' ')
}

export function nextHandoff(request: AssistanceRequest, now: number) {
  if (['closed', 'cancelled'].includes(request.status))
    return label(request.status)
  if (!request.verified) return 'County: verify intake and assistance'
  if (request.status === 'arrived') return 'County: confirm closure'
  if (request.blocker) return `Blocked: ${label(request.blocker)}`
  if (request.status === 'picked_up' && request.released)
    return 'Receiving partner: confirm arrival'
  if (!request.receiving) return 'County: choose a receiving partner'
  if (!request.receiving_ready) return 'Receiving partner: confirm readiness'
  if (['requested', 'declined'].includes(request.status))
    return 'Coordinator: offer transport'
  if (request.status === 'offered')
    return 'Transport provider: accept or decline'
  if (!request.released) return 'Coordinator: verify movement prerequisites'
  if (request.eta && Date.parse(request.eta) < now)
    return 'Pickup ETA missed: coordinator follow-up'
  return 'Transport provider: confirm pickup'
}

export const readinessGaps = {
  accessible_warning: {
    domain: 'Communication',
    evidence:
      'A reviewed language/format arrangement, tested offline fallback and responsible outreach partner.',
  },
  medical_support: {
    domain: 'Medical',
    evidence:
      'A qualified partner assessment of medical-support requirements and the approved referral arrangement.',
  },
  backup_power: {
    domain: 'Medical',
    evidence:
      'A documented power-support assessment, tested runtime and responsible qualified partner—not a generator count inferred from population.',
  },
  daily_support: {
    domain: 'Independence',
    evidence:
      'A reviewed daily-living or caregiver-support arrangement and an accessible continuity procedure.',
  },
  receiving_access: {
    domain: 'Safety',
    evidence:
      'A receiving-partner accessibility and support assessment with outstanding limitations recorded.',
  },
  transport_agreement: {
    domain: 'Transportation',
    evidence:
      'An agency-reviewed transport agreement identifying the accessible capability, acceptance procedure and fallback.',
  },
} as const

export function readinessEvidence(gap: string) {
  return Object.entries(readinessGaps).find(([key]) => key === gap)?.[1]
}

export function readinessOverdue(task: ReadinessTask, now: number) {
  return task.status !== 'closed' && Date.parse(task.due_at) < now
}

export function handoffDecision(request: AssistanceRequest, now: number) {
  const terminal = ['closed', 'cancelled'].includes(request.status)
  const deadlineRisk =
    request.status === 'accepted' &&
    !!request.eta &&
    Date.parse(request.eta) > Date.parse(request.due_at)
  const dueSoon =
    !terminal &&
    request.status !== 'arrived' &&
    Date.parse(request.due_at) >= now &&
    Date.parse(request.due_at) - now <= 60 * 60_000
  const urgency = terminal
    ? 'complete'
    : requestOverdue(request, now)
      ? 'overdue'
      : request.blocker
        ? 'blocked'
        : deadlineRisk
          ? 'deadline_risk'
          : dueSoon
            ? 'due_soon'
            : 'waiting'
  let owner = request.coordinator
  if (
    !terminal &&
    request.verified &&
    request.status !== 'arrived' &&
    !request.blocker
  ) {
    if (request.status === 'picked_up' && request.released)
      owner = request.receiving
    else if (request.receiving && !request.receiving_ready)
      owner = request.receiving
    else if (
      request.receiving_ready &&
      (request.status === 'offered' ||
        (request.status === 'accepted' &&
          request.released &&
          !requestOverdue(request, now)))
    )
      owner = request.transport
  }
  if (deadlineRisk) owner = request.coordinator
  return {
    urgency,
    deadlineRisk,
    dueSoon,
    owner,
    action:
      deadlineRisk && !request.blocker
        ? 'County: resolve pickup ETA beyond completion deadline'
        : nextHandoff(request, now),
    deadline:
      request.status === 'accepted' &&
      request.eta &&
      Date.parse(request.eta) < Date.parse(request.due_at)
        ? request.eta
        : request.due_at,
    priority: [
      'overdue',
      'blocked',
      'deadline_risk',
      'due_soon',
      'waiting',
      'complete',
    ].indexOf(urgency),
  }
}

export function requestOverdue(request: AssistanceRequest, now: number) {
  return (
    !['closed', 'cancelled', 'arrived'].includes(request.status) &&
    (Date.parse(request.due_at) < now ||
      (request.status === 'accepted' &&
        !!request.eta &&
        Date.parse(request.eta) < now))
  )
}
