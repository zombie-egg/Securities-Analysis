import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Sparkles,
  XCircle,
} from 'lucide-react'

import { ErrorState } from '@/components/pages/state-views'
import { BorderBeam } from '@/components/ui/border-beam'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type {
  AnalysisPayload,
  ApiError,
  FocusResult,
  PredictionMarket,
} from '@/lib/api'
import {
  formatEasternTime,
  intlLocale,
  relativeTime,
  type Dict,
  type Locale,
} from '@/lib/i18n'
import { SENTIMENT_BADGE } from '@/lib/sentiment'

interface FocusPageProps {
  payload: AnalysisPayload | null
  loading: boolean
  error: ApiError | null
  hasSymbols: boolean
  locale: Locale
  t: Dict
  onRun: () => void
}

/** Page 2 (core) — real AI analysis, each verdict traceable to its sources. */
export function FocusPage({
  payload,
  loading,
  error,
  hasSymbols,
  locale,
  t,
  onRun,
}: FocusPageProps) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="size-4 text-muted-foreground" />
              {t.aiDailyFocus}
            </CardTitle>
            <CardDescription>
              {t.aiDailyFocusDesc}
              {payload
                ? ` · ${t.analyzedAt(
                    formatEasternTime(payload.generatedAt, locale, {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  )}`
                : ''}
            </CardDescription>
          </div>
          <Button onClick={onRun} disabled={loading || !hasSymbols}>
            {loading ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Sparkles />
            )}
            {loading ? t.analyzing : t.runAnalysis}
          </Button>
        </CardHeader>
      </Card>

      {error ? (
        <ErrorState error={error} t={t} onRetry={onRun} />
      ) : !payload && !loading ? (
        <Card>
          <CardContent className="space-y-2 py-12 text-center">
            <p className="font-medium">{t.noFocusYet}</p>
            <p className="text-sm text-muted-foreground">
              {hasSymbols ? t.noFocusHint : t.emptyWatchlist}
            </p>
          </CardContent>
        </Card>
      ) : loading && !payload ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t.analyzing}
          </CardContent>
        </Card>
      ) : payload ? (
        <>
          <SourceBanner sources={payload.sources} t={t} />

          <div className="grid gap-4 lg:grid-cols-2">
            {payload.results.map((result) => (
              <FocusCard
                key={result.symbol}
                result={result}
                articles={payload.articlesBySymbol[result.symbol] ?? []}
                markets={payload.marketsBySymbol[result.symbol] ?? []}
                locale={locale}
                t={t}
              />
            ))}
          </div>

          {/* Symbols the model could not cover, named rather than hidden */}
          {payload.failures.length > 0 && (
            <Card className="border-chart-5/40">
              <CardContent className="space-y-1 py-4">
                <p className="flex items-center gap-2 text-sm font-medium text-chart-5">
                  <AlertCircle className="size-4" />
                  {t.partialFailure(
                    payload.failures.map((f) => f.symbol).join(', ')
                  )}
                </p>
                {payload.failures.map((failure) => (
                  <p
                    key={failure.symbol}
                    className="text-sm text-muted-foreground"
                  >
                    {failure.symbol}: {failure.reason}
                  </p>
                ))}
              </CardContent>
            </Card>
          )}

          <p className="text-xs text-muted-foreground">{t.poweredBy}</p>
        </>
      ) : null}
    </div>
  )
}

/** Format market volume as $1.2M / $645K. */
function compactMoney(value: number, locale: Locale) {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

/** Per-source live/unavailable strip, so nothing silently degrades. */
function SourceBanner({
  sources,
  t,
}: {
  sources: AnalysisPayload['sources']
  t: Dict
}) {
  const entries = [
    { label: t.sourceQuotes, status: sources.quotes },
    { label: t.sourceNews, status: sources.news },
    { label: t.sourcePolymarket, status: sources.polymarket },
  ]
  const degraded = entries.some((entry) => !entry.status.ok)

  return (
    <Card>
      <CardContent className="space-y-2 py-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t.sourceStatus}
          </span>
          {entries.map((entry) => (
            <span
              key={entry.label}
              className="flex items-center gap-1.5 text-sm"
              title={entry.status.reason ?? undefined}
            >
              {entry.status.ok ? (
                <CheckCircle2 className="size-3.5 text-chart-2" />
              ) : (
                <XCircle className="size-3.5 text-chart-5" />
              )}
              <span className="text-muted-foreground">
                {entry.label}
                <span className="ml-1 opacity-70">
                  {entry.status.ok ? t.sourceLive : t.sourceMissing}
                </span>
              </span>
            </span>
          ))}
        </div>

        {degraded && (
          <>
            <p className="text-xs text-muted-foreground">{t.degradedNotice}</p>
            {entries
              .filter((entry) => !entry.status.ok && entry.status.reason)
              .map((entry) => (
                <p key={entry.label} className="text-xs text-muted-foreground">
                  {entry.label}: {entry.status.reason}
                </p>
              ))}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function FocusCard({
  result,
  articles,
  markets,
  locale,
  t,
}: {
  result: FocusResult
  articles: { id: string; headline: string; url: string; datetime: number }[]
  markets: PredictionMarket[]
  locale: Locale
  t: Dict
}) {
  const reasoning = locale === 'zh' ? result.reasoningZh : result.reasoningEn
  const polymarketNote =
    locale === 'zh' ? result.polymarketNoteZh : result.polymarketNoteEn

  // Only the headlines the model said it used
  const cited = result.citedIndices
    .map((index) => articles[index])
    .filter((article): article is (typeof articles)[number] => Boolean(article))

  return (
    <Card className="relative overflow-hidden">
      <BorderBeam size={180} duration={12} />
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-xl">{result.symbol}</CardTitle>
            <CardDescription className="truncate">
              {result.name}
            </CardDescription>
          </div>
          <span
            className={`shrink-0 rounded-md border px-2 py-1 text-xs font-medium ${SENTIMENT_BADGE[result.sentiment]}`}
          >
            {t.sentiment[result.sentiment]}
          </span>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{t.confidence}</span>
            <span className="tabular-nums">{result.confidence}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${result.confidence}%` }}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 text-sm">
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Activity className="size-3.5" />
            {t.polymarketLabel}
          </p>

          {/* Real market odds, shown alongside the model's reading of them */}
          {markets.length > 0 ? (
            <ul className="space-y-1.5">
              {markets.map((market) => (
                <li key={market.slug}>
                  <a
                    href={market.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-start justify-between gap-3 rounded-md border bg-muted/40 px-2.5 py-2 transition-colors hover:bg-accent/60"
                  >
                    <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                      <span className="line-clamp-2 group-hover:text-foreground">
                        {market.question}
                      </span>
                      <span className="mt-0.5 block opacity-70">
                        {t.marketVolume(compactMoney(market.volume, locale))}
                      </span>
                    </span>
                    {market.probability !== null && (
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-medium tabular-nums">
                          {market.probability}%
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {market.outcomeLabel}
                        </span>
                      </span>
                    )}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">{t.polymarketUnavailable}</p>
          )}

          {polymarketNote && (
            <p className="text-muted-foreground">{polymarketNote}</p>
          )}
        </div>

        <div className="space-y-1 rounded-md border bg-muted/40 p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Sparkles className="size-3.5" />
            {t.reasoningLabel}
          </p>
          <p className="text-muted-foreground">{reasoning}</p>
        </div>

        {/* Traceability: the actual articles behind the verdict */}
        {cited.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t.sourcesLabel}
            </p>
            <ul className="space-y-1.5">
              {cited.map((article) => (
                <li key={article.id}>
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="mt-0.5 size-3 shrink-0" />
                    <span className="underline-offset-2 group-hover:underline">
                      {article.headline}
                      <span className="ml-1 opacity-70">
                        ({relativeTime(article.datetime, locale)})
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
