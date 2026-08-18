import type { ExportDataset } from './dataset'
import { analyzeCompleteness } from '../analytics/completeness'
import { computeAllCorrelations } from '../analytics/correlations'
import { summarizeMetric } from '../analytics/trends'
import { round } from '../lib/stats'

export const EXPORT_SCHEMA_VERSION = 1

/** Surowe dane + wyliczenia pochodne w jednym pliku JSON o wersjonowanym schemacie. */
export function buildJsonExport(d: ExportDataset): unknown {
  const completeness = analyzeCompleteness(d.entries, d.from, d.to)
  const keyMetrics = ['totalSleepMinutes', 'deepSleepMinutes', 'remSleepMinutes', 'hrv', 'restingHeartRate', 'sleepScore', 'energy', 'stress', 'irritability', 'recovery', 'mood', 'steps', 'trainingMinutes', 'caffeineShots', 'alcoholUnits']

  return {
    schema_version: EXPORT_SCHEMA_VERSION,
    generated_at: d.generatedAt,
    app: 'GPTHealthTracker',
    disclaimer:
      'Dane samoraportowane oraz z urządzenia noszonego. Zestawienie nie zawiera interpretacji medycznych ani zaleceń.',
    period: { from: d.from, to: d.to, days: d.days },
    daily: d.entries,
    measurements: d.measurements,
    lab_results: d.labResults.map((r) => ({
      date: r.date,
      test: r.testKey,
      test_name: d.labTests.find((t) => t.key === r.testKey)?.name ?? r.testKey,
      value: r.value ?? null,
      value_text: r.valueText ?? null,
      unit: r.unit,
      ref_min: r.refMin ?? null,
      ref_max: r.refMax ?? null,
      ref_text: r.refText ?? null,
      laboratory: r.laboratory ?? null,
      fasting: r.fasting ?? null,
      notes: r.notes ?? null,
      source: r.source,
    })),
    previous_lab_results: d.previousLabResults,
    derived: {
      trends: keyMetrics
        .map((key) => summarizeMetric(d.entriesWithHistory, key, d.from, d.to))
        .filter((s) => s && s.n > 0)
        .map((s) => ({
          metric: s!.metric.key,
          label: s!.metric.label,
          unit: s!.metric.unit,
          n: s!.n,
          mean: round(s!.mean, 2),
          median: round(s!.median, 2),
          min: s!.min,
          max: s!.max,
          previous_period_mean: round(s!.previousMean, 2),
          change_percent: round(s!.changePercent, 1),
        })),
      correlations: computeAllCorrelations(d.entries)
        .filter((c) => c.hasEnoughData)
        .map((c) => ({
          pair: c.id,
          label: c.label,
          x: c.x.key,
          y: c.y.key,
          next_day: c.nextDay,
          n: c.n,
          spearman_rho: round(c.rho, 3),
          strength: c.strength,
          preliminary: c.preliminary,
          note: 'Korelacja nie oznacza przyczynowości.',
        })),
    },
    completeness: {
      days_total: completeness.totalDays,
      days_with_any_data: completeness.daysWithAnyData,
      empty_dates: completeness.emptyDates,
      fields: Object.fromEntries(completeness.fields.map((f) => [f.key, f.filledDays])),
    },
  }
}
