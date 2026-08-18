import type { MetricSummary } from '../analytics/trends'
import { fmtPercent } from '../lib/stats'

/** Kafelka trendu: średnia okresu, kierunek zmiany i liczba dni z danymi (nigdy sama liczba). */
export function MetricCard({ summary, onClick, active }: { summary: MetricSummary | null; onClick?: () => void; active?: boolean }) {
  if (!summary) return null
  const { metric, mean, previousMean, changePercent, n, days } = summary
  const hasData = n > 0
  const rising = changePercent != null && changePercent > 0
  const neutral = changePercent == null || Math.abs(changePercent) < 1
  // kolor opisuje wyłącznie kierunek zmiany względem poprzedniego okresu, nie ocene stanu
  const tone = neutral
    ? 'text-[var(--color-muted)]'
    : (metric.higherIsBetter === undefined ? null : metric.higherIsBetter === rising)
      ? 'text-[var(--color-accent)]'
      : 'text-[var(--color-warn)]'

  return (
    <button
      type="button"
      onClick={onClick}
      className={`card p-3 text-left transition ${active ? 'border-[var(--color-accent)]' : ''} ${onClick ? 'active:scale-[0.99]' : ''}`}
    >
      <div className="text-xs text-[var(--color-muted)]">{metric.label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{hasData ? metric.format(mean) : 'brak danych'}</div>
      <div className="mt-0.5 flex items-center gap-1.5 text-xs">
        {hasData && previousMean != null ? (
          <>
            <span className={tone}>
              {neutral ? 'bez zmian' : `${rising ? '▲' : '▼'} ${fmtPercent(changePercent)}`}
            </span>
            <span className="text-[var(--color-muted)]">vs {metric.format(previousMean)}</span>
          </>
        ) : (
          <span className="text-[var(--color-muted)]">brak porównania</span>
        )}
      </div>
      <div className="mt-1 text-[11px] text-[var(--color-muted)]">
        dni z danymi: {n}/{days}
      </div>
    </button>
  )
}
