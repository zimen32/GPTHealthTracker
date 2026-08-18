import Dexie, { type Table } from 'dexie'
import { DEFAULT_SCHEDULES, LAB_CATALOG } from '../domain/catalog'
import {
  DEFAULT_SETTINGS,
  type DailyEntry,
  type ImportMapping,
  type LabResult,
  type LabTest,
  type Measurement,
  type MeasurementSchedule,
  type Revision,
  type Settings,
} from '../domain/types'

/**
 * Lokalna baza aplikacji (IndexedDB). Zadne dane nie opuszczaja urzadzenia.
 * Migracje: dodawaj nowe `version(n)` - nigdy nie usuwaj ani nie zmieniaj istniejacych.
 */
export class HealthDb extends Dexie {
  daily!: Table<DailyEntry, string>
  measurements!: Table<Measurement, number>
  schedules!: Table<MeasurementSchedule, string>
  labTests!: Table<LabTest, string>
  labResults!: Table<LabResult, number>
  revisions!: Table<Revision, number>
  mappings!: Table<ImportMapping, number>
  settings!: Table<Settings, string>

  constructor(name = 'health-tracker') {
    super(name)
    this.version(1).stores({
      daily: '&date, updatedAt',
      measurements: '++id, date, type, [type+date]',
      schedules: '&type',
      labTests: '&key, category, sortOrder',
      labResults: '++id, testKey, date, [testKey+date]',
      revisions: '++id, entity, entityId, changedAt',
      mappings: '++id, kind, name',
      settings: '&id',
    })
  }
}

export const db = new HealthDb()

/** Wypelnia katalog badan, harmonogramy i ustawienia, jesli baza jest swiezo utworzona. */
export async function seedIfEmpty(database: HealthDb = db): Promise<void> {
  if ((await database.labTests.count()) === 0) await database.labTests.bulkPut(LAB_CATALOG)
  if ((await database.schedules.count()) === 0) await database.schedules.bulkPut(DEFAULT_SCHEDULES)
  if (!(await database.settings.get('app'))) await database.settings.put(DEFAULT_SETTINGS)
}
