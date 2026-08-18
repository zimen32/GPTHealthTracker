import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db } from '../../data/db'
import type { DailyEntry } from '../../domain/types'
import { addDays, formatDatePl, formatMinutes, parseIsoDate, toIsoDate, today } from '../../lib/date'
import { Button, Note, Screen, Section } from '../../components/ui'

/** Ile z kluczowych pół dnia jest wypełnione - do oznaczenia kompletności w kalendarzu. */
function completeness(entry: DailyEntry | undefined): 'empty' | 'partial' | 'full' {
  if (!entry) return 'empty'
  const keys: Array<keyof DailyEntry> = ['energy', 'stress', 'irritability', 'recovery', 'mood', 'totalSleepMinutes', 'steps']
  const filled = keys.filter((k) => entry[k] != null).length
  if (filled === 0) return 'empty'
  return filled >= 5 ? 'full' : 'partial'
}

export function HistoryScreen() {
  const navigate = useNavigate()
  const [monthStart, setMonthStart] = useState(() => {
    const d = parseIsoDate(today())
    d.setDate(1)
    return toIsoDate(d)
  })

  const monthEnd = useMemo(() => {
    const d = parseIsoDate(monthStart)
    d.setMonth(d.getMonth() + 1)
    d.setDate(0)
    return toIsoDate(d)
  }, [monthStart])

  const entries = useLiveQuery(() => db.daily.where('date').between(monthStart, monthEnd, true, true).toArray(), [monthStart, monthEnd])
  const byDate = useMemo(() => new Map((entries ?? []).map((e) => [e.date, e])), [entries])

  const days = useMemo(() => {
    const out: string[] = []
    for (let d = monthStart; d <= monthEnd; d = addDays(d, 1)) out.push(d)
    return out
  }, [monthStart, monthEnd])

  const leadingBlanks = (parseIsoDate(monthStart).getDay() + 6) % 7
  const monthLabel = parseIsoDate(monthStart).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' })

  function shiftMonth(delta: number) {
    const d = parseIsoDate(monthStart)
    d.setMonth(d.getMonth() + delta)
    setMonthStart(toIsoDate(d))
  }

  const filled = days.filter((d) => completeness(byDate.get(d)) !== 'empty').length

  return (
    <Screen title="Historia" subtitle="Dotknij dnia, aby uzupełnić lub poprawić dane">
      <Section
        title={monthLabel}
        right={
          <div className="flex gap-1">
            <Button variant="ghost" onClick={() => shiftMonth(-1)}>
              ‹
            </Button>
            <Button variant="ghost" onClick={() => shiftMonth(1)}>
              ›
            </Button>
          </div>
        }
      >
        <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[11px] text-[var(--color-muted)]">
          {['pon', 'wt', 'sr', 'czw', 'pt', 'sob', 'nd'].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: leadingBlanks }, (_, i) => (
            <div key={`blank-${i}`} />
          ))}
          {days.map((date) => {
            const state = completeness(byDate.get(date))
            const isFuture = date > today()
            const styles =
              state === 'full'
                ? 'bg-[var(--color-accent)]/20 border-[var(--color-accent)] text-[var(--color-ink)]'
                : state === 'partial'
                  ? 'bg-[var(--color-surface-2)] border-[var(--color-accent-2)]/50'
                  : 'bg-transparent border-[var(--color-line)] text-[var(--color-muted)]'
            return (
              <button
                key={date}
                disabled={isFuture}
                onClick={() => navigate(`/dzień/${date}`)}
                className={`aspect-square rounded-lg border text-xs tabular-nums disabled:opacity-30 ${styles} ${date === today() ? 'ring-1 ring-[var(--color-accent)]' : ''}`}
              >
                {Number(date.slice(-2))}
              </button>
            )
          })}
        </div>
        <Note>
          Dni z danymi w tym miesiącu: {filled}/{days.length}. Obramowanie jasne = wpis pełny, ciemniejsze = częściowy.
        </Note>
      </Section>

      <Section title="Ostatnie wpisy">
        {(entries ?? [])
          .slice()
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, 12)
          .map((e) => (
            <button
              key={e.date}
              onClick={() => navigate(`/dzień/${e.date}`)}
              className="flex w-full items-baseline justify-between border-b border-[var(--color-line)] py-2 text-left text-sm last:border-0"
            >
              <span>
                {formatDatePl(e.date)}
                {e.edited && <span className="ml-2 text-[11px] text-[var(--color-muted)]">edytowany</span>}
              </span>
              <span className="text-xs text-[var(--color-muted)] tabular-nums">
                {e.totalSleepMinutes != null ? formatMinutes(e.totalSleepMinutes) : 'sen: -'} · energia {e.energy ?? '-'}
              </span>
            </button>
          ))}
        {(entries ?? []).length === 0 && <Note>Brak wpisów w tym miesiącu.</Note>}
      </Section>
    </Screen>
  )
}
