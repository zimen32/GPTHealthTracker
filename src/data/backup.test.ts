import { beforeEach, describe, expect, it } from 'vitest'
import { HealthDb, seedIfEmpty } from './db'
import { createBackup, parseBackup, restoreBackup, wipeAllData } from './backup'
import { addLabResult, addMeasurement, getLabResults, saveDailyEntry } from './repo'

let db: HealthDb
let n = 0

beforeEach(async () => {
  db = new HealthDb(`backup-db-${n++}`)
  await db.open()
  await seedIfEmpty(db)
  await saveDailyEntry({ date: '2026-08-17', energy: 5, totalSleepMinutes: 412 }, 'user', db)
  await addMeasurement({ date: '2026-08-16', type: 'body_weight', value: 84.2, unit: 'kg', source: 'manual' }, 'user', db)
  await addLabResult({ testKey: 'ferritin', date: '2026-07-14', value: 38, unit: 'ng/ml', refMin: 30, refMax: 400, source: 'manual' }, 'user', db)
})

describe('kopia zapasowa', () => {
  it('odtwarza te same dane po przywroceniu do pustej bazy', async () => {
    const backup = await createBackup(db)
    const target = new HealthDb(`backup-target-${n++}`)
    await target.open()

    await restoreBackup(backup, 'replace', target)

    expect(await target.daily.get('2026-08-17')).toMatchObject({ energy: 5, totalSleepMinutes: 412 })
    expect(await target.measurements.count()).toBe(1)
    const results = await getLabResults('ferritin', target)
    expect(results[0]).toMatchObject({ value: 38, unit: 'ng/ml', refMin: 30 })
    expect(await target.labTests.count()).toBeGreaterThan(40)
  })

  it('zachowuje dziennik rewizji', async () => {
    const backup = await createBackup(db)
    expect(backup.data.revisions.length).toBe(3)
    const target = new HealthDb(`backup-rev-${n++}`)
    await target.open()
    await restoreBackup(backup, 'replace', target)
    expect(await target.revisions.count()).toBe(3)
  })

  it('odrzuca plik, który nie jest kopia tej aplikacji', () => {
    expect(() => parseBackup('{"format":"cos-innego"}')).toThrow(/kopii zapasowej/)
    expect(() => parseBackup(JSON.stringify({ format: 'gpthealthtracker-backup', version: 99 }))).toThrow(/nowszej wersji/)
  })

  it('usuwa wszystkie dane uzytkownika i przywraca katalog startowy', async () => {
    await wipeAllData(db)
    expect(await db.daily.count()).toBe(0)
    expect(await db.measurements.count()).toBe(0)
    expect(await db.labResults.count()).toBe(0)
    expect(await db.revisions.count()).toBe(0)
    expect(await db.labTests.count()).toBeGreaterThan(40)
  })
})
