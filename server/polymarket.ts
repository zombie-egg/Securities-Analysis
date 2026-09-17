// Polymarket adapter — public Gamma API, no key required.
//
// Uses /public-search rather than /markets?q=: the q parameter on /markets is
// silently ignored, which would hand back top-volume markets on unrelated
// topics (Ethiopian politics for a "NVDA" query). /public-search actually
// filters, and returns markets nested inside events.
//
// Coverage per ticker is uneven — some large names have no open markets at all.
// Every failure here is non-fatal: callers get an empty list and the AI
// analysis proceeds on news alone.

import { cached, TTL } from './cache.ts'
import { getJson } from './http.ts'

const BASE = 'https://gamma-api.polymarket.com'

export interface PredictionMarket {
  question: string
  slug: string
  /** Probability of the leg named by `outcomeLabel`, as a percentage 0-100. */
  probability: number | null
  /** Which outcome `probability` refers to — usually "Yes". */
  outcomeLabel: string
  volume: number
  endDate: string | null
  url: string
}

interface RawMarket {
  question?: string
  slug?: string
  outcomes?: string | string[]
  outcomePrices?: string | string[]
  volumeNum?: number
  volume?: string | number
  endDate?: string
  closed?: boolean
  active?: boolean
}

interface RawEvent {
  slug?: string
  title?: string
  closed?: boolean
  markets?: RawMarket[]
}

interface RawSearch {
  events?: RawEvent[]
}

/** Gamma returns some array fields as JSON-encoded strings. */
function parseList(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

/**
 * Pick the most informative leg of a market.
 * Binary markets are reported as "Yes"; two-sided comparison markets (e.g.
 * ["Google","NVIDIA"]) have no Yes leg, so report the leading side instead.
 */
function pickOutcome(
  outcomes: string[],
  prices: number[]
): { label: string; probability: number | null } {
  const yesIndex = outcomes.findIndex((o) => o.toLowerCase() === 'yes')
  if (yesIndex >= 0 && Number.isFinite(prices[yesIndex])) {
    return { label: outcomes[yesIndex], probability: prices[yesIndex] }
  }
  // No Yes leg: surface whichever outcome the market currently favors
  let best = -1
  let bestIndex = -1
  prices.forEach((price, index) => {
    if (Number.isFinite(price) && price > best) {
      best = price
      bestIndex = index
    }
  })
  if (bestIndex >= 0) {
    return { label: outcomes[bestIndex] ?? 'Yes', probability: best }
  }
  return { label: outcomes[0] ?? 'Yes', probability: null }
}

function toMarket(raw: RawMarket, eventSlug: string): PredictionMarket | null {
  if (!raw.question) return null
  // Only live markets carry a usable signal
  if (raw.closed || raw.active === false) return null

  const outcomes = parseList(raw.outcomes)
  const prices = parseList(raw.outcomePrices).map(Number)
  const { label, probability } = pickOutcome(outcomes, prices)

  return {
    question: raw.question,
    slug: raw.slug ?? eventSlug,
    probability:
      probability !== null && Number.isFinite(probability)
        ? Math.round(probability * 100)
        : null,
    outcomeLabel: label,
    volume: Number(raw.volumeNum ?? raw.volume ?? 0) || 0,
    endDate: raw.endDate ?? null,
    url: `https://polymarket.com/event/${eventSlug}`,
  }
}

/**
 * Search open markets matching a company name or ticker.
 * Returns [] on any failure — never throws.
 */
export async function marketsFor(term: string): Promise<PredictionMarket[]> {
  try {
    return await cached(`pm:${term.toLowerCase()}`, TTL.polymarket, async () => {
      const raw = await getJson<RawSearch>(
        `${BASE}/public-search?q=${encodeURIComponent(term)}&limit_per_type=10`,
        8_000 // short timeout: this is optional enrichment
      )

      const markets: PredictionMarket[] = []
      for (const event of raw.events ?? []) {
        if (event.closed) continue
        for (const market of event.markets ?? []) {
          const parsed = toMarket(market, event.slug ?? '')
          if (parsed) markets.push(parsed)
        }
      }

      // Highest volume first — the most liquid markets carry the best signal
      markets.sort((a, b) => b.volume - a.volume)

      // Drop near-duplicate questions that differ only by resolution date
      const seen = new Set<string>()
      const deduped = markets.filter((market) => {
        // Strip the date clause so "... by Sept 30" and "... before 2027"
        // collapse to one entry, keeping the highest-volume variant
        const stem = market.question
          .toLowerCase()
          .replace(/\b(by|before|in|on)\b.*$/, '')
          .replace(/\(\s*(low|high)\s*\)/g, '')
          .replace(/\$[\d,.]+/g, '')
          .replace(/[^a-z0-9 ]/g, '')
          .replace(/\s+/g, ' ')
          .trim()
        if (seen.has(stem)) return false
        seen.add(stem)
        return true
      })

      return deduped.slice(0, 3)
    })
  } catch {
    return []
  }
}

/** Whether the Gamma API is currently reachable at all. */
export async function reachable(): Promise<boolean> {
  try {
    await cached('pm:health', TTL.polymarket, async () => {
      await getJson<unknown>(`${BASE}/markets?limit=1`, 6_000)
      return true
    })
    return true
  } catch {
    return false
  }
}
