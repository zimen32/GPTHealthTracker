import { beforeEach, describe, expect, it } from 'vitest'
import { HealthDb, seedIfEmpty } from './db'
import {
  addLabResult,
  addMeasurement,
  getDailyEntry,
  getLabResults,
  getLabTests,
  getRevisions,
  saveDailyEntry,
  updateLabResult,
  updateMeasurement,
  upsertLabTest,
} from './repo'

let db: HealthDb
let n = 0

beforeEach(async () => {
  db = new HealthDb(`test-db-${n++}`)
  await db.open()
  await seedIfEmpty(db)
})

describe('wpisy dzienne', () => {
  it('zapisuje wpis częściowy i pozwala uzupełnić dane później bez utraty poprzednich pół', async () => {
    await saveDailyEntry({ date: '2026-08-17', energy: 5 }, 'user', db)
    await saveDailyEntry({ date: '2026-08-17', steps: 8200 }, 'user', db)

    const entry = await getDailyEntry('2026-08-17', db)
    expect(entry?.energy).toBe(5)
    expect(entry?.steps).toBe(8200)
    expect(entry?.edited).toBe(true)
  })

  it('traktuje pominięte pola jako brak danych, a nie jako zero', async () => {
    await saveDailyEntry({ date: '2026-08-17', energy: 4 }, 'user', db)
    const entry = await getDailyEntry('2026-08-17', db)
    expect(entry?.stress).toBeUndefined()
    expect(entry?.steps).toBeUndefined()
  })

  it('zapisuje każda zmianę w dzienniku rewizji razem ze stanem poprzednim', async () => {
    await saveDailyEntry({ date: '2026-08-17', energy: 5 }, 'user', db)
    await saveDailyEntry({ date: '2026-08-17', energy: 8 }, 'user', db)

    const revisions = await getRevisions('daily_entry', '2026-08-17', db)
    expect(revisions).toHaveLength(2)
    expect(revisions[0].changeType).toBe('update')
    expect((revisions[0].before as { energy: number }).energy).toBe(5)
    expect((revisions[0].after as { energy: number }).energy).toBe(8)
    expect(revisions[1].changeType).toBe('create')
  })
})

describe('wyniki laboratoryjne', () => {
  it('zachowuje jednostkę i zakres referencyjny z dnia badania po zmianie katalogu', async () => {
    await addLabResult(
      {
        testKey: 'ferritin',
        date: '2026-02-03',
        value: 61,
        unit: 'ng/ml',
        refMin: 30,
        refMax: 400,
        laboratory: 'Lab A',
        source: 'manual',
      },
      'user',
      db,
    )
    // zmiana katalogu (inna jednostka domyslna) nie może ruszyc historii
    await upsertLabTest({ key: 'ferritin', name: 'Ferrytyna', category: 'iron', defaultUnit: 'ug/l' }, db)

    const [result] = await getLabResults('ferritin', db)
    expect(result.unit).toBe('ng/ml')
    expect(result.refMin).toBe(30)
    expect(result.refMax).toBe(400)
    expect(result.laboratory).toBe('Lab A')
  })

  it('pozwala przechowywac wiele wyników tego samego parametru w czasie', async () => {
    for (const [date, value] of [
      ['2026-02-03', 61],
      ['2026-07-14', 38],
    ] as const) {
      await addLabResult({ testKey: 'ferritin', date, value, unit: 'ng/ml', source: 'manual' }, 'user', db)
    }
    const results = await getLabResults('ferritin', db)
    expect(results.map((r) => r.value)).toEqual([61, 38])
  })

  it('oznacza poprawiony wynik jako edytowany i zachowuje wartość pierwotna', async () => {
    const id = await addLabResult(
      { testKey: 'tsh', date: '2026-07-14', value: 21, unit: 'mIU/l', source: 'manual' },
      'user',
      db,
    )
    await updateLabResult(id, { value: 2.1 }, 'user', db)

    const [result] = await getLabResults('tsh', db)
    expect(result.value).toBe(2.1)
    expect(result.edited).toBe(true)
    const revisions = await getRevisions('lab_result', String(id), db)
    expect((revisions[0].before as { value: number }).value).toBe(21)
  })

  it('seeduje katalog startowy z parametrami z listy wymagan', async () => {
    const tests = await getLabTests(db)
    const keys = tests.map((t) => t.key)
    for (const key of ['hemoglobin', 'ferritin', 'tsh', 'vitamin_d_25oh', 'crp', 'urinalysis']) {
      expect(keys).toContain(key)
    }
  })
})

describe('pomiary okresowe', () => {
  it('zapisuje ciśnienie jako pare wartości z jednostka', async () => {
    const id = await addMeasurement(
      { date: '2026-08-10', type: 'blood_pressure', value: 128, value2: 82, unit: 'mmHg', source: 'manual' },
      'user',
      db,
    )
    await updateMeasurement(id, { value: 126 }, 'user', db)

    const row = await db.measurements.get(id)
    expect(row?.value).toBe(126)
    expect(row?.value2).toBe(82)
    expect(row?.unit).toBe('mmHg')
    expect(row?.edited).toBe(true)
  })
})
