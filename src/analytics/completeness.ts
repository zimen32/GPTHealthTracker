import type { DailyEntry, IsoDate, LabResult, LabTest, Measurement } from '../domain/types'
import { dateRange, daysBetween, today } from '../lib/date'
import { METRICS } from './metrics'

export interface FieldCompleteness {
  key: string
  label: string
  filledDays: number
  totalDays: number
  missingDays: number
}

export interface CompletenessReport {
  totalDays: number
  daysWithAnyData: number
  fields: FieldCompleteness[]
  /** Daty bez zadnego wpisu w analizowanym okresie. */
  emptyDates: IsoDate[]
}

/** Ile danych faktycznie zebrano w okresie - podstawa sekcji "Missing data" w raporcie dla AI. */
export function analyzeCompleteness(entries: DailyEntry[], from: IsoDate, to: IsoDate): CompletenessReport {
  const dates = dateRange(from, to)
  const byDate = new Map(entries.map((e) => [e.date, e]))
  const inRange = entries.filter((e) => e.date >= from && e.date <= to)

  const fields = METRICS.map((m) => {
    const filled = inRange.filter((e) => m.get(e) != null).length
    return {
      key: m.key,
      label: m.label,
      filledDays: filled,
      totalDays: dates.length,
      missingDays: dates.length - filled,
    }
  })

  return {
    totalDays: dates.length,
    daysWithAnyData: inRange.length,
    fields,
    emptyDates: dates.filter((d) => !byDate.has(d)),
  }
}

export interface StaleItem {
  label: string
  lastDate: IsoDate | null
  daysAgo: number | null
}

/** Parametry laboratoryjne bez wyniku lub z wynikiem starszym niz `staleAfterDays`. */
export function staleLabTests(
  tests: LabTest[],
  results: LabResult[],
  staleAfterDays = 180,
  reference: IsoDate = today(),
): StaleItem[] {
  const latest = new Map<string, IsoDate>()
  for (const r of results) {
    const prev = latest.get(r.testKey)
    if (!prev || r.date > prev) latest.set(r.testKey, r.date)
  }
  return tests
    .map((t) => {
      const lastDate = latest.get(t.key) ?? null
      const daysAgo = lastDate ? daysBetween(lastDate, reference) : null
      return { label: t.name, lastDate, daysAgo }
    })
    .filter((i) => i.lastDate === null || (i.daysAgo ?? 0) > staleAfterDays)
}

/** Pomiary okresowe, ktorych termin minal wzgledem ustawionej czestotliwosci. */
export function dueMeasurements(
  schedules: Array<{ type: string; intervalDays: number; enabled: boolean }>,
  measurements: Measurement[],
  reference: IsoDate = today(),
): Array<{ type: string; lastDate: IsoDate | null; daysAgo: number | null; intervalDays: number; due: boolean }> {
  const latest = new Map<string, IsoDate>()
  for (const m of measurements) {
    const prev = latest.get(m.type)
    if (!prev || m.date > prev) latest.set(m.type, m.date)
  }
  return schedules
    .filter((s) => s.enabled)
    .map((s) => {
      const lastDate = latest.get(s.type) ?? null
      const daysAgo = lastDate ? daysBetween(lastDate, reference) : null
      return { type: s.type, lastDate, daysAgo, intervalDays: s.intervalDays, due: daysAgo == null || daysAgo >= s.intervalDays }
    })
}
