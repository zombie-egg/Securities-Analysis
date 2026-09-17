// Finnhub adapter — real-time quotes, company news, market news, symbol search.
// The API key stays here on the server; it is never sent to the browser.

import { cached, TTL } from './cache.ts'
import { getJson, requireEnv, UpstreamError } from './http.ts'

const BASE = 'https://finnhub.io/api/v1'

export interface Quote {
  symbol: string
  name: string
  price: number
  change: number
  changePct: number
  high: number
  low: number
  open: number
  prevClose: number
}

export interface Article {
  id: string
  headline: string
  summary: string
  url: string
  image: string | null
  source: string
  datetime: number // unix ms
  related: string[]
  category: string
}

interface RawQuote {
  c: number // current
  d: number | null // change
  dp: number | null // percent change
  h: number
  l: number
  o: number
  pc: number
}

interface RawArticle {
  id?: number
  headline?: string
  summary?: string
  url?: string
  image?: string
  source?: string
  datetime?: number // unix SECONDS
  related?: string
  category?: string
}

interface RawProfile {
  name?: string
  ticker?: string
}

interface RawSearch {
  count?: number
  result?: { symbol?: string; description?: string; type?: string }[]
}

function key() {
  return requireEnv('FINNHUB_API_KEY')
}

/** Normalize one Finnhub news object, dropping entries with no link. */
function toArticle(raw: RawArticle, index: number): Article | null {
  if (!raw.headline || !raw.url) return null
  return {
    id: String(raw.id ?? `${raw.datetime ?? 0}-${index}`),
    headline: raw.headline,
    summary: raw.summary ?? '',
    url: raw.url,
    image: raw.image ? raw.image : null, // '' is common upstream
    source: raw.source ?? 'Unknown',
    datetime: (raw.datetime ?? 0) * 1000, // seconds -> ms
    related: (raw.related ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    category: raw.category ?? 'company',
  }
}

/** Company display name, cached for an hour (it does not change). */
async function companyName(symbol: string): Promise<string> {
  return cached(`profile:${symbol}`, TTL.search, async () => {
    const raw = await getJson<RawProfile>(
      `${BASE}/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${key()}`
    )
    return raw.name ?? symbol
  })
}

/** Real-time quotes for several symbols, fetched concurrently. */
export async function quotes(symbols: string[]): Promise<Quote[]> {
  // Fail loudly before fanning out if the server is not configured, rather
  // than letting the per-symbol catch below turn it into an empty list.
  key()

  const results = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        return await cached(`quote:${symbol}`, TTL.quote, async () => {
          const [raw, name] = await Promise.all([
            getJson<RawQuote>(
              `${BASE}/quote?symbol=${encodeURIComponent(symbol)}&token=${key()}`
            ),
            companyName(symbol),
          ])
          // Finnhub returns all zeros for an unknown symbol rather than 404
          if (!raw.c) {
            throw new UpstreamError(
              404,
              'UNKNOWN_SYMBOL',
              `No quote data for ${symbol}.`
            )
          }
          const quote: Quote = {
            symbol,
            name,
            price: raw.c,
            change: raw.d ?? 0,
            changePct: raw.dp ?? 0,
            high: raw.h,
            low: raw.l,
            open: raw.o,
            prevClose: raw.pc,
          }
          return quote
        })
      } catch (err) {
        // Absorb only per-symbol problems. Auth, rate-limit and config errors
        // are systemic and must reach the client instead of looking like an
        // empty result.
        if (
          err instanceof UpstreamError &&
          (err.code === 'UNKNOWN_SYMBOL' || err.status === 404)
        ) {
          return null
        }
        throw err
      }
    })
  )
  return results.filter((q): q is Quote => q !== null)
}

/** Verify a ticker exists before it is added to the watchlist. */
export async function search(query: string) {
  return cached(`search:${query.toLowerCase()}`, TTL.search, async () => {
    const raw = await getJson<RawSearch>(
      `${BASE}/search?q=${encodeURIComponent(query)}&exchange=US&token=${key()}`
    )
    return (raw.result ?? [])
      .filter((r) => r.symbol && r.type === 'Common Stock')
      .slice(0, 8)
      .map((r) => ({ symbol: r.symbol!, description: r.description ?? '' }))
  })
}

function ymd(date: Date) {
  return date.toISOString().slice(0, 10)
}

/** Company news for one symbol over the trailing `days` window. */
export async function companyNews(symbol: string, days = 7): Promise<Article[]> {
  return cached(`news:${symbol}:${days}`, TTL.news, async () => {
    const to = new Date()
    const from = new Date(to.getTime() - days * 86_400_000)
    const raw = await getJson<RawArticle[]>(
      `${BASE}/company-news?symbol=${encodeURIComponent(symbol)}` +
        `&from=${ymd(from)}&to=${ymd(to)}&token=${key()}`
    )
    return (Array.isArray(raw) ? raw : [])
      .map(toArticle)
      .filter((a): a is Article => a !== null)
      .sort((a, b) => b.datetime - a.datetime)
  })
}

/** General US market news feed. */
export async function marketNews(): Promise<Article[]> {
  return cached('news:general', TTL.news, async () => {
    const raw = await getJson<RawArticle[]>(
      `${BASE}/news?category=general&token=${key()}`
    )
    return (Array.isArray(raw) ? raw : [])
      .map(toArticle)
      .filter((a): a is Article => a !== null)
      .sort((a, b) => b.datetime - a.datetime)
      .slice(0, 40)
  })
}
