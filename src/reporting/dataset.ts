import { db, type HealthDb } from '../data/db'
import { getSettings } from '../data/repo'
import type { DailyEntry, IsoDate, LabResult, LabTest, Measurement, Settings } from '../domain/types'
import { addDays, daysBetween, today } from '../lib/date'

export interface ExportDataset {
  from: IsoDate
  to: IsoDate
  days: number
  generatedAt: string
  /** Wpisy z wybranego okresu. */
  entries: DailyEntry[]
  /**
   * Wpisy z okresu poprzedniego (tej samej dlugosci) razem z okresem biezacym.
   * Uzywane wylacznie do porownan "wobec poprzedniego okresu" - raport opisuje tylko wybrany zakres.
   */
  entriesWithHistory: DailyEntry[]
  measurements: Measurement[]
  /** Wyniki badan z okresu. */
  labResults: LabResult[]
  /** Ostatni wynik kazdego parametru sprzed okresu - potrzebny do opisu zmiany. */
  previousLabResults: LabResult[]
  labTests: LabTest[]
  settings: Settings
}

export type RangePreset = '7d' | '30d' | '90d' | 'since_labs' | 'custom'

export async function buildDataset(
  from: IsoDate,
  to: IsoDate = today(),
  database: HealthDb = db,
): Promise<ExportDataset> {
  const historyFrom = addDays(from, -(daysBetween(from, to) + 1))
  const [entriesWithHistory, allMeasurements, allLabResults, labTests, settings] = await Promise.all([
    database.daily.where('date').between(historyFrom, to, true, true).sortBy('date'),
    database.measurements.toArray(),
    database.labResults.toArray(),
    database.labTests.toArray(),
    getSettings(database),
  ])

  const labResults = allLabResults.filter((r) => r.date >= from && r.date <= to).sort((a, b) => a.date.localeCompare(b.date))

  // ostatni wynik kazdego parametru sprzed okresu - do kolumny "zmiana od poprzedniego badania"
  const previous = new Map<string, LabResult>()
  for (const r of allLabResults.filter((r) => r.date < from).sort((a, b) => a.date.localeCompare(b.date))) {
    previous.set(r.testKey, r)
  }

  return {
    from,
    to,
    days: daysBetween(from, to) + 1,
    generatedAt: new Date().toISOString(),
    entries: entriesWithHistory.filter((e) => e.date >= from),
    entriesWithHistory,
    measurements: allMeasurements.filter((m) => m.date >= from && m.date <= to).sort((a, b) => a.date.localeCompare(b.date)),
    labResults,
    previousLabResults: [...previous.values()],
    labTests: labTests.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    settings,
  }
}

/** Data ostatniego badania laboratoryjnego - dla zakresu "od ostatnich badan". */
export async function lastLabDate(database: HealthDb = db): Promise<IsoDate | null> {
  const rows = await database.labResults.orderBy('date').last()
  return rows?.date ?? null
}
