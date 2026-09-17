import { useState } from 'react'
import {
  Check,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  TrendingDown,
  TrendingUp,
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ApiError, Quote } from '@/lib/api'
import { intlLocale, type Dict, type Locale } from '@/lib/i18n'
import { deltaClass } from '@/lib/sentiment'

interface WatchlistPageProps {
  quotes: Quote[]
  symbols: string[]
  loading: boolean
  error: ApiError | null
  lastUpdated: number | null
  draft: string
  addError: string | null
  adding: boolean
  removing: boolean
  locale: Locale
  t: Dict
  onDraftChange: (value: string) => void
  onAdd: () => void
  onRemove: (symbol: string) => void
  onRemoveMany: (symbols: string[]) => void
  onRetry: () => void
}

/** Page 1 — live quotes for the user's persisted watchlist. */
export function WatchlistPage({
  quotes,
  symbols,
  loading,
  error,
  lastUpdated,
  draft,
  addError,
  adding,
  removing,
  locale,
  t,
  onDraftChange,
  onAdd,
  onRemove,
  onRemoveMany,
  onRetry,
}: WatchlistPageProps) {
  const money = new Intl.NumberFormat(intlLocale(locale), {
    style: 'currency',
    currency: 'USD',
  })

  const [editing, setEditing] = useState(false)
  const [selected, setSelected] = useState<string[]>([])

  // Quotes are keyed by symbol so the list can render from `symbols`. A ticker
  // whose quote failed still needs a row, or it becomes impossible to delete.
  const quoteBySymbol = new Map(quotes.map((q) => [q.symbol, q]))

  function toggleSelected(symbol: string) {
    setSelected((prev) =>
      prev.includes(symbol)
        ? prev.filter((s) => s !== symbol)
        : [...prev, symbol]
    )
  }

  function handleRemoveSelected() {
    onRemoveMany(selected)
    setSelected([])
    setEditing(false)
  }

  function handleToggleEditing() {
    setEditing((prev) => !prev)
    setSelected([])
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t.addTicker}</CardTitle>
          <CardDescription>{t.addTickerDesc}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault()
              onAdd()
            }}
          >
            <div className="flex-1 space-y-2">
              <Label htmlFor="ticker">{t.tickerLabel}</Label>
              <Input
                id="ticker"
                value={draft}
                onChange={(event) => onDraftChange(event.target.value)}
                placeholder={t.tickerPlaceholder}
                maxLength={6}
                autoComplete="off"
                disabled={adding || removing}
                aria-invalid={addError ? true : undefined}
                aria-describedby={addError ? 'ticker-error' : undefined}
                className="uppercase"
              />
            </div>
            <Button
              type="submit"
              className="sm:w-32"
              disabled={adding || removing}
            >
              {adding ? <Loader2 className="animate-spin" /> : <Plus />}
              {adding ? t.verifying : t.add}
            </Button>
          </form>
          {addError && (
            <p
              id="ticker-error"
              role="alert"
              className="mt-2 text-sm text-chart-5"
            >
              {addError}
            </p>
          )}
        </CardContent>
      </Card>

      {error && <ErrorState error={error} t={t} onRetry={onRetry} />}
      {loading && symbols.length === 0 ? (
        <LoadingState t={t} />
      ) : (
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
            <div className="space-y-1.5">
              <CardTitle className="text-lg">{t.myWatchlist}</CardTitle>
              <CardDescription>
                {t.tracked(symbols.length)}
                {lastUpdated
                  ? ` · ${t.updatedAt(
                      new Date(lastUpdated).toLocaleTimeString(
                        intlLocale(locale),
                        {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        }
                      )
                    )}`
                  : ''}
              </CardDescription>
            </div>
            {symbols.length > 0 && (
              <div className="flex shrink-0 items-center gap-2">
                {editing && selected.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={adding || removing}
                    onClick={handleRemoveSelected}
                    className="text-chart-5"
                  >
                    <Trash2 />
                    {t.removeSelected(selected.length)}
                  </Button>
                )}
                <Button
                  variant={editing ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={handleToggleEditing}
                  aria-pressed={editing}
                >
                  {editing ? <Check /> : <Pencil />}
                  {editing ? t.doneEditing : t.editList}
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {symbols.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t.emptyWatchlist}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {symbols.map((symbol) => {
                  const quote = quoteBySymbol.get(symbol)
                  const up = (quote?.changePct ?? 0) >= 0
                  const isSelected = selected.includes(symbol)
                  return (
                    <li
                      key={symbol}
                      className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0"
                    >
                      {editing && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelected(symbol)}
                          aria-label={t.selectAria(symbol)}
                          className="size-4 shrink-0 accent-primary"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{symbol}</p>
                        <p className="truncate text-sm text-muted-foreground">
                          {quote?.name ?? t.noQuoteData}
                        </p>
                      </div>

                      {quote ? (
                        <>
                          {/* Extra real fields the mock version never had */}
                          <div className="hidden text-right text-xs text-muted-foreground sm:block">
                            <p>
                              {t.open} {money.format(quote.open)}
                            </p>
                            <p>
                              {t.prevClose} {money.format(quote.prevClose)}
                            </p>
                          </div>
                          <div className="hidden text-right text-xs text-muted-foreground md:block">
                            <p>{t.dayRange}</p>
                            <p className="tabular-nums">
                              {money.format(quote.low)} –{' '}
                              {money.format(quote.high)}
                            </p>
                          </div>

                          <div className="text-right">
                            <p className="font-medium tabular-nums">
                              {money.format(quote.price)}
                            </p>
                            <p
                              className={`flex items-center justify-end gap-1 text-sm tabular-nums ${deltaClass(quote.changePct)}`}
                            >
                              {up ? (
                                <TrendingUp className="size-3.5" />
                              ) : (
                                <TrendingDown className="size-3.5" />
                              )}
                              {up ? '+' : ''}
                              {quote.change.toFixed(2)} ({up ? '+' : ''}
                              {quote.changePct.toFixed(2)}%)
                            </p>
                          </div>
                        </>
                      ) : (
                        <p className="text-right text-sm text-muted-foreground">
                          {loading ? t.loading : t.noQuoteData}
                        </p>
                      )}

                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={adding || removing}
                        onClick={() => onRemove(symbol)}
                        aria-label={t.removeAria(symbol)}
                      >
                        <Trash2 />
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
