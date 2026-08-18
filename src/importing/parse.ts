/** Parsery plików wejsciowych. Zadny plik nie opuszcza urządzenia - wszystko dzieje się lokalnie. */

export interface ParsedTable {
  headers: string[]
  rows: Array<Record<string, string>>
  delimiter: string
}

const DELIMITERS = [',', ';', '\t', '|']

export function detectDelimiter(sample: string): string {
  const firstLine = sample.split(/\r?\n/, 1)[0] ?? ''
  let best = ','
  let bestCount = -1
  for (const d of DELIMITERS) {
    const count = firstLine.split(d).length - 1
    if (count > bestCount) {
      best = d
      bestCount = count
    }
  }
  return best
}

/** Parser CSV obslugujacy cudzyslowy, przecinki w polach i znaki nowej linii w cudzyslowach. */
export function parseDelimited(text: string, delimiter = detectDelimiter(text)): ParsedTable {
  const clean = text.replace(/^﻿/, '')
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += ch
      continue
    }
    if (ch === '"') inQuotes = true
    else if (ch === delimiter) {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (ch !== '\r') field += ch
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ''))
  const headers = (nonEmpty[0] ?? []).map((h) => h.trim())
  return {
    headers,
    delimiter,
    rows: nonEmpty.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()]))),
  }
}

/**
 * Spłaszcza JSON do tabeli wierszy. Obsluguje tablice obiektow oraz obiekt,
 * ktorego jedna z wartości jest tablica obiektow (typowy uklad eksportow z aplikacji zdrowotnych).
 */
export function flattenJson(data: unknown): ParsedTable {
  const array = findArray(data)
  const rows = array.map((item) => flattenObject(item))
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))]
  return { headers, rows, delimiter: 'json' }
}

function findArray(data: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(data)) return data as Array<Record<string, unknown>>
  if (data && typeof data === 'object') {
    const candidates = Object.values(data as Record<string, unknown>)
      .filter((v): v is Array<Record<string, unknown>> => Array.isArray(v) && v.length > 0 && typeof v[0] === 'object')
      .sort((a, b) => b.length - a.length)
    if (candidates.length) return candidates[0]
  }
  return []
}

function flattenObject(obj: unknown, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  if (obj == null || typeof obj !== 'object') return prefix ? { [prefix]: String(obj ?? '') } : {}
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value != null && typeof value === 'object' && !Array.isArray(value)) Object.assign(out, flattenObject(value, path))
    else out[path] = value == null ? '' : Array.isArray(value) ? JSON.stringify(value) : String(value)
  }
  return out
}
