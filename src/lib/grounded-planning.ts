import {
  backendGet,
  backendPost,
  groundedPlanningRequestTimeoutMs,
} from './backend-api'
import type { BackendApiError } from './backend-api'
import type { CollaborativePlan } from './collaborative-plans'

export type GroundedPlanningOperation =
  'identify_gaps' | 'draft_actions' | 'summarize_evidence'

export type GroundedPlanningStyle = 'concise' | 'structured'

export type GroundedPlanningStatus = {
  state: 'disabled' | 'configured' | 'unavailable'
  human_review_required: true
}

export type GroundedPlanningDraft = {
  schema_version: 'grounded-planning-draft.v1'
  draft_id: string
  plan_id: string
  plan_version: number
  plan_revision: number
  generated_at: string
  provider_class: string
  model_policy_version: string
  input_context_hash: string
  operation: GroundedPlanningOperation
  style: GroundedPlanningStyle
  sections: Array<{
    id: string
    heading: string
    claims: Array<{ text: string; citations: string[] }>
  }>
  actions: Array<{ id: string; text: string; citations: string[] }>
  uncertainty: string[]
  gaps: string[]
  citations: Array<{
    source_id: string
    authority: string
    url: string
    freshness: string
  }>
  policy_warnings: string[]
  human_review_required: true
}

export function loadGroundedPlanningStatus(planId: string) {
  return backendGet<GroundedPlanningStatus>(
    `/api/v1/collaboration/plans/${encodeURIComponent(planId)}/planning-assist/status`,
  )
}

export function generateGroundedPlanningDraft(
  planId: string,
  input: {
    expected_revision: number
    operation: GroundedPlanningOperation
    style: GroundedPlanningStyle
  },
) {
  return backendPost<typeof input, GroundedPlanningDraft>(
    `/api/v1/collaboration/plans/${encodeURIComponent(planId)}/planning-drafts`,
    input,
    groundedPlanningRequestTimeoutMs,
  )
}

export function applyGroundedPlanningDraft(
  planId: string,
  draftId: string,
  input: {
    expected_revision: number
    section_ids: string[]
    action_ids: string[]
  },
) {
  return backendPost<typeof input, CollaborativePlan>(
    `/api/v1/collaboration/plans/${encodeURIComponent(planId)}/planning-drafts/${encodeURIComponent(draftId)}/apply`,
    input,
  )
}

export function rejectGroundedPlanningDraft(
  planId: string,
  draftId: string,
  input: { expected_revision: number },
) {
  return backendPost<typeof input, { state: 'rejected' }>(
    `/api/v1/collaboration/plans/${encodeURIComponent(planId)}/planning-drafts/${encodeURIComponent(draftId)}/reject`,
    input,
  )
}

export function groundedPlanningErrorStatus(error: unknown) {
  return (error as BackendApiError | undefined)?.status ?? null
}
