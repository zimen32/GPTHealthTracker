/** Podstawowe statystyki opisowe. Wszystkie funkcje ignoruja wartosci brakujace. */

export function clean(values: Array<number | null | undefined>): number[] {
  return values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
}

export function mean(values: Array<number | null | undefined>): number | null {
  const v = clean(values)
  if (v.length === 0) return null
  return v.reduce((a, b) => a + b, 0) / v.length
}

export function median(values: Array<number | null | undefined>): number | null {
  const v = clean(values).sort((a, b) => a - b)
  if (v.length === 0) return null
  const mid = Math.floor(v.length / 2)
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2
}

export function quantile(values: Array<number | null | undefined>, q: number): number | null {
  const v = clean(values).sort((a, b) => a - b)
  if (v.length === 0) return null
  const pos = (v.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return v[lo] + (v[hi] - v[lo]) * (pos - lo)
}

export function stdDev(values: Array<number | null | undefined>): number | null {
  const v = clean(values)
  if (v.length < 2) return null
  const m = mean(v) as number
  return Math.sqrt(v.reduce((acc, x) => acc + (x - m) ** 2, 0) / (v.length - 1))
}

/**
 * Odchylenie od osobistej normy wyrazone w jednostkach rozrzutu (odporne na wartosci skrajne):
 * (wartosc - mediana) / (IQR / 1,349). Zwraca null, gdy rozrzut jest zerowy lub danych jest za malo.
 */
export function robustZScore(value: number, baseline: Array<number | null | undefined>): number | null {
  const v = clean(baseline)
  if (v.length < 7) return null
  const med = median(v) as number
  const q1 = quantile(v, 0.25) as number
  const q3 = quantile(v, 0.75) as number
  const scale = (q3 - q1) / 1.349
  if (scale === 0) return null
  return (value - med) / scale
}

export function percentChange(from: number, to: number): number | null {
  if (from === 0) return null
  return ((to - from) / Math.abs(from)) * 100
}

/** Srednia kroczaca; pozycje z mniejsza liczba danych niz `minPoints` zwracaja null. */
export function rollingMean(values: Array<number | null | undefined>, window: number, minPoints = 1): Array<number | null> {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1)
    const v = clean(slice)
    return v.length >= minPoints ? (mean(v) as number) : null
  })
}

function ranks(values: number[]): number[] {
  const indexed = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v)
  const out = new Array<number>(values.length)
  let i = 0
  while (i < indexed.length) {
    let j = i
    while (j + 1 < indexed.length && indexed[j + 1].v === indexed[i].v) j++
    const avgRank = (i + j) / 2 + 1
    for (let k = i; k <= j; k++) out[indexed[k].i] = avgRank
    i = j + 1
  }
  return out
}

/**
 * Korelacja rangowa Spearmana - odporna na nieliniowosc i na skale porzadkowe 1-10,
 * dlatego uzywana zamiast Pearsona dla ocen subiektywnych.
 */
export function spearman(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 3) return null
  const rx = ranks(xs)
  const ry = ranks(ys)
  const mx = mean(rx) as number
  const my = mean(ry) as number
  let num = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < rx.length; i++) {
    num += (rx[i] - mx) * (ry[i] - my)
    dx += (rx[i] - mx) ** 2
    dy += (ry[i] - my) ** 2
  }
  if (dx === 0 || dy === 0) return null
  return num / Math.sqrt(dx * dy)
}

export function round(value: number | null | undefined, digits = 1): number | null {
  if (value == null || !Number.isFinite(value)) return null
  const f = 10 ** digits
  return Math.round(value * f) / f
}

/** Formatowanie liczby po polsku (przecinek dziesietny). */
export function fmt(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '-'
  return value.toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: digits })
}

export function fmtPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '-'
  const sign = value > 0 ? '+' : ''
  return `${sign}${fmt(value, 1)}%`
}
