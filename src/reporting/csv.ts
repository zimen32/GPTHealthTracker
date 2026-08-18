import type { ExportDataset } from './dataset'
import { METRICS } from '../analytics/metrics'

function csvCell(value: unknown): string {
  if (value == null) return ''
  const s = String(value)
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
  return [headers.join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\n') + '\n'
}

const DAILY_COLUMNS: Array<keyof import('../domain/types').DailyEntry> = [
  'date',
  'energy',
  'stress',
  'irritability',
  'recovery',
  'mood',
  'clarity',
  'bedtime',
  'sleepStart',
  'wakeTime',
  'totalSleepMinutes',
  'deepSleepMinutes',
  'remSleepMinutes',
  'lightSleepMinutes',
  'awakeMinutes',
  'awakenings',
  'sleepScore',
  'restingHeartRate',
  'hrv',
  'spo2',
  'sleepSource',
  'steps',
  'walkingMinutes',
  'sedentaryMinutes',
  'trainingDone',
  'trainingType',
  'trainingMinutes',
  'trainingIntensity',
  'caffeineShots',
  'caffeineLastTime',
  'alcoholUnits',
  'waterMl',
  'unusualStress',
  'illness',
  'notes',
]

export function dailyCsv(d: ExportDataset): string {
  return toCsv(
    DAILY_COLUMNS as string[],
    d.entries.map((e) => DAILY_COLUMNS.map((c) => e[c])),
  )
}

export function measurementsCsv(d: ExportDataset): string {
  return toCsv(
    ['date', 'type', 'value', 'value2', 'unit', 'source', 'notes'],
    d.measurements.map((m) => [m.date, m.type, m.value, m.value2, m.unit, m.source, m.notes]),
  )
}

export function labResultsCsv(d: ExportDataset): string {
  return toCsv(
    ['date', 'test_key', 'test_name', 'value', 'value_text', 'unit', 'ref_min', 'ref_max', 'ref_text', 'laboratory', 'fasting', 'notes'],
    d.labResults.map((r) => [
      r.date,
      r.testKey,
      d.labTests.find((t) => t.key === r.testKey)?.name ?? r.testKey,
      r.value,
      r.valueText,
      r.unit,
      r.refMin,
      r.refMax,
      r.refText,
      r.laboratory,
      r.fasting == null ? '' : r.fasting ? 'tak' : 'nie',
      r.notes,
    ]),
  )
}

/** Szeroka tabela dziennych metryk gotowa do arkusza (jedna kolumna = jedna metryka). */
export function metricsCsv(d: ExportDataset): string {
  return toCsv(
    ['date', ...METRICS.map((m) => `${m.key}_${m.unit.replace(/[^\w]/g, '')}`)],
    d.entries.map((e) => [e.date, ...METRICS.map((m) => m.get(e))]),
  )
}

export function csvFiles(d: ExportDataset): Record<string, string> {
  return {
    'daily.csv': dailyCsv(d),
    'metrics.csv': metricsCsv(d),
    'measurements.csv': measurementsCsv(d),
    'lab_results.csv': labResultsCsv(d),
  }
}
