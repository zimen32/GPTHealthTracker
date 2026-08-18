import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../data/db'
import { addMeasurement, deleteMeasurement, saveSchedule } from '../../data/repo'
import { dueMeasurements } from '../../analytics/completeness'
import { MEASUREMENT_LABELS, MEASUREMENT_UNITS } from '../../domain/catalog'
import type { MeasurementType } from '../../domain/types'
import { formatDatePl, today } from '../../lib/date'
import { fmt } from '../../lib/stats'
import { MetricChart } from '../../components/Chart'
import { Button, Chip, Empty, Note, Screen, Section, Toast } from '../../components/ui'
import { NumberField } from '../../components/inputs'

const TYPES = Object.keys(MEASUREMENT_LABELS) as MeasurementType[]
const INTERVALS = [7, 14, 30, 90]

export function MeasurementsScreen() {
  const [type, setType] = useState<MeasurementType>('body_weight')
  const [date, setDate] = useState(today())
  const [value, setValue] = useState<number | null>(null)
  const [value2, setValue2] = useState<number | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const measurements = useLiveQuery(() => db.measurements.toArray(), [])
  const schedules = useLiveQuery(() => db.schedules.toArray(), [])

  const own = useMemo(
    () => (measurements ?? []).filter((m) => m.type === type).sort((a, b) => a.date.localeCompare(b.date)),
    [measurements, type],
  )
  const due = dueMeasurements(schedules ?? [], measurements ?? [], today())
  const schedule = (schedules ?? []).find((s) => s.type === type)
  const isBp = type === 'blood_pressure'

  const series = own.map((m) => ({ date: m.date, value: m.value, rolling7: null, rolling30: null }))

  async function save() {
    if (value == null) {
      setToast('Podaj wartość pomiaru.')
      return
    }
    await addMeasurement({ date, type, value, value2: isBp ? value2 : null, unit: MEASUREMENT_UNITS[type], source: 'manual' })
    setValue(null)
    setValue2(null)
    setToast('Pomiar zapisany.')
    window.setTimeout(() => setToast(null), 2000)
  }

  return (
    <Screen title="Pomiary" subtitle="Pomiary okresowe - nic nie musi być codzienne">
      {due.filter((d) => d.due).length > 0 && (
        <div className="card mb-3 p-3">
          <Note>Termin pomiaru według Twojej częstotliwości:</Note>
          <div className="mt-2 flex flex-wrap gap-2">
            {due
              .filter((d) => d.due)
              .map((d) => (
                <Chip key={d.type} active={type === d.type} onClick={() => setType(d.type as MeasurementType)}>
                  {MEASUREMENT_LABELS[d.type as MeasurementType] ?? d.type}
                  {d.daysAgo != null ? ` (${d.daysAgo} dni)` : ' (brak)'}
                </Chip>
              ))}
          </div>
        </div>
      )}

      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        {TYPES.map((t) => (
          <Chip key={t} active={type === t} onClick={() => setType(t)}>
            {MEASUREMENT_LABELS[t]}
          </Chip>
        ))}
      </div>

      <Section title={`Nowy pomiar: ${MEASUREMENT_LABELS[type]}`}>
        <div className="mb-3">
          <label className="mb-1.5 block text-sm">Data</label>
          <input className="field tabular-nums" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
        </div>
        {isBp ? (
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Skurczowe" value={value} unit="mmHg" onChange={setValue} />
            <NumberField label="Rozkurczowe" value={value2} unit="mmHg" onChange={setValue2} />
          </div>
        ) : (
          <NumberField label={MEASUREMENT_LABELS[type]} value={value} unit={MEASUREMENT_UNITS[type]} step={0.1} onChange={setValue} />
        )}
        <Button variant="primary" full onClick={() => void save()}>
          Zapisz pomiar
        </Button>
      </Section>

      <Section title="Częstotliwość" hint="Aplikacja przypomni o pomiarze w check-inie, gdy minie ustawiony czas.">
        <div className="flex flex-wrap items-center gap-2">
          {INTERVALS.map((i) => (
            <Chip
              key={i}
              active={schedule?.enabled === true && schedule?.intervalDays === i}
              onClick={() => void saveSchedule({ type, intervalDays: i, enabled: true })}
            >
              co {i} dni
            </Chip>
          ))}
          <Chip active={schedule?.enabled === false} onClick={() => void saveSchedule({ type, intervalDays: schedule?.intervalDays ?? 30, enabled: false })}>
            nie przypominaj
          </Chip>
        </div>
      </Section>

      {series.length >= 2 && (
        <Section title="Trend">
          <MetricChart series={series} formatValue={(v) => `${fmt(v, 1)} ${MEASUREMENT_UNITS[type]}`} />
        </Section>
      )}

      <Section title="Historia pomiarów">
        {own.length === 0 ? (
          <Empty>Brak pomiarów tego typu.</Empty>
        ) : (
          own
            .slice()
            .reverse()
            .map((m) => (
              <div key={m.id} className="flex items-baseline justify-between border-b border-[var(--color-line)] py-2 text-sm last:border-0">
                <span>
                  {formatDatePl(m.date)}
                  {m.edited && <span className="ml-2 text-[11px] text-[var(--color-muted)]">poprawiony</span>}
                </span>
                <span className="flex items-baseline gap-3">
                  <span className="tabular-nums">
                    {isBp ? `${fmt(m.value, 0)}/${fmt(m.value2, 0)}` : fmt(m.value, 1)} {m.unit}
                  </span>
                  <button className="text-[11px] text-[var(--color-muted)] underline" onClick={() => void deleteMeasurement(m.id as number)}>
                    usuń
                  </button>
                </span>
              </div>
            ))
        )}
      </Section>
      <Toast message={toast} />
    </Screen>
  )
}
