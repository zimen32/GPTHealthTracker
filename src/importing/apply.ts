import type { DailyEntry, IsoDate, LabResult, LabTest } from '../domain/types'
import { sleepDurationMinutes } from '../lib/date'
import { deaccent, normalizeKey } from '../lib/text'
import { FIELD_BY_KEY, convertValue, parseBoolean, parseDate, parseNumber } from './fields'
import type { ParsedTable } from './parse'

export interface RowPreview {
  date: IsoDate | null
  values: Partial<DailyEntry>
  /** Pola, które już istnieja w bazie z INNA wartością - uzytkownik decyduje, czy nadpisać. */
  conflicts: Array<{ field: string; existing: unknown; incoming: unknown }>
  status: 'new' | 'update' | 'conflict' | 'invalid'
  problems: string[]
}

export interface ImportPreview {
  rows: RowPreview[]
  counts: { new: number; update: number; conflict: number; invalid: number }
}

/**
 * Przeklada wiersze pliku na wpisy dzienne według mapowania kolumn i porownuje je z baza.
 * Nic nie jest zapisywane - wynik służy do podgladu przed zatwierdzeniem.
 */
export function buildDailyPreview(
  table: ParsedTable,
  columnMap: Record<string, string>,
  existing: DailyEntry[],
): ImportPreview {
  const byDate = new Map(existing.map((e) => [e.date, e]))
  const rows: RowPreview[] = []

  for (const raw of table.rows) {
    const values: Partial<DailyEntry> = {}
    const problems: string[] = []
    let date: IsoDate | null = null

    for (const [column, fieldKey] of Object.entries(columnMap)) {
      if (!fieldKey || fieldKey === 'skip') continue
      const field = FIELD_BY_KEY[fieldKey]
      if (!field) continue
      const rawValue = raw[column] ?? ''
      if (rawValue.trim() === '') continue
      const converted = convertValue(field.kind, rawValue)
      if (converted == null) {
        problems.push(`kolumna "${column}": nie udało się odczytać wartości "${rawValue}"`)
        continue
      }
      if (fieldKey === 'date') date = converted as IsoDate
      else (values as Record<string, unknown>)[fieldKey] = converted
    }

    // długość snu z godzin, jesli plik nie zawiera gotowej sumy
    if (values.totalSleepMinutes == null && values.sleepStart && values.wakeTime) {
      values.totalSleepMinutes = sleepDurationMinutes(values.sleepStart, values.wakeTime)
    }

    if (!date) {
      rows.push({ date: null, values, conflicts: [], status: 'invalid', problems: ['brak rozpoznanej daty w wierszu'] })
      continue
    }

    const current = byDate.get(date)
    const conflicts: RowPreview['conflicts'] = []
    if (current) {
      for (const [field, incoming] of Object.entries(values)) {
        const existingValue = (current as unknown as Record<string, unknown>)[field]
        if (existingValue != null && existingValue !== incoming) conflicts.push({ field, existing: existingValue, incoming })
      }
    }

    const hasValues = Object.keys(values).length > 0
    rows.push({
      date,
      values: { ...values, sleepSource: values.totalSleepMinutes != null ? 'import' : undefined },
      conflicts,
      status: !hasValues ? 'invalid' : !current ? 'new' : conflicts.length ? 'conflict' : 'update',
      problems: hasValues ? problems : [...problems, 'wiersz nie zawiera żadnych wartości do zapisania'],
    })
  }

  return {
    rows,
    counts: {
      new: rows.filter((r) => r.status === 'new').length,
      update: rows.filter((r) => r.status === 'update').length,
      conflict: rows.filter((r) => r.status === 'conflict').length,
      invalid: rows.filter((r) => r.status === 'invalid').length,
    },
  }
}

export interface LabRowPreview {
  result: Omit<LabResult, 'id'> | null
  testName: string
  status: 'ok' | 'new_parameter' | 'invalid'
  problems: string[]
}

/** Kolumny rozpoznawane w imporcie wyników badań. */
export const LAB_COLUMNS = ['date', 'test', 'value', 'unit', 'ref_min', 'ref_max', 'laboratory', 'fasting', 'notes'] as const

/**
 * Przeklada wiersze CSV na wyniki badań. Parametry nieznane są oznaczane jako nowe -
 * uzytkownik zatwierdza dodanie ich do katalogu razem z importem.
 */
export function buildLabPreview(
  table: ParsedTable,
  columnMap: Record<string, string>,
  tests: LabTest[],
): LabRowPreview[] {
  // dopasowanie nazw parametrów ignoruje wielkość liter i polskie znaki (plik z laboratorium może ich nie miec)
  const byKey = new Map(tests.map((t) => [normalizeKey(t.key), t]))
  const byName = new Map(tests.map((t) => [normalizeKey(t.name), t]))

  const pick = (row: Record<string, string>, target: string): string => {
    const column = Object.entries(columnMap).find(([, field]) => field === target)?.[0]
    return column ? (row[column] ?? '') : ''
  }

  return table.rows.map((row) => {
    const problems: string[] = []
    const date = parseDate(pick(row, 'date'))
    const rawTest = pick(row, 'test').trim()
    const test = byKey.get(normalizeKey(rawTest)) ?? byName.get(normalizeKey(rawTest))
    const value = parseNumber(pick(row, 'value'))
    const valueText = pick(row, 'value').trim()
    const unit = pick(row, 'unit').trim() || test?.defaultUnit || '-'

    if (!date) problems.push('brak rozpoznanej daty')
    if (!rawTest) problems.push('brak nazwy parametru')
    if (value == null && valueText === '') problems.push('brak wartości wyniku')

    if (!date || !rawTest || (value == null && valueText === '')) {
      return { result: null, testName: rawTest, status: 'invalid', problems }
    }

    return {
      result: {
        testKey: test?.key ?? slugify(rawTest),
        date,
        value,
        valueText: value == null ? valueText : null,
        unit,
        refMin: parseNumber(pick(row, 'ref_min')),
        refMax: parseNumber(pick(row, 'ref_max')),
        laboratory: pick(row, 'laboratory').trim() || null,
        fasting: parseBoolean(pick(row, 'fasting')),
        notes: pick(row, 'notes').trim() || null,
        source: 'import',
      },
      testName: test?.name ?? rawTest,
      status: test ? 'ok' : 'new_parameter',
      problems,
    }
  })
}

export function slugify(name: string): string {
  return deaccent(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40)
}
