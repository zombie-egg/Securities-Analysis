// Single implementation of every /api route. Imported by the Vite dev
// middleware (local) and by api/[...path].ts (Vercel), so both behave
// identically and the proxy logic exists in exactly one place.

import * as finnhub from './finnhub.ts'
import * as yahoo from './yahoo.ts'
import * as polymarket from './polymarket.ts'
import * as realtime from './realtime.ts'
import * as auth from './auth.ts'
import { analyzeStock, translateArticle, type FocusResult } from './deepseek.ts'
import { UpstreamError } from './http.ts'

/**
 * Quotes come from Finnhub when a key is configured, and from Yahoo's keyless
 * chart endpoint otherwise, so real prices appear before any signup. Both
 * return the same Quote shape.
 */
function quoteProvider() {
  return process.env.FINNHUB_API_KEY ? finnhub : yahoo
}

/** Validate a ticker against whichever quote source is active. */
async function verifySymbols(query: string) {
  if (process.env.FINNHUB_API_KEY) return finnhub.search(query)
  // Yahoo has no search endpoint; an exact-ticker lookup is what the
  // add-to-watchlist flow actually needs.
  const hit = await yahoo.verify(query.trim().toUpperCase())
  return hit ? [hit] : []
}

export interface ApiRequest {
  path: string
  query: URLSearchParams
  method: string
  body: unknown
  /** Raw Cookie header, used to resolve the session. */
  cookies?: string
}

export interface ApiResponse {
  status: number
  body: unknown
  /** Set-Cookie value, when a route opens or closes a session. */
  setCookie?: string
}

function ok(body: unknown): ApiResponse {
  return { status: 200, body }
}

const SESSION_COOKIE = 'sd_session'
const MAX_AVATAR_BYTES = 200 * 1024
const AVATAR_DATA_URI = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]*={0,2})$/

/** Read one cookie out of a raw Cookie header. */
function readCookie(header: string | undefined, name: string): string | null {
  for (const part of (header ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return decodeURIComponent(rest.join('='))
  }
  return null
}

/**
 * HttpOnly so client JavaScript cannot read the token, SameSite=Lax so it is
 * not sent on cross-site requests, and Secure once served over HTTPS.
 */
function sessionCookie(token: string, maxAgeSeconds: number): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return (
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; ` +
    `SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`
  )
}

/** Resolve the signed-in user, or throw 401. */
async function requireUser(req: ApiRequest) {
  const token = readCookie(req.cookies, SESSION_COOKIE)
  const user = await auth.userForToken(token)
  if (!user) {
    throw new UpstreamError(401, 'UNAUTHENTICATED', 'Sign in to continue.')
  }
  return user
}

function requirePost(req: ApiRequest, route: string) {
  if (req.method !== 'POST') {
    throw new UpstreamError(405, 'BAD_METHOD', `Use POST for /api/${route}.`)
  }
}

function requireParam(query: URLSearchParams, name: string): string {
  const value = query.get(name)
  if (!value) {
    throw new UpstreamError(400, 'BAD_REQUEST', `Missing "${name}" parameter.`)
  }
  return value
}

/** Sanitize a user-supplied ticker before it reaches an upstream URL. */
function cleanSymbol(raw: string): string {
  const symbol = raw.trim().toUpperCase()
  if (!/^[A-Z][A-Z.-]{0,9}$/.test(symbol)) {
    throw new UpstreamError(400, 'BAD_SYMBOL', `Invalid ticker: ${raw}`)
  }
  return symbol
}

/** Accept only a real, small PNG/JPEG/WebP data URI, or null to remove it. */
function cleanAvatar(raw: unknown): string | null {
  if (raw === null) return null
  if (typeof raw !== 'string') {
    throw new UpstreamError(400, 'BAD_AVATAR', 'Choose a PNG, JPEG, or WebP image.')
  }
  const match = AVATAR_DATA_URI.exec(raw)
  if (!match) {
    throw new UpstreamError(
      400,
      'BAD_AVATAR',
      'Avatar must be a base64 PNG, JPEG, or WebP image.'
    )
  }
  const decoded = Buffer.from(match[2], 'base64')
  const supplied = match[2].replace(/=+$/, '')
  const canonical = decoded.toString('base64').replace(/=+$/, '')
  if (decoded.length === 0 || supplied !== canonical) {
    throw new UpstreamError(400, 'BAD_AVATAR', 'Avatar image data is invalid.')
  }
  if (decoded.length > MAX_AVATAR_BYTES) {
    throw new UpstreamError(
      413,
      'AVATAR_TOO_LARGE',
      'Avatar must be 200 KB or smaller.'
    )
  }
  return raw
}

interface AnalyzeBody {
  symbols?: unknown
}

/**
 * Overlay streamed trade prices on a REST snapshot. The snapshot supplies the
 * day's open/high/low/prevClose; the socket supplies a price that is current to
 * the second, so change and changePct are recomputed from it.
 */
function withLivePrices(quotes: finnhub.Quote[]): finnhub.Quote[] {
  const live = realtime.track(quotes.map((q) => q.symbol))
  if (live.size === 0) return quotes

  return quotes.map((quote) => {
    const hit = live.get(quote.symbol)
    if (!hit || hit.price === quote.price) return quote

    const change = hit.price - quote.prevClose
    return {
      ...quote,
      price: hit.price,
      change,
      changePct:
        quote.prevClose === 0 ? 0 : (change / quote.prevClose) * 100,
      // A live trade can exceed the snapshot's range for the day
      high: Math.max(quote.high, hit.price),
      low: Math.min(quote.low, hit.price),
    }
  })
}

/** Route one API request. Throws UpstreamError for anything non-200. */
export async function handle(req: ApiRequest): Promise<ApiResponse> {
  switch (req.path) {
    case 'quote': {
      const symbols = requireParam(req.query, 'symbols')
        .split(',')
        .map(cleanSymbol)
        .slice(0, 25)
      const quotes = await quoteProvider().quotes(symbols)
      return ok({ quotes: withLivePrices(quotes) })
    }

    case 'search': {
      const q = requireParam(req.query, 'q')
      return ok({ results: await verifySymbols(q.slice(0, 20)) })
    }

    case 'news': {
      const symbol = req.query.get('symbol')
      const articles = symbol
        ? await finnhub.companyNews(cleanSymbol(symbol))
        : await finnhub.marketNews()
      return ok({ articles })
    }

    case 'polymarket': {
      const term = requireParam(req.query, 'q')
      return ok({ markets: await polymarket.marketsFor(term.slice(0, 40)) })
    }

    case 'analyze': {
      if (req.method !== 'POST') {
        throw new UpstreamError(405, 'BAD_METHOD', 'Use POST for /api/analyze.')
      }
      const body = (req.body ?? {}) as AnalyzeBody
      const symbols = Array.isArray(body.symbols)
        ? body.symbols.map((s) => cleanSymbol(String(s))).slice(0, 6)
        : []
      if (symbols.length === 0) {
        throw new UpstreamError(400, 'BAD_REQUEST', 'Provide at least one symbol.')
      }
      return ok(await runAnalysis(symbols))
    }

    case 'translate': {
      if (req.method !== 'POST') {
        throw new UpstreamError(405, 'BAD_METHOD', 'Use POST for /api/translate.')
      }
      const body = (req.body ?? {}) as {
        id?: string
        headline?: string
        summary?: string
      }
      if (!body.id || !body.headline) {
        throw new UpstreamError(400, 'BAD_REQUEST', 'Missing id or headline.')
      }
      return ok(
        await translateArticle(body.id, body.headline, body.summary ?? '')
      )
    }

    // --- Accounts -------------------------------------------------------

    case 'auth/request-code': {
      requirePost(req, 'auth/request-code')
      const body = (req.body ?? {}) as { email?: unknown }
      return ok(await auth.requestCode(body.email))
    }

    case 'auth/register': {
      requirePost(req, 'auth/register')
      const body = (req.body ?? {}) as {
        email?: unknown
        code?: unknown
        password?: unknown
      }
      const { user, token } = await auth.register(
        body.email,
        body.code,
        body.password
      )
      return {
        status: 200,
        body: { user },
        setCookie: sessionCookie(token, 30 * 86_400),
      }
    }

    case 'auth/login': {
      requirePost(req, 'auth/login')
      const body = (req.body ?? {}) as { email?: unknown; password?: unknown }
      const { user, token } = await auth.login(body.email, body.password)
      return {
        status: 200,
        body: { user },
        setCookie: sessionCookie(token, 30 * 86_400),
      }
    }

    case 'auth/logout': {
      requirePost(req, 'auth/logout')
      await auth.logout(readCookie(req.cookies, SESSION_COOKIE))
      // Max-Age=0 clears it in the browser
      return { status: 200, body: { ok: true }, setCookie: sessionCookie('', 0) }
    }

    case 'auth/me': {
      // Not an error when signed out — the client uses this to decide what to show
      const token = readCookie(req.cookies, SESSION_COOKIE)
      const user = await auth.userForToken(token)
      return ok({ user })
    }

    case 'auth/profile': {
      requirePost(req, 'auth/profile')
      const user = await requireUser(req)
      const body = (req.body ?? {}) as {
        displayName?: unknown
        avatar?: unknown
      }
      if (body.displayName === undefined && body.avatar === undefined) {
        throw new UpstreamError(
          400,
          'BAD_REQUEST',
          'Provide a display name or avatar.'
        )
      }
      const avatar =
        body.avatar === undefined ? undefined : cleanAvatar(body.avatar)
      return ok({
        user: await auth.updateProfile(user.id, {
          displayName: body.displayName,
          avatar,
        }),
      })
    }

    case 'watchlist': {
      const user = await requireUser(req)

      if (req.method === 'GET') {
        return ok({ symbols: await auth.getWatchlist(user.id) })
      }
      if (req.method === 'POST') {
        const body = (req.body ?? {}) as { symbol?: unknown; remove?: unknown }
        if (Array.isArray(body.remove)) {
          const removing = body.remove.map((s) => cleanSymbol(String(s)))
          return ok({ symbols: await auth.removeFromWatchlist(user.id, removing) })
        }
        if (body.symbol === undefined) {
          throw new UpstreamError(400, 'BAD_REQUEST', 'Provide a symbol.')
        }
        const symbol = cleanSymbol(String(body.symbol))
        // Confirm the ticker is real before storing it
        const matches = await verifySymbols(symbol)
        if (!matches.some((m) => m.symbol === symbol)) {
          throw new UpstreamError(
            404,
            'UNKNOWN_SYMBOL',
            `No market data found for ${symbol}.`
          )
        }
        return ok({ symbols: await auth.addToWatchlist(user.id, symbol) })
      }
      throw new UpstreamError(405, 'BAD_METHOD', 'Use GET or POST.')
    }

    case 'health': {
      return ok({
        finnhubConfigured: Boolean(process.env.FINNHUB_API_KEY),
        deepseekConfigured: Boolean(process.env.DEEPSEEK_API_KEY),
        polymarketReachable: await polymarket.reachable(),
        quoteSource: process.env.FINNHUB_API_KEY ? 'finnhub' : 'yahoo',
        streaming: realtime.streaming(),
        databaseConfigured: Boolean(process.env.DATABASE_URL),
        mailConfigured: Boolean(
          process.env.QQ_EMAIL && process.env.QQ_EMAIL_AUTH_CODE
        ),
      })
    }

    default:
      throw new UpstreamError(404, 'NOT_FOUND', `Unknown endpoint: ${req.path}`)
  }
}

export interface AnalysisPayload {
  results: FocusResult[]
  articlesBySymbol: Record<string, finnhub.Article[]>
  marketsBySymbol: Record<string, polymarket.PredictionMarket[]>
  /** Per-source status, so the UI can say what is live and what is missing. */
  sources: {
    quotes: SourceStatus
    news: SourceStatus
    polymarket: SourceStatus
  }
  generatedAt: number
  failures: { symbol: string; reason: string }[]
}

export interface SourceStatus {
  ok: boolean
  reason: string | null
}

/** Strip corporate suffixes so "Amazon.com Inc" searches as "Amazon". */
function companySearchTerm(name: string): string {
  return name
    .replace(/\b(inc|corp|corporation|co|ltd|plc|holdings|group|the|company)\b\.?/gi, '')
    .replace(/[.,]/g, '')
    .trim()
}

/** Collect Polymarket signals for one symbol, by ticker and by company name. */
async function marketsForSymbol(symbol: string, companyName: string) {
  const term = companySearchTerm(companyName)
  const [tickerMarkets, nameMarkets] = await Promise.all([
    polymarket.marketsFor(symbol),
    term && term.toUpperCase() !== symbol
      ? polymarket.marketsFor(term)
      : Promise.resolve([] as polymarket.PredictionMarket[]),
  ])

  // Merge both searches, de-duplicating by market slug
  const bySlug = new Map<string, polymarket.PredictionMarket>()
  for (const market of [...nameMarkets, ...tickerMarkets]) {
    if (!bySlug.has(market.slug)) bySlug.set(market.slug, market)
  }
  return [...bySlug.values()].sort((a, b) => b.volume - a.volume).slice(0, 3)
}

/**
 * Gather real evidence per symbol, then have DeepSeek analyze each one.
 *
 * Each upstream degrades on its own: if quotes or news are unavailable (no
 * Finnhub key, rate limit) the analysis still runs on whatever evidence did
 * arrive, and `sources` reports exactly what was missing. A symbol is only
 * skipped when it has no evidence at all.
 */
async function runAnalysis(symbols: string[]): Promise<AnalysisPayload> {
  const sources: AnalysisPayload['sources'] = {
    quotes: { ok: true, reason: null },
    news: { ok: true, reason: null },
    polymarket: { ok: true, reason: null },
  }

  // Quotes are optional context, not a precondition
  let quoteBySymbol = new Map<string, finnhub.Quote>()
  try {
    const quotes = withLivePrices(await quoteProvider().quotes(symbols))
    quoteBySymbol = new Map(quotes.map((q) => [q.symbol, q]))
  } catch (err) {
    sources.quotes = {
      ok: false,
      reason: err instanceof UpstreamError ? err.message : 'Quotes unavailable.',
    }
  }

  const articlesBySymbol: Record<string, finnhub.Article[]> = {}
  const marketsBySymbol: Record<string, polymarket.PredictionMarket[]> = {}
  const results: FocusResult[] = []
  const failures: { symbol: string; reason: string }[] = []
  let newsError: string | null = null
  let anyMarkets = false

  const settled = await Promise.all(
    symbols.map(async (symbol) => {
      const quote = quoteBySymbol.get(symbol)

      const [articlesResult, markets] = await Promise.all([
        finnhub
          .companyNews(symbol)
          .then((articles) => ({ articles, error: null as string | null }))
          .catch((err: unknown) => ({
            articles: [] as finnhub.Article[],
            error:
              err instanceof UpstreamError ? err.message : 'News unavailable.',
          })),
        marketsForSymbol(symbol, quote?.name ?? symbol),
      ])

      if (articlesResult.error) newsError ??= articlesResult.error
      if (markets.length > 0) anyMarkets = true

      const topArticles = articlesResult.articles.slice(0, 8)
      articlesBySymbol[symbol] = topArticles
      marketsBySymbol[symbol] = markets

      // Need at least one kind of real evidence to say anything
      if (topArticles.length === 0 && markets.length === 0) {
        return {
          symbol,
          error:
            articlesResult.error ??
            'No recent news or prediction markets found for this symbol.',
          result: null,
        }
      }

      try {
        const result = await analyzeStock({
          symbol,
          name: quote?.name ?? symbol,
          changePct: quote?.changePct ?? null,
          price: quote?.price ?? null,
          articles: topArticles,
          markets,
        })
        return { symbol, error: null, result }
      } catch (err) {
        return {
          symbol,
          error:
            err instanceof UpstreamError
              ? err.message
              : 'Analysis failed for this symbol.',
          result: null,
        }
      }
    })
  )

  if (newsError) sources.news = { ok: false, reason: newsError }
  if (!anyMarkets) {
    sources.polymarket = {
      ok: await polymarket.reachable(),
      reason: 'No related prediction markets found for these symbols.',
    }
  }

  for (const entry of settled) {
    if (entry.result) results.push(entry.result)
    else failures.push({ symbol: entry.symbol, reason: entry.error! })
  }

  // Strongest signals first, regardless of direction
  results.sort((a, b) => b.confidence - a.confidence)

  return {
    results,
    articlesBySymbol,
    marketsBySymbol,
    sources,
    generatedAt: Date.now(),
    failures,
  }
}

/** Convert a thrown error into a client-safe response. */
export function toErrorResponse(err: unknown): ApiResponse {
  if (err instanceof UpstreamError) {
    return { status: err.status, body: { error: err.code, message: err.message } }
  }
  return {
    status: 500,
    body: {
      error: 'INTERNAL',
      message: err instanceof Error ? err.message : 'Unexpected server error.',
    },
  }
}
