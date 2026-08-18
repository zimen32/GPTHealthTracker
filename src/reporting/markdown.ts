import { analyzeCompleteness, staleLabTests } from '../analytics/completeness'
import { CORRELATION_DISCLAIMER, computeAllCorrelations } from '../analytics/correlations'
import { METRIC_BY_KEY } from '../analytics/metrics'
import { compareByThreshold, summarizeMetric, type MetricSummary } from '../analytics/trends'
import { MEASUREMENT_LABELS } from '../domain/catalog'
import type { LabResult, Measurement, MeasurementType } from '../domain/types'
import { addDays, formatDatePl, formatMinutes } from '../lib/date'
import { fmt, fmtPercent, mean, round } from '../lib/stats'
import type { ExportDataset } from './dataset'

/**
 * Raport tekstowy do wklejenia zewnętrznemu asystentowi AI.
 *
 * Zasada jezykowa (pilnowana testem): opisujemy wyłącznie to, co pokazuja dane -
 * bez rozpoznan, bez ocen stanu zdrowia i bez zaleceń.
 */

const SLEEP_METRICS = ['totalSleepMinutes', 'deepSleepMinutes', 'remSleepMinutes', 'lightSleepMinutes', 'awakeMinutes', 'sleepScore', 'hrv', 'restingHeartRate', 'awakenings']
const WELLBEING_METRICS = ['energy', 'stress', 'irritability', 'recovery', 'mood', 'clarity']
const ACTIVITY_METRICS = ['steps', 'trainingMinutes', 'walkingMinutes']
const TREND_METRICS = ['totalSleepMinutes', 'deepSleepMinutes', 'hrv', 'restingHeartRate', 'energy', 'stress', 'irritability', 'recovery', 'mood', 'steps']

function line(label: string, value: string): string {
  return `- ${label}: ${value}`
}

/** "6 h 32 min (poprzedni okres: 7 h 05 min, -7,8%; dni z danymi: 30/30)" */
function summaryText(s: MetricSummary | null): string {
  if (!s || s.n === 0) return 'brak danych'
  const parts = [s.metric.format(s.mean)]
  const extra: string[] = []
  if (s.previousMean != null && s.previousN > 0) {
    extra.push(`poprzedni okres: ${s.metric.format(s.previousMean)}`)
    if (s.changePercent != null) extra.push(fmtPercent(s.changePercent))
  }
  extra.push(`dni z danymi: ${s.n}/${s.days}`)
  parts.push(`(${extra.join(', ')})`)
  return parts.join(' ')
}

function metricLine(d: ExportDataset, key: string): string {
  const metric = METRIC_BY_KEY[key]
  return line(metric.label, summaryText(summarizeMetric(d.entriesWithHistory, key, d.from, d.to)))
}

function latestMeasurement(measurements: Measurement[], type: MeasurementType): Measurement | null {
  const rows = measurements.filter((m) => m.type === type)
  return rows.length ? rows[rows.length - 1] : null
}

function bodySection(d: ExportDataset): string[] {
  const out: string[] = []
  const weight = d.measurements.filter((m) => m.type === 'body_weight')
  if (weight.length) {
    const first = weight[0]
    const last = weight[weight.length - 1]
    const delta = round(last.value - first.value, 1)
    out.push(
      line(
        'Masa ciała',
        `${fmt(last.value, 1)} ${last.unit} (${formatDatePl(last.date)}); zmiana w okresie: ${delta != null && delta > 0 ? '+' : ''}${fmt(delta, 1)} ${last.unit}; pomiarów: ${weight.length}`,
      ),
    )
  } else out.push(line('Masa ciała', 'brak pomiarów w okresie'))

  for (const type of ['waist', 'chest', 'arm', 'thigh', 'calf'] as MeasurementType[]) {
    const m = latestMeasurement(d.measurements, type)
    if (m) out.push(line(MEASUREMENT_LABELS[type], `${fmt(m.value, 1)} ${m.unit} (${formatDatePl(m.date)})`))
  }

  const bp = latestMeasurement(d.measurements, 'blood_pressure')
  const bpRows = d.measurements.filter((m) => m.type === 'blood_pressure')
  if (bp) {
    const avgSys = mean(bpRows.map((m) => m.value))
    const avgDia = mean(bpRows.map((m) => m.value2 ?? null))
    out.push(
      line(
        'Ciśnienie krwi',
        `ostatni pomiar ${fmt(bp.value, 0)}/${fmt(bp.value2, 0)} mmHg (${formatDatePl(bp.date)}); średnia z okresu: ${fmt(avgSys, 0)}/${fmt(avgDia, 0)} mmHg z ${bpRows.length} pomiarów`,
      ),
    )
  } else out.push(line('Ciśnienie krwi', 'brak pomiarów w okresie'))

  const rhr = latestMeasurement(d.measurements, 'resting_heart_rate')
  if (rhr) out.push(line('Tętno spoczynkowe (pomiar ręczny)', `${fmt(rhr.value, 0)} bpm (${formatDatePl(rhr.date)})`))
  return out
}

function labTable(d: ExportDataset): string[] {
  if (d.labResults.length === 0) return ['Brak wyników badań w wybranym okresie.']
  const header = ['| Date | Test | Value | Unit | Reference | Lab | Fasting | Change vs previous |', '|---|---|---|---|---|---|---|---|']
  const previousByKey = new Map(d.previousLabResults.map((r) => [r.testKey, r]))
  const seen = new Map<string, LabResult>()

  const rows = d.labResults.map((r) => {
    const name = d.labTests.find((t) => t.key === r.testKey)?.name ?? r.testKey
    const reference = r.refMin != null || r.refMax != null ? `${fmt(r.refMin, 2)}-${fmt(r.refMax, 2)}` : (r.refText ?? '-')
    const prev = seen.get(r.testKey) ?? previousByKey.get(r.testKey)
    seen.set(r.testKey, r)
    let change = '-'
    if (prev && prev.value != null && r.value != null) {
      const diff = r.value - prev.value
      const sameUnit = prev.unit === r.unit
      change = sameUnit
        ? `${diff > 0 ? '+' : ''}${fmt(round(diff, 2), 2)} vs ${fmt(prev.value, 2)} (${formatDatePl(prev.date)})`
        : `poprzednio ${fmt(prev.value, 2)} ${prev.unit} (${formatDatePl(prev.date)}) - inna jednostka, bez przeliczenia`
    }
    const value = r.value != null ? fmt(r.value, 2) : (r.valueText ?? '-')
    const fasting = r.fasting == null ? '-' : r.fasting ? 'tak' : 'nie'
    return `| ${r.date} | ${name} | ${value} | ${r.unit} | ${reference} | ${r.laboratory ?? '-'} | ${fasting} | ${change} |`
  })
  return [...header, ...rows]
}

function trendsSection(d: ExportDataset): string[] {
  const out: string[] = []
  for (const key of TREND_METRICS) {
    const s = summarizeMetric(d.entriesWithHistory, key, d.from, d.to)
    if (!s || s.n === 0) continue
    if (s.previousMean != null && s.changePercent != null && s.previousN >= 3) {
      out.push(
        `- ${s.metric.label}: średnia ${s.metric.format(s.mean)} wobec ${s.metric.format(s.previousMean)} w poprzednim okresie ${s.days} dni (${fmtPercent(s.changePercent)}; dni z danymi: ${s.n}/${s.days} i ${s.previousN}/${s.days}).`,
      )
    } else {
      out.push(`- ${s.metric.label}: średnia ${s.metric.format(s.mean)} (dni z danymi: ${s.n}/${s.days}; brak porównywalnego poprzedniego okresu).`)
    }
  }
  return out.length ? out : ['Za malo danych, aby opisac zmiany w czasie.']
}

function correlationsSection(d: ExportDataset, shortSleepMinutes: number): string[] {
  const out: string[] = []
  const correlations = computeAllCorrelations(d.entries).filter((c) => c.hasEnoughData && c.strength !== 'brak')
  for (const c of correlations) {
    out.push(
      `- ${c.label}${c.nextDay ? ' (efekt liczony dla dnia następnego)' : ''}: Spearman rho = ${fmt(round(c.rho, 2), 2)} (zależność ${c.direction}, ${c.strength}; n = ${c.n}${c.preliminary ? '; wynik wstępny, poniżej 30 dni' : ''}).`,
    )
  }

  const cmp = compareByThreshold(d.entries, 'totalSleepMinutes', shortSleepMinutes, 'irritability')
  if (cmp && cmp.belowN >= 5 && cmp.atOrAboveN >= 5) {
    out.push(
      `- Rozdrażnienie w dniach ze snem poniżej ${formatMinutes(shortSleepMinutes)}: ${fmt(cmp.belowMean, 1)} (n = ${cmp.belowN}) wobec ${fmt(cmp.atOrAboveMean, 1)} (n = ${cmp.atOrAboveN}) w pozostalych dniach.`,
    )
  }
  const energyCmp = compareByThreshold(d.entries, 'totalSleepMinutes', shortSleepMinutes, 'energy')
  if (energyCmp && energyCmp.belowN >= 5 && energyCmp.atOrAboveN >= 5) {
    out.push(
      `- Energia w dniach ze snem poniżej ${formatMinutes(shortSleepMinutes)}: ${fmt(energyCmp.belowMean, 1)} (n = ${energyCmp.belowN}) wobec ${fmt(energyCmp.atOrAboveMean, 1)} (n = ${energyCmp.atOrAboveN}) w pozostalych dniach.`,
    )
  }

  if (out.length === 0) return [`Brak zależności z wystarczajaca liczba danych (wymagane minimum 14 dni wspolnych obserwacji). ${CORRELATION_DISCLAIMER}`]
  return [`(uwzgledniono wyłącznie zależności z n >= 14 dni; ${CORRELATION_DISCLAIMER})`, ...out]
}

function missingDataSection(d: ExportDataset): string[] {
  const completeness = analyzeCompleteness(d.entries, d.from, d.to)
  const out: string[] = []
  out.push(line('Dni z jakimikolwiek danymi', `${completeness.daysWithAnyData}/${completeness.totalDays}`))

  const important = ['totalSleepMinutes', 'hrv', 'restingHeartRate', 'energy', 'stress', 'steps']
  for (const key of important) {
    const field = completeness.fields.find((f) => f.key === key)
    if (field && field.missingDays > 0) out.push(line(field.label, `brak danych w ${field.missingDays}/${field.totalDays} dni`))
  }

  const measurementTypes: MeasurementType[] = ['body_weight', 'waist', 'blood_pressure']
  for (const type of measurementTypes) {
    const count = d.measurements.filter((m) => m.type === type).length
    if (count === 0) out.push(line(MEASUREMENT_LABELS[type], 'brak pomiarów w okresie'))
  }

  const stale = staleLabTests(d.labTests, [...d.labResults, ...d.previousLabResults], 180, d.to)
  if (stale.length) {
    const noResult = stale.filter((s) => s.lastDate === null).map((s) => s.label)
    const old = stale.filter((s) => s.lastDate !== null)
    if (noResult.length) out.push(line('Badania bez żadnego wyniku', noResult.join(', ')))
    for (const s of old) out.push(line(`Badanie starsze niż 180 dni: ${s.label}`, `ostatni wynik ${formatDatePl(s.lastDate as string)} (${s.daysAgo} dni temu)`))
  }
  return out
}

function recentChangesSection(d: ExportDataset): string[] {
  const window = 14
  const to = d.to
  const from = addDays(to, -(window - 1))
  const out: string[] = []
  for (const key of TREND_METRICS) {
    const s = summarizeMetric(d.entriesWithHistory, key, from, to)
    if (!s || s.n === 0 || s.previousN === 0 || s.changeAbsolute == null) continue
    const sign = s.changeAbsolute > 0 ? '+' : ''
    out.push(
      `- ${s.metric.label}: ${s.metric.format(s.mean)} wobec ${s.metric.format(s.previousMean)} w poprzednich ${window} dniach (${sign}${fmt(round(s.changeAbsolute, 1), 1)} ${s.metric.unit}, ${fmtPercent(s.changePercent)}).`,
    )
  }
  return out.length ? [`Ostatnie ${window} dni wobec poprzednich ${window} dni:`, ...out] : ['Za malo danych, aby porownac ostatnie 14 dni z poprzednimi.']
}

export function buildMarkdownReport(d: ExportDataset): string {
  const completeness = analyzeCompleteness(d.entries, d.from, d.to)
  const caffeine = summarizeMetric(d.entriesWithHistory, 'caffeineShots', d.from, d.to)
  const alcohol = summarizeMetric(d.entriesWithHistory, 'alcoholUnits', d.from, d.to)
  const water = summarizeMetric(d.entriesWithHistory, 'waterMl', d.from, d.to)
  const caffeineTimes = d.entries.map((e) => e.caffeineLastTime).filter((t): t is string => Boolean(t))
  const trainingDays = d.entries.filter((e) => e.trainingDone === true || (e.trainingMinutes ?? 0) > 0).length
  const watchDays = d.entries.filter((e) => e.sleepSource && e.sleepSource !== 'manual').length
  const notes = d.entries.filter((e) => e.notes && e.notes.trim().length > 0)
  const illnessDays = d.entries.filter((e) => e.illness === true).length
  const stressDays = d.entries.filter((e) => e.unusualStress === true).length

  const md: string[] = []
  md.push('# Health Tracking Report', '')
  md.push('## Period')
  md.push(
    `${d.from} - ${d.to} (${d.days} dni; dni z danymi: ${completeness.daysWithAnyData}/${completeness.totalDays}${d.days ? ` = ${Math.round((completeness.daysWithAnyData / d.days) * 100)}%` : ''})`,
  )
  md.push(`Raport wygenerowany: ${d.generatedAt}`, '')

  md.push('## Sleep')
  for (const key of SLEEP_METRICS) md.push(metricLine(d, key))
  md.push(line('Dni z danymi z urządzenia noszonego', `${watchDays}/${d.days}`), '')

  md.push('## Subjective wellbeing')
  md.push('Skale subiektywne 1-10 (10 = najwyzsza wartość danej cechy).')
  for (const key of WELLBEING_METRICS) md.push(metricLine(d, key))
  md.push('')

  md.push('## Activity')
  for (const key of ACTIVITY_METRICS) md.push(metricLine(d, key))
  md.push(line('Dni z treningiem', `${trainingDays}/${d.days}`))
  const types = [...new Set(d.entries.map((e) => e.trainingType).filter(Boolean))]
  if (types.length) md.push(line('Typy treningow', types.join(', ')))
  md.push('')

  md.push('## Body')
  md.push(...bodySection(d))
  md.push('')

  md.push('## Lifestyle')
  md.push(
    line(
      'Kofeina',
      caffeine && caffeine.n > 0
        ? `${fmt(caffeine.mean, 1)} porcji espresso/dzień (~${fmt((caffeine.mean ?? 0) * d.settings.mgPerEspresso, 0)} mg; dni z danymi: ${caffeine.n}/${caffeine.days})`
        : 'brak danych',
    ),
  )
  if (caffeineTimes.length) md.push(line('Typowa godzina ostatniej kofeiny', `${caffeineTimes.sort()[Math.floor(caffeineTimes.length / 2)]} (mediana z ${caffeineTimes.length} dni)`))
  md.push(line('Alkohol', alcohol && alcohol.n > 0 ? `${fmt(alcohol.mean, 2)} jednostki/dzień (dni z danymi: ${alcohol.n}/${alcohol.days})` : 'brak danych'))
  md.push(line('Woda', water && water.n > 0 ? `${fmt((water.mean ?? 0) / 1000, 1)} l/dzień (dni z danymi: ${water.n}/${water.days})` : 'brak danych'))
  md.push(line('Dni oznaczone jako nietypowo stresujace', `${stressDays}/${d.days}`))
  md.push(line('Dni oznaczone jako infekcja/choroba', `${illnessDays}/${d.days}`))
  md.push(line('Notatki', notes.length ? `${notes.length} wpisów (treść w sekcji Appendix)` : 'brak'))
  md.push('')

  md.push('## Laboratory results')
  md.push(...labTable(d))
  md.push('')

  md.push('## Trends')
  md.push(...trendsSection(d))
  md.push('')

  md.push('## Potential correlations')
  md.push(...correlationsSection(d, d.settings.shortSleepMinutes))
  md.push('')

  md.push('## Missing data')
  md.push(...missingDataSection(d))
  md.push('')

  md.push('## Recent changes')
  md.push(...recentChangesSection(d))
  md.push('')

  md.push('## Context for the analyst')
  md.push(
    '- Dane pochodzą z własnego dziennika (skale subiektywne) oraz z zegarka; fazy snu i HRV z urządzenia noszonego nie są pomiarem klinicznym.',
    '- Wartości laboratoryjne zapisane są razem z jednostka i zakresem referencyjnym tego laboratorium z dnia badania; zakresy roznych laboratoriow moga się roznic.',
    '- Zestawienie jest opisem zebranych danych, bez interpretacji medycznej i bez zaleceń.',
    `- ${CORRELATION_DISCLAIMER}`,
    '',
  )

  if (notes.length) {
    md.push('## Appendix - daily notes')
    for (const e of notes) md.push(`- ${e.date}: ${e.notes?.replace(/\n+/g, ' ')}`)
    md.push('')
  }

  return md.join('\n')
}
