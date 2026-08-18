import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, type DailyEntry, type LabResult, type Measurement } from '../domain/types'
import { addDays } from '../lib/date'
import { LAB_CATALOG } from '../domain/catalog'
import type { ExportDataset } from './dataset'
import { csvFiles, dailyCsv, labResultsCsv } from './csv'
import { buildJsonExport } from './json'
import { buildMarkdownReport } from './markdown'

function dataset(overrides: Partial<ExportDataset> = {}): ExportDataset {
  const entries: DailyEntry[] = Array.from({ length: 60 }, (_, i) => ({
    date: addDays('2026-06-20', i),
    // druga polowa okresu: krótszy sen, niższe HRV, wyższy stres
    totalSleepMinutes: i < 30 ? 425 : 392,
    deepSleepMinutes: i < 30 ? 62 : 54,
    remSleepMinutes: 70,
    hrv: i < 30 ? 46 : 41,
    restingHeartRate: i < 30 ? 59 : 62,
    sleepScore: i < 30 ? 79 : 74,
    energy: i < 30 ? 6 : 4,
    stress: i < 30 ? 5 : 7,
    irritability: i < 30 ? 4 : 7,
    recovery: i < 30 ? 6 : 4,
    mood: i < 30 ? 6 : 5,
    steps: 6000 + i * 10,
    caffeineShots: i < 30 ? 2 : 4,
    caffeineLastTime: '16:20',
    alcoholUnits: 0,
    waterMl: 1900,
    trainingDone: i % 5 === 0,
    trainingMinutes: i % 5 === 0 ? 45 : null,
    trainingType: i % 5 === 0 ? 'siłowy' : null,
    sleepSource: i % 2 === 0 ? 'huawei' : 'manual',
    notes: i === 59 ? 'ciężki tydzien w pracy' : null,
  }))

  const measurements: Measurement[] = [
    { date: '2026-06-21', type: 'body_weight', value: 85, unit: 'kg', source: 'manual' },
    { date: '2026-08-16', type: 'body_weight', value: 84.2, unit: 'kg', source: 'manual' },
    { date: '2026-08-10', type: 'blood_pressure', value: 128, value2: 82, unit: 'mmHg', source: 'manual' },
    { date: '2026-07-01', type: 'waist', value: 92, unit: 'cm', source: 'manual' },
  ]

  const labResults: LabResult[] = [
    { testKey: 'ferritin', date: '2026-07-14', value: 38, unit: 'ng/ml', refMin: 30, refMax: 400, laboratory: 'Lab X', fasting: true, source: 'manual' },
    { testKey: 'tsh', date: '2026-07-14', value: 2.1, unit: 'mIU/l', refMin: 0.27, refMax: 4.2, laboratory: 'Lab X', fasting: true, source: 'manual' },
  ]

  return {
    // raport dotyczy ostatnich 30 dni; poprzednie 30 dni służy tylko do porównania
    from: '2026-07-20',
    to: '2026-08-18',
    days: 30,
    generatedAt: '2026-08-18T20:00:00.000Z',
    entries: entries.filter((e) => e.date >= '2026-07-20'),
    entriesWithHistory: entries,
    measurements,
    labResults,
    previousLabResults: [
      { testKey: 'ferritin', date: '2026-02-03', value: 61, unit: 'ng/ml', refMin: 30, refMax: 400, laboratory: 'Lab X', source: 'manual' },
    ],
    labTests: LAB_CATALOG,
    settings: DEFAULT_SETTINGS,
    ...overrides,
  }
}

describe('raport Markdown dla AI', () => {
  const report = buildMarkdownReport(dataset())

  it('zawiera wszystkie wymagane sekcje w ustalonej kolejności', () => {
    const required = [
      '# Health Tracking Report',
      '## Period',
      '## Sleep',
      '## Subjective wellbeing',
      '## Activity',
      '## Body',
      '## Lifestyle',
      '## Laboratory results',
      '## Trends',
      '## Potential correlations',
      '## Missing data',
      '## Recent changes',
    ]
    let position = -1
    for (const heading of required) {
      const next = report.indexOf(heading)
      expect(next, `brak sekcji ${heading}`).toBeGreaterThan(position)
      position = next
    }
  })

  it('nie uzywa jezyka diagnostycznego ani zaleceń', () => {
    const forbidden = [
      'objawy',
      'diagnoz',
      'rozpoznanie',
      'zalecam',
      'zalecenie',
      'powinienes',
      'musisz',
      'leczenie',
      'chorob',
      'zespol wypalenia',
      'przeciążenie organizmu',
    ]
    const lower = report.toLowerCase()
    for (const phrase of forbidden) {
      // "choroba" dozwolona wyłącznie jako neutralna etykieta pola dziennika
      if (phrase === 'chorob') {
        const occurrences = lower.split('chorob').length - 1
        expect(occurrences, 'slowo "chorob..." poza etykieta pola').toBe(1)
        expect(lower).toContain('dni oznaczone jako infekcja/choroba')
        continue
      }
      expect(lower, `raport zawiera zwrot "${phrase}"`).not.toContain(phrase)
    }
  })

  it('opisuje zmianę średniego snu względem poprzedniego okresu wraz z liczba dni danych', () => {
    expect(report).toContain('Długość snu: 6 h 32 min')
    expect(report).toMatch(/Długość snu: średnia 6 h 32 min wobec 7 h 05 min/)
    expect(report).toContain('dni z danymi: 30/30')
  })

  it('pokazuje wyniki badań z jednostka, zakresem laboratorium i zmiana wobec poprzedniego wyniku', () => {
    expect(report).toContain('| Date | Test | Value | Unit | Reference | Lab | Fasting | Change vs previous |')
    expect(report).toContain('| 2026-07-14 | Ferrytyna | 38 | ng/ml | 30-400 | Lab X | tak |')
    expect(report).toContain('-23 vs 61 (03.02.2026)')
  })

  it('dolacza zastrzeżenie o braku przyczynowości przy korelacjach', () => {
    expect(report).toContain('Korelacja nie oznacza przyczynowości.')
  })

  it('wymienia braki danych zamiast je pomijać', () => {
    expect(report).toContain('## Missing data')
    expect(report).toContain('Dni z jakimikolwiek danymi: 30/30')
    expect(report).toContain('Badania bez żadnego wyniku')
  })

  it('dolacza notatki dzienne w zalaczniku', () => {
    expect(report).toContain('## Appendix - daily notes')
    expect(report).toContain('ciężki tydzien w pracy')
  })

  it('nie pokazuje korelacji, gdy danych jest mniej niż 14 dni', () => {
    const short = dataset({
      entries: Array.from({ length: 10 }, (_, i) => ({ date: addDays('2026-08-09', i), totalSleepMinutes: 400, energy: 5 })),
      entriesWithHistory: Array.from({ length: 10 }, (_, i) => ({ date: addDays('2026-08-09', i), totalSleepMinutes: 400, energy: 5 })),
      from: '2026-08-09',
      to: '2026-08-18',
      days: 10,
    })
    const md = buildMarkdownReport(short)
    expect(md).toContain('Brak zależności z wystarczajaca liczba danych')
    expect(md).not.toContain('Spearman rho')
  })

  it('działa na pustym zbiorze danych bez wyjatkow', () => {
    const empty = dataset({ entries: [], entriesWithHistory: [], measurements: [], labResults: [], previousLabResults: [] })
    const md = buildMarkdownReport(empty)
    expect(md).toContain('# Health Tracking Report')
    expect(md).toContain('brak danych')
    expect(md).toContain('brak pomiarów w okresie')
    expect(md).toContain('Brak wyników badań w wybranym okresie.')
  })
})

describe('eksport JSON', () => {
  const json = buildJsonExport(dataset()) as Record<string, any>

  it('ma wersje schematu, okres i surowe dane', () => {
    expect(json.schema_version).toBe(1)
    expect(json.period).toEqual({ from: '2026-07-20', to: '2026-08-18', days: 30 })
    expect(json.daily).toHaveLength(30)
  })

  it('przechowuje wynik badania z jednostka i zakresem osobno', () => {
    const ferritin = json.lab_results.find((r: any) => r.test === 'ferritin')
    expect(ferritin).toMatchObject({ value: 38, unit: 'ng/ml', ref_min: 30, ref_max: 400, laboratory: 'Lab X' })
  })

  it('dolacza wyliczenia pochodne i kompletność danych', () => {
    expect(json.derived.trends.length).toBeGreaterThan(0)
    expect(json.derived.correlations.every((c: any) => c.n >= 14)).toBe(true)
    expect(json.completeness.days_with_any_data).toBe(30)
  })
})

describe('eksport CSV', () => {
  it('generuje pliki z naglowkami i danymi', () => {
    const files = csvFiles(dataset())
    expect(Object.keys(files)).toEqual(['daily.csv', 'metrics.csv', 'measurements.csv', 'lab_results.csv'])
    expect(dailyCsv(dataset()).split('\n')[0]).toContain('date,energy,stress')
    expect(labResultsCsv(dataset())).toContain('2026-07-14,ferritin,Ferrytyna,38,,ng/ml,30,400')
  })

  it('escapuje przecinki i cudzyslowy w notatkach', () => {
    const d = dataset({ entries: [{ date: '2026-08-18', notes: 'test, z "cudzyslowem"' }] })
    expect(dailyCsv(d)).toContain('"test, z ""cudzyslowem"""')
  })
})
