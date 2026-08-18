import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db } from '../../data/db'
import { METRIC_BY_KEY } from '../../analytics/metrics'
import { metricSeries, summarizeMetric } from '../../analytics/trends'
import { MEASUREMENT_LABELS } from '../../domain/catalog'
import type { IsoDate, MeasurementType } from '../../domain/types'
import { addDays, formatDatePl, today } from '../../lib/date'
import { fmt } from '../../lib/stats'
import { MetricChart } from '../../components/Chart'
import { MetricCard } from '../../components/MetricCard'
import { Chip, Empty, Note, Screen, Section } from '../../components/ui'

const RANGES = [
  { days: 7, label: '7 dni' },
  { days: 30, label: '30 dni' },
  { days: 90, label: '90 dni' },
  { days: 180, label: '6 mies.' },
  { days: 365, label: '12 mies.' },
] as const

const SECTIONS: Array<{ title: string; metrics: string[] }> = [
  { title: 'Regeneracja', metrics: ['totalSleepMinutes', 'sleepScore', 'deepSleepMinutes', 'remSleepMinutes', 'hrv', 'restingHeartRate'] },
  { title: 'Samopoczucie', metrics: ['energy', 'stress', 'irritability', 'recovery', 'mood', 'clarity'] },
  { title: 'Aktywność', metrics: ['steps', 'trainingMinutes', 'walkingMinutes'] },
]

export function DashboardScreen() {
  const navigate = useNavigate()
  const [days, setDays] = useState<number>(30)
  const [selected, setSelected] = useState<string>('totalSleepMinutes')

  const to = today()
  const from: IsoDate = addDays(to, -(days - 1))
  // wykresy i porównania potrzebuja również poprzedniego okresu
  const entries = useLiveQuery(() => db.daily.where('date').between(addDays(from, -days), to, true, true).sortBy('date'), [from, to, days])
  const measurements = useLiveQuery(() => db.measurements.toArray(), [])
  const labResults = useLiveQuery(() => db.labResults.toArray(), [])
  const labTests = useLiveQuery(() => db.labTests.toArray(), [])

  const series = useMemo(() => metricSeries(entries ?? [], selected, from, to), [entries, selected, from, to])
  const selectedMetric = METRIC_BY_KEY[selected]

  const bodyRows = useMemo(() => {
    const rows: Array<{ type: MeasurementType; latest: string; change: string; count: number }> = []
    for (const type of ['body_weight', 'waist', 'blood_pressure'] as MeasurementType[]) {
      const inRange = (measurements ?? []).filter((m) => m.type === type && m.date >= from && m.date <= to).sort((a, b) => a.date.localeCompare(b.date))
      if (inRange.length === 0) {
        rows.push({ type, latest: 'brak pomiarów w okresie', change: '-', count: 0 })
        continue
      }
      const first = inRange[0]
      const last = inRange[inRange.length - 1]
      const latest =
        type === 'blood_pressure' ? `${fmt(last.value, 0)}/${fmt(last.value2, 0)} ${last.unit}` : `${fmt(last.value, 1)} ${last.unit}`
      const delta = last.value - first.value
      rows.push({
        type,
        latest: `${latest} (${formatDatePl(last.date)})`,
        change: inRange.length > 1 ? `${delta > 0 ? '+' : ''}${fmt(delta, 1)} ${last.unit}` : 'jeden pomiar',
        count: inRange.length,
      })
    }
    return rows
  }, [measurements, from, to])

  const latestLabs = useMemo(() => {
    const byKey = new Map<string, typeof labResults extends undefined ? never : NonNullable<typeof labResults>>()
    for (const r of labResults ?? []) {
      const list = byKey.get(r.testKey) ?? []
      list.push(r)
      byKey.set(r.testKey, list)
    }
    return [...byKey.entries()]
      .map(([key, list]) => {
        const sorted = list.sort((a, b) => a.date.localeCompare(b.date))
        const last = sorted[sorted.length - 1]
        const prev = sorted[sorted.length - 2]
        const name = (labTests ?? []).find((t) => t.key === key)?.name ?? key
        const outside = last.value != null && ((last.refMin != null && last.value < last.refMin) || (last.refMax != null && last.value > last.refMax))
        return { key, name, last, prev, outside }
      })
      .sort((a, b) => b.last.date.localeCompare(a.last.date))
      .slice(0, 8)
  }, [labResults, labTests])

  return (
    <Screen title="Trendy" subtitle="Średnie okresu i zmiana wobec poprzedniego okresu tej samej długości">
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        {RANGES.map((r) => (
          <Chip key={r.days} active={days === r.days} onClick={() => setDays(r.days)}>
            {r.label}
          </Chip>
        ))}
      </div>

      <Section title={selectedMetric?.label ?? 'Wykres'} hint={`${formatDatePl(from)} - ${formatDatePl(to)}; linia jasna = pomiar dzienny, gruba = średnia krocząca 7 dni`}>
        <MetricChart series={series} formatValue={(v) => selectedMetric?.format(v) ?? String(v)} show30={days >= 90} />
      </Section>

      {SECTIONS.map((section) => (
        <Section key={section.title} title={section.title}>
          <div className="grid grid-cols-2 gap-2">
            {section.metrics.map((key) => (
              <MetricCard
                key={key}
                summary={summarizeMetric(entries ?? [], key, from, to)}
                active={selected === key}
                onClick={() => setSelected(key)}
              />
            ))}
          </div>
        </Section>
      ))}

      <Section title="Ciało" right={<button className="text-xs text-[var(--color-accent)] underline" onClick={() => navigate('/pomiary')}>pomiary</button>}>
        {bodyRows.map((row) => (
          <div key={row.type} className="flex items-baseline justify-between border-b border-[var(--color-line)] py-2 last:border-0">
            <span className="text-sm">{MEASUREMENT_LABELS[row.type]}</span>
            <span className="text-right text-xs">
              <span className="block tabular-nums">{row.latest}</span>
              <span className="text-[var(--color-muted)]">
                zmiana: {row.change} · pomiarów: {row.count}
              </span>
            </span>
          </div>
        ))}
      </Section>

      <Section title="Badania" right={<button className="text-xs text-[var(--color-accent)] underline" onClick={() => navigate('/badania')}>wszystkie</button>}>
        {latestLabs.length === 0 ? (
          <Empty>Brak wyników badań. Dodasz je w zakladce Badania lub importem CSV.</Empty>
        ) : (
          latestLabs.map((row) => (
            <button
              key={row.key}
              onClick={() => navigate(`/badania/${row.key}`)}
              className="flex w-full items-baseline justify-between border-b border-[var(--color-line)] py-2 text-left last:border-0"
            >
              <span className="text-sm">
                {row.name}
                <span className="ml-2 text-[11px] text-[var(--color-muted)]">{formatDatePl(row.last.date)}</span>
              </span>
              <span className="text-right text-xs">
                <span className={`block tabular-nums ${row.outside ? 'text-[var(--color-warn)]' : ''}`}>
                  {row.last.value != null ? `${fmt(row.last.value, 2)} ${row.last.unit}` : (row.last.valueText ?? '-')}
                </span>
                <span className="text-[var(--color-muted)]">
                  {row.prev?.value != null && row.last.value != null
                    ? `poprzednio ${fmt(row.prev.value, 2)} (${formatDatePl(row.prev.date)})`
                    : 'pierwszy wynik'}
                </span>
              </span>
            </button>
          ))
        )}
        <Note>
          Wartość poza zakresem laboratorium jest oznaczona kolorem. To informacja o zakresie z wyniku, nie ocena stanu zdrowia.
        </Note>
      </Section>
    </Screen>
  )
}
