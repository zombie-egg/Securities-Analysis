import { useState } from 'react'
import {
  ArrowLeft,
  Clock,
  ExternalLink,
  Languages,
  Loader2,
  Newspaper,
} from 'lucide-react'

import { ErrorState, LoadingState } from '@/components/pages/state-views'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { translate, type ApiError, type Article } from '@/lib/api'
import { intlLocale, relativeTime, type Dict, type Locale } from '@/lib/i18n'

interface NewsPageProps {
  articles: Article[]
  loading: boolean
  error: ApiError | null
  symbols: string[]
  activeSymbol: string | null
  locale: Locale
  t: Dict
  onSelectSymbol: (symbol: string | null) => void
  onRetry: () => void
}

/** Page 3 — real news list plus an in-page detail view. */
export function NewsPage({
  articles,
  loading,
  error,
  symbols,
  activeSymbol,
  locale,
  t,
  onSelectSymbol,
  onRetry,
}: NewsPageProps) {
  const [selected, setSelected] = useState<Article | null>(null)

  if (selected) {
    return (
      <ArticleDetail
        article={selected}
        locale={locale}
        t={t}
        onBack={() => setSelected(null)}
      />
    )
  }

  return (
    <div className="space-y-4">
      {/* Symbol filter, built from the user's watchlist */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={activeSymbol === null ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => onSelectSymbol(null)}
        >
          {t.allMarkets}
        </Button>
        {symbols.map((symbol) => (
          <Button
            key={symbol}
            variant={activeSymbol === symbol ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => onSelectSymbol(symbol)}
          >
            {symbol}
          </Button>
        ))}
      </div>

      {error ? (
        <ErrorState error={error} t={t} onRetry={onRetry} />
      ) : loading ? (
        <LoadingState t={t} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {activeSymbol
                ? t.companyNewsTitle(activeSymbol)
                : t.newsFeedTitle}
            </CardTitle>
            <CardDescription>{t.newsFeedDesc}</CardDescription>
          </CardHeader>
          <CardContent>
            {articles.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t.emptyNews}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {articles.map((article) => (
                  <li key={article.id}>
                    {/* Whole row is the click target into the detail view */}
                    <button
                      type="button"
                      onClick={() => setSelected(article)}
                      className="flex w-full gap-3 py-4 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {article.image ? (
                        <img
                          src={article.image}
                          alt=""
                          loading="lazy"
                          className="size-16 shrink-0 rounded-md border object-cover"
                          onError={(event) => {
                            event.currentTarget.style.display = 'none'
                          }}
                        />
                      ) : (
                        <div className="flex size-16 shrink-0 items-center justify-center rounded-md border bg-muted">
                          <Newspaper className="size-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-sm font-medium leading-snug">
                          {article.headline}
                        </p>
                        {article.summary && (
                          <p className="line-clamp-2 text-sm text-muted-foreground">
                            {article.summary}
                          </p>
                        )}
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock className="size-3.5" />
                          {article.source} ·{' '}
                          {relativeTime(article.datetime, locale)}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

/**
 * Detail view. Finnhub supplies a summary and a link, not licensed full text,
 * so the full story opens on the publisher's site.
 */
function ArticleDetail({
  article,
  locale,
  t,
  onBack,
}: {
  article: Article
  locale: Locale
  t: Dict
  onBack: () => void
}) {
  const [translated, setTranslated] = useState<{
    headlineZh: string
    summaryZh: string
  } | null>(null)
  const [showTranslation, setShowTranslation] = useState(false)
  const [translating, setTranslating] = useState(false)
  const [translateError, setTranslateError] = useState<string | null>(null)

  async function handleTranslate() {
    if (translated) {
      setShowTranslation((prev) => !prev)
      return
    }
    setTranslating(true)
    setTranslateError(null)
    try {
      setTranslated(await translate(article))
      setShowTranslation(true)
    } catch (err) {
      setTranslateError(
        err instanceof Error ? err.message : 'Translation failed.'
      )
    } finally {
      setTranslating(false)
    }
  }

  const headline =
    showTranslation && translated ? translated.headlineZh : article.headline
  const summary =
    showTranslation && translated ? translated.summaryZh : article.summary

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft />
        {t.back}
      </Button>

      <Card>
        <CardHeader className="space-y-3">
          <CardTitle className="text-2xl leading-tight">{headline}</CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium">{article.source}</span>
            <span>·</span>
            <span>
              {new Date(article.datetime).toLocaleString(intlLocale(locale), {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </span>
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          {article.image && (
            <img
              src={article.image}
              alt=""
              className="w-full rounded-md border object-cover"
              onError={(event) => {
                event.currentTarget.style.display = 'none'
              }}
            />
          )}

          <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            {summary || t.noSummary}
          </p>

          {article.related.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t.relatedTickers}
              </p>
              <div className="flex flex-wrap gap-2">
                {article.related.slice(0, 12).map((ticker) => (
                  <span
                    key={ticker}
                    className="rounded-md border bg-muted px-2 py-0.5 text-xs font-medium"
                  >
                    {ticker}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink />
                {t.readOriginal}
              </a>
            </Button>
            <Button
              variant="outline"
              onClick={handleTranslate}
              disabled={translating}
            >
              {translating ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Languages />
              )}
              {translating
                ? t.translating
                : showTranslation
                  ? t.showOriginal
                  : t.translateAction}
            </Button>
          </div>

          {translateError && (
            <p role="alert" className="text-sm text-chart-5">
              {translateError}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
