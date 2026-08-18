import { useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router-dom'
import { db } from '../../data/db'
import { addMeasurement, findMissingDays, getSettings, saveDailyEntry } from '../../data/repo'
import { dueMeasurements } from '../../analytics/completeness'
import { MEASUREMENT_LABELS, MEASUREMENT_UNITS, SCORE_LABELS } from '../../domain/catalog'
import type { DailyEntry, IsoDate, MeasurementType } from '../../domain/types'
import { addDays, formatDatePl, formatMinutes, minutesToClock, sleepDurationMinutes, today, weekdayPl } from '../../lib/date'
import { median } from '../../lib/stats'
import { Button, Chip, Note, Screen, Section, Toast } from '../../components/ui'
import { Counter, NumberField, ScoreSlider, Select, TextArea, TimeField, Toggle } from '../../components/inputs'

const SCORE_ORDER = ['energy', 'stress', 'irritability', 'recovery', 'mood', 'clarity'] as const
type ScoreKey = (typeof SCORE_ORDER)[number]

const TRAINING_TYPES = ['siłowy', 'bieganie', 'rower', 'spacer', 'basen', 'joga', 'inny']

/** Ile pół z listy "codziennego minimum" jest wypelnionych - wskaźnik informacyjny, nie streak. */
const TRACKED_FIELDS: Array<keyof DailyEntry> = ['energy', 'stress', 'irritability', 'recovery', 'mood', 'totalSleepMinutes', 'steps', 'caffeineShots', 'alcoholUnits', 'notes']

export function CheckinScreen() {
  const params = useParams<{ date?: string }>()
  const date = (params.date ?? today()) as IsoDate
  // useLiveQuery zwraca undefined, dopoki nie odczyta dnia z bazy - formularz montujemy dopiero potem,
  // dzieki temu stan startowy pochodzi wprost z bazy i nie trzeba go dosylac efektem
  const stored = useLiveQuery(() => db.daily.get(date).then((e) => e ?? null), [date])
  if (stored === undefined) return null
  return <CheckinForm key={date} date={date} stored={stored} />
}

function CheckinForm({ date, stored }: { date: IsoDate; stored: DailyEntry | null }) {
  const navigate = useNavigate()
  const isToday = date === today()
  const settings = useLiveQuery(() => getSettings(), [])
  const missing = useLiveQuery(() => findMissingDays(7), [stored])
  const schedules = useLiveQuery(() => db.schedules.toArray(), [])
  const measurements = useLiveQuery(() => db.measurements.toArray(), [])
  const recent = useLiveQuery(() => db.daily.where('date').between(addDays(date, -7), date, true, false).toArray(), [date])

  const [draft, setDraft] = useState<Partial<DailyEntry>>(stored ?? {})
  const [showMore, setShowMore] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [measurementDraft, setMeasurementDraft] = useState<Record<string, { value?: number | null; value2?: number | null }>>({})
  const timer = useRef<number | null>(null)

  const suggestions = useMemo(() => {
    const entries = recent ?? []
    const suggestFor = (key: ScoreKey) => median(entries.map((e) => e[key] ?? null))
    return {
      scores: Object.fromEntries(SCORE_ORDER.map((k) => [k, suggestFor(k)])) as Record<ScoreKey, number | null>,
      sleepStart: pickMedianClock(entries.map((e) => e.sleepStart)),
      wakeTime: pickMedianClock(entries.map((e) => e.wakeTime)),
      trainingType: entries.find((e) => e.trainingType)?.trainingType ?? null,
      caffeineLastTime: entries.find((e) => e.caffeineLastTime)?.caffeineLastTime ?? null,
    }
  }, [recent])

  const visibleScores = (settings?.visibleScores ?? ['energy', 'stress', 'irritability', 'recovery', 'mood']) as ScoreKey[]
  const hiddenScores = SCORE_ORDER.filter((k) => !visibleScores.includes(k))

  const sleepFromWatch = draft.sleepSource != null && draft.sleepSource !== 'manual'
  const computedSleep =
    draft.totalSleepMinutes ?? (draft.sleepStart && draft.wakeTime ? sleepDurationMinutes(draft.sleepStart, draft.wakeTime) : null)
  const filledCount = TRACKED_FIELDS.filter((f) => draft[f] != null && draft[f] !== '').length

  function update(patch: Partial<DailyEntry>) {
    setDraft((d) => {
      const next = { ...d, ...patch }
      scheduleSave(next)
      return next
    })
  }

  function scheduleSave(next: Partial<DailyEntry>) {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      void saveDailyEntry({ ...next, date })
    }, 1500)
  }

  async function saveNow() {
    if (timer.current) window.clearTimeout(timer.current)
    await saveDailyEntry({ ...draft, date })
    for (const [type, value] of Object.entries(measurementDraft)) {
      if (value.value == null) continue
      await addMeasurement({
        date,
        type,
        value: value.value,
        value2: value.value2 ?? null,
        unit: MEASUREMENT_UNITS[type as MeasurementType] ?? '',
        source: 'manual',
      })
    }
    setMeasurementDraft({})
    const summary = [
      computedSleep != null ? `sen ${formatMinutes(computedSleep)}` : null,
      draft.energy != null ? `energia ${draft.energy}` : null,
      draft.steps != null ? `${draft.steps} kroków` : null,
    ]
      .filter(Boolean)
      .join(', ')
    setToast(`Zapisano ${formatDatePl(date)}${summary ? ` - ${summary}` : ''}`)
    window.setTimeout(() => setToast(null), 2600)
  }

  const due = dueMeasurements(schedules ?? [], measurements ?? [], date).filter((d) => d.due)

  return (
    <Screen
      title={isToday ? 'Dzisiaj' : formatDatePl(date)}
      subtitle={`${weekdayPl(date)}, ${formatDatePl(date)} - każde pole możesz pominąć`}
      action={
        <div className="flex gap-1">
          <Button variant="ghost" onClick={() => navigate(`/dzień/${addDays(date, -1)}`)} title="poprzedni dzień">
            ‹
          </Button>
          {!isToday && (
            <Button variant="ghost" onClick={() => navigate(`/dzień/${addDays(date, 1)}`)} title="następny dzień">
              ›
            </Button>
          )}
        </div>
      }
    >
      {missing && missing.length > 0 && (
        <div className="card mb-3 p-3">
          <Note>Dni bez wpisu: uzupełnij, kiedy będzie wygodnie.</Note>
          <div className="mt-2 flex flex-wrap gap-2">
            {missing.map((d) => (
              <Chip key={d} active={d === date} onClick={() => navigate(`/dzień/${d}`)}>
                {formatDatePl(d)}
              </Chip>
            ))}
          </div>
        </div>
      )}

      <Section title="Samopoczucie" hint="Suwak nietknięty oznacza brak danych - to normalne.">
        {visibleScores.map((key) => (
          <ScoreSlider
            key={key}
            label={SCORE_LABELS[key]}
            value={draft[key] as number | null}
            suggestion={suggestions.scores[key]}
            onChange={(v) => update({ [key]: v } as Partial<DailyEntry>)}
          />
        ))}
        {hiddenScores.length > 0 && (
          <>
            {showMore &&
              hiddenScores.map((key) => (
                <ScoreSlider
                  key={key}
                  label={SCORE_LABELS[key]}
                  value={draft[key] as number | null}
                  suggestion={suggestions.scores[key]}
                  onChange={(v) => update({ [key]: v } as Partial<DailyEntry>)}
                />
              ))}
            <button type="button" onClick={() => setShowMore((s) => !s)} className="text-xs text-[var(--color-accent)] underline">
              {showMore ? 'mniej' : `więcej (${hiddenScores.map((k) => SCORE_LABELS[k].toLowerCase()).join(', ')})`}
            </button>
          </>
        )}
      </Section>

      <Section
        title="Sen"
        hint={
          sleepFromWatch
            ? 'Dane pochodzą z importu - możesz je nadpisać ręcznie, poprzednia wartość zostanie w historii zmian.'
            : 'Wystarcza dwie godziny; długość snu wyliczy się sama.'
        }
        right={<span className="text-xs text-[var(--color-muted)]">{sleepFromWatch ? 'źródło: import' : 'źródło: ręcznie'}</span>}
      >
        <div className="grid grid-cols-2 gap-3">
          <TimeField label="Zaśnięcie" value={draft.sleepStart} hint={suggestions.sleepStart ? `zwykle ${suggestions.sleepStart}` : undefined} onChange={(v) => update({ sleepStart: v, sleepSource: 'manual' })} />
          <TimeField label="Wybudzenie" value={draft.wakeTime} hint={suggestions.wakeTime ? `zwykle ${suggestions.wakeTime}` : undefined} onChange={(v) => update({ wakeTime: v, sleepSource: 'manual' })} />
        </div>
        <div className="mb-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-2 text-sm">
          Długość snu: <span className="tabular-nums text-[var(--color-accent)]">{formatMinutes(computedSleep)}</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Sleep score" value={draft.sleepScore} unit="pkt" onChange={(v) => update({ sleepScore: v })} />
          <NumberField label="Wybudzenia" value={draft.awakenings} unit="liczba" onChange={(v) => update({ awakenings: v })} />
        </div>
        <details className="mt-1">
          <summary className="cursor-pointer text-xs text-[var(--color-accent)]">Szczegóły z zegarka (fazy snu, HRV, tętno)</summary>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <NumberField label="Sen głęboki" value={draft.deepSleepMinutes} unit="min" onChange={(v) => update({ deepSleepMinutes: v })} />
            <NumberField label="Sen REM" value={draft.remSleepMinutes} unit="min" onChange={(v) => update({ remSleepMinutes: v })} />
            <NumberField label="Sen lekki" value={draft.lightSleepMinutes} unit="min" onChange={(v) => update({ lightSleepMinutes: v })} />
            <NumberField label="Czuwanie w nocy" value={draft.awakeMinutes} unit="min" onChange={(v) => update({ awakeMinutes: v })} />
            <NumberField label="HRV" value={draft.hrv} unit="ms" onChange={(v) => update({ hrv: v })} />
            <NumberField label="Tętno spoczynkowe" value={draft.restingHeartRate} unit="bpm" onChange={(v) => update({ restingHeartRate: v })} />
            <NumberField label="SpO2" value={draft.spo2} unit="%" onChange={(v) => update({ spo2: v })} />
            <NumberField label="Sen całkowity" value={draft.totalSleepMinutes} unit="min (nadpisuje)" onChange={(v) => update({ totalSleepMinutes: v })} />
          </div>
          <Note>Te pola zwykle wypełnia import z zegarka - nie trzeba ich wpisywać codziennie.</Note>
        </details>
      </Section>

      <Section title="Dzień">
        <NumberField label="Kroki" value={draft.steps} onChange={(v) => update({ steps: v })} />
        <Toggle label="Trening" value={draft.trainingDone} onChange={(v) => update({ trainingDone: v, ...(v ? {} : { trainingMinutes: null, trainingIntensity: null, trainingType: null }) })} />
        {draft.trainingDone === true && (
          <div className="mb-3 rounded-xl border border-[var(--color-line)] p-3">
            <Select
              label="Typ treningu"
              value={draft.trainingType}
              options={[...new Set([...(suggestions.trainingType ? [suggestions.trainingType] : []), ...TRAINING_TYPES])].map((t) => ({ value: t, label: t }))}
              onChange={(v) => update({ trainingType: v })}
            />
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Czas" value={draft.trainingMinutes} unit="min" onChange={(v) => update({ trainingMinutes: v })} />
              <NumberField label="Intensywność" value={draft.trainingIntensity} unit="1-10" onChange={(v) => update({ trainingIntensity: v })} />
            </div>
          </div>
        )}
        <Counter label="Kofeina" value={draft.caffeineShots} unit="x espresso" onChange={(v) => update({ caffeineShots: v, caffeineLastTime: draft.caffeineLastTime ?? suggestions.caffeineLastTime })} />
        {(draft.caffeineShots ?? 0) > 0 && (
          <TimeField label="Ostatnia kofeina" value={draft.caffeineLastTime} onChange={(v) => update({ caffeineLastTime: v })} />
        )}
        <Counter label="Alkohol" value={draft.alcoholUnits} unit="jednostki" onChange={(v) => update({ alcoholUnits: v })} />
        <Counter label="Woda" value={draft.waterMl} step={250} unit="ml" onChange={(v) => update({ waterMl: v })} />
        <Toggle label="Nietypowy stres" value={draft.unusualStress} onChange={(v) => update({ unusualStress: v })} />
        <Toggle label="Infekcja / choroba" value={draft.illness} onChange={(v) => update({ illness: v })} />
        <TextArea label="Notatka" value={draft.notes} onChange={(v) => update({ notes: v })} />
      </Section>

      {due.length > 0 && (
        <Section title="Pomiary na dziś" hint="Pokazujemy tylko te, których termin wynika z ustawionej częstotliwości.">
          {due.map((d) => (
            <div key={d.type} className="mb-3 last:mb-0">
              <div className="mb-1 text-xs text-[var(--color-muted)]">
                {d.lastDate ? `ostatni pomiar ${d.daysAgo} dni temu` : 'brak poprzedniego pomiaru'} - co {d.intervalDays} dni
              </div>
              {d.type === 'blood_pressure' ? (
                <div className="grid grid-cols-2 gap-3">
                  <NumberField
                    label="Ciśnienie skurczowe"
                    value={measurementDraft[d.type]?.value}
                    unit="mmHg"
                    onChange={(v) => setMeasurementDraft((m) => ({ ...m, [d.type]: { ...m[d.type], value: v } }))}
                  />
                  <NumberField
                    label="Ciśnienie rozkurczowe"
                    value={measurementDraft[d.type]?.value2}
                    unit="mmHg"
                    onChange={(v) => setMeasurementDraft((m) => ({ ...m, [d.type]: { ...m[d.type], value2: v } }))}
                  />
                </div>
              ) : (
                <NumberField
                  label={MEASUREMENT_LABELS[d.type as MeasurementType] ?? d.type}
                  value={measurementDraft[d.type]?.value}
                  unit={MEASUREMENT_UNITS[d.type as MeasurementType]}
                  step={0.1}
                  onChange={(v) => setMeasurementDraft((m) => ({ ...m, [d.type]: { ...m[d.type], value: v } }))}
                />
              )}
            </div>
          ))}
        </Section>
      )}

      <div className="sticky bottom-20 mt-4">
        <Button variant="primary" full onClick={() => void saveNow()}>
          Zapisz dzień
        </Button>
        <p className="mt-2 text-center text-[11px] text-[var(--color-muted)]">
          zebrano {filledCount}/{TRACKED_FIELDS.length} pół
          {stored?.edited ? ' - wpis edytowany, historia zmian zachowana' : ''}
        </p>
      </div>
      <Toast message={toast} />
    </Screen>
  )
}

/** Mediana godzin (np. typowa godzina zasniecia) liczona na minutach od polnocy, z korekta dla godzin nocnych. */
function pickMedianClock(values: Array<string | null | undefined>): string | null {
  const minutes = values
    .filter((v): v is string => Boolean(v))
    .map((v) => {
      const [h, m] = v.split(':').map(Number)
      const total = h * 60 + m
      return total < 720 ? total + 1440 : total // godziny po polnocy traktujemy jako "później"
    })
  const med = median(minutes)
  return med == null ? null : minutesToClock(Math.round(med))
}
