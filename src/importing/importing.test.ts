import { describe, expect, it } from 'vitest'
import { LAB_CATALOG } from '../domain/catalog'
import type { DailyEntry } from '../domain/types'
import { buildDailyPreview, buildLabPreview, slugify } from './apply'
import { parseClock, parseDate, parseDurationMinutes, parseNumber, suggestMapping } from './fields'
import { flattenJson, parseDelimited } from './parse'

describe('parsowanie plikow', () => {
  it('czyta CSV z cudzyslowami i przecinkami w polu', () => {
    const table = parseDelimited('date,steps,notes\n2026-08-17,8200,"praca, dyzur"\n')
    expect(table.headers).toEqual(['date', 'steps', 'notes'])
    expect(table.rows[0]).toEqual({ date: '2026-08-17', steps: '8200', notes: 'praca, dyzur' })
  })

  it('rozpoznaje separator srednikowy uzywany przez polskie arkusze', () => {
    const table = parseDelimited('date;value\n2026-08-17;7,5\n')
    expect(table.delimiter).toBe(';')
    expect(table.rows[0].value).toBe('7,5')
  })

  it('splaszcza JSON z zagniezdzona tablica rekordow', () => {
    const table = flattenJson({
      meta: { app: 'x' },
      records: [
        { date: '2026-08-17', sleep: { total: 412, deep: 58 } },
        { date: '2026-08-18', sleep: { total: 395, deep: 51 } },
      ],
    })
    expect(table.headers).toEqual(['date', 'sleep.total', 'sleep.deep'])
    expect(table.rows[1]['sleep.total']).toBe('395')
  })
})

describe('konwersje wartosci', () => {
  it('czyta liczby z przecinkiem dziesietnym', () => {
    expect(parseNumber('7,5')).toBe(7.5)
    expect(parseNumber(' 41 ')).toBe(41)
    expect(parseNumber('')).toBeNull()
  })

  it('czyta daty w formatach polskich i ISO oraz znaczniki czasu', () => {
    expect(parseDate('2026-08-17')).toBe('2026-08-17')
    expect(parseDate('17.08.2026')).toBe('2026-08-17')
    expect(parseDate('2026/8/7')).toBe('2026-08-07')
    expect(parseDate('nie-data')).toBeNull()
  })

  it('czyta godziny z roznych formatow', () => {
    expect(parseClock('23:15')).toBe('23:15')
    expect(parseClock('7:05')).toBe('07:05')
    expect(parseClock('2026-08-17T06:40:00+02:00')).toBe('06:40')
  })

  it('czyta czas trwania z minut, godzin i sekund', () => {
    expect(parseDurationMinutes('412')).toBe(412)
    expect(parseDurationMinutes('6:52')).toBe(412)
    expect(parseDurationMinutes('6h 52m')).toBe(412)
    expect(parseDurationMinutes('7,5 h')).toBe(450)
    expect(parseDurationMinutes('24720')).toBe(412) // sekundy z eksportu urzadzenia
  })

  it('proponuje mapowanie kolumn na podstawie ich nazw', () => {
    const map = suggestMapping(['Date', 'Total sleep (min)', 'Deep sleep', 'REM', 'Resting HR', 'HRV', 'Steps', 'Cos nieznanego'])
    expect(map['Date']).toBe('date')
    expect(map['Total sleep (min)']).toBe('totalSleepMinutes')
    expect(map['Deep sleep']).toBe('deepSleepMinutes')
    expect(map['REM']).toBe('remSleepMinutes')
    expect(map['Resting HR']).toBe('restingHeartRate')
    expect(map['HRV']).toBe('hrv')
    expect(map['Steps']).toBe('steps')
    expect(map['Cos nieznanego']).toBeUndefined()
  })
})

describe('podglad importu danych dziennych', () => {
  const table = parseDelimited(
    ['date,total_sleep,deep,rem,rhr,hrv,steps', '2026-08-16,6:52,58,71,61,42,8200', '2026-08-17,7:10,64,80,59,47,10400', 'brak-daty,7:00,,,,,'].join('\n'),
  )
  const map = suggestMapping(table.headers)

  it('rozpoznaje nowe dni, aktualizacje i wiersze bledne', () => {
    const existing: DailyEntry[] = [{ date: '2026-08-16', energy: 5 }]
    const preview = buildDailyPreview(table, map, existing)
    expect(preview.counts.new).toBe(1)
    expect(preview.counts.update).toBe(1)
    expect(preview.counts.invalid).toBe(1)
    expect(preview.rows[0].values.totalSleepMinutes).toBe(412)
    expect(preview.rows[2].problems[0]).toContain('brak rozpoznanej daty')
  })

  it('oznacza konflikt, gdy istniejaca wartosc rozni sie od importowanej', () => {
    const existing: DailyEntry[] = [{ date: '2026-08-16', totalSleepMinutes: 400 }]
    const preview = buildDailyPreview(table, map, existing)
    const row = preview.rows[0]
    expect(row.status).toBe('conflict')
    expect(row.conflicts).toEqual([{ field: 'totalSleepMinutes', existing: 400, incoming: 412 }])
    expect(preview.counts.conflict).toBe(1)
  })

  it('wylicza dlugosc snu z godzin, gdy plik nie zawiera sumy', () => {
    const t = parseDelimited('date,sleep start,wake\n2026-08-17,23:40,06:20\n')
    const preview = buildDailyPreview(t, suggestMapping(t.headers), [])
    expect(preview.rows[0].values.totalSleepMinutes).toBe(400)
  })

  it('oznacza zaimportowane dane snu zrodlem "import"', () => {
    const preview = buildDailyPreview(table, map, [])
    expect(preview.rows[0].values.sleepSource).toBe('import')
  })
})

describe('podglad importu wynikow badan', () => {
  const csv = [
    'date,test,value,unit,ref_min,ref_max,laboratory,fasting,notes',
    '2026-07-14,Ferrytyna,38,ng/ml,30,400,Lab X,tak,',
    '14.07.2026,TSH,2:1,mIU/l,0.27,4.2,Lab X,tak,',
    '2026-07-14,Wlasny parametr,12,mg/l,,,Lab X,nie,',
    ',Ferrytyna,,,,,,,',
  ].join('\n')
  const table = parseDelimited(csv)
  const map = Object.fromEntries(table.headers.map((h) => [h, h]))

  it('mapuje nazwy parametrow na katalog i zachowuje jednostke oraz zakres z pliku', () => {
    const preview = buildLabPreview(table, map, LAB_CATALOG)
    expect(preview[0].status).toBe('ok')
    expect(preview[0].result).toMatchObject({ testKey: 'ferritin', value: 38, unit: 'ng/ml', refMin: 30, refMax: 400, laboratory: 'Lab X', fasting: true })
  })

  it('oznacza nieznany parametr jako nowy zamiast go odrzucac', () => {
    const preview = buildLabPreview(table, map, LAB_CATALOG)
    expect(preview[2].status).toBe('new_parameter')
    expect(preview[2].result?.testKey).toBe('wlasny_parametr')
  })

  it('odrzuca wiersz bez daty i bez wartosci, opisujac problem', () => {
    const preview = buildLabPreview(table, map, LAB_CATALOG)
    expect(preview[3].status).toBe('invalid')
    expect(preview[3].problems).toContain('brak rozpoznanej daty')
    expect(preview[3].problems).toContain('brak wartosci wyniku')
  })

  it('tworzy klucz parametru bez polskich znakow', () => {
    expect(slugify('Zelazo (Fe) - surowica')).toBe('zelazo_fe_surowica')
    expect(slugify('Witamina D 25(OH)')).toBe('witamina_d_25_oh')
  })
})
