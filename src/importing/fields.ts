import type { ClockTime, DailyEntry, IsoDate } from '../domain/types'

/** Konwersje wartosci tekstowych z pliku na typy aplikacji. Zwracaja null, gdy wartosci nie da sie odczytac. */

export function parseNumber(raw: string): number | null {
  const s = raw.trim().replace(/\s/g, '').replace(',', '.')
  if (s === '' || s === '-' || s === '--') return null
  const n = Number(s.replace(/[^\d.+-eE]/g, ''))
  return Number.isFinite(n) ? n : null
}

/** Data w formatach: YYYY-MM-DD, DD.MM.YYYY, DD/MM/YYYY, YYYY/MM/DD, znacznik ISO, timestamp ms. */
export function parseDate(raw: string): IsoDate | null {
  const s = raw.trim()
  if (s === '') return null
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/.exec(s)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  if (/^\d{10,13}$/.test(s)) {
    const ms = s.length === 13 ? Number(s) : Number(s) * 1000
    const d = new Date(ms)
    if (!Number.isNaN(d.getTime())) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  return null
}

/** Godzina w formatach: HH:mm, H:mm, HH:mm:ss, znacznik ISO, timestamp ms. */
export function parseClock(raw: string): ClockTime | null {
  const s = raw.trim()
  if (s === '') return null
  const iso = /T(\d{2}):(\d{2})/.exec(s)
  if (iso) return `${iso[1]}:${iso[2]}`
  const m = /^(\d{1,2}):(\d{2})/.exec(s)
  if (m) {
    const h = Number(m[1])
    const min = Number(m[2])
    if (h < 24 && min < 60) return `${String(h).padStart(2, '0')}:${m[2]}`
  }
  if (/^\d{10,13}$/.test(s)) {
    const ms = s.length === 13 ? Number(s) : Number(s) * 1000
    const d = new Date(ms)
    if (!Number.isNaN(d.getTime())) return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  return null
}

/**
 * Czas trwania w minutach. Obsluguje: "412", "6:52", "6h 52m", "6 godz. 52 min", "412 min".
 * Wartosci powyzej 1440 traktowane sa jako sekundy (typowe dla eksportow z urzadzen).
 */
export function parseDurationMinutes(raw: string): number | null {
  const s = raw.trim().toLowerCase()
  if (s === '') return null
  const hm = /^(\d{1,2})\s*(?::|h|godz\.?)\s*(\d{1,2})/.exec(s)
  if (hm) return Number(hm[1]) * 60 + Number(hm[2])
  const hoursOnly = /^([\d.,]+)\s*(?:h|godz\.?)$/.exec(s)
  if (hoursOnly) {
    const n = parseNumber(hoursOnly[1])
    return n == null ? null : Math.round(n * 60)
  }
  const n = parseNumber(s)
  if (n == null) return null
  if (/\bs(ec|ek)?\b|sekund/.test(s)) return Math.round(n / 60)
  return n > 1440 ? Math.round(n / 60) : Math.round(n)
}

export function parseBoolean(raw: string): boolean | null {
  const s = raw.trim().toLowerCase()
  if (s === '') return null
  if (['1', 'true', 'tak', 'yes', 'y', 't'].includes(s)) return true
  if (['0', 'false', 'nie', 'no', 'n', 'f'].includes(s)) return false
  return null
}

export type FieldKind = 'date' | 'number' | 'integer' | 'duration' | 'clock' | 'boolean' | 'text' | 'score'

export interface ImportField {
  key: keyof DailyEntry | 'skip'
  label: string
  kind: FieldKind
  group: string
  /** Fragmenty nazw kolumn, po ktorych rozpoznajemy pole automatycznie (male litery). */
  aliases: string[]
}

/** Pola wpisu dziennego dostepne w kreatorze mapowania kolumn. */
export const IMPORT_FIELDS: ImportField[] = [
  { key: 'date', label: 'Data', kind: 'date', group: 'Podstawa', aliases: ['date', 'data', 'day', 'dzien', 'time', 'czas'] },
  { key: 'bedtime', label: 'Pojscie do lozka', kind: 'clock', group: 'Sen', aliases: ['bedtime', 'lozko'] },
  { key: 'sleepStart', label: 'Zasniecie', kind: 'clock', group: 'Sen', aliases: ['sleep start', 'start', 'zasniecie', 'fallasleep', 'sleep_start', 'bedtime'] },
  { key: 'wakeTime', label: 'Wybudzenie', kind: 'clock', group: 'Sen', aliases: ['wake', 'wakeup', 'wake_time', 'pobudka', 'end'] },
  { key: 'totalSleepMinutes', label: 'Sen calkowity', kind: 'duration', group: 'Sen', aliases: ['total sleep', 'sleep duration', 'sen', 'totalsleep', 'sleep_total', 'duration'] },
  { key: 'deepSleepMinutes', label: 'Sen gleboki', kind: 'duration', group: 'Sen', aliases: ['deep', 'gleboki'] },
  { key: 'remSleepMinutes', label: 'Sen REM', kind: 'duration', group: 'Sen', aliases: ['rem'] },
  { key: 'lightSleepMinutes', label: 'Sen lekki', kind: 'duration', group: 'Sen', aliases: ['light', 'lekki'] },
  { key: 'awakeMinutes', label: 'Czuwanie w nocy', kind: 'duration', group: 'Sen', aliases: ['awake', 'czuwanie', 'wake duration'] },
  { key: 'awakenings', label: 'Liczba wybudzen', kind: 'integer', group: 'Sen', aliases: ['awakenings', 'wybudzenia', 'wake count', 'wakecount'] },
  { key: 'sleepScore', label: 'Sleep score', kind: 'integer', group: 'Sen', aliases: ['sleep score', 'score', 'ocena snu'] },
  { key: 'restingHeartRate', label: 'Tetno spoczynkowe', kind: 'integer', group: 'Sen', aliases: ['resting heart', 'resting hr', 'rhr', 'tetno spoczynkowe'] },
  { key: 'hrv', label: 'HRV', kind: 'number', group: 'Sen', aliases: ['hrv', 'rmssd', 'sdnn'] },
  { key: 'spo2', label: 'SpO2', kind: 'number', group: 'Sen', aliases: ['spo2', 'saturacja', 'oxygen'] },
  { key: 'steps', label: 'Kroki', kind: 'integer', group: 'Aktywnosc', aliases: ['steps', 'kroki'] },
  { key: 'walkingMinutes', label: 'Czas chodzenia', kind: 'duration', group: 'Aktywnosc', aliases: ['walking', 'chodzenie'] },
  { key: 'sedentaryMinutes', label: 'Czas siedzenia', kind: 'duration', group: 'Aktywnosc', aliases: ['sedentary', 'siedzenie'] },
  { key: 'trainingMinutes', label: 'Czas treningu', kind: 'duration', group: 'Aktywnosc', aliases: ['training', 'workout', 'exercise', 'trening'] },
  { key: 'trainingType', label: 'Typ treningu', kind: 'text', group: 'Aktywnosc', aliases: ['training type', 'sport', 'typ treningu', 'activity type'] },
  { key: 'trainingIntensity', label: 'Intensywnosc treningu', kind: 'score', group: 'Aktywnosc', aliases: ['intensity', 'intensywnosc'] },
  { key: 'energy', label: 'Energia', kind: 'score', group: 'Samopoczucie', aliases: ['energy', 'energia'] },
  { key: 'stress', label: 'Stres', kind: 'score', group: 'Samopoczucie', aliases: ['stress', 'stres'] },
  { key: 'irritability', label: 'Rozdraznienie', kind: 'score', group: 'Samopoczucie', aliases: ['irritability', 'rozdraznienie'] },
  { key: 'recovery', label: 'Regeneracja', kind: 'score', group: 'Samopoczucie', aliases: ['recovery', 'regeneracja'] },
  { key: 'mood', label: 'Nastroj', kind: 'score', group: 'Samopoczucie', aliases: ['mood', 'nastroj'] },
  { key: 'clarity', label: 'Jasnosc umyslu', kind: 'score', group: 'Samopoczucie', aliases: ['clarity', 'jasnosc'] },
  { key: 'caffeineShots', label: 'Kofeina (espresso)', kind: 'number', group: 'Styl zycia', aliases: ['caffeine', 'kofeina', 'espresso', 'kawa'] },
  { key: 'caffeineLastTime', label: 'Ostatnia kofeina (godzina)', kind: 'clock', group: 'Styl zycia', aliases: ['caffeine time', 'ostatnia kawa'] },
  { key: 'alcoholUnits', label: 'Alkohol', kind: 'number', group: 'Styl zycia', aliases: ['alcohol', 'alkohol'] },
  { key: 'waterMl', label: 'Woda (ml)', kind: 'integer', group: 'Styl zycia', aliases: ['water', 'woda'] },
  { key: 'notes', label: 'Notatka', kind: 'text', group: 'Styl zycia', aliases: ['notes', 'note', 'notatka', 'comment'] },
]

export const FIELD_BY_KEY = Object.fromEntries(IMPORT_FIELDS.map((f) => [f.key, f])) as Record<string, ImportField>

export function convertValue(kind: FieldKind, raw: string): string | number | boolean | null {
  switch (kind) {
    case 'date':
      return parseDate(raw)
    case 'clock':
      return parseClock(raw)
    case 'duration':
      return parseDurationMinutes(raw)
    case 'number':
      return parseNumber(raw)
    case 'integer': {
      const n = parseNumber(raw)
      return n == null ? null : Math.round(n)
    }
    case 'score': {
      const n = parseNumber(raw)
      if (n == null) return null
      return Math.min(10, Math.max(1, Math.round(n)))
    }
    case 'boolean':
      return parseBoolean(raw)
    case 'text': {
      const s = raw.trim()
      return s === '' ? null : s
    }
  }
}

/** Propozycja mapowania kolumna -> pole na podstawie nazw kolumn. */
export function suggestMapping(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {}
  const used = new Set<string>()
  for (const header of headers) {
    const h = header.toLowerCase().replace(/[_-]+/g, ' ')
    let best: ImportField | null = null
    let bestScore = 0
    for (const field of IMPORT_FIELDS) {
      for (const alias of field.aliases) {
        if (!h.includes(alias)) continue
        const score = alias.length + (h === alias ? 10 : 0)
        if (score > bestScore && !used.has(String(field.key))) {
          best = field
          bestScore = score
        }
      }
    }
    if (best) {
      map[header] = String(best.key)
      used.add(String(best.key))
    }
  }
  return map
}
