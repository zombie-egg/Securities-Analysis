import type { Sentiment } from './api'

/**
 * Badge classes per sentiment. Colors come from shadcn theme tokens only.
 * Bearish uses chart-5 rather than `destructive` so bullish/bearish stay a
 * matched pair of chart tokens, and so a failure state (destructive) still
 * reads differently from a bearish reading.
 */
export const SENTIMENT_BADGE: Record<Sentiment, string> = {
  Bullish: 'border-chart-2/40 bg-chart-2/15 text-chart-2',
  Neutral: 'border-border bg-muted text-muted-foreground',
  Bearish: 'border-chart-5/40 bg-chart-5/15 text-chart-5',
}

/** Text color for price / percentage deltas. */
export function deltaClass(changePct: number) {
  if (changePct > 0) return 'text-chart-2'
  if (changePct < 0) return 'text-chart-5'
  return 'text-muted-foreground'
}
