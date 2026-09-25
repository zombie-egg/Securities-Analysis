import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Languages,
  LineChart,
  Newspaper,
  Sparkles,
  Star,
  UserCircle,
} from 'lucide-react'

import { AccountPage } from '@/components/pages/account-page'
import { AuthPage } from '@/components/pages/auth-page'
import { FocusPage } from '@/components/pages/focus-page'
import { NewsPage } from '@/components/pages/news-page'
import { WatchlistPage } from '@/components/pages/watchlist-page'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ApiError,
  addSymbol,
  fetchMe,
  fetchNews,
  fetchQuotes,
  fetchWatchlist,
  removeSymbols,
  runAnalysis,
  type AnalysisPayload,
  type User,
} from '@/lib/api'
import { DICT, type Dict, type Locale } from '@/lib/i18n'
import { displayNameFor } from '@/lib/user'
import { ErrorState, LoadingState } from '@/components/pages/state-views'
import { useAsync } from '@/lib/use-async'

type View = 'watchlist' | 'focus' | 'news' | 'account'
const NAV: {
  id: Exclude<View, 'account'>
  icon: typeof Star
  label: (t: Dict) => string
}[] = [
  { id: 'watchlist', icon: Star, label: (t) => t.navWatchlist },
  { id: 'focus', icon: Sparkles, label: (t) => t.navFocus },
  { id: 'news', icon: Newspaper, label: (t) => t.navNews },
]
const SUBTITLE: Record<View, (t: Dict) => string> = {
  watchlist: (t) => t.subtitleWatchlist,
  focus: (t) => t.subtitleFocus,
  news: (t) => t.subtitleNews,
  account: (t) => t.subtitleAccount,
}
const QUOTE_POLL_MS = 3_000
type AddErrorKind =
  | { kind: 'empty' | 'format' }
  | { kind: 'duplicate' | 'notFound'; ticker: string }

export default function App() {
  const [locale, setLocale] = useState<Locale>('en')
  const [user, setUser] = useState<User | null>(null)
  const session = useAsync(fetchMe, [])
  const [resolved, setResolved] = useState(false)
  const t = DICT[locale]
  const toggleLocale = () =>
    setLocale((previous) => (previous === 'en' ? 'zh' : 'en'))

  function authenticated(next: User) {
    setUser(next)
    setResolved(true)
  }

  function signedOut() {
    setUser(null)
    setResolved(true)
  }

  const currentUser = resolved ? user : session.data
  if (!resolved && (session.loading || session.error)) {
    return (
      <div
        className="min-h-screen bg-background p-4 text-foreground"
        lang={locale}
      >
        <Button variant="ghost" onClick={toggleLocale}>
          <Languages />
          {t.languageSwitchTo}
        </Button>
        {session.error ? (
          <ErrorState error={session.error} t={t} onRetry={session.reload} />
        ) : (
          <LoadingState t={t} />
        )}
      </div>
    )
  }
  if (!currentUser) {
    return (
      <AuthPage
        locale={locale}
        t={t}
        onToggleLocale={toggleLocale}
        onAuthenticated={authenticated}
      />
    )
  }
  return (
    <Dashboard
      key={currentUser.id}
      user={currentUser}
      locale={locale}
      t={t}
      onToggleLocale={toggleLocale}
      onUserChange={authenticated}
      onSignedOut={signedOut}
    />
  )
}

interface DashboardProps {
  user: User
  locale: Locale
  t: Dict
  onToggleLocale: () => void
  onUserChange: (user: User) => void
  onSignedOut: () => void
}

function Dashboard({
  user,
  locale,
  t,
  onToggleLocale,
  onUserChange,
  onSignedOut,
}: DashboardProps) {
  const [view, setView] = useState<View>('watchlist')
  const [symbols, setSymbols] = useState<string[]>([])
  const [watchlistLoading, setWatchlistLoading] = useState(true)
  const [watchlistError, setWatchlistError] = useState<ApiError | null>(null)
  const [watchlistNonce, setWatchlistNonce] = useState(0)
  const [mutationError, setMutationError] = useState<ApiError | null>(null)
  const [failedRemoval, setFailedRemoval] = useState<string[]>([])
  const [removing, setRemoving] = useState(false)
  const mutationLock = useRef(false)
  const lifetime = useRef<AbortController | null>(null)
  const [draft, setDraft] = useState('')
  const [addErrorKind, setAddErrorKind] = useState<AddErrorKind | null>(null)
  const [addApiError, setAddApiError] = useState<ApiError | null>(null)
  const [adding, setAdding] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const [newsSymbol, setNewsSymbol] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<AnalysisPayload | null>(null)
  const [analysisError, setAnalysisError] = useState<ApiError | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const analysisAbort = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    lifetime.current = controller
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetchWatchlist(controller.signal)
      .then((list) => {
        if (!controller.signal.aborted) setSymbols(list)
      })
      .catch((err) => {
        if (!controller.signal.aborted)
          setWatchlistError(
            err instanceof ApiError
              ? err
              : new ApiError(0, 'UNKNOWN', t.errorTitle)
          )
      })
      .finally(() => {
        if (!controller.signal.aborted) setWatchlistLoading(false)
      })
    return () => controller.abort()
  }, [watchlistNonce, t.errorTitle])

  const symbolKey = symbols.join(',')
  const quotesState = useAsync(
    async (signal) => {
      const result = await fetchQuotes(symbols, signal)
      setLastUpdated(Date.now())
      return result
    },
    [symbolKey],
    { pollIntervalMs: symbols.length > 0 ? QUOTE_POLL_MS : 0 }
  )
  const newsState = useAsync(
    (signal) => fetchNews(newsSymbol ?? undefined, signal),
    [newsSymbol]
  )

  const handleRunAnalysis = useCallback(async () => {
    if (symbols.length === 0) return
    analysisAbort.current?.abort()
    const controller = new AbortController()
    analysisAbort.current = controller
    setAnalyzing(true)
    setAnalysisError(null)
    try {
      setAnalysis(await runAnalysis(symbols, controller.signal))
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      setAnalysisError(
        err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', t.errorTitle)
      )
    } finally {
      if (!controller.signal.aborted) setAnalyzing(false)
    }
  }, [symbols, t.errorTitle])
  useEffect(() => () => analysisAbort.current?.abort(), [])

  async function handleAdd() {
    if (mutationLock.current || watchlistLoading || watchlistError) return
    const ticker = draft.trim().toUpperCase()
    if (!ticker) return setAddErrorKind({ kind: 'empty' })
    if (!/^[A-Z][A-Z.-]{0,5}$/.test(ticker))
      return setAddErrorKind({ kind: 'format' })
    if (symbols.includes(ticker))
      return setAddErrorKind({ kind: 'duplicate', ticker })
    mutationLock.current = true
    setAdding(true)
    setAddErrorKind(null)
    setAddApiError(null)
    try {
      const next = await addSymbol(ticker, lifetime.current?.signal)
      if (lifetime.current?.signal.aborted) return
      setSymbols(next)
      setDraft('')
    } catch (err) {
      if (lifetime.current?.signal.aborted) return
      setAddApiError(
        err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', t.errorTitle)
      )
    } finally {
      mutationLock.current = false
      setAdding(false)
    }
  }
  async function handleRemoveMany(removed: string[]) {
    if (mutationLock.current) return
    mutationLock.current = true
    setRemoving(true)
    setMutationError(null)
    try {
      const next = await removeSymbols(removed, lifetime.current?.signal)
      if (lifetime.current?.signal.aborted) return
      setSymbols(next)
      setFailedRemoval([])
      if (newsSymbol && removed.includes(newsSymbol)) setNewsSymbol(null)
    } catch (err) {
      if (lifetime.current?.signal.aborted) return
      setFailedRemoval(removed)
      setMutationError(
        err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', t.errorTitle)
      )
    } finally {
      mutationLock.current = false
      setRemoving(false)
    }
  }
  function resolveAddError(): string | null {
    if (addApiError) {
      if (addApiError.code === 'UNKNOWN_SYMBOL') {
        return t.errNotFound(draft.trim().toUpperCase())
      }
      return t.apiErrorMessage(addApiError.code, addApiError.message)
    }
    if (!addErrorKind) return null
    switch (addErrorKind.kind) {
      case 'empty':
        return t.errEmpty
      case 'format':
        return t.errFormat
      case 'duplicate':
        return t.errDuplicate(addErrorKind.ticker)
      case 'notFound':
        return t.errNotFound(addErrorKind.ticker)
    }
  }

  const title =
    view === 'account'
      ? t.navAccount
      : NAV.find((entry) => entry.id === view)?.label(t)
  return (
    <div className="min-h-screen bg-background text-foreground" lang={locale}>
      <div className="flex min-h-screen flex-col md:flex-row">
        <aside className="flex flex-col border-b border-border bg-secondary md:sticky md:top-0 md:h-screen md:w-72 md:shrink-0 md:border-b-0 md:border-r">
          <div className="flex items-center justify-between gap-2 border-border p-4 md:h-16 md:shrink-0 md:border-b">
            <div className="flex items-center gap-2">
              <LineChart className="size-5" />
              <span className="font-semibold tracking-tight">{t.brand}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={onToggleLocale}>
              <Languages />
              {t.languageSwitchTo}
            </Button>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-2 pb-3 md:flex-col md:overflow-y-auto md:px-2 md:py-3 md:pb-0">
            {NAV.map((entry) => {
              const Icon = entry.icon
              const active = view === entry.id
              return (
                <Button
                  key={entry.id}
                  variant="ghost"
                  onClick={() => setView(entry.id)}
                  aria-current={active ? 'page' : undefined}
                  className={
                    'shrink-0 justify-start md:w-full ' +
                    (active
                      ? 'bg-background font-medium text-foreground shadow-sm hover:bg-background'
                      : 'text-muted-foreground')
                  }
                >
                  <Icon />
                  {entry.label(t)}
                </Button>
              )
            })}
          </nav>
          <div className="mt-auto shrink-0 border-t border-border p-2">
            <Button
              variant="ghost"
              onClick={() => setView('account')}
              className="w-full justify-start"
              aria-current={view === 'account' ? 'page' : undefined}
            >
              <span className="flex size-7 items-center justify-center overflow-hidden rounded-full bg-muted">
                {user.avatar ? (
                  <img
                    src={user.avatar}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <UserCircle className="size-5" />
                )}
              </span>
              <span className="truncate">{displayNameFor(user)}</span>
            </Button>
          </div>
        </aside>
        <main className="min-w-0 flex-1 bg-background">
          <header className="flex min-h-16 items-center justify-between gap-3 border-b border-border bg-background p-4 md:sticky md:top-0 md:z-10">
            <div className="space-y-1">
              <h1 className="text-base font-semibold leading-none">{title}</h1>
              <p className="text-sm text-muted-foreground">
                {SUBTITLE[view](t)}
              </p>
            </div>
          </header>
          <div className="p-4">
            {view === 'account' ? (
              <AccountPage
                user={user}
                t={t}
                onUserChange={onUserChange}
                onSignedOut={onSignedOut}
              />
            ) : (
              <Tabs
                value={view}
                onValueChange={(value) => setView(value as View)}
              >
                <TabsList className="mb-4 md:hidden">
                  {NAV.map((entry) => (
                    <TabsTrigger key={entry.id} value={entry.id}>
                      {entry.label(t)}
                    </TabsTrigger>
                  ))}
                </TabsList>
                <TabsContent value="watchlist">
                  {mutationError && (
                    <ErrorState
                      error={mutationError}
                      t={t}
                      onRetry={() => void handleRemoveMany(failedRemoval)}
                    />
                  )}
                  {watchlistError ? (
                    <ErrorState
                      error={watchlistError}
                      t={t}
                      onRetry={() => {
                        setWatchlistLoading(true)
                        setWatchlistError(null)
                        setWatchlistNonce((n) => n + 1)
                      }}
                    />
                  ) : watchlistLoading ? (
                    <LoadingState t={t} />
                  ) : (
                    <WatchlistPage
                      quotes={quotesState.data ?? []}
                      symbols={symbols}
                      loading={quotesState.loading || watchlistLoading}
                      error={quotesState.error}
                      lastUpdated={lastUpdated}
                      draft={draft}
                      addError={resolveAddError()}
                      adding={adding}
                      removing={removing}
                      locale={locale}
                      t={t}
                      onDraftChange={(value) => {
                        setDraft(value)
                        setAddErrorKind(null)
                        setAddApiError(null)
                      }}
                      onAdd={() => void handleAdd()}
                      onRemove={(symbol) => void handleRemoveMany([symbol])}
                      onRemoveMany={(removed) => void handleRemoveMany(removed)}
                      onRetry={quotesState.reload}
                    />
                  )}
                </TabsContent>
                <TabsContent value="focus">
                  <FocusPage
                    payload={analysis}
                    loading={analyzing}
                    error={analysisError}
                    hasSymbols={symbols.length > 0}
                    locale={locale}
                    t={t}
                    onRun={handleRunAnalysis}
                  />
                </TabsContent>
                <TabsContent value="news">
                  <NewsPage
                    articles={newsState.data ?? []}
                    loading={newsState.loading}
                    error={newsState.error}
                    symbols={symbols}
                    activeSymbol={newsSymbol}
                    locale={locale}
                    t={t}
                    onSelectSymbol={setNewsSymbol}
                    onRetry={newsState.reload}
                  />
                </TabsContent>
              </Tabs>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
