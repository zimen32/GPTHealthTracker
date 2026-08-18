import type { ReactNode } from 'react'

/**
 * Pola formularza Daily Check-in.
 *
 * Zasada wspolna: brak wartości = null (pole pominięte), nigdy zero. Każde pole można wyczyscic.
 */

export function FieldRow({ label, hint, children, right }: { label: string; hint?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label className="text-sm text-[var(--color-ink)]">{label}</label>
        {right ?? (hint ? <span className="text-xs text-[var(--color-muted)]">{hint}</span> : null)}
      </div>
      {children}
    </div>
  )
}

export function ScoreSlider({
  label,
  value,
  suggestion,
  onChange,
}: {
  label: string
  value: number | null | undefined
  /** Podpowiedź z ostatnich dni - pokazywana, dopóki pole jest puste. */
  suggestion?: number | null
  onChange: (v: number | null) => void
}) {
  const filled = value != null
  const shown = filled ? value : (suggestion ?? 5)
  return (
    <div className="mb-4 last:mb-0">
      <div className="flex items-baseline justify-between">
        <label className="text-sm">{label}</label>
        <div className="flex items-center gap-2">
          <span className={`text-sm tabular-nums ${filled ? 'text-[var(--color-accent)]' : 'text-[var(--color-muted)]'}`}>
            {filled ? `${value}/10` : suggestion != null ? `nie podano (ostatnio ~${suggestion})` : 'nie podano'}
          </span>
          {filled && (
            <button type="button" onClick={() => onChange(null)} className="text-xs text-[var(--color-muted)] underline">
              wyczyść
            </button>
          )}
        </div>
      </div>
      <input
        type="range"
        min={1}
        max={10}
        step={1}
        value={shown}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className={filled ? '' : 'opacity-60'}
      />
    </div>
  )
}

export function Counter({
  label,
  value,
  step = 1,
  unit,
  onChange,
}: {
  label: string
  value: number | null | undefined
  step?: number
  unit?: string
  onChange: (v: number | null) => void
}) {
  const current = value ?? 0
  return (
    <FieldRow
      label={label}
      right={
        value != null ? (
          <button type="button" onClick={() => onChange(null)} className="text-xs text-[var(--color-muted)] underline">
            wyczyść
          </button>
        ) : (
          <span className="text-xs text-[var(--color-muted)]">nie podano</span>
        )
      }
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={`${label} mniej`}
          onClick={() => onChange(Math.max(0, Math.round((current - step) * 100) / 100))}
          className="h-11 w-11 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] text-lg"
        >
          -
        </button>
        <div className="min-w-16 text-center text-lg tabular-nums">
          {value == null ? '-' : value}
          {unit && value != null && <span className="ml-1 text-xs text-[var(--color-muted)]">{unit}</span>}
        </div>
        <button
          type="button"
          aria-label={`${label} więcej`}
          onClick={() => onChange(Math.round((current + step) * 100) / 100)}
          className="h-11 w-11 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] text-lg"
        >
          +
        </button>
      </div>
    </FieldRow>
  )
}

export function NumberField({
  label,
  value,
  unit,
  placeholder,
  step,
  onChange,
}: {
  label: string
  value: number | null | undefined
  unit?: string
  placeholder?: string
  step?: number
  onChange: (v: number | null) => void
}) {
  return (
    <FieldRow label={label} hint={unit}>
      <input
        className="field tabular-nums"
        type="number"
        inputMode="decimal"
        step={step}
        placeholder={placeholder ?? 'nie podano'}
        value={value ?? ''}
        aria-label={label}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      />
    </FieldRow>
  )
}

export function TimeField({
  label,
  value,
  hint,
  onChange,
}: {
  label: string
  value: string | null | undefined
  hint?: string
  onChange: (v: string | null) => void
}) {
  return (
    <FieldRow label={label} hint={hint}>
      <input
        className="field tabular-nums"
        type="time"
        value={value ?? ''}
        aria-label={label}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
      />
    </FieldRow>
  )
}

export function TextField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string
  value: string | null | undefined
  placeholder?: string
  onChange: (v: string | null) => void
}) {
  return (
    <FieldRow label={label}>
      <input
        className="field"
        type="text"
        value={value ?? ''}
        placeholder={placeholder}
        aria-label={label}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
      />
    </FieldRow>
  )
}

export function TextArea({ label, value, onChange }: { label: string; value: string | null | undefined; onChange: (v: string | null) => void }) {
  return (
    <FieldRow label={label}>
      <textarea
        className="field min-h-20"
        value={value ?? ''}
        aria-label={label}
        placeholder="opcjonalnie"
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
      />
    </FieldRow>
  )
}

export function Toggle({ label, value, onChange }: { label: string; value: boolean | null | undefined; onChange: (v: boolean | null) => void }) {
  const on = value === true
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(on ? null : true)}
      className={`mb-2 flex w-full items-center justify-between rounded-xl border px-3 py-3 text-sm transition ${
        on ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10' : 'border-[var(--color-line)] bg-[var(--color-surface-2)]'
      }`}
    >
      <span>{label}</span>
      <span className={`text-xs ${on ? 'text-[var(--color-accent)]' : 'text-[var(--color-muted)]'}`}>{on ? 'tak' : 'nie zaznaczono'}</span>
    </button>
  )
}

export function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string | null | undefined
  options: Array<{ value: string; label: string }>
  onChange: (v: string | null) => void
}) {
  return (
    <FieldRow label={label}>
      <select className="field" value={value ?? ''} aria-label={label} onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}>
        <option value="">nie podano</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldRow>
  )
}
