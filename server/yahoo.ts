// Yahoo Finance adapter — keyless quote source used when FINNHUB_API_KEY is
// absent, so the app shows real prices out of the box.
//
// This is an undocumented public endpoint. It needs a browser User-Agent, is
// one-symbol-per-request (the v7 batch endpoint is gated), and could change
// without notice. Finnhub is preferred when configured; this keeps the app
// useful before a key is set up.

import { cached, TTL } from './cache.ts'
import { getJson, UpstreamError } from './http.ts'
import type { Quote } from './finnhub.ts'

const BASE = 'https://query1.finance.yahoo.com/v8/finance/chart'

interface RawChart {
  chart?: {
    result?: {
      meta?: {
        symbol?: string
        shortName?: string
        longName?: string
        regularMarketPrice?: number
        chartPreviousClose?: number
        regularMarketDayHigh?: number
        regularMarketDayLow?: number
        currency?: string
      }
      indicators?: {
        quote?: { open?: (number | null)[] }[]
      }
    }[]
    error?: { code?: string; description?: string }
  }
}

/** Fetch one real quote. Throws UNKNOWN_SYMBOL for a ticker Yahoo rejects. */
async function fetchOne(symbol: string): Promise<Quote> {
  const raw = await getJson<RawChart>(
    `${BASE}/${encodeURIComponent(symbol)}?range=1d&interval=1d`,
    10_000,
    // Yahoo returns 401/403 to non-browser clients
    { 'User-Agent': 'Mozilla/5.0' }
  )

  const result = raw.chart?.result?.[0]
  const meta = result?.meta
  const price = meta?.regularMarketPrice
  const prevClose = meta?.chartPreviousClose

  if (!meta || typeof price !== 'number' || typeof prevClose !== 'number') {
    throw new UpstreamError(
      404,
      'UNKNOWN_SYMBOL',
      `No quote data for ${symbol}.`
    )
  }

  // Open lives in the indicators array rather than meta
  const open = result?.indicators?.quote?.[0]?.open?.[0]
  const change = price - prevClose

  return {
    symbol,
    name: meta.shortName || meta.longName || symbol,
    price,
    change,
    changePct: prevClose === 0 ? 0 : (change / prevClose) * 100,
    high: meta.regularMarketDayHigh ?? price,
    low: meta.regularMarketDayLow ?? price,
    open: typeof open === 'number' ? open : prevClose,
    prevClose,
  }
}

/** Real-time quotes for several symbols, one request each, run concurrently. */
export async function quotes(symbols: string[]): Promise<Quote[]> {
  const results = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        return await cached(`yq:${symbol}`, TTL.quote, () => fetchOne(symbol))
      } catch (err) {
        // A single unknown ticker must not sink the whole watchlist
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

/** Confirm a ticker exists, for watchlist validation. */
export async function verify(
  symbol: string
): Promise<{ symbol: string; description: string } | null> {
  try {
    const quote = await cached(`yq:${symbol}`, TTL.quote, () =>
      fetchOne(symbol)
    )
    return { symbol: quote.symbol, description: quote.name }
  } catch {
    return null
  }
}
