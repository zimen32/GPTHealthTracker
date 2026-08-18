import { db, seedIfEmpty, type HealthDb } from './db'
import type { DailyEntry, ImportMapping, LabResult, LabTest, Measurement, MeasurementSchedule, Revision, Settings } from '../domain/types'

export const BACKUP_VERSION = 1

export interface BackupFile {
  format: 'gpthealthtracker-backup'
  version: number
  createdAt: string
  data: {
    daily: DailyEntry[]
    measurements: Measurement[]
    schedules: MeasurementSchedule[]
    labTests: LabTest[]
    labResults: LabResult[]
    revisions: Revision[]
    mappings: ImportMapping[]
    settings: Settings[]
  }
}

/** Pełny zrzut bazy - kopia zapasowa i jednoczesnie eksport wszystkich danych uzytkownika. */
export async function createBackup(database: HealthDb = db): Promise<BackupFile> {
  const [daily, measurements, schedules, labTests, labResults, revisions, mappings, settings] = await Promise.all([
    database.daily.toArray(),
    database.measurements.toArray(),
    database.schedules.toArray(),
    database.labTests.toArray(),
    database.labResults.toArray(),
    database.revisions.toArray(),
    database.mappings.toArray(),
    database.settings.toArray(),
  ])
  return {
    format: 'gpthealthtracker-backup',
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    data: { daily, measurements, schedules, labTests, labResults, revisions, mappings, settings },
  }
}

export interface RestoreResult {
  counts: Record<string, number>
  mode: 'merge' | 'replace'
}

export function parseBackup(text: string): BackupFile {
  const parsed = JSON.parse(text) as BackupFile
  if (parsed?.format !== 'gpthealthtracker-backup') throw new Error('To nie jest plik kopii zapasowej tej aplikacji.')
  if (typeof parsed.version !== 'number' || parsed.version > BACKUP_VERSION) {
    throw new Error('Plik pochodzi z nowszej wersji aplikacji - zaktualizuj aplikację przed przywroceniem.')
  }
  return parsed
}

/**
 * Przywraca dane z kopii. `merge` dopisuje i nadpisuje rekordy o tych samych kluczach,
 * `replace` czysci tabele przed zapisem. Dziennik rewizji jest zawsze dopisywany.
 */
export async function restoreBackup(
  backup: BackupFile,
  mode: 'merge' | 'replace' = 'merge',
  database: HealthDb = db,
): Promise<RestoreResult> {
  const d = backup.data
  await database.transaction(
    'rw',
    [database.daily, database.measurements, database.schedules, database.labTests, database.labResults, database.revisions, database.mappings, database.settings],
    async () => {
      if (mode === 'replace') {
        await Promise.all([
          database.daily.clear(),
          database.measurements.clear(),
          database.schedules.clear(),
          database.labTests.clear(),
          database.labResults.clear(),
          database.mappings.clear(),
          database.settings.clear(),
        ])
      }
      await database.daily.bulkPut(d.daily ?? [])
      await database.measurements.bulkPut(d.measurements ?? [])
      await database.schedules.bulkPut(d.schedules ?? [])
      await database.labTests.bulkPut(d.labTests ?? [])
      await database.labResults.bulkPut(d.labResults ?? [])
      await database.mappings.bulkPut(d.mappings ?? [])
      await database.settings.bulkPut(d.settings ?? [])
      if (d.revisions?.length) await database.revisions.bulkPut(d.revisions)
    },
  )
  return {
    mode,
    counts: {
      daily: d.daily?.length ?? 0,
      measurements: d.measurements?.length ?? 0,
      labResults: d.labResults?.length ?? 0,
      labTests: d.labTests?.length ?? 0,
      revisions: d.revisions?.length ?? 0,
    },
  }
}

/** Nieodwracalne usunięcie wszystkich danych z urządzenia. */
export async function wipeAllData(database: HealthDb = db): Promise<void> {
  await database.transaction(
    'rw',
    [database.daily, database.measurements, database.schedules, database.labTests, database.labResults, database.revisions, database.mappings, database.settings],
    async () => {
      await Promise.all([
        database.daily.clear(),
        database.measurements.clear(),
        database.schedules.clear(),
        database.labTests.clear(),
        database.labResults.clear(),
        database.revisions.clear(),
        database.mappings.clear(),
        database.settings.clear(),
      ])
    },
  )
  await seedIfEmpty(database)
}
