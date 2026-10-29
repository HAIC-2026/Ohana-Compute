import {
  evidenceKinds,
  evidenceRoles,
  parseContribution,
  validityHours,
} from './planning-evidence'
import type {
  EvidenceScenario,
  PlanningContribution,
} from './planning-evidence'
import { evaluateTiming, timingFields } from './waianae-case'
import type { TimingInputs } from './waianae-case'

export const planningPrompts = [
  'What does the plan still need?',
  'Change the planning window',
  'Add transport evidence',
  'Add power evidence',
  'Add receiving evidence',
  'Add H1 evidence',
  'Add H2 evidence',
  'Review local claims',
  'Prepare County review',
  'Draft a resident message',
  'Exchange evidence',
  'Show H1 on the map',
  'Show H2 on the map',
] as const
export type PlanningPrompt = (typeof planningPrompts)[number]

export function interpretPlanningPrompt(
  text: string,
): { prompt: PlanningPrompt } | { arrival: string } | null {
  if (text.length > 256) return null
  const clean = text
    .trim()
    .toLowerCase()
    .replace(/[?.!]$/, '')
  const prompt = planningPrompts.find(
    (item) => item.toLowerCase().replace(/[?.!]$/, '') === clean,
  )
  if (prompt) return { prompt }
  if (/^(help|what can you do|what does kupuna a need)$/.test(clean))
    return { prompt: 'What does the plan still need?' }
  const arrival =
    /^(?:what if (?:the )?storm arrives in|storm arrives in|set storm arrival to) (\d{1,3}) (?:hours|h)$/.exec(
      clean,
    )
  return arrival ? { arrival: arrival[1] } : null
}

export type ClaimDraft = {
  targetId: string
  values: Record<string, string>
  basis?: PlanningContribution['basis']
  sourceRole?: PlanningContribution['sourceRole']
  observedAt?: string
  validForHours?: PlanningContribution['validForHours']
  question: number
}
export function startClaim(
  targetId: string,
  scenario: EvidenceScenario,
): ClaimDraft {
  const target = scenario.targets.find((item) => item.id === targetId)
  if (!target) throw new Error('Unsupported planning subject.')
  return {
    targetId,
    values: Object.fromEntries(
      evidenceKinds[target.kind].fields.map((field) => [field.id, 'unknown']),
    ),
    question: 0,
  }
}

export function claimQuestion(draft: ClaimDraft, scenario: EvidenceScenario) {
  const target = scenario.targets.find((item) => item.id === draft.targetId)
  if (!target) throw new Error('Unsupported planning subject.')
  const fields = evidenceKinds[target.kind].fields
  const field = fields.at(draft.question)
  if (field)
    return {
      label: field.label,
      hint: field.choices
        ? 'Choose a reported value, or keep it unknown.'
        : `Enter a whole number from 0 to ${field.max}, or choose Unknown. Counts are not added across reports.`,
      choices: field.choices
        ? [
            ...field.choices.map((choice) => ({
              label: choice.label,
              value: choice.value,
            })),
            { label: 'Unknown', value: 'unknown' },
          ]
        : [{ label: 'Unknown', value: 'unknown' }],
    }
  switch (draft.question - fields.length) {
    case 0:
      return {
        label: 'Is this an exercise assumption or a reported claim?',
        hint: 'Neither choice verifies the claim.',
        choices: [
          { label: 'Exercise assumption', value: 'assumption' },
          { label: 'Reported claim', value: 'reported' },
        ],
      }
    case 1:
      return {
        label: 'Which source category supplied this claim?',
        hint: 'Author-entered category, not an authenticated identity. Do not enter a name.',
        choices: evidenceRoles.map((role) => ({ label: role, value: role })),
      }
    case 2:
      return {
        label: 'When was it observed?',
        hint: 'Choose Observed now, or type YYYY-MM-DDTHH:mm in your local time. No future observations.',
        choices: [{ label: 'Observed now', value: 'now' }],
      }
    case 3:
      return {
        label: 'When should this claim be reviewed again?',
        hint: 'Measured from the observation time, not an authority’s validity guarantee.',
        choices: validityHours.map((hours) => ({
          label: `${hours} hour${hours === 1 ? '' : 's'}`,
          value: String(hours),
        })),
      }
    default:
      return null
  }
}

export function answerClaim(
  draft: ClaimDraft,
  scenario: EvidenceScenario,
  answer: string,
  now: number,
): { draft: ClaimDraft; label: string } | { error: string } {
  const target = scenario.targets.find((item) => item.id === draft.targetId)
  if (!target)
    return {
      error: 'The planning subject changed. Cancel and start a new report.',
    }
  const fields = evidenceKinds[target.kind].fields
  const field = fields.at(draft.question)
  const value = answer.trim()
  const next = {
    ...draft,
    values: { ...draft.values },
    question: draft.question + 1,
  }
  if (field) {
    const choice = field.choices?.find(
      (item) =>
        item.value === value ||
        item.label.toLowerCase() === value.toLowerCase(),
    )
    if (value.toLowerCase() === 'unknown') next.values[field.id] = 'unknown'
    else if (choice) next.values[field.id] = choice.value
    else if (
      !field.choices &&
      /^\d{1,3}$/.test(value) &&
      Number(value) <= (field.max ?? 0)
    )
      next.values[field.id] = String(Number(value))
    else
      return {
        error: field.choices
          ? 'Choose one of the listed values, or Unknown.'
          : `Use a whole number from 0 to ${field.max}, or Unknown. No claim has changed.`,
      }
    return {
      draft: next,
      label: `${field.label}: ${choice?.label ?? next.values[field.id]}`,
    }
  }
  switch (draft.question - fields.length) {
    case 0:
      if (value !== 'assumption' && value !== 'reported')
        return { error: 'Choose Exercise assumption or Reported claim.' }
      next.basis = value
      return {
        draft: next,
        label:
          value === 'reported'
            ? 'Reported claim · unverified'
            : 'Exercise assumption',
      }
    case 1: {
      const role = evidenceRoles.find((item) => item === value)
      if (!role)
        return {
          error:
            'Choose a listed source category; no names or free-text attribution.',
        }
      next.sourceRole = role
      return { draft: next, label: `Source category: ${role}` }
    }
    case 2: {
      const observed =
        value.toLowerCase() === 'now' ? new Date(now) : new Date(value)
      const isLocalMinute = /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value)
      if (
        (value.toLowerCase() !== 'now' && !isLocalMinute) ||
        !Number.isFinite(observed.getTime()) ||
        observed.getTime() > now ||
        (isLocalMinute && localObservationMinute(observed.getTime()) !== value)
      )
        return {
          error:
            'Use Observed now or a valid past local date and time: YYYY-MM-DDTHH:mm.',
        }
      next.observedAt = observed.toISOString()
      return { draft: next, label: `Observed: ${next.observedAt}` }
    }
    case 3: {
      const hours = validityHours.find((item) => String(item) === value)
      if (!hours) return { error: 'Choose 1, 6, 12 or 24 hours.' }
      next.validForHours = hours
      return { draft: next, label: `Review interval: ${hours}h` }
    }
    default:
      return { error: 'Review the proposed claim before applying it.' }
  }
}

function localObservationMinute(now: number) {
  const date = new Date(now)
  return new Date(now - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16)
}

export function validatedChatClaim(
  draft: ClaimDraft,
  scenario: EvidenceScenario,
  id: string,
): PlanningContribution | null {
  const target = scenario.targets.find((item) => item.id === draft.targetId)
  if (!target || claimQuestion(draft, scenario)) return null
  return parseContribution(
    {
      id,
      scenarioId: scenario.id,
      targetId: draft.targetId,
      kind: target.kind,
      values: draft.values,
      basis: draft.basis,
      sourceRole: draft.sourceRole,
      observedAt: draft.observedAt,
      validForHours: draft.validForHours,
      suppressed: false,
    },
    scenario,
  )
}

export function proposedTiming(
  timing: TimingInputs,
  fieldId: string,
  value: string,
): { timing: TimingInputs } | { error: string } {
  const field = timingFields.find((item) => item.id === fieldId)
  if (!field) return { error: 'Choose a listed timing assumption.' }
  const next = { ...timing, [field.id]: value }
  if (!evaluateTiming(next).result)
    return {
      error: `Use whole hours from ${field.min} to ${field.max}; access-loss lead must not exceed arrival. Nothing changed.`,
    }
  return { timing: next }
}
