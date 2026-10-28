import { maxContributions, parseContributions } from './planning-evidence'
import type {
  EvidenceScenario,
  PlanningContribution,
} from './planning-evidence'

export const maxEvidenceBundleBytes = 128 * 1024
const bundleSchema = 'local-planning-evidence.v1'
const contributionKeys = [
  'id',
  'scenarioId',
  'targetId',
  'kind',
  'basis',
  'sourceRole',
  'observedAt',
  'validForHours',
  'values',
  'suppressed',
]

function exactKeys(
  value: unknown,
  keys: string[],
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    Object.keys(value).every((key) => keys.includes(key))
  )
}

function fail(message: string): never {
  throw new Error(`${message} No claims changed.`)
}

// JSON.parse accepts duplicate keys and discards their earlier payloads.
// Check the original tokens too, so hidden/overwritten fields cannot pass review.
function rejectDuplicateKeys(text: string) {
  const objects: Array<Set<string> | null> = []
  for (let index = 0; index < text.length; index++) {
    const token = text[index]
    if (token === '{') objects.push(new Set())
    else if (token === '[') objects.push(null)
    else if (token === '}' || token === ']') objects.pop()
    else if (token === '"') {
      const start = index++
      while (index < text.length) {
        if (text[index] === '\\') index += 2
        else if (text[index] === '"') break
        else index++
      }
      let next = index + 1
      while (/\s/.test(text[next] ?? '') && next < text.length) next++
      if (text[next] === ':') {
        const key: string = JSON.parse(text.slice(start, index + 1))
        const keys = objects[objects.length - 1]
        if (keys?.has(key)) fail('Duplicate JSON fields are not allowed.')
        keys?.add(key)
      }
    }
  }
}

function validateRows(value: unknown, scenario: EvidenceScenario) {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > maxContributions
  )
    fail(`A bundle must contain 1–${maxContributions} claims.`)
  if (
    !value.every(
      (row: unknown) =>
        exactKeys(row, contributionKeys) &&
        typeof row.id === 'string' &&
        /^E-[0-9a-f]{8}$/.test(row.id),
    )
  )
    fail(
      'Only generated claim IDs and the exact controlled fields are allowed.',
    )
  const rows = parseContributions(value, scenario)
  if (!rows)
    fail('Invalid claims, subjects, source categories, times or duplicate IDs.')
  return rows
}

export function exportEvidenceBundle(
  scenario: EvidenceScenario,
  contributions: PlanningContribution[],
) {
  const rows = validateRows(contributions, scenario)
  const text = JSON.stringify(
    {
      schema: bundleSchema,
      scenarioId: scenario.id,
      modelRevision: scenario.modelRevision,
      contributions: rows,
    },
    null,
    2,
  )
  if (new TextEncoder().encode(text).byteLength > maxEvidenceBundleBytes)
    fail('Bundle exceeds the 128 KiB limit.')
  return text
}

export function previewEvidenceBundle(
  text: string,
  scenario: EvidenceScenario,
  current: PlanningContribution[],
) {
  if (new TextEncoder().encode(text).byteLength > maxEvidenceBundleBytes)
    fail('Bundle exceeds the 128 KiB limit.')
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    fail('File must be a single valid JSON bundle.')
  }
  rejectDuplicateKeys(text)
  if (
    !exactKeys(raw, ['schema', 'scenarioId', 'modelRevision', 'contributions'])
  )
    fail('Bundle fields do not match the exchange format.')
  if (raw.schema !== bundleSchema)
    fail('Unsupported bundle schema. Export a current evidence bundle.')
  if (
    raw.scenarioId !== scenario.id ||
    raw.modelRevision !== scenario.modelRevision
  )
    fail(
      'Scenario or model revision differs. Use the same exercise and timing.',
    )
  const incoming = validateRows(raw.contributions, scenario)
  const existing = parseContributions(current, scenario)
  if (!existing)
    fail('Current claims cannot be validated. Review local evidence.')
  const additions: PlanningContribution[] = []
  let duplicates = 0
  for (const row of incoming) {
    const previous = existing.find((item) => item.id === row.id)
    if (!previous) additions.push(row)
    else if (JSON.stringify(previous) === JSON.stringify(row)) duplicates++
    else
      fail(
        `Conflicting duplicate ID ${row.id}. Resolve it outside this import.`,
      )
  }
  if (existing.length + additions.length > maxContributions)
    fail(
      `Combined claims exceed ${maxContributions}. Remove local claims first.`,
    )
  return {
    incoming,
    additions,
    duplicates,
    merged: [...existing, ...additions],
  }
}
