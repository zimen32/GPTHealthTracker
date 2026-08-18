import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../data/db'
import { getSettings } from '../../data/repo'
import { analyzeCompleteness } from '../../analytics/completeness'
import {
  CORRELATION_DISCLAIMER,
  MIN_DAYS_FOR_CORRELATION,
  PREFERRED_DAYS_FOR_CORRELATION,
  computeAllCorrelations,
} from '../../analytics/correlations'
import { compareByThreshold, summarizeMetric } from '../../analytics/trends'
import { addDays, formatMinutes, today } from '../../lib/date'
import { fmt, fmtPercent, round } from '../../lib/stats'
import { Chip, Empty, Note, Screen, Section } from '../../components/ui'

const RANGES = [30, 90, 180, 365]
const TREND_KEYS = ['totalSleepMinutes', 'deepSleepMinutes', 'hrv', 'restingHeartRate', 'energy', 'stress', 'irritability', 'recovery', 'mood', 'steps']

export function InsightsScreen() {
  const [days, setDays] = useState(30)
  const to = today()
  const from = addDays(to, -(days - 1))
  const entries = useLiveQuery(() => db.daily.where('date').between(addDays(from, -days), to, true, true).sortBy('date'), [from, to, days])
  const settings = useLiveQuery(() => getSettings(), [])
  const inRange = useMemo(() => (entries ?? []).filter((e) => e.date >= from), [entries, from])

  const trends = useMemo(
    () =>
      TREND_KEYS.map((key) => summarizeMetric(entries ?? [], key, from, to)).filter(
        (s): s is NonNullable<typeof s> => Boolean(s) && (s as NonNullable<typeof s>).n > 0,
      ),
    [entries, from, to],
  )
  const correlations = useMemo(() => computeAllCorrelations(inRange), [inRange])
  const shown = correlations.filter((c) => c.hasEnoughData && c.strength !== 'brak')
  const pending = correlations.filter((c) => !c.hasEnoughData)
  const completeness = useMemo(() => analyzeCompleteness(inRange, from, to), [inRange, from, to])

  const shortSleep = settings?.shortSleepMinutes ?? 390
  const conditional = useMemo(
    () =>
      (['irritability', 'energy', 'clarity', 'mood'] as const)
        .map((key) => ({ key, cmp: compareByThreshold(inRange, 'totalSleepMinutes', shortSleep, key) }))
        .filter((r) => r.cmp && r.cmp.belowN >= 5 && r.cmp.atOrAboveN >= 5),
    [inRange, shortSleep],
  )

  return (
    <Screen title="Zależności" subtitle="Opis zebranych danych - bez interpretacji medycznej">
      <div className="mb-3 flex gap-2">
        {RANGES.map((d) => (
          <Chip key={d} active={days === d} onClick={() => setDays(d)}>
            {d} dni
          </Chip>
        ))}
      </div>

      <Section title="Zmiany w czasie" hint={`Okres ${days} dni wobec poprzednich ${days} dni.`}>
        {trends.length === 0 ? (
          <Empty>Brak danych w tym okresie.</Empty>
        ) : (
          trends.map((s) => (
            <div key={s.metric.key} className="border-b border-[var(--color-line)] py-2 text-sm last:border-0">
              <div className="flex items-baseline justify-between gap-2">
                <span>{s.metric.label}</span>
                <span className="tabular-nums">{s.metric.format(s.mean)}</span>
              </div>
              <div className="text-xs text-[var(--color-muted)]">
                {s.previousMean != null && s.previousN >= 3
                  ? `poprzedni okres: ${s.metric.format(s.previousMean)} (${fmtPercent(s.changePercent)}); dni z danymi: ${s.n}/${s.days}`
                  : `dni z danymi: ${s.n}/${s.days}; brak porównywalnego poprzedniego okresu`}
                {s.latestZ != null && Math.abs(s.latestZ) > 2
                  ? ` · ostatnia wartość odbiega od Twojej typowej (${fmt(round(s.latestZ, 1), 1)} jednostki rozrzutu)`
                  : ''}
              </div>
            </div>
          ))
        )}
      </Section>

      <Section
        title="Potencjalne zależności"
        hint={`Pokazujemy wyłącznie pary z co najmniej ${MIN_DAYS_FOR_CORRELATION} dniami wspolnych danych (${PREFERRED_DAYS_FOR_CORRELATION}+ dni daje pewniejszy obraz). ${CORRELATION_DISCLAIMER}`}
      >
        {shown.length === 0 ? (
          <Empty>Za malo danych, aby pokazac zależności. Wróć tu po kilku tygodniach wpisów.</Empty>
        ) : (
          shown.map((c) => (
            <div key={c.id} className="border-b border-[var(--color-line)] py-2 text-sm last:border-0">
              <div className="flex items-baseline justify-between gap-2">
                <span>
                  {c.label}
                  {c.nextDay && <span className="ml-1 text-[11px] text-[var(--color-muted)]">(dzień następny)</span>}
                </span>
                <span className="tabular-nums">rho = {fmt(round(c.rho, 2), 2)}</span>
              </div>
              <div className="text-xs text-[var(--color-muted)]">
                zależność {c.direction}, {c.strength}; n = {c.n} dni{c.preliminary ? '; wynik wstępny' : ''}
              </div>
            </div>
          ))
        )}
        {pending.length > 0 && (
          <Note>
            Czeka na dane ({pending.length}): {pending.map((c) => `${c.label} (${c.n}/${MIN_DAYS_FOR_CORRELATION} dni)`).join(', ')}.
          </Note>
        )}
      </Section>

      {conditional.length > 0 && (
        <Section title="Porównania warunkowe" hint={`Dni ze snem krótszym niż ${formatMinutes(shortSleep)} wobec pozostalych dni.`}>
          {conditional.map(({ key, cmp }) => (
            <div key={key} className="border-b border-[var(--color-line)] py-2 text-sm last:border-0">
              <div className="flex items-baseline justify-between gap-2">
                <span>{summarizeMetric(inRange, key, from, to)?.metric.label ?? key}</span>
                <span className="tabular-nums">
                  {fmt(cmp!.belowMean, 1)} vs {fmt(cmp!.atOrAboveMean, 1)}
                </span>
              </div>
              <div className="text-xs text-[var(--color-muted)]">
                krótszy sen: n = {cmp!.belowN} dni; pozostale dni: n = {cmp!.atOrAboveN}
              </div>
            </div>
          ))}
        </Section>
      )}

      <Section title="Kompletność danych" hint="Braki nie są błędem - lepiej zebrac 80% danych przez pół roku niż 100% przez 10 dni.">
        <div className="mb-2 text-sm">
          Dni z jakimikolwiek danymi: <span className="tabular-nums">{completeness.daysWithAnyData}/{completeness.totalDays}</span>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-[var(--color-muted)]">
          {completeness.fields
            .filter((f) => ['totalSleepMinutes', 'hrv', 'restingHeartRate', 'energy', 'stress', 'steps'].includes(f.key))
            .map((f) => (
              <div key={f.key} className="flex justify-between">
                <span>{f.label}</span>
                <span className="tabular-nums">
                  {f.filledDays}/{f.totalDays}
                </span>
              </div>
            ))}
        </div>
      </Section>
    </Screen>
  )
}
