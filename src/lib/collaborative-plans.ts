import { backendGet, backendPost, backendPut } from './backend-api'
import type { BackendApiError } from './backend-api'

export type CollaborativePlanStatus =
  'draft' | 'in_review' | 'changes_needed' | 'approved' | 'archived'

export type CollaborativePlanSnapshot = {
  checklist: Array<{ title: string; owner: string; timing: string }>
  source_refs: string[]
  outputs: Array<{
    stage: 'map' | 'model' | 'match'
    reference: string
    status: 'available' | 'partial' | 'unavailable'
    summary: string
  }>
  demand_lines?: Array<{
    id: string
    status: 'modeled' | 'unavailable'
    gap_state: 'modeled_gap' | 'no_modeled_gap' | 'unavailable'
  }>
  partner_capabilities?: Array<{
    capability: string
    status: 'matched' | 'unmatched' | 'stale'
    operational_status: 'not_validated'
    capacity_status: 'not_reported'
    activation_status: 'not_reported'
  }>
}

export type CollaborativePlanVersion = {
  version: number
  title: string
  summary: string
  status: CollaborativePlanStatus
  snapshot: CollaborativePlanSnapshot
  actor_role: string
  ai_assistance?: {
    provider_policy_version: string
    input_context_hash: string
  }
  created_at: string
}

export type CollaborativePlan = {
  schema_version: 'collaborative-plan.v1'
  id: string
  jurisdiction: string
  area_ref: string
  event_ref?: string
  hazard: string
  title: string
  summary: string
  status: CollaborativePlanStatus
  current_version: number
  revision: number
  created_at: string
  updated_at: string
  versions: CollaborativePlanVersion[]
  comments: Array<{
    id: string
    body: string
    author_role: string
    created_at: string
  }>
  assignments: Array<{
    id: string
    role: string
    capability: string
    status: string
    due_start: string
    due_end: string
    actor_role: string
    created_at: string
  }>
  approvals: Array<{
    id: string
    version: number
    decision: string
    rationale?: string
    approver_role: string
    created_at: string
  }>
  audit: Array<{
    id: string
    action: string
    resource_type: string
    actor_role: string
    outcome: string
    metadata?: Record<string, string>
    created_at: string
  }>
}

export type CollaborativePlanComparison = {
  schema_version: 'collaborative-plan-comparison.v1'
  plan_id: string
  from: CollaborativePlanVersion
  to: CollaborativePlanVersion
  changed_fields: string[]
}

export function createCollaborativePlan(input: {
  jurisdiction: string
  area_ref: string
  event_ref: string
  hazard: string
  title: string
  summary: string
  status: CollaborativePlanStatus
  snapshot: CollaborativePlanSnapshot
}) {
  return backendPost<typeof input, CollaborativePlan>(
    '/api/v1/collaboration/plans',
    input,
  )
}

export function loadCollaborativePlan(planId: string) {
  return backendGet<CollaborativePlan>(
    `/api/v1/collaboration/plans/${encodeURIComponent(planId)}`,
  )
}

export function updateCollaborativePlan(
  planId: string,
  input: {
    expected_revision: number
    title: string
    summary: string
    status: CollaborativePlanStatus
    snapshot: CollaborativePlanSnapshot
  },
) {
  return backendPut<typeof input, CollaborativePlan>(
    `/api/v1/collaboration/plans/${encodeURIComponent(planId)}`,
    input,
  )
}

export function addCollaborativePlanComment(
  planId: string,
  input: { expected_revision: number; body: string },
) {
  return backendPost<typeof input, CollaborativePlan>(
    `/api/v1/collaboration/plans/${encodeURIComponent(planId)}/comments`,
    input,
  )
}

export function addCollaborativePlanAssignment(
  planId: string,
  input: {
    expected_revision: number
    role: string
    capability: string
    status: string
    due_start: string
    due_end: string
  },
) {
  return backendPost<typeof input, CollaborativePlan>(
    `/api/v1/collaboration/plans/${encodeURIComponent(planId)}/assignments`,
    input,
  )
}

export function addCollaborativePlanApproval(
  planId: string,
  input: {
    expected_revision: number
    version: number
    decision: string
    rationale: string
  },
) {
  return backendPost<typeof input, CollaborativePlan>(
    `/api/v1/collaboration/plans/${encodeURIComponent(planId)}/approvals`,
    input,
  )
}

export function compareCollaborativePlanVersions(
  planId: string,
  from: number,
  to: number,
) {
  return backendGet<CollaborativePlanComparison>(
    `/api/v1/collaboration/plans/${encodeURIComponent(planId)}/compare`,
    { from, to },
  )
}

export function collaborationErrorStatus(error: unknown) {
  return (error as BackendApiError | undefined)?.status ?? null
}
