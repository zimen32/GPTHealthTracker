/**
 * Model danych aplikacji.
 *
 * Zasady obowiazujace w calym module:
 * - każde pole pomiarowe jest opcjonalne; pominiecie pola to normalny stan, nie błąd,
 * - wartości liczbowe i jednostki są przechowywane osobno,
 * - godziny są zapisywane jako lokalny czas zegarowy 'HH:mm' (opis w docs/PRIVACY.md),
 * - nic nie jest nadpisywane bezśladowo: każda zmiana trafia do tabeli `revisions`.
 */

export type IsoDate = string // 'YYYY-MM-DD'
export type ClockTime = string // 'HH:mm'
export type IsoTimestamp = string // ISO-8601 z offsetem

export type DataSource = 'manual' | 'import'

/** Skala subiektywna 1-10. */
export type Score = number

export interface DailyEntry {
  /** Klucz główny = data dnia (dla snu: dzień wybudzenia). */
  date: IsoDate

  // --- samopoczucie (skale 1-10) ---
  energy?: Score | null
  stress?: Score | null
  irritability?: Score | null
  recovery?: Score | null
  mood?: Score | null
  clarity?: Score | null

  // --- sen ---
  bedtime?: ClockTime | null
  sleepStart?: ClockTime | null
  wakeTime?: ClockTime | null
  totalSleepMinutes?: number | null
  deepSleepMinutes?: number | null
  remSleepMinutes?: number | null
  lightSleepMinutes?: number | null
  awakeMinutes?: number | null
  awakenings?: number | null
  sleepScore?: number | null
  restingHeartRate?: number | null
  hrv?: number | null
  spo2?: number | null
  /** Skad pochodzą dane o snie dla tego dnia. */
  sleepSource?: 'manual' | 'huawei' | 'import' | null

  // --- aktywność ---
  steps?: number | null
  walkingMinutes?: number | null
  sedentaryMinutes?: number | null
  trainingDone?: boolean | null
  trainingType?: string | null
  trainingMinutes?: number | null
  trainingIntensity?: Score | null

  // --- styl zycia ---
  /** Liczba porcji espresso (każda kawa jest wielokrotnością espresso). */
  caffeineShots?: number | null
  caffeineLastTime?: ClockTime | null
  alcoholUnits?: number | null
  waterMl?: number | null
  unusualStress?: boolean | null
  illness?: boolean | null
  notes?: string | null

  createdAt?: IsoTimestamp
  updatedAt?: IsoTimestamp
  /** true, jesli wpis byl edytowany po pierwszym zapisie (szczegóły w `revisions`). */
  edited?: boolean
}

export type MeasurementType =
  | 'body_weight'
  | 'waist'
  | 'chest'
  | 'arm'
  | 'thigh'
  | 'calf'
  | 'blood_pressure'
  | 'resting_heart_rate'

export interface Measurement {
  id?: number
  date: IsoDate
  measuredAt?: IsoTimestamp | null
  type: MeasurementType | string
  /** Dla ciśnienia: wartość skurczowa. */
  value: number
  /** Dla ciśnienia: wartość rozkurczowa. */
  value2?: number | null
  unit: string
  source: DataSource
  notes?: string | null
  createdAt?: IsoTimestamp
  updatedAt?: IsoTimestamp
  edited?: boolean
}

export interface MeasurementSchedule {
  type: MeasurementType | string
  intervalDays: number
  enabled: boolean
}

export type LabCategory =
  | 'cbc'
  | 'metabolic'
  | 'lipids'
  | 'liver'
  | 'thyroid'
  | 'iron'
  | 'vitamins'
  | 'inflammation'
  | 'urine'
  | 'other'

export interface LabTest {
  /** Stabilny klucz parametru, np. 'ferritin'. */
  key: string
  name: string
  category: LabCategory
  defaultUnit: string
  /** true dla parametrów opisowych (np. badanie ogólne moczu). */
  textual?: boolean
  isCustom?: boolean
  sortOrder?: number
}

export interface LabResult {
  id?: number
  testKey: string
  date: IsoDate
  /** Wartość liczbowa; null tylko dla parametrów opisowych. */
  value?: number | null
  /** Wynik opisowy (np. treść badania ogolnego moczu). */
  valueText?: string | null
  /** Snapshot jednostki - nie referencja do katalogu. */
  unit: string
  /** Snapshot zakresu referencyjnego tego laboratorium z dnia badania. */
  refMin?: number | null
  refMax?: number | null
  refText?: string | null
  laboratory?: string | null
  fasting?: boolean | null
  notes?: string | null
  source: DataSource
  createdAt?: IsoTimestamp
  updatedAt?: IsoTimestamp
  edited?: boolean
}

export type RevisionEntity = 'daily_entry' | 'measurement' | 'lab_result' | 'lab_test' | 'settings'
export type RevisionChange = 'create' | 'update' | 'delete'

export interface Revision {
  id?: number
  entity: RevisionEntity
  entityId: string
  changedAt: IsoTimestamp
  changeType: RevisionChange
  before?: unknown
  after?: unknown
  actor: 'user' | 'import' | 'migration'
}

export interface ImportMapping {
  id?: number
  name: string
  kind: 'daily_csv' | 'lab_csv' | 'huawei_json'
  /** kolumna w pliku -> pole aplikacji */
  columnMap: Record<string, string>
  createdAt?: IsoTimestamp
  lastUsedAt?: IsoTimestamp | null
}

export interface Settings {
  id: 'app'
  /** Domyślnie 63 mg kofeiny na porcje espresso; służy tylko do raportowania. */
  mgPerEspresso: number
  /** Metryki subiektywne widoczne od razu w Daily Check-in. */
  visibleScores: Array<'energy' | 'stress' | 'irritability' | 'recovery' | 'mood' | 'clarity'>
  reminderEnabled: boolean
  reminderTime: ClockTime
  /** Próg krótkiego snu (minuty) używany w porownaniach warunkowych. */
  shortSleepMinutes: number
  lastBackupAt?: IsoTimestamp | null
  aiExportWarningDismissed?: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'app',
  mgPerEspresso: 63,
  visibleScores: ['energy', 'stress', 'irritability', 'recovery', 'mood'],
  reminderEnabled: false,
  reminderTime: '21:00',
  shortSleepMinutes: 390,
  lastBackupAt: null,
  aiExportWarningDismissed: false,
}
