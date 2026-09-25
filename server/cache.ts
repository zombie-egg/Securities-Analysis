// In-memory TTL cache. Shared across all clients hitting this server, which is
// what keeps us inside Finnhub's 60 req/min free-tier budget.

interface Entry {
  value: unknown
  expiresAt: number
}

const store = new Map<string, Entry>()

/** Wrap a fetcher so repeat calls within `ttlMs` reuse the first result. */
export async function cached<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const hit = store.get(key)
  if (hit && hit.expiresAt > Date.now()) {
    return hit.value as T
  }
  const value = await fetcher()
  store.set(key, { value, expiresAt: Date.now() + ttlMs })

  // Opportunistic sweep so the map cannot grow without bound
  if (store.size > 500) {
    const now = Date.now()
    for (const [k, v] of store) {
      if (v.expiresAt <= now) store.delete(k)
    }
  }
  return value
}

export const TTL = {
  // REST context is refreshed in the background; live prices arrive via socket.
  quote: 30_000,
  search: 60 * 60_000,
  news: 60_000,
  polymarket: 60_000,
  analyze: 10 * 60_000,
  translate: 24 * 60 * 60_000,
} as const
