import { expect, test } from '@playwright/test'

import {
  buildAiPlanningContext,
  generatePlanningBrief,
} from '../src/lib/mock-api'
import type {
  AiPlanningContext,
  PlanningResponseGenerator,
} from '../src/lib/mock-api'
import {
  areas,
  getLocalResourceInventory,
  getLocalRouteChecks,
  getScenarioView,
} from '../src/lib/mock-data'
import { analyzeAfnPlanning } from '../src/lib/planning-analysis'
import {
  adjustResources,
  adjustRoutes,
  planningMatrixCases,
} from './planning-matrix-cases'

test.beforeEach(({ browserName }, testInfo) => {
  expect(browserName).toBe('chromium')
  test.skip(!testInfo.project.name.startsWith('desktop'))
})

for (const matrixCase of planningMatrixCases) {
  test(matrixCase.name, async () => {
    const area = areas.find((candidate) => candidate.id === matrixCase.areaId)
    expect(area, `area ${matrixCase.areaId} must exist`).toBeDefined()
    if (!area) return

    const scenario = getScenarioView(
      area,
      matrixCase.hazard,
      matrixCase.severity,
      ['mobility', 'medical-power', 'language', 'transportation', 'shelters'],
    )
    const resources = adjustResources(
      getLocalResourceInventory(area),
      matrixCase.resourceAdjustment,
    )
    const routes = adjustRoutes(
      getLocalRouteChecks(area),
      matrixCase.routeAdjustment,
    )
    const analysis = analyzeAfnPlanning({
      area,
      hazard: matrixCase.hazard,
      scenario,
      profile: matrixCase.profile,
      resources,
      routes,
    })

    expect(analysis.primaryHotspot.domain).toBe(matrixCase.expectedDomain)
    expect(analysis.primaryHotspot.score).toBeGreaterThanOrEqual(
      matrixCase.minimumScore,
    )
    expect(analysis.primaryHotspot.evidence.join(' ')).toContain(
      matrixCase.evidencePhrase,
    )

    const capturedContexts: AiPlanningContext[] = []
    const generator: PlanningResponseGenerator = {
      async generate(context) {
        capturedContexts.push(context)
        return {
          headline: context.hotspot?.recommendedAction ?? 'Confirm conditions.',
          explanation: context.hotspot?.summary ?? 'Confirm conditions.',
          priorities: [],
          citations: [],
        }
      },
    }

    const brief = await generatePlanningBrief(
      {
        area,
        hazard: matrixCase.hazard,
        severity: matrixCase.severity,
        exposedPopulation: scenario.exposedPopulation,
        primarySignal: scenario.primarySignal,
        analysis,
      },
      generator,
    )
    expect(capturedContexts[0]?.hotspot?.domain).toBe(matrixCase.expectedDomain)
    expect(capturedContexts[0]?.operationalGaps).toEqual(
      analysis.operationalGaps,
    )
    expect(brief.headline).toContain(analysis.primaryHotspot.recommendedAction)

    const serializedContext = JSON.stringify(capturedContexts[0]).toLowerCase()
    for (const unsafeField of [
      'coordinates',
      'address',
      'latitude',
      'longitude',
      'source_errors',
      'fixture-only unavailable source',
    ]) {
      expect(serializedContext).not.toContain(unsafeField)
    }
  })
}

test('bounded AI context excludes raw geography and source errors', () => {
  const matrixCase = planningMatrixCases[0]
  const area = areas.find((candidate) => candidate.id === matrixCase.areaId)
  expect(area).toBeDefined()
  if (!area) return
  const scenario = getScenarioView(area, matrixCase.hazard, 5, [])
  const analysis = analyzeAfnPlanning({
    area,
    hazard: matrixCase.hazard,
    scenario,
    profile: {
      ...matrixCase.profile,
      source_errors: [
        {
          source: 'upstream',
          error: 'raw upstream error with sensitive request details',
        },
      ],
    },
    resources: getLocalResourceInventory(area),
    routes: getLocalRouteChecks(area),
  })

  const context = buildAiPlanningContext({
    area,
    hazard: matrixCase.hazard,
    severity: 5,
    exposedPopulation: scenario.exposedPopulation,
    primarySignal: scenario.primarySignal,
    analysis,
  })
  const serializedContext = JSON.stringify(context)

  expect(serializedContext).not.toContain(String(area.coordinates[0]))
  expect(serializedContext).not.toContain(String(area.coordinates[1]))
  expect(serializedContext).not.toContain('raw upstream error')
  expect(context.hotspot?.evidence.length).toBeGreaterThan(0)
})
