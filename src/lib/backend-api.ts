const defaultBackendApiUrl = 'http://127.0.0.1:8080'
const requestTimeoutMs = 12_000
export const groundedPlanningRequestTimeoutMs = 35_000

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
      headers: {
        Accept: 'application/json',
        ...authorizationHeaders(),
      },
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

export type ConditionalGetResult<T> =
  | { status: 'ok'; data: T; etag: string | null }
  | { status: 'not-modified'; etag: string | null }

export async function backendConditionalGet<T>(
  path: string,
  params: Record<string, string | number>,
  etag?: string | null,
  decode?: (text: string) => T,
): Promise<ConditionalGetResult<T>> {
  const url = new URL(path, `${getBackendApiUrl()}/`)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value))
  }
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), requestTimeoutMs)
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        ...(etag ? { 'If-None-Match': etag } : {}),
        ...authorizationHeaders(),
      },
      signal: controller.signal,
    })
    if (response.status === 304) {
      return {
        status: 'not-modified',
        etag: response.headers.get('ETag') ?? etag ?? null,
      }
    }
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
    return {
      status: 'ok',
      data: decode
        ? decode(await response.text())
        : ((await response.json()) as T),
      etag: response.headers.get('ETag'),
    }
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
  timeoutMs = requestTimeoutMs,
): Promise<TResponse> {
  return backendMutation<TRequest, TResponse>('POST', path, body, timeoutMs)
}

export async function backendPut<TRequest, TResponse>(
  path: string,
  body: TRequest,
): Promise<TResponse> {
  return backendMutation<TRequest, TResponse>('PUT', path, body)
}

async function backendMutation<TRequest, TResponse>(
  method: 'POST' | 'PUT',
  path: string,
  body: TRequest,
  timeoutMs = requestTimeoutMs,
): Promise<TResponse> {
  const url = new URL(path, `${getBackendApiUrl()}/`)
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...authorizationHeaders(),
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

function authorizationHeaders(): Record<string, string> {
  if (
    import.meta.env.VITE_ENABLE_TEST_IDENTITY !== 'true' ||
    typeof window === 'undefined'
  ) {
    return {}
  }
  const token = window.sessionStorage.getItem(
    'hawaii-resilience-collaboration-token',
  )
  return token ? { Authorization: 'Bearer ' + token } : {}
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
