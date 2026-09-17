// DeepSeek adapter — turns real headlines and real prediction-market odds into
// a structured, bilingual analysis. Verified models: deepseek-flash,
// deepseek-v4-pro. JSON output mode is supported.

import { cached, TTL } from './cache.ts'
import { requireEnv, UpstreamError } from './http.ts'
import type { Article } from './finnhub.ts'
import type { PredictionMarket } from './polymarket.ts'

const ENDPOINT = 'https://api.deepseek.com/v1/chat/completions'

export type Sentiment = 'Bullish' | 'Neutral' | 'Bearish'

export interface AnalysisInput {
  symbol: string
  name: string
  /** Null when quotes are unavailable; the prompt then omits the price line. */
  changePct: number | null
  /**
   * Last traded price. Needed alongside changePct because prediction markets
   * are quoted at strike prices — without it the model cannot tell whether a
   * "$220 by Friday" contract is a small step or a large one.
   */
  price: number | null
  articles: Article[]
  markets: PredictionMarket[]
}

export interface FocusResult {
  symbol: string
  name: string
  sentiment: Sentiment
  confidence: number // 0-100
  reasoningEn: string
  reasoningZh: string
  polymarketNoteEn: string | null
  polymarketNoteZh: string | null
  /** Indices into the articles array that the reasoning draws on. */
  citedIndices: number[]
}

const SYSTEM_PROMPT = `You are an equity news-sentiment analyst. You receive real \
headlines and real prediction-market odds for one US-listed stock, and you output \
a single JSON object.

Rules:
- Base every claim ONLY on the supplied headlines and market odds. Never invent \
facts, numbers, or events not present in the input.
- Some inputs may be missing (no headlines, no market odds, or no price). Work \
with whatever is supplied, say what the available evidence supports, and lower \
"confidence" accordingly. Never speculate to fill a gap.
- "sentiment" must be exactly "Bullish", "Neutral", or "Bearish".
- "confidence" is an integer 0-100 reflecting how clearly the evidence points one way. \
Weak or conflicting evidence means a low number and usually "Neutral".
- Reasoning is 2-3 sentences, specific to the supplied material. Reference what the \
headlines actually say. No boilerplate, no disclaimers, no investment advice.
- reasoning_zh is native Simplified Chinese financial prose, not a literal translation.
- "cited_indices" lists the 0-based indices of the headlines you actually used.
- If prediction-market data is absent, set both polymarket_note fields to null.
- Prediction markets are matched by keyword and may be only loosely related to \
the stock. If a supplied market is not genuinely informative about this company, \
say so plainly in the note or set it to null. Never stretch a weak connection.

Output exactly this shape:
{"sentiment":"Bullish"|"Neutral"|"Bearish","confidence":int,"reasoning_en":string,
"reasoning_zh":string,"polymarket_note_en":string|null,"polymarket_note_zh":string|null,
"cited_indices":int[]}`

interface RawResponse {
  choices?: { message?: { content?: string }; finish_reason?: string }[]
  error?: { message?: string }
}

interface RawAnalysis {
  sentiment?: string
  confidence?: number
  reasoning_en?: string
  reasoning_zh?: string
  polymarket_note_en?: string | null
  polymarket_note_zh?: string | null
  cited_indices?: number[]
}

/** POST to DeepSeek and return the assistant message content. */
async function complete(
  messages: { role: string; content: string }[],
  maxTokens: number
): Promise<string> {
  const apiKey = requireEnv('DEEPSEEK_API_KEY')
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-flash'

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 90_000)
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: maxTokens,
      }),
    })
    const body = (await res.json().catch(() => ({}))) as RawResponse
    if (!res.ok) {
      throw new UpstreamError(
        res.status === 401 ? 503 : 502,
        res.status === 401 ? 'MISSING_KEY' : 'UPSTREAM_ERROR',
        body.error?.message ?? `DeepSeek responded ${res.status}.`
      )
    }
    const choice = body.choices?.[0]
    const content = choice?.message?.content
    if (!content) {
      throw new UpstreamError(502, 'EMPTY_RESPONSE', 'DeepSeek returned no content.')
    }
    // A response cut off at max_tokens is truncated mid-string, so it can never
    // parse as JSON. Say that plainly instead of reporting "malformed JSON".
    if (choice.finish_reason === 'length') {
      throw new UpstreamError(
        502,
        'TRUNCATED',
        'DeepSeek response hit the token limit before finishing.'
      )
    }
    return content
  } catch (err) {
    if (err instanceof UpstreamError) throw err
    if (err instanceof Error && err.name === 'AbortError') {
      throw new UpstreamError(504, 'TIMEOUT', 'DeepSeek request timed out.')
    }
    throw new UpstreamError(
      502,
      'NETWORK_ERROR',
      err instanceof Error ? err.message : 'DeepSeek request failed.'
    )
  } finally {
    clearTimeout(timer)
  }
}

function normalizeSentiment(value: string | undefined): Sentiment {
  if (value === 'Bullish' || value === 'Bearish') return value
  return 'Neutral'
}

function clampConfidence(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 50
  // Tolerate a model returning 0-1 instead of 0-100
  const scaled = value > 0 && value <= 1 ? value * 100 : value
  return Math.max(0, Math.min(100, Math.round(scaled)))
}

/** Analyze one stock from its real headlines and prediction markets. */
export async function analyzeStock(
  input: AnalysisInput
): Promise<FocusResult> {
  const headlineBlock = input.articles
    .map(
      (a, i) =>
        `[${i}] ${a.headline}${a.summary ? `\n    ${a.summary.slice(0, 300)}` : ''}` +
        `\n    (${a.source}, ${new Date(a.datetime).toISOString().slice(0, 10)})`
    )
    .join('\n')

  const marketBlock = input.markets.length
    ? input.markets
        .map(
          (m) =>
            `- "${m.question}" — "${m.outcomeLabel}" at ${m.probability ?? '?'}%` +
            ` (volume $${Math.round(m.volume).toLocaleString('en-US')})`
        )
        .join('\n')
    : 'None available.'

  const priceLine =
    input.price === null || input.changePct === null
      ? 'Current price: not available.'
      : `Current price: $${input.price.toFixed(2)} ` +
        `(${input.changePct >= 0 ? '+' : ''}${input.changePct.toFixed(2)}% today)`

  const userPrompt = `Stock: ${input.symbol} (${input.name})
${priceLine}

Recent headlines:
${headlineBlock || 'None available.'}

Polymarket prediction markets:
${marketBlock}`

  // Cache on the actual evidence, so identical inputs do not re-bill
  const cacheKey = `analyze:${input.symbol}:${input.price?.toFixed(2) ?? 'na'}:${input.articles
    .slice(0, 8)
    .map((a) => a.id)
    .join(',')}:${input.markets
    .map((m) => `${m.slug}@${m.probability}`)
    .join(',')}`

  return cached(cacheKey, TTL.analyze, async () => {
    const content = await complete(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      // Bilingual output runs 500-600 tokens, and Chinese costs far more
      // tokens per sentence than English. 900 sat right on that boundary, so
      // longer answers were truncated mid-string and failed to parse.
      2400
    )

    let parsed: RawAnalysis
    try {
      parsed = JSON.parse(content) as RawAnalysis
    } catch {
      throw new UpstreamError(
        502,
        'BAD_JSON',
        'DeepSeek returned malformed JSON.'
      )
    }

    const maxIndex = input.articles.length - 1
    const result: FocusResult = {
      symbol: input.symbol,
      name: input.name,
      sentiment: normalizeSentiment(parsed.sentiment),
      confidence: clampConfidence(parsed.confidence),
      reasoningEn: parsed.reasoning_en?.trim() || '',
      reasoningZh: parsed.reasoning_zh?.trim() || '',
      polymarketNoteEn: parsed.polymarket_note_en?.trim() || null,
      polymarketNoteZh: parsed.polymarket_note_zh?.trim() || null,
      citedIndices: (parsed.cited_indices ?? [])
        .filter((i) => Number.isInteger(i) && i >= 0 && i <= maxIndex)
        .slice(0, 5),
    }
    return result
  })
}

/** Translate one article's headline and summary into Simplified Chinese. */
export async function translateArticle(
  id: string,
  headline: string,
  summary: string
) {
  return cached(`translate:${id}`, TTL.translate, async () => {
    const content = await complete(
      [
        {
          role: 'system',
          content:
            'Translate the given financial news into natural Simplified Chinese. ' +
            'Keep ticker symbols and company names in their common Chinese form. ' +
            'Output JSON: {"headline_zh":string,"summary_zh":string}',
        },
        {
          role: 'user',
          content: `Headline: ${headline}\n\nSummary: ${summary.slice(0, 1500)}`,
        },
      ],
      // Same reason as analyzeStock: Chinese output needs generous headroom.
      2400
    )
    let parsed: { headline_zh?: string; summary_zh?: string }
    try {
      parsed = JSON.parse(content) as typeof parsed
    } catch {
      throw new UpstreamError(
        502,
        'BAD_JSON',
        'DeepSeek returned malformed JSON for the translation.'
      )
    }
    return {
      headlineZh: parsed.headline_zh?.trim() || headline,
      summaryZh: parsed.summary_zh?.trim() || summary,
    }
  })
}
