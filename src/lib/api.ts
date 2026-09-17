// Typed client for our own /api proxy. No third-party keys live here — the
// browser only ever talks to our server.

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
  datetime: number
  related: string[]
  category: string
}

export type Sentiment = 'Bullish' | 'Neutral' | 'Bearish'

export interface FocusResult {
  symbol: string
  name: string
  sentiment: Sentiment
  confidence: number
  reasoningEn: string
  reasoningZh: string
  polymarketNoteEn: string | null
  polymarketNoteZh: string | null
  citedIndices: number[]
}

export interface PredictionMarket {
  question: string
  slug: string
  /** Probability of `outcomeLabel`, 0-100. */
  probability: number | null
  outcomeLabel: string
  volume: number
  endDate: string | null
  url: string
}

export interface SourceStatus {
  ok: boolean
  reason: string | null
}

export interface AnalysisPayload {
  results: FocusResult[]
  articlesBySymbol: Record<string, Article[]>
  marketsBySymbol: Record<string, PredictionMarket[]>
  sources: {
    quotes: SourceStatus
    news: SourceStatus
    polymarket: SourceStatus
  }
  generatedAt: number
  failures: { symbol: string; reason: string }[]
}

export interface SearchResult {
  symbol: string
  description: string
}

export interface Health {
  finnhubConfigured: boolean
  deepseekConfigured: boolean
  polymarketReachable: boolean
  /** Which upstream is serving prices right now. */
  quoteSource: 'finnhub' | 'yahoo'
}

export interface User {
  id: string
  email: string
  displayName: string | null
  avatar: string | null
}

/** Error from our proxy, carrying the machine-readable code. */
export class ApiError extends Error {
  code: string
  status: number

  constructor(status: number, code: string, message: string) {
    super(message)
    this.code = code
    this.status = status
  }

  /** True when the server is missing an API key rather than actually broken. */
  get isConfigError() {
    return this.code === 'MISSING_KEY'
  }
}

async function request<T>(
  path: string,
  init?: { method?: string; body?: unknown; signal?: AbortSignal }
): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api/${path}`, {
      method: init?.method ?? 'GET',
      signal: init?.signal,
      credentials: 'include',
      ...(init?.body
        ? {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(init.body),
          }
        : {}),
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err
    throw new ApiError(0, 'OFFLINE', 'Could not reach the server.')
  }

  const data = (await res.json().catch(() => null)) as
    | (T & { error?: string; message?: string })
    | null

  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.error ?? 'UNKNOWN',
      data?.message ?? `Request failed with status ${res.status}.`
    )
  }
  if (data === null) {
    throw new ApiError(502, 'BAD_JSON', 'Server returned an invalid response.')
  }
  return data
}

export async function fetchMe(signal?: AbortSignal) {
  const data = await request<{ user: User | null }>('auth/me', { signal })
  return data.user
}

export function requestCode(email: string, signal?: AbortSignal) {
  return request<{ sent: true }>('auth/request-code', {
    method: 'POST',
    body: { email },
    signal,
  })
}

export async function register(
  email: string,
  code: string,
  password: string,
  signal?: AbortSignal
) {
  const data = await request<{ user: User }>('auth/register', {
    method: 'POST',
    body: { email, code, password },
    signal,
  })
  return data.user
}

export async function login(
  email: string,
  password: string,
  signal?: AbortSignal
) {
  const data = await request<{ user: User }>('auth/login', {
    method: 'POST',
    body: { email, password },
    signal,
  })
  return data.user
}

export function logout(signal?: AbortSignal) {
  return request<{ ok: true }>('auth/logout', { method: 'POST', signal })
}

export async function updateProfile(
  profile: { displayName?: string; avatar?: string | null },
  signal?: AbortSignal
) {
  const data = await request<{ user: User }>('auth/profile', {
    method: 'POST',
    body: profile,
    signal,
  })
  return data.user
}

export async function fetchWatchlist(signal?: AbortSignal) {
  const data = await request<{ symbols: string[] }>('watchlist', { signal })
  return data.symbols
}

export async function addSymbol(symbol: string, signal?: AbortSignal) {
  const data = await request<{ symbols: string[] }>('watchlist', {
    method: 'POST',
    body: { symbol },
    signal,
  })
  return data.symbols
}

export async function removeSymbols(symbols: string[], signal?: AbortSignal) {
  const data = await request<{ symbols: string[] }>('watchlist', {
    method: 'POST',
    body: { remove: symbols },
    signal,
  })
  return data.symbols
}

export function fetchHealth(signal?: AbortSignal) {
  return request<Health>('health', { signal })
}

export async function fetchQuotes(symbols: string[], signal?: AbortSignal) {
  if (symbols.length === 0) return []
  const data = await request<{ quotes: Quote[] }>(
    `quote?symbols=${encodeURIComponent(symbols.join(','))}`,
    { signal }
  )
  return data.quotes
}

export async function searchSymbols(query: string, signal?: AbortSignal) {
  const data = await request<{ results: SearchResult[] }>(
    `search?q=${encodeURIComponent(query)}`,
    { signal }
  )
  return data.results
}

export async function fetchMarkets(term: string, signal?: AbortSignal) {
  const data = await request<{ markets: PredictionMarket[] }>(
    `polymarket?q=${encodeURIComponent(term)}`,
    { signal }
  )
  return data.markets
}

export async function fetchNews(symbol?: string, signal?: AbortSignal) {
  const path = symbol ? `news?symbol=${encodeURIComponent(symbol)}` : 'news'
  const data = await request<{ articles: Article[] }>(path, { signal })
  return data.articles
}

export function runAnalysis(symbols: string[], signal?: AbortSignal) {
  return request<AnalysisPayload>('analyze', {
    method: 'POST',
    body: { symbols },
    signal,
  })
}

export function translate(
  article: Pick<Article, 'id' | 'headline' | 'summary'>,
  signal?: AbortSignal
) {
  return request<{ headlineZh: string; summaryZh: string }>('translate', {
    method: 'POST',
    body: article,
    signal,
  })
}
