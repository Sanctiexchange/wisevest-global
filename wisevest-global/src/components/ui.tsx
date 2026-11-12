import { createContext, useCallback, useContext, useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

export function Logo({ to = '/', className }: { to?: string; className?: string }) {
  return (
    <Link to={to} className={cx('font-head text-xl font-bold', className)}>
      Wise<span className="text-neon">Vest</span> Global
    </Link>
  )
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger'; block?: boolean; loading?: boolean }
export function Button({ variant = 'primary', block, loading, className, children, disabled, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-[0.92rem] font-semibold transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0',
        variant === 'primary' && 'bg-brand text-[#05050a] shadow-glow',
        variant === 'ghost' && 'border border-line text-ink hover:border-violet',
        variant === 'danger' && 'border border-danger/45 text-danger',
        block && 'mt-5 w-full',
        className,
      )}
    >
      {loading ? 'Working…' : children}
    </button>
  )
}

export function Tag({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'ok' | 'warn' | 'bad' }) {
  return (
    <span
      className={cx(
        'mr-1.5 mt-1 inline-block rounded-full border px-2.5 py-0.5 text-[0.72rem]',
        tone === 'default' && 'border-orchid/35 text-orchid',
        tone === 'ok' && 'border-neon/40 text-neon',
        tone === 'warn' && 'border-amber/45 text-amber',
        tone === 'bad' && 'border-danger/45 text-danger',
      )}
    >
      {children}
    </span>
  )
}

export const riskTone = (r: string) => (r === 'High' ? 'bad' : 'warn') as 'bad' | 'warn'

export function Progress({ value }: { value: number }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-surface2" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full bg-brand transition-all" style={{ width: `${value}%` }} />
    </div>
  )
}

export function Field({ label, error, children, htmlFor }: { label: string; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label className="lbl" htmlFor={htmlFor}>{label}</label>
      {children}
      <div className="err" role="alert">{error}</div>
    </div>
  )
}

export function Segmented<T extends string>({ options, value, onChange, labels, disabledOptions = [] }: { options: readonly T[]; value: T; onChange: (v: T) => void; labels?: Record<string, string>; disabledOptions?: readonly T[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup">
      {options.map((o) => {
        const disabled = disabledOptions.includes(o)
        return (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={value === o}
          aria-disabled={disabled}
          disabled={disabled}
          onClick={() => onChange(o)}
          className={cx('rounded-xl border bg-bg px-2 py-3 text-[0.82rem] font-medium', disabled ? 'cursor-not-allowed border-line text-muted/60' : value === o ? 'border-neon text-ink ring-1 ring-neon' : 'border-line text-muted')}
        >
          {labels?.[o] ?? o}
        </button>
        )
      })}
    </div>
  )
}

export function Modal({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-[22px] border border-line bg-surface bg-brand-soft p-6">
        <div className="-mt-2 mb-2">
          <button type="button" onClick={onClose} aria-label="Back or close dialog" className="grid h-8 w-8 place-items-center rounded-full text-neon transition hover:bg-brand-soft">
            <span aria-hidden className="text-xl leading-none">←</span>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-[0.84rem] text-muted">
      <input type="checkbox" className="mt-0.5 h-[18px] w-[18px] flex-none accent-[#BBEC04]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  )
}

/* ---- Toasts ---- */
const ToastCtx = createContext<(m: string) => void>(() => {})
export const useToast = () => useContext(ToastCtx)
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState('')
  const show = useCallback((m: string) => {
    setMsg(m)
    setTimeout(() => setMsg(''), 2600)
  }, [])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div aria-live="polite" className={cx('pointer-events-none fixed bottom-24 left-1/2 z-[130] -translate-x-1/2 rounded-full border border-neon bg-surface2 px-5 py-3 text-sm transition', msg ? 'opacity-100' : 'translate-y-4 opacity-0')}>
        {msg}
      </div>
    </ToastCtx.Provider>
  )
}

export function RiskNotice({ className }: { className?: string }) {
  return (
    <p className={cx('fine', className)}>
      Risk warning: investments, including crypto assets, can lose value and you may lose some or all of your capital. Target returns are objectives, not guarantees. Figures shown are demo data.
    </p>
  )
}

export function PageTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-5">
      <h1 className="text-2xl font-bold md:text-[1.7rem]">{title}</h1>
      {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-8 text-center text-sm text-muted">{children}</div>
}
