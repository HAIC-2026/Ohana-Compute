const packetCache = 'hmcp-packets-v1'
const publicCache = 'hmcp-public-v1'
const snapshotURL = '/offline-data/planning-views'
const maxPackets = 5

export type SavedPacket = {
  url: string
  filename: string
  retrievedAt: string
}

export async function saveOfflinePacket(filename: string, html: string) {
  const cache = await caches.open(packetCache)
  const url = `/offline-packets/${encodeURIComponent(filename)}`
  await cache.put(
    url,
    new Response(html, {
      headers: {
        'Content-Type': 'text/html;charset=utf-8',
        'X-Retrieved-At': new Date().toISOString(),
      },
    }),
  )
  const keys = await cache.keys()
  const ordered = await Promise.all(
    keys.map(async (key) => ({
      key,
      at: (await cache.match(key))?.headers.get('X-Retrieved-At') ?? '',
    })),
  )
  ordered.sort((a, b) => b.at.localeCompare(a.at))
  await Promise.all(
    ordered.slice(maxPackets).map(({ key }) => cache.delete(key)),
  )
}

export async function listOfflinePackets(): Promise<SavedPacket[]> {
  const cache = await caches.open(packetCache)
  return Promise.all(
    (await cache.keys()).map(async (key) => ({
      url: key.url,
      filename: decodeURIComponent(new URL(key.url).pathname.split('/').pop()!),
      retrievedAt:
        (await cache.match(key))?.headers.get('X-Retrieved-At') ?? '',
    })),
  )
}

export async function openOfflinePacket(url: string) {
  const response = await (await caches.open(packetCache)).match(url)
  if (!response) throw new Error('Packet is no longer saved on this device.')
  const blobURL = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = blobURL
  link.download = decodeURIComponent(new URL(url).pathname.split('/').pop()!)
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(blobURL), 1000)
}

export type PublicPlanningView = {
  retrievedAt: string
  areas: Array<{ name: string; island: string; summary: string }>
  unsupported: string[]
}

export async function storePublicPlanningView(view: PublicPlanningView) {
  const cache = await caches.open(publicCache)
  await cache.put(
    snapshotURL,
    new Response(JSON.stringify(view), {
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

export async function readPublicPlanningView(): Promise<PublicPlanningView | null> {
  const response = await (await caches.open(publicCache)).match(snapshotURL)
  return response ? (response.json() as Promise<PublicPlanningView>) : null
}

export async function clearOfflineData() {
  await Promise.all([caches.delete(packetCache), caches.delete(publicCache)])
}
