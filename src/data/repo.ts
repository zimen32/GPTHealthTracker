import { db, type HealthDb } from './db'
import { nowIso, today } from '../lib/date'
import {
  DEFAULT_SETTINGS,
  type DailyEntry,
  type ImportMapping,
  type IsoDate,
  type LabResult,
  type LabTest,
  type Measurement,
  type MeasurementSchedule,
  type Revision,
  type RevisionEntity,
  type Settings,
} from '../domain/types'

type Actor = Revision['actor']

async function journal(
  database: HealthDb,
  entity: RevisionEntity,
  entityId: string,
  changeType: Revision['changeType'],
  before: unknown,
  after: unknown,
  actor: Actor,
): Promise<void> {
  await database.revisions.add({ entity, entityId, changedAt: nowIso(), changeType, before, after, actor })
}

/**
 * Zapisuje wpis dzienny. Pola nieobecne w `patch` pozostają bez zmian,
 * pola ustawione na `null` są czyszczone świadomie (uzytkownik cofnal wartość).
 */
export async function saveDailyEntry(
  patch: Partial<DailyEntry> & { date: IsoDate },
  actor: Actor = 'user',
  database: HealthDb = db,
): Promise<DailyEntry> {
  return database.transaction('rw', database.daily, database.revisions, async () => {
    const before = await database.daily.get(patch.date)
    const ts = nowIso()
    const after: DailyEntry = {
      ...(before ?? { date: patch.date, createdAt: ts }),
      ...patch,
      updatedAt: ts,
      edited: Boolean(before),
    }
    await database.daily.put(after)
    await journal(database, 'daily_entry', patch.date, before ? 'update' : 'create', before ?? null, after, actor)
    return after
  })
}

export async function getDailyEntry(date: IsoDate, database: HealthDb = db): Promise<DailyEntry | undefined> {
  return database.daily.get(date)
}

export async function getDailyRange(from: IsoDate, to: IsoDate, database: HealthDb = db): Promise<DailyEntry[]> {
  return database.daily.where('date').between(from, to, true, true).sortBy('date')
}

export async function getAllDaily(database: HealthDb = db): Promise<DailyEntry[]> {
  return database.daily.orderBy('date').toArray()
}

export async function deleteDailyEntry(date: IsoDate, actor: Actor = 'user', database: HealthDb = db): Promise<void> {
  await database.transaction('rw', database.daily, database.revisions, async () => {
    const before = await database.daily.get(date)
    if (!before) return
    await database.daily.delete(date)
    await journal(database, 'daily_entry', date, 'delete', before, null, actor)
  })
}

export async function addMeasurement(
  m: Omit<Measurement, 'id' | 'createdAt' | 'updatedAt'>,
  actor: Actor = 'user',
  database: HealthDb = db,
): Promise<number> {
  return database.transaction('rw', database.measurements, database.revisions, async () => {
    const ts = nowIso()
    const row: Measurement = { ...m, createdAt: ts, updatedAt: ts }
    const id = await database.measurements.add(row)
    await journal(database, 'measurement', String(id), 'create', null, { ...row, id }, actor)
    return id
  })
}

export async function updateMeasurement(
  id: number,
  patch: Partial<Measurement>,
  actor: Actor = 'user',
  database: HealthDb = db,
): Promise<void> {
  await database.transaction('rw', database.measurements, database.revisions, async () => {
    const before = await database.measurements.get(id)
    if (!before) return
    const after: Measurement = { ...before, ...patch, updatedAt: nowIso(), edited: true }
    await database.measurements.put(after)
    await journal(database, 'measurement', String(id), 'update', before, after, actor)
  })
}

export async function deleteMeasurement(id: number, actor: Actor = 'user', database: HealthDb = db): Promise<void> {
  await database.transaction('rw', database.measurements, database.revisions, async () => {
    const before = await database.measurements.get(id)
    if (!before) return
    await database.measurements.delete(id)
    await journal(database, 'measurement', String(id), 'delete', before, null, actor)
  })
}

export async function getMeasurements(type?: string, database: HealthDb = db): Promise<Measurement[]> {
  const rows = type
    ? await database.measurements.where('type').equals(type).toArray()
    : await database.measurements.toArray()
  return rows.sort((a, b) => a.date.localeCompare(b.date))
}

export async function getSchedules(database: HealthDb = db): Promise<MeasurementSchedule[]> {
  return database.schedules.toArray()
}

export async function saveSchedule(s: MeasurementSchedule, database: HealthDb = db): Promise<void> {
  await database.schedules.put(s)
}

export async function getLabTests(database: HealthDb = db): Promise<LabTest[]> {
  const rows = await database.labTests.toArray()
  return rows.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name, 'pl'))
}

export async function upsertLabTest(t: LabTest, database: HealthDb = db): Promise<void> {
  await database.labTests.put(t)
}

/**
 * Dodaje wynik badania. `unit`, `refMin`, `refMax` i `laboratory` są snapshotem -
 * pozniejsza zmiana katalogu lub zakresow laboratorium nie modyfikuje tego wpisu.
 */
export async function addLabResult(
  r: Omit<LabResult, 'id' | 'createdAt' | 'updatedAt'>,
  actor: Actor = 'user',
  database: HealthDb = db,
): Promise<number> {
  return database.transaction('rw', database.labResults, database.revisions, async () => {
    const ts = nowIso()
    const row: LabResult = { ...r, createdAt: ts, updatedAt: ts }
    const id = await database.labResults.add(row)
    await journal(database, 'lab_result', String(id), 'create', null, { ...row, id }, actor)
    return id
  })
}

export async function updateLabResult(
  id: number,
  patch: Partial<LabResult>,
  actor: Actor = 'user',
  database: HealthDb = db,
): Promise<void> {
  await database.transaction('rw', database.labResults, database.revisions, async () => {
    const before = await database.labResults.get(id)
    if (!before) return
    const after: LabResult = { ...before, ...patch, updatedAt: nowIso(), edited: true }
    await database.labResults.put(after)
    await journal(database, 'lab_result', String(id), 'update', before, after, actor)
  })
}

export async function deleteLabResult(id: number, actor: Actor = 'user', database: HealthDb = db): Promise<void> {
  await database.transaction('rw', database.labResults, database.revisions, async () => {
    const before = await database.labResults.get(id)
    if (!before) return
    await database.labResults.delete(id)
    await journal(database, 'lab_result', String(id), 'delete', before, null, actor)
  })
}

export async function getLabResults(testKey?: string, database: HealthDb = db): Promise<LabResult[]> {
  const rows = testKey
    ? await database.labResults.where('testKey').equals(testKey).toArray()
    : await database.labResults.toArray()
  return rows.sort((a, b) => a.date.localeCompare(b.date))
}

export async function getRevisions(
  entity?: RevisionEntity,
  entityId?: string,
  database: HealthDb = db,
): Promise<Revision[]> {
  let rows = await database.revisions.toArray()
  if (entity) rows = rows.filter((r) => r.entity === entity)
  if (entityId) rows = rows.filter((r) => r.entityId === entityId)
  // najnowsze pierwsze; `id` rozstrzyga zmiany zapisane w tej samej milisekundzie
  return rows.sort((a, b) => b.changedAt.localeCompare(a.changedAt) || (b.id ?? 0) - (a.id ?? 0))
}

export async function getSettings(database: HealthDb = db): Promise<Settings> {
  return (await database.settings.get('app')) ?? DEFAULT_SETTINGS
}

export async function saveSettings(patch: Partial<Settings>, database: HealthDb = db): Promise<Settings> {
  const current = await getSettings(database)
  const next: Settings = { ...current, ...patch, id: 'app' }
  await database.settings.put(next)
  return next
}

export async function getMappings(kind?: ImportMapping['kind'], database: HealthDb = db): Promise<ImportMapping[]> {
  const rows = await database.mappings.toArray()
  return kind ? rows.filter((m) => m.kind === kind) : rows
}

export async function saveMapping(m: ImportMapping, database: HealthDb = db): Promise<number> {
  const row: ImportMapping = { ...m, createdAt: m.createdAt ?? nowIso(), lastUsedAt: nowIso() }
  return database.mappings.put(row) as unknown as number
}

/** Daty (do `limitDays` w tyl), dla których nie ma żadnego wpisu - do paska "uzupełnij". */
export async function findMissingDays(limitDays = 7, database: HealthDb = db): Promise<IsoDate[]> {
  const { lastNDays } = await import('../lib/date')
  const days = lastNDays(limitDays, today())
  const existing = new Set((await getDailyRange(days[0], days[days.length - 1], database)).map((d) => d.date))
  return days.filter((d) => !existing.has(d) && d !== today())
}
