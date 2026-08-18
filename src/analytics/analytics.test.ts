import { describe, expect, it } from 'vitest'
import type { DailyEntry } from '../domain/types'
import { addDays } from '../lib/date'
import { median, robustZScore, rollingMean, spearman } from '../lib/stats'
import { analyzeCompleteness, dueMeasurements, staleLabTests } from './completeness'
import { MIN_DAYS_FOR_CORRELATION, computeCorrelation, correlationStrength } from './correlations'
import { compareByThreshold, metricSeries, summarizeMetric } from './trends'

/** Buduje ciag dni od `start`, stosujac funkcje do kazdego indeksu. */
function buildDays(start: string, count: number, fn: (i: number) => Partial<DailyEntry>): DailyEntry[] {
  return Array.from({ length: count }, (_, i) => ({ date: addDays(start, i), ...fn(i) }))
}

describe('statystyki', () => {
  it('liczy mediane dla parzystej i nieparzystej liczby elementow', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 2, 3])).toBe(2.5)
    expect(median([])).toBeNull()
  })

  it('ignoruje brakujace wartości w średniej kroczacej i wymaga minimum punktow', () => {
    const r = rollingMean([1, null, 3, 5, 7], 3, 2)
    expect(r[0]).toBeNull()
    expect(r[2]).toBe(2)
    expect(r[4]).toBe(5)
  })

  it('zwraca korelacje rangowa Spearmana odporna na nieliniowość', () => {
    expect(spearman([1, 2, 3, 4], [1, 4, 9, 16])).toBe(1)
    expect(spearman([1, 2, 3, 4], [16, 9, 4, 1])).toBe(-1)
    expect(spearman([1, 1, 1, 1], [1, 2, 3, 4])).toBeNull()
  })

  it('nie wyznacza odchylenia od normy przy zbyt malej liczbie danych', () => {
    expect(robustZScore(10, [5, 6, 7])).toBeNull()
    const z = robustZScore(12, [6, 6, 7, 7, 7, 8, 8, 8, 9])
    expect(z).not.toBeNull()
    expect(z as number).toBeGreaterThan(2)
  })
})

describe('podsumowanie metryki', () => {
  const entries = [
    ...buildDays('2026-06-01', 30, () => ({ totalSleepMinutes: 425 })), // poprzedni okres: 7 h 05 min
    ...buildDays('2026-07-01', 30, () => ({ totalSleepMinutes: 392 })), // okres biezacy: 6 h 32 min
  ]

  it('porownuje okres biezacy z poprzednim okresem tej samej długości', () => {
    const s = summarizeMetric(entries, 'totalSleepMinutes', '2026-07-01', '2026-07-30')!
    expect(s.n).toBe(30)
    expect(s.mean).toBe(392)
    expect(s.previousMean).toBe(425)
    expect(s.changeAbsolute).toBe(-33)
    expect(s.changePercent).toBeCloseTo(-7.76, 1)
  })

  it('podaje liczbę dni z danymi osobno od długości okresu', () => {
    const sparse = buildDays('2026-07-01', 30, (i) => (i % 3 === 0 ? { energy: 5 } : {}))
    const s = summarizeMetric(sparse, 'energy', '2026-07-01', '2026-07-30')!
    expect(s.days).toBe(30)
    expect(s.n).toBe(10)
  })

  it('zwraca pusty wynik zamiast zera, gdy nie ma danych', () => {
    const s = summarizeMetric([], 'hrv', '2026-07-01', '2026-07-30')!
    expect(s.mean).toBeNull()
    expect(s.changePercent).toBeNull()
    expect(s.n).toBe(0)
  })
})

describe('szereg czasowy', () => {
  it('zwraca pelna os dat z lukami jako null', () => {
    const entries: DailyEntry[] = [
      { date: '2026-08-01', steps: 5000 },
      { date: '2026-08-03', steps: 7000 },
    ]
    const series = metricSeries(entries, 'steps', '2026-08-01', '2026-08-03')
    expect(series.map((p) => p.value)).toEqual([5000, null, 7000])
    expect(series).toHaveLength(3)
  })
})

describe('porównania warunkowe', () => {
  it('porownuje rozdrażnienie w dniach z krótkim i dluzszym snem', () => {
    const entries = [
      ...buildDays('2026-07-01', 10, () => ({ totalSleepMinutes: 360, irritability: 7 })),
      ...buildDays('2026-07-11', 10, () => ({ totalSleepMinutes: 430, irritability: 4 })),
    ]
    const c = compareByThreshold(entries, 'totalSleepMinutes', 390, 'irritability')!
    expect(c.belowN).toBe(10)
    expect(c.belowMean).toBe(7)
    expect(c.atOrAboveN).toBe(10)
    expect(c.atOrAboveMean).toBe(4)
  })
})

describe('korelacje', () => {
  const pair = { id: 'sleep_energy', xKey: 'totalSleepMinutes', yKey: 'energy', nextDay: false, label: 'Sen a energia' }

  it('nie pokazuje korelacji przy mniej niż 14 dniach danych', () => {
    const entries = buildDays('2026-07-01', MIN_DAYS_FOR_CORRELATION - 1, (i) => ({
      totalSleepMinutes: 360 + i * 5,
      energy: 3 + i * 0.2,
    }))
    const r = computeCorrelation(entries, pair)
    expect(r.hasEnoughData).toBe(false)
    expect(r.rho).toBeNull()
  })

  it('pokazuje korelacje od 14 dni i oznacza wynik jako wstępny poniżej 30 dni', () => {
    const entries = buildDays('2026-07-01', 20, (i) => ({ totalSleepMinutes: 360 + i * 5, energy: 3 + i * 0.2 }))
    const r = computeCorrelation(entries, pair)
    expect(r.hasEnoughData).toBe(true)
    expect(r.n).toBe(20)
    expect(r.rho).toBeCloseTo(1, 5)
    expect(r.preliminary).toBe(true)
  })

  it('liczy pary z przesunieciem o jeden dzień, gdy skutek dotyczy dnia następnego', () => {
    const entries = [
      { date: '2026-07-01', caffeineShots: 4 },
      { date: '2026-07-02', totalSleepMinutes: 360, caffeineShots: 1 },
      { date: '2026-07-03', totalSleepMinutes: 450 },
    ]
    const r = computeCorrelation(entries, {
      id: 'caffeine_sleep',
      xKey: 'caffeineShots',
      yKey: 'totalSleepMinutes',
      nextDay: true,
      label: 'Kofeina a sen',
    })
    expect(r.n).toBe(2)
  })

  it('opisuje sile zależności bez jezyka przyczynowego', () => {
    expect(correlationStrength(0.1)).toBe('brak')
    expect(correlationStrength(-0.35)).toBe('słaba')
    expect(correlationStrength(0.5)).toBe('umiarkowana')
    expect(correlationStrength(-0.8)).toBe('wyraźna')
  })
})

describe('kompletność danych', () => {
  it('raportuje liczbę dni z danymi i luki w okresie', () => {
    const entries: DailyEntry[] = [
      { date: '2026-08-01', energy: 5, steps: 4000 },
      { date: '2026-08-03', energy: 6 },
    ]
    const report = analyzeCompleteness(entries, '2026-08-01', '2026-08-04')
    expect(report.totalDays).toBe(4)
    expect(report.daysWithAnyData).toBe(2)
    expect(report.emptyDates).toEqual(['2026-08-02', '2026-08-04'])
    const steps = report.fields.find((f) => f.key === 'steps')!
    expect(steps.filledDays).toBe(1)
    expect(steps.missingDays).toBe(3)
  })

  it('wskazuje badania bez wyniku lub z wynikiem starszym niż próg', () => {
    const tests = [
      { key: 'ferritin', name: 'Ferrytyna', category: 'iron' as const, defaultUnit: 'ng/ml' },
      { key: 'tsh', name: 'TSH', category: 'thyroid' as const, defaultUnit: 'mIU/l' },
      { key: 'crp', name: 'CRP', category: 'inflammation' as const, defaultUnit: 'mg/l' },
    ]
    const results = [
      { testKey: 'ferritin', date: '2026-07-14', value: 38, unit: 'ng/ml', source: 'manual' as const },
      { testKey: 'tsh', date: '2025-01-10', value: 2.1, unit: 'mIU/l', source: 'manual' as const },
    ]
    const stale = staleLabTests(tests, results, 180, '2026-08-18')
    expect(stale.map((s) => s.label)).toEqual(['TSH', 'CRP'])
    expect(stale[1].lastDate).toBeNull()
  })

  it('wyznacza pomiary, których termin minął', () => {
    const schedules = [
      { type: 'body_weight', intervalDays: 7, enabled: true },
      { type: 'waist', intervalDays: 30, enabled: true },
      { type: 'calf', intervalDays: 90, enabled: false },
    ]
    const measurements = [
      { date: '2026-08-16', type: 'body_weight', value: 84.2, unit: 'kg', source: 'manual' as const },
      { date: '2026-08-01', type: 'waist', value: 92, unit: 'cm', source: 'manual' as const },
    ]
    const due = dueMeasurements(schedules, measurements, '2026-08-18')
    expect(due.find((d) => d.type === 'body_weight')?.due).toBe(false)
    expect(due.find((d) => d.type === 'waist')?.due).toBe(false)
    expect(due.map((d) => d.type)).not.toContain('calf')

    const later = dueMeasurements(schedules, measurements, '2026-09-05')
    expect(later.find((d) => d.type === 'body_weight')?.due).toBe(true)
    expect(later.find((d) => d.type === 'waist')?.due).toBe(true)
  })
})
