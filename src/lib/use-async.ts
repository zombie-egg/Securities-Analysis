import { useCallback, useEffect, useRef, useState } from 'react'

import { ApiError } from './api'

export interface AsyncState<T> {
  data: T | null
  error: ApiError | null
  loading: boolean
  reload: () => void
}

/**
 * Run an async fetcher and track its state. Aborts in-flight work on unmount
 * or when the fetcher identity changes, so a stale response cannot overwrite
 * a newer one.
 */
export function useAsync<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: unknown[],
  options: { enabled?: boolean; pollIntervalMs?: number } = {}
): AsyncState<T> {
  const enabled = options.enabled ?? true
  const pollIntervalMs = options.pollIntervalMs ?? 0
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [nonce, setNonce] = useState(0)

  // Keep the latest fetcher without making it a dependency
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }
    const controller = new AbortController()
    let active = true
    let timer: ReturnType<typeof setTimeout> | null = null

    // Schedule after completion so a slow upstream request never gets canceled
    // by the next poll. The timer also pauses while the tab is hidden.
    const run = () => {
      if (!active) return
      if (pollIntervalMs > 0 && document.visibilityState === 'hidden') {
        timer = setTimeout(run, pollIntervalMs)
        return
      }

      setLoading(true)
      setError(null)
      fetcherRef
        .current(controller.signal)
        .then((result) => {
          if (!active) return
          setData(result)
          setError(null)
        })
        .catch((err: unknown) => {
          if (!active) return
          if (err instanceof Error && err.name === 'AbortError') return
          if (pollIntervalMs > 0) setData(null)
          setError(
            err instanceof ApiError
              ? err
              : new ApiError(0, 'UNKNOWN', 'Something went wrong.')
          )
        })
        .finally(() => {
          if (!active) return
          setLoading(false)
          if (pollIntervalMs > 0) timer = setTimeout(run, pollIntervalMs)
        })
    }

    run()

    return () => {
      active = false
      controller.abort()
      if (timer) clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled, nonce, pollIntervalMs])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  return { data, error, loading, reload }
}
