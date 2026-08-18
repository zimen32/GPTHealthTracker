import type { DailyEntry, IsoDate } from '../domain/types'
import { addDays, dateRange, daysBetween } from '../lib/date'
import { mean, median, percentChange, robustZScore, rollingMean, stdDev } from '../lib/stats'
import { METRIC_BY_KEY, type MetricDef } from './metrics'

export interface MetricSummary {
  metric: MetricDef
  /** Liczba dni z danymi w analizowanym okresie. */
  n: number
  /** Liczba dni w okresie (również tych bez danych). */
  days: number
  mean: number | null
  median: number | null
  min: number | null
  max: number | null
  sd: number | null
  /** Średnia z poprzedniego okresu tej samej długości. */
  previousMean: number | null
  previousN: number
  changePercent: number | null
  changeAbsolute: number | null
  /** Ostatnia wartość i jej odchylenie od osobistej normy (mediana +/- IQR). */
  latest: number | null
  latestZ: number | null
}

export interface SeriesPoint {
  date: IsoDate
  value: number | null
  rolling7: number | null
  rolling30: number | null
}

function valuesOf(entries: DailyEntry[], metric: MetricDef): number[] {
  return entries.map((e) => metric.get(e)).filter((v): v is number => v != null)
}

function entriesInRange(entries: DailyEntry[], from: IsoDate, to: IsoDate): DailyEntry[] {
  return entries.filter((e) => e.date >= from && e.date <= to)
}

/**
 * Podsumowanie metryki w okresie `from`-`to` wraz z porownaniem do poprzedniego okresu
 * tej samej długości. Nie zawiera żadnych ocen - tylko liczby i liczebność danych.
 */
export function summarizeMetric(
  entries: DailyEntry[],
  metricKey: string,
  from: IsoDate,
  to: IsoDate,
): MetricSummary | null {
  const metric = METRIC_BY_KEY[metricKey]
  if (!metric) return null

  const days = daysBetween(from, to) + 1
  const current = entriesInRange(entries, from, to)
  const prevTo = addDays(from, -1)
  const prevFrom = addDays(prevTo, -(days - 1))
  const previous = entriesInRange(entries, prevFrom, prevTo)

  const values = valuesOf(current, metric)
  const prevValues = valuesOf(previous, metric)
  const currentMean = mean(values)
  const previousMean = mean(prevValues)

  const withValues = current.filter((e) => metric.get(e) != null)
  const latestEntry = withValues[withValues.length - 1]
  const latest = latestEntry ? metric.get(latestEntry) : null
  const baseline = valuesOf(entries.filter((e) => e.date <= to), metric)

  return {
    metric,
    n: values.length,
    days,
    mean: currentMean,
    median: median(values),
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
    sd: stdDev(values),
    previousMean,
    previousN: prevValues.length,
    changePercent: currentMean != null && previousMean != null ? percentChange(previousMean, currentMean) : null,
    changeAbsolute: currentMean != null && previousMean != null ? currentMean - previousMean : null,
    latest,
    latestZ: latest != null ? robustZScore(latest, baseline) : null,
  }
}

/** Szereg czasowy metryki z pelna osia dat (dni bez danych maja value = null) i srednimi kroczacymi. */
export function metricSeries(entries: DailyEntry[], metricKey: string, from: IsoDate, to: IsoDate): SeriesPoint[] {
  const metric = METRIC_BY_KEY[metricKey]
  if (!metric) return []
  const byDate = new Map(entries.map((e) => [e.date, e]))
  const dates = dateRange(from, to)
  const raw = dates.map((d) => {
    const e = byDate.get(d)
    return e ? metric.get(e) : null
  })
  const r7 = rollingMean(raw, 7, 3)
  const r30 = rollingMean(raw, 30, 10)
  return dates.map((date, i) => ({ date, value: raw[i], rolling7: r7[i], rolling30: r30[i] }))
}

/**
 * Porównanie warunkowe: średnia metryki w dniach, w których inna metryka byla poniżej progu,
 * kontra dni z wartością rowna progowi lub wyższa. Służy do opisow typu
 * "rozdrażnienie w dniach ze snem < 6 h 30 min".
 */
export interface ConditionalComparison {
  belowMean: number | null
  belowN: number
  atOrAboveMean: number | null
  atOrAboveN: number
}

export function compareByThreshold(
  entries: DailyEntry[],
  conditionKey: string,
  threshold: number,
  targetKey: string,
  /** true = warunek dotyczy poprzedniej nocy/dnia (lag +1 dnia dla metryki docelowej) */
  nextDay = false,
): ConditionalComparison | null {
  const condition = METRIC_BY_KEY[conditionKey]
  const target = METRIC_BY_KEY[targetKey]
  if (!condition || !target) return null

  const byDate = new Map(entries.map((e) => [e.date, e]))
  const below: number[] = []
  const above: number[] = []

  for (const entry of entries) {
    const c = condition.get(entry)
    if (c == null) continue
    const targetEntry = nextDay ? byDate.get(addDays(entry.date, 1)) : entry
    const t = targetEntry ? target.get(targetEntry) : null
    if (t == null) continue
    ;(c < threshold ? below : above).push(t)
  }

  return {
    belowMean: mean(below),
    belowN: below.length,
    atOrAboveMean: mean(above),
    atOrAboveN: above.length,
  }
}
