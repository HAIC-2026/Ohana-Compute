const defaultBackendApiUrl = 'http://127.0.0.1:8080'
const requestTimeoutMs = 12_000

export type BackendSourceStatus = {
  id: string
  authority: string
  url: string
  retrieved_at: string
  fresh_until: string
  status: 'fresh' | 'stale'
}

export class BackendApiError extends Error {
  readonly path: string
  readonly status: number | null

  constructor(path: string, message: string, status: number | null) {
    super(message)
    this.name = 'BackendApiError'
    this.path = path
    this.status = status
  }
}

export function getBackendApiUrl() {
  return (
    import.meta.env.VITE_BACKEND_API_URL?.trim().replace(/\/+$/, '') ||
    defaultBackendApiUrl
  )
}

export async function backendGet<T>(
  path: string,
  params?: Record<string, string | number>,
): Promise<T> {
  const url = new URL(path, `${getBackendApiUrl()}/`)
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, String(value))
  }

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), requestTimeoutMs)
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) {
      const error = (await response.json().catch(() => null)) as {
        detail?: string
        error?: string
      } | null
      throw new BackendApiError(
        path,
        error?.detail ??
          error?.error ??
          `Backend request failed with ${response.status}`,
        response.status,
      )
    }
    return (await response.json()) as T
  } catch (error) {
    if (error instanceof BackendApiError) throw error
    if (controller.signal.aborted) {
      throw new BackendApiError(path, 'Backend request timed out', null)
    }
    throw new BackendApiError(
      path,
      error instanceof Error ? error.message : 'Backend request failed',
      null,
    )
  } finally {
    window.clearTimeout(timeout)
  }
}

export async function backendPost<TRequest, TResponse>(
  path: string,
  body: TRequest,
): Promise<TResponse> {
  const url = new URL(path, `${getBackendApiUrl()}/`)
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), requestTimeoutMs)
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!response.ok) {
      const error = (await response.json().catch(() => null)) as {
        detail?: string
        error?: string
      } | null
      throw new BackendApiError(
        path,
        error?.detail ??
          error?.error ??
          `Backend request failed with ${response.status}`,
        response.status,
      )
    }
    return (await response.json()) as TResponse
  } catch (error) {
    if (error instanceof BackendApiError) throw error
    if (controller.signal.aborted) {
      throw new BackendApiError(path, 'Backend request timed out', null)
    }
    throw new BackendApiError(
      path,
      error instanceof Error ? error.message : 'Backend request failed',
      null,
    )
  } finally {
    window.clearTimeout(timeout)
  }
}

export function describeBackendSources(sources: BackendSourceStatus[]) {
  const authorities = [
    ...new Set(sources.map((source) => source.authority).filter(Boolean)),
  ]
  const freshness = sources.some((source) => source.status === 'stale')
    ? 'stale cached data via backend'
    : 'live via backend'
  return `${authorities.join(' + ') || 'Official public source'} · ${freshness}`
}
