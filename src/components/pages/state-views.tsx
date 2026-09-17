import { AlertCircle, Loader2, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { ApiError } from '@/lib/api'
import type { Dict } from '@/lib/i18n'

/** Centered spinner for first loads. */
export function LoadingState({ t }: { t: Dict }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {t.loading}
      </CardContent>
    </Card>
  )
}

/**
 * Error block. Distinguishes a missing server key from a genuine failure so
 * the user knows whether to configure something or just retry.
 */
export function ErrorState({
  error,
  t,
  onRetry,
}: {
  error: ApiError
  t: Dict
  onRetry?: () => void
}) {
  const isConfig = error.isConfigError
  const isOffline = error.code === 'OFFLINE'

  return (
    <Card className="border-chart-5/40">
      <CardContent className="space-y-3 py-6">
        <p className="flex items-center gap-2 font-medium text-chart-5">
          <AlertCircle className="size-4" />
          {isConfig ? t.configErrorTitle : t.errorTitle}
        </p>
        <p className="text-sm text-muted-foreground">
          {t.apiErrorMessage(error.code, error.message)}
        </p>
        <p className="text-sm text-muted-foreground">
          {isConfig ? t.configErrorHint : isOffline ? t.offlineHint : null}
        </p>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw />
            {t.retry}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
