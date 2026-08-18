import type { DailyEntry } from '../domain/types'
import { addDays } from '../lib/date'
import { spearman } from '../lib/stats'
import { METRIC_BY_KEY, type MetricDef } from './metrics'

/** Minimum dni wspolnych obserwacji, zeby cokolwiek pokazac. */
export const MIN_DAYS_FOR_CORRELATION = 14
/** Ponizej tego progu zaleznosc jest oznaczana jako wstepna. */
export const PREFERRED_DAYS_FOR_CORRELATION = 30

export const CORRELATION_DISCLAIMER = 'Korelacja nie oznacza przyczynowosci.'

export type CorrelationStrength = 'brak' | 'slaba' | 'umiarkowana' | 'wyrazna'

export interface CorrelationPairDef {
  id: string
  xKey: string
  yKey: string
  /** true = metryka Y jest brana z dnia nastepnego (np. sen w nocy -> energia nastepnego dnia). */
  nextDay: boolean
  label: string
}

/** Pary analizowane w aplikacji - swiadomie ograniczona lista, zeby nie mnozyc przypadkowych zaleznosci. */
export const CORRELATION_PAIRS: CorrelationPairDef[] = [
  { id: 'sleep_energy', xKey: 'totalSleepMinutes', yKey: 'energy', nextDay: false, label: 'Dlugosc snu a energia' },
  { id: 'sleep_irritability', xKey: 'totalSleepMinutes', yKey: 'irritability', nextDay: false, label: 'Dlugosc snu a rozdraznienie' },
  { id: 'sleep_clarity', xKey: 'totalSleepMinutes', yKey: 'clarity', nextDay: false, label: 'Dlugosc snu a jasnosc umyslu' },
  { id: 'hrv_stress', xKey: 'hrv', yKey: 'stress', nextDay: false, label: 'HRV a stres' },
  { id: 'rhr_recovery', xKey: 'restingHeartRate', yKey: 'recovery', nextDay: false, label: 'Tetno spoczynkowe a regeneracja' },
  { id: 'caffeine_sleep', xKey: 'caffeineShots', yKey: 'totalSleepMinutes', nextDay: true, label: 'Kofeina a sen nastepnej nocy' },
  { id: 'alcohol_sleep', xKey: 'alcoholUnits', yKey: 'totalSleepMinutes', nextDay: true, label: 'Alkohol a sen nastepnej nocy' },
  { id: 'alcohol_hrv', xKey: 'alcoholUnits', yKey: 'hrv', nextDay: true, label: 'Alkohol a HRV nastepnej nocy' },
  { id: 'training_mood', xKey: 'trainingMinutes', yKey: 'mood', nextDay: true, label: 'Trening a nastroj nastepnego dnia' },
  { id: 'training_energy', xKey: 'trainingMinutes', yKey: 'energy', nextDay: true, label: 'Trening a energia nastepnego dnia' },
  { id: 'steps_energy', xKey: 'steps', yKey: 'energy', nextDay: false, label: 'Kroki a energia' },
  { id: 'sleep_recovery', xKey: 'totalSleepMinutes', yKey: 'recovery', nextDay: false, label: 'Dlugosc snu a odczuwana regeneracja' },
]

export interface CorrelationResult {
  id: string
  label: string
  x: MetricDef
  y: MetricDef
  nextDay: boolean
  n: number
  rho: number | null
  strength: CorrelationStrength
  direction: 'dodatnia' | 'ujemna' | null
  /** true, gdy danych jest wystarczajaco duzo, zeby pokazac wynik uzytkownikowi. */
  hasEnoughData: boolean
  /** true, gdy n < PREFERRED_DAYS_FOR_CORRELATION - wynik wstepny. */
  preliminary: boolean
}

export function correlationStrength(rho: number | null): CorrelationStrength {
  if (rho == null) return 'brak'
  const a = Math.abs(rho)
  if (a < 0.2) return 'brak'
  if (a < 0.4) return 'slaba'
  if (a < 0.6) return 'umiarkowana'
  return 'wyrazna'
}

/** Zbiera pary (x z dnia D, y z dnia D lub D+1) dla dni, w ktorych obie wartosci istnieja. */
export function pairedValues(
  entries: DailyEntry[],
  xKey: string,
  yKey: string,
  nextDay: boolean,
): { xs: number[]; ys: number[] } {
  const x = METRIC_BY_KEY[xKey]
  const y = METRIC_BY_KEY[yKey]
  const xs: number[] = []
  const ys: number[] = []
  if (!x || !y) return { xs, ys }

  const byDate = new Map(entries.map((e) => [e.date, e]))
  for (const entry of entries) {
    const xv = x.get(entry)
    if (xv == null) continue
    const target = nextDay ? byDate.get(addDays(entry.date, 1)) : entry
    const yv = target ? y.get(target) : null
    if (yv == null) continue
    xs.push(xv)
    ys.push(yv)
  }
  return { xs, ys }
}

export function computeCorrelation(entries: DailyEntry[], pair: CorrelationPairDef): CorrelationResult {
  const { xs, ys } = pairedValues(entries, pair.xKey, pair.yKey, pair.nextDay)
  const hasEnoughData = xs.length >= MIN_DAYS_FOR_CORRELATION
  const rho = hasEnoughData ? spearman(xs, ys) : null
  return {
    id: pair.id,
    label: pair.label,
    x: METRIC_BY_KEY[pair.xKey],
    y: METRIC_BY_KEY[pair.yKey],
    nextDay: pair.nextDay,
    n: xs.length,
    rho,
    strength: correlationStrength(rho),
    direction: rho == null ? null : rho >= 0 ? 'dodatnia' : 'ujemna',
    hasEnoughData,
    preliminary: xs.length < PREFERRED_DAYS_FOR_CORRELATION,
  }
}

/** Wszystkie pary; wyniki bez wystarczajacej liczby danych sa zwracane z hasEnoughData = false. */
export function computeAllCorrelations(entries: DailyEntry[]): CorrelationResult[] {
  return CORRELATION_PAIRS.map((p) => computeCorrelation(entries, p)).sort((a, b) => {
    if (a.hasEnoughData !== b.hasEnoughData) return a.hasEnoughData ? -1 : 1
    return Math.abs(b.rho ?? 0) - Math.abs(a.rho ?? 0)
  })
}
