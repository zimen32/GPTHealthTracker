import type { ReactNode } from 'react'

export function Screen({ title, subtitle, children, action }: { title: string; subtitle?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-5 pb-28">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-[var(--color-muted)]">{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card p-4 ${className}`}>{children}</div>
}

export function Section({ title, hint, children, right }: { title: string; hint?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="card mb-3 p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-wide text-[var(--color-accent)] uppercase">{title}</h2>
        {right}
      </div>
      {hint && <p className="mb-3 text-xs text-[var(--color-muted)]">{hint}</p>}
      {children}
    </section>
  )
}

type ButtonProps = {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'ghost' | 'danger' | 'subtle'
  disabled?: boolean
  full?: boolean
  type?: 'button' | 'submit'
  title?: string
}

export function Button({ children, onClick, variant = 'subtle', disabled, full, type = 'button', title }: ButtonProps) {
  const styles: Record<string, string> = {
    primary: 'bg-[var(--color-accent)] text-[#06231f] font-semibold',
    ghost: 'bg-transparent border border-[var(--color-line)] text-[var(--color-ink)]',
    subtle: 'bg-[var(--color-surface-2)] border border-[var(--color-line)] text-[var(--color-ink)]',
    danger: 'bg-[#4c1d24] border border-[#7f1d29] text-[#fecdd3]',
  }
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl px-4 py-2.5 text-sm transition active:scale-[0.98] disabled:opacity-40 ${styles[variant]} ${full ? 'w-full' : ''}`}
    >
      {children}
    </button>
  )
}

export function Chip({ children, active, onClick }: { children: ReactNode; active?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs whitespace-nowrap transition ${
        active
          ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/15 text-[var(--color-accent)]'
          : 'border-[var(--color-line)] bg-[var(--color-surface-2)] text-[var(--color-muted)]'
      }`}
    >
      {children}
    </button>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-[var(--color-muted)]">{children}</p>
}

export function Note({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'warn' }) {
  return (
    <p className={`text-xs leading-relaxed ${tone === 'warn' ? 'text-[var(--color-warn)]' : 'text-[var(--color-muted)]'}`}>{children}</p>
  )
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="fixed inset-x-0 bottom-20 z-50 flex justify-center px-4">
      <div className="card max-w-md px-4 py-2.5 text-sm shadow-lg">{message}</div>
    </div>
  )
}
