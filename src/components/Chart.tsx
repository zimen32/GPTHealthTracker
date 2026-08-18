import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { SeriesPoint } from '../analytics/trends'
import { formatDateShortPl } from '../lib/date'

const AXIS = { stroke: '#94a3bd', fontSize: 11 }

/** Wykres metryki dziennej: punkty surowe + średnia kroczaca 7 dni (i 30 dni dla dluzszych zakresow). */
export function MetricChart({
  series,
  formatValue,
  show30 = false,
  height = 180,
}: {
  series: SeriesPoint[]
  formatValue?: (v: number | null) => string
  show30?: boolean
  height?: number
}) {
  const data = series.map((p) => ({ ...p, label: formatDateShortPl(p.date) }))
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -14 }}>
          <CartesianGrid stroke="#263450" vertical={false} />
          <XAxis dataKey="label" {...AXIS} tickLine={false} minTickGap={28} />
          <YAxis {...AXIS} tickLine={false} width={44} domain={['auto', 'auto']} />
          <Tooltip
            contentStyle={{ background: '#131c2e', border: '1px solid #263450', borderRadius: 12, fontSize: 12 }}
            labelStyle={{ color: '#94a3bd' }}
            formatter={(value, name) => [formatValue && value != null ? formatValue(Number(value)) : String(value ?? '-'), String(name)]}
          />
          <Line type="monotone" dataKey="value" name="wartość" stroke="#7dd3fc" strokeWidth={1} dot={{ r: 1.6 }} connectNulls={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="rolling7" name="średnia 7 dni" stroke="#5eead4" strokeWidth={2.4} dot={false} connectNulls isAnimationActive={false} />
          {show30 && (
            <Line type="monotone" dataKey="rolling30" name="średnia 30 dni" stroke="#fbbf24" strokeWidth={1.8} strokeDasharray="4 3" dot={false} connectNulls isAnimationActive={false} />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Wykres wyników badania z pasmem zakresu referencyjnego laboratorium. */
export function LabChart({
  points,
  refMin,
  refMax,
  height = 200,
}: {
  points: Array<{ date: string; value: number | null }>
  refMin?: number | null
  refMax?: number | null
  height?: number
}) {
  const data = points.map((p) => ({ ...p, label: formatDateShortPl(p.date) }))
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -14 }}>
          <CartesianGrid stroke="#263450" vertical={false} />
          <XAxis dataKey="label" {...AXIS} tickLine={false} minTickGap={20} />
          <YAxis {...AXIS} tickLine={false} width={48} domain={['auto', 'auto']} />
          <Tooltip contentStyle={{ background: '#131c2e', border: '1px solid #263450', borderRadius: 12, fontSize: 12 }} labelStyle={{ color: '#94a3bd' }} />
          {refMin != null && refMax != null && <ReferenceArea y1={refMin} y2={refMax} fill="#5eead4" fillOpacity={0.08} stroke="none" />}
          {refMin != null && <ReferenceLine y={refMin} stroke="#5eead4" strokeDasharray="3 3" strokeOpacity={0.6} />}
          {refMax != null && <ReferenceLine y={refMax} stroke="#5eead4" strokeDasharray="3 3" strokeOpacity={0.6} />}
          <Line type="monotone" dataKey="value" name="wynik" stroke="#7dd3fc" strokeWidth={2.2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
