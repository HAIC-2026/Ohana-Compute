/* Only build assets and public, state-free shell documents are cached.
 * API requests, map tiles, identity, free text and mutations never enter this cache. */
const shellCache = 'hmcp-shell-v1'
const shellRoutes = ['/offline', '/lifecycle']
const shellAssets = [
  '/manifest.webmanifest',
  '/planner-icon.svg',
  '/planner-icon-192.png',
  '/planner-icon-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const manifest = await fetch('/offline-assets.json', {
        cache: 'no-store',
      })
      if (!manifest.ok) throw new Error('Offline asset manifest unavailable')
      const assets = await manifest.json()
      const cache = await caches.open(shellCache)
      await cache.addAll([
        ...shellRoutes,
        ...shellAssets,
        ...assets.filter((path) => /^\/assets\/[a-zA-Z0-9._/-]+$/.test(path)),
      ])
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith('hmcp-shell-') && key !== shellCache) {
          await caches.delete(key)
        }
      }
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/') ||
    request.headers.has('Authorization')
  )
    return
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        if (url.pathname === '/exercise') {
          return Response.redirect(
            new URL('/lifecycle', self.location.origin).href,
            302,
          )
        }
        try {
          const response = await fetch(request)
          if (response.redirected || response.ok) return response
        } catch {
          // A failed navigation always falls back to explicitly labeled offline content.
        }
        // Keep the address and SSR route aligned so hydration cannot reopen the live planner.
        if (!shellRoutes.includes(url.pathname)) {
          return Response.redirect(
            new URL('/offline', self.location.origin).href,
          )
        }
        const cache = await caches.open(shellCache)
        return (
          (await cache.match(
            url.pathname === '/lifecycle' ? '/lifecycle' : '/offline',
          )) ||
          new Response(
            'Offline shell unavailable. Open your downloaded field packet.',
            {
              status: 503,
              headers: { 'Content-Type': 'text/plain' },
            },
          )
        )
      })(),
    )
  } else if (
    (url.pathname.startsWith('/assets/') ||
      shellAssets.includes(url.pathname)) &&
    !url.search
  ) {
    event.respondWith(
      caches.open(shellCache).then(
        // Public immutable assets are identical across Origin variants.
        async (cache) =>
          (await cache.match(request, { ignoreVary: true })) || fetch(request),
      ),
    )
  }
})
