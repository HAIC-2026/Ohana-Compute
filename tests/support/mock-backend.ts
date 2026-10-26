import type { Page } from '@playwright/test'

export async function mockOfficialHawaiiKaiStatus(page: Page) {
  const source = {
    id: 'test-source',
    authority: 'Official test authority',
    url: 'https://example.test/source',
    retrieved_at: '2026-10-26T19:00:00Z',
    fresh_until: '2026-10-26T19:05:00Z',
    status: 'fresh',
  }
  await page.route('**/api/v1/risk/tsunami?**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'inside',
        zone_type: 'Extreme Tsunami Evacuation Zone',
        description:
          'Evacuate out of these areas for an Extreme Tsunami Warning.',
        geometry: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: { zone_type: 'Extreme Tsunami Evacuation Zone' },
              geometry: {
                type: 'Polygon',
                coordinates: [
                  [
                    [-157.7, 21.28],
                    [-157.68, 21.28],
                    [-157.68, 21.31],
                    [-157.7, 21.31],
                    [-157.7, 21.28],
                  ],
                ],
              },
            },
          ],
        },
        sources: [source],
      }),
    })
  })
  await page.route('**/api/v1/shelters/open?**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        shelters: [],
        sources: [source],
      }),
    })
  })
  await page.route('**/api/v1/risk/flood?**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        classification: 'undetermined',
        zone_code: 'D',
        zone_subtype: null,
        title: 'Flood risk is undetermined (FEMA Zone D)',
        description:
          'FEMA has not completed a detailed flood analysis for this zone. Zone D does not mean low risk.',
        coastal_planning_exposure: true,
        nearby_risk_geometry: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {
                fld_zone: 'AE',
                zone_subty: null,
                sfha_tf: 'T',
              },
              geometry: {
                type: 'Polygon',
                coordinates: [
                  [
                    [-157.71, 21.28],
                    [-157.7, 21.28],
                    [-157.7, 21.29],
                    [-157.71, 21.29],
                    [-157.71, 21.28],
                  ],
                ],
              },
            },
          ],
        },
        sources: [source],
      }),
    })
  })
  await page.route('**/api/v1/risk/wildfire?**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        rating: 'Medium',
        community_name: 'East Honolulu (Hawaii Kai)',
        title: 'Medium mapped wildfire risk · East Honolulu (Hawaii Kai)',
        description:
          'This is a community planning risk rating, not a live fire perimeter.',
        geometry: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {
                commu_name: 'East Honolulu (Hawaii Kai)',
                risk_rating: 'Medium',
              },
              geometry: {
                type: 'Polygon',
                coordinates: [
                  [
                    [-157.73, 21.27],
                    [-157.65, 21.27],
                    [-157.65, 21.33],
                    [-157.73, 21.33],
                    [-157.73, 21.27],
                  ],
                ],
              },
            },
          ],
        },
        sources: [source],
      }),
    })
  })
}
