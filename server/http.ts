// Small helpers shared by the upstream adapters.

/** Error carrying an HTTP status so handlers can pass it straight through. */
export class UpstreamError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

/** Read a required env var, or fail with a message naming the missing key. */
export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new UpstreamError(
      503,
      'MISSING_KEY',
      `${name} is not configured on the server. Add it to .env.local and restart.`
    )
  }
  return value
}

/**
 * GET JSON with a timeout. Server-side only, so extra headers are free — there
 * is no browser preflight to worry about (Yahoo needs a browser User-Agent).
 */
export async function getJson<T>(
  url: string,
  timeoutMs = 12_000,
  headers: Record<string, string> = {}
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', ...headers },
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new UpstreamError(
        res.status,
        'UPSTREAM_ERROR',
        `Upstream responded ${res.status}. ${body.slice(0, 200)}`
      )
    }
    return (await res.json()) as T
  } catch (err) {
    if (err instanceof UpstreamError) throw err
    if (err instanceof Error && err.name === 'AbortError') {
      throw new UpstreamError(504, 'TIMEOUT', 'Upstream request timed out.')
    }
    throw new UpstreamError(
      502,
      'NETWORK_ERROR',
      err instanceof Error ? err.message : 'Upstream request failed.'
    )
  } finally {
    clearTimeout(timer)
  }
}
