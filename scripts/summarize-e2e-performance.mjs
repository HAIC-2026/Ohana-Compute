import { execFileSync } from 'node:child_process'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const directory = path.resolve('test-results/performance')
const files = (await readdir(directory))
  .filter((file) => file.endsWith('.json') && file !== 'metrics.json')
  .sort()
const metrics = Object.fromEntries(
  await Promise.all(
    files.map(async (file) => [
      file.replace(/\.json$/, ''),
      JSON.parse(await readFile(path.join(directory, file), 'utf8')),
    ]),
  ),
)
await writeFile(
  path.join(directory, 'metrics.json'),
  JSON.stringify(metrics, null, 2),
)

const interactionMetrics = [
  ...(metrics['event-navigation-timing-us'] ?? []),
  ...(metrics['resident-route-timing-us'] ?? []),
]
const apiMetrics = metrics['backend-api-timing-ms'] ?? []
const slowestInteraction = interactionMetrics.reduce(
  (slowest, metric) =>
    !slowest || metric.duration_us > slowest.duration_us ? metric : slowest,
  null,
)
const slowestWarmAPI = apiMetrics.reduce((slowest, metric) => {
  const duration = metric.warm_p95_ms
  return !slowest || duration > slowest.duration
    ? { path: metric.path, duration }
    : slowest
}, null)
const slowestColdAPI = apiMetrics.reduce(
  (slowest, metric) =>
    !slowest || metric.cold_ms > slowest.cold_ms ? metric : slowest,
  null,
)
const coldTargetBreaches = apiMetrics.filter(
  (metric) => metric.cold_ms > metric.cold_target_ms,
)
const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
  encoding: 'utf8',
}).trim()
const navigation = metrics['initial-view-timing-ms'] ?? {}
const summary = `# Resident journey browser performance

## Run context
- repo: HAIC-2026/Ohana-Compute
- branch/commit: main / ${commit}
- command: \`npm run test:journey\`
- started_at: ${new Date().toISOString()}
- host: ${os.platform()} ${os.arch()} · ${os.cpus()[0]?.model ?? 'unknown CPU'}
- software: Node ${process.version} · Playwright 1.64

## Workload
- browser projects: desktop Chromium and mobile Chromium
- journey: first-view awareness, area and event navigation, resident search, no-car routing, language support, resource switching, event-specific risk, and normalized backend APIs
- UI timing unit: microseconds from browser event dispatch to matching DOM mutation
- API timing unit: milliseconds for one cold request and seven cached requests

## Key metrics
| metric | value | source |
|---|---:|---|
| initial DOM content loaded | ${navigation.dom_content_loaded_ms ?? 'unknown'} ms | initial-view-timing-ms.json |
| initial hydrated view | ${navigation.hydrated_ms ?? 'unknown'} ms | initial-view-timing-ms.json |
| initial map ready | ${navigation.map_ready_ms ?? 'unknown'} ms | initial-view-timing-ms.json |
| slowest measured UI response | ${slowestInteraction?.duration_us ?? 'unknown'} µs | ${slowestInteraction?.name ?? 'unknown'} |
| slowest cached API response | ${slowestWarmAPI?.duration ?? 'unknown'} ms | ${slowestWarmAPI?.path ?? 'unknown'} |
| slowest cold API response | ${slowestColdAPI?.cold_ms ?? 'unknown'} ms | ${slowestColdAPI?.path ?? 'unknown'} |

## Top findings
1. Important UI state changes are enforced against a 100,000 µs response budget.
2. Cached backend requests are enforced against a 100 ms median and 500 ms p95 response budget.
3. ${coldTargetBreaches.length} cold request(s) exceeded the ${apiMetrics[0]?.cold_target_ms ?? 1_000} ms target: ${coldTargetBreaches.map((metric) => metric.path).join(', ') || 'none'}. These remain dependent on authoritative upstream response time and are recorded separately rather than hidden inside the warm application budget.

## Artifacts
- \`metrics.json\` - combined browser and backend timing data
- \`initial-view-timing-ms.json\` - initial navigation and hydration timing
- \`event-navigation-timing-us.json\` - area and event interaction timing
- \`resident-route-timing-us.json\` - route-search and accessibility interaction timing
- \`backend-api-timing-ms.json\` - cold and cached API timing
`
await writeFile(path.join(directory, 'summary.md'), summary)
