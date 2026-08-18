import type { DailyEntry } from '../domain/types'
import { formatMinutes } from '../lib/date'
import { fmt } from '../lib/stats'

export type MetricGroup = 'regeneracja' | 'samopoczucie' | 'aktywnosc' | 'styl_zycia'

export interface MetricDef {
  key: string
  label: string
  group: MetricGroup
  unit: string
  /** Odczyt wartosci z wpisu dziennego; null = brak danych. */
  get: (e: DailyEntry) => number | null
  format: (v: number | null) => string
  /** Kierunek, w ktorym wzrost wartosci jest zwykle korzystny - tylko do opisu strzalki, nie do ocen. */
  higherIsBetter?: boolean
  digits?: number
}

const num = (v: number | null | undefined): number | null => (typeof v === 'number' ? v : null)

function scoreMetric(key: string, label: string, higherIsBetter: boolean, get: (e: DailyEntry) => number | null): MetricDef {
  return { key, label, group: 'samopoczucie', unit: '/10', get, format: (v) => (v == null ? '-' : fmt(v, 1)), higherIsBetter }
}

export const METRICS: MetricDef[] = [
  // regeneracja
  {
    key: 'totalSleepMinutes',
    label: 'Dlugosc snu',
    group: 'regeneracja',
    unit: 'min',
    get: (e) => num(e.totalSleepMinutes),
    format: (v) => formatMinutes(v),
    higherIsBetter: true,
  },
  {
    key: 'sleepScore',
    label: 'Sleep score',
    group: 'regeneracja',
    unit: 'pkt',
    get: (e) => num(e.sleepScore),
    format: (v) => (v == null ? '-' : fmt(v, 0)),
    higherIsBetter: true,
  },
  {
    key: 'deepSleepMinutes',
    label: 'Sen gleboki',
    group: 'regeneracja',
    unit: 'min',
    get: (e) => num(e.deepSleepMinutes),
    format: (v) => formatMinutes(v),
    higherIsBetter: true,
  },
  {
    key: 'remSleepMinutes',
    label: 'Sen REM',
    group: 'regeneracja',
    unit: 'min',
    get: (e) => num(e.remSleepMinutes),
    format: (v) => formatMinutes(v),
    higherIsBetter: true,
  },
  {
    key: 'hrv',
    label: 'HRV',
    group: 'regeneracja',
    unit: 'ms',
    get: (e) => num(e.hrv),
    format: (v) => (v == null ? '-' : `${fmt(v, 0)} ms`),
    higherIsBetter: true,
  },
  {
    key: 'restingHeartRate',
    label: 'Tetno spoczynkowe',
    group: 'regeneracja',
    unit: 'bpm',
    get: (e) => num(e.restingHeartRate),
    format: (v) => (v == null ? '-' : `${fmt(v, 0)} bpm`),
    higherIsBetter: false,
  },
  {
    key: 'awakenings',
    label: 'Wybudzenia',
    group: 'regeneracja',
    unit: 'x',
    get: (e) => num(e.awakenings),
    format: (v) => (v == null ? '-' : fmt(v, 1)),
    higherIsBetter: false,
  },
  // samopoczucie
  scoreMetric('energy', 'Energia', true, (e) => num(e.energy)),
  scoreMetric('stress', 'Stres', false, (e) => num(e.stress)),
  scoreMetric('irritability', 'Rozdraznienie', false, (e) => num(e.irritability)),
  scoreMetric('recovery', 'Regeneracja (odczuwana)', true, (e) => num(e.recovery)),
  scoreMetric('mood', 'Nastroj', true, (e) => num(e.mood)),
  scoreMetric('clarity', 'Jasnosc umyslu', true, (e) => num(e.clarity)),
  // aktywnosc
  {
    key: 'steps',
    label: 'Kroki',
    group: 'aktywnosc',
    unit: 'kroki',
    get: (e) => num(e.steps),
    format: (v) => (v == null ? '-' : fmt(v, 0)),
    higherIsBetter: true,
  },
  {
    key: 'trainingMinutes',
    label: 'Czas treningu',
    group: 'aktywnosc',
    unit: 'min',
    get: (e) => num(e.trainingMinutes),
    format: (v) => formatMinutes(v),
    higherIsBetter: true,
  },
  {
    key: 'walkingMinutes',
    label: 'Czas chodzenia',
    group: 'aktywnosc',
    unit: 'min',
    get: (e) => num(e.walkingMinutes),
    format: (v) => formatMinutes(v),
    higherIsBetter: true,
  },
  // styl zycia
  {
    key: 'caffeineShots',
    label: 'Kofeina (espresso)',
    group: 'styl_zycia',
    unit: 'porcje',
    get: (e) => num(e.caffeineShots),
    format: (v) => (v == null ? '-' : fmt(v, 1)),
  },
  {
    key: 'alcoholUnits',
    label: 'Alkohol',
    group: 'styl_zycia',
    unit: 'jednostki',
    get: (e) => num(e.alcoholUnits),
    format: (v) => (v == null ? '-' : fmt(v, 1)),
  },
  {
    key: 'waterMl',
    label: 'Woda',
    group: 'styl_zycia',
    unit: 'ml',
    get: (e) => num(e.waterMl),
    format: (v) => (v == null ? '-' : `${fmt(v / 1000, 1)} l`),
  },
]

export const METRIC_BY_KEY: Record<string, MetricDef> = Object.fromEntries(METRICS.map((m) => [m.key, m]))
