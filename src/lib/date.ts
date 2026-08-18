import type { ClockTime, IsoDate } from '../domain/types'

export function toIsoDate(d: Date): IsoDate {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function today(): IsoDate {
  return toIsoDate(new Date())
}

export function parseIsoDate(s: IsoDate): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = parseIsoDate(date)
  d.setDate(d.getDate() + days)
  return toIsoDate(d)
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  const ms = parseIsoDate(to).getTime() - parseIsoDate(from).getTime()
  return Math.round(ms / 86_400_000)
}

/** Lista dat od `from` do `to` wlacznie. */
export function dateRange(from: IsoDate, to: IsoDate): IsoDate[] {
  const out: IsoDate[] = []
  for (let d = from; daysBetween(d, to) >= 0; d = addDays(d, 1)) out.push(d)
  return out
}

/** Ostatnie `days` dni koniczace się na `end` (wlacznie). */
export function lastNDays(days: number, end: IsoDate = today()): IsoDate[] {
  return dateRange(addDays(end, -(days - 1)), end)
}

export function clockToMinutes(t: ClockTime): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export function minutesToClock(min: number): ClockTime {
  const m = ((min % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/**
 * Długość snu z godziny zasniecia i wybudzenia (czas zegarowy, przejscie przez polnoc).
 * Uwaga: liczymy na czasie lokalnym - w noc zmiany czasu wynik może roznic się o 60 min.
 */
export function sleepDurationMinutes(sleepStart: ClockTime, wakeTime: ClockTime): number {
  const s = clockToMinutes(sleepStart)
  const w = clockToMinutes(wakeTime)
  return w >= s ? w - s : 1440 - s + w
}

export function formatMinutes(min: number | null | undefined): string {
  if (min == null || Number.isNaN(min)) return '-'
  const sign = min < 0 ? '-' : ''
  const abs = Math.abs(Math.round(min))
  const h = Math.floor(abs / 60)
  const m = abs % 60
  return h > 0 ? `${sign}${h} h ${String(m).padStart(2, '0')} min` : `${sign}${m} min`
}

export function formatDatePl(date: IsoDate): string {
  const d = parseIsoDate(date)
  return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function formatDateShortPl(date: IsoDate): string {
  const d = parseIsoDate(date)
  return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })
}

const WEEKDAYS = ['pon', 'wt', 'sr', 'czw', 'pt', 'sob', 'nd']

export function weekdayPl(date: IsoDate): string {
  const jsDay = parseIsoDate(date).getDay()
  return WEEKDAYS[(jsDay + 6) % 7]
}

export function nowIso(): string {
  return new Date().toISOString()
}
