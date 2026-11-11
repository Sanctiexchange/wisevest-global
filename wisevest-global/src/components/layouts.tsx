import { useState } from 'react'
import { Link, NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom'
import { Logo, RiskNotice, cx } from './ui'
import { useStore } from '../store'
import { admin, auth, resetDemo } from '../api'
import { ADMIN_ACTORS } from '../lib/types'

export function PublicLayout() {
  const user = useStore((s) => s.user)
  const [open, setOpen] = useState(false)
  const home = user ? (user.role === 'admin' ? '/admin' : '/app') : '/login'
  return (
    <div>
      <nav className="sticky top-[env(safe-area-inset-top,0px)] z-50 border-b border-line bg-bg/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1120px] items-center justify-between px-5">
          <Logo />
          <button className="rounded-xl border border-line px-3 py-2 md:hidden" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(!open)}>☰</button>
          <div className={cx('absolute left-0 right-0 top-16 flex-col gap-5 border-b border-line bg-surface p-5 md:static md:flex md:flex-row md:items-center md:gap-7 md:border-0 md:bg-transparent md:p-0 text-sm text-muted', open ? 'flex' : 'hidden')} onClick={() => setOpen(false)}>
            <NavLink to="/projects" className="hover:text-ink">Investments</NavLink>
            <a href="/#calculator" className="hover:text-ink">Calculator</a>
            <a href="/#how" className="hover:text-ink">How it works</a>
            <a href="/#trust" className="hover:text-ink">Trust and risk</a>
            <Link to={home} className="rounded-full bg-brand px-5 py-2.5 text-center font-semibold text-[#05050a] shadow-glow">{user ? 'Open dashboard' : 'Sign in'}</Link>
          </div>
        </div>
      </nav>
      <Outlet />
      <footer className="border-t border-line py-8">
        <div className="mx-auto max-w-[1120px] px-5">
          <p className="mb-2 text-sm"><b>WiseVest Global</b> © 2026</p>
          <RiskNotice />
        </div>
      </footer>
    </div>
  )
}

type Item = { to: string; label: string; icon: string; end?: boolean }

function Shell({ items, role, children, extra }: { items: Item[]; role: string; children: React.ReactNode; extra?: React.ReactNode }) {
  const navigate = useNavigate()
  const user = useStore((s) => s.user)
  const out = () => { auth.logout(); navigate('/') }
  return (
    <div className="grid min-h-screen md:grid-cols-[240px_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col gap-1 border-r border-line bg-surface p-5 md:flex">
        <Logo />
        <div className="mb-4 mt-1 text-[0.72rem] uppercase tracking-widest text-orchid">{role}</div>
        {items.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => cx('flex items-center gap-3 rounded-xl border px-3.5 py-3 text-sm font-medium', isActive ? 'border-neon/30 bg-brand-soft text-ink' : 'border-transparent text-muted hover:text-ink')}>
            <span aria-hidden>{i.icon}</span>{i.label}
          </NavLink>
        ))}
        <div className="mt-auto space-y-3">
          {extra}
          <div className="text-xs text-muted">{user?.email}</div>
          <button onClick={out} className="text-sm text-muted hover:text-ink">Sign out</button>
        </div>
      </aside>
      <main className="mx-auto w-full max-w-[1100px] px-4 pb-28 pt-6 md:px-7 md:pb-10">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-[70] flex overflow-x-auto border-t border-line bg-surface/95 px-1 pt-1.5 backdrop-blur-xl md:hidden" style={{ paddingBottom: 'calc(6px + env(safe-area-inset-bottom,0px))' }}>
        {items.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => cx('flex min-w-[64px] flex-1 flex-col items-center gap-0.5 py-1.5 text-[0.68rem]', isActive ? 'text-neon' : 'text-muted')}>
            <span className="text-lg" aria-hidden>{i.icon}</span>{i.label}
          </NavLink>
        ))}
        <button type="button" onClick={out} className="flex min-w-[64px] flex-1 flex-col items-center gap-0.5 py-1.5 text-[0.68rem] text-muted">
          <span className="text-lg" aria-hidden>⇥</span>Sign out
        </button>
      </nav>
    </div>
  )
}

export function ClientLayout() {
  const user = useStore((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'client') return <Navigate to="/admin" replace />
  const items: Item[] = [
    { to: '/app', label: 'Home', icon: '▦', end: true },
    { to: '/app/investments', label: 'Invest', icon: '◈' },
    { to: '/app/deposit', label: 'Deposit', icon: '↓' },
    { to: '/app/withdraw', label: 'Withdraw', icon: '↑' },
    { to: '/app/transactions', label: 'History', icon: '≡' },
  ]
  const banner =
    user.kyc === 'approved' ? null : (
      <div className="mb-5 rounded-xl border border-amber/30 bg-amber/10 p-4 text-sm text-amber">
        {user.kyc === 'not_started' && <>Verify your identity to deposit, invest and withdraw. <Link className="underline" to="/register">Start verification</Link></>}
        {user.kyc === 'under_review' && <>Your verification is under review. Deposits, investing and withdrawals unlock once it is approved. (Demo: approve it from the admin console.)</>}
        {user.kyc === 'rejected' && <>Your verification was not approved. <Link className="underline" to="/register">Submit new documents</Link></>}
      </div>
    )
  return (
    <Shell items={items} role="Investor">
      {banner}
      <Outlet />
    </Shell>
  )
}

export function AdminLayout() {
  const navigate = useNavigate()
  const user = useStore((s) => s.user)
  const actor = useStore((s) => s.adminActor)
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'admin') {
    return (
      <div className="grid min-h-screen place-items-center px-5">
        <div className="card max-w-lg text-center">
          <h1 className="text-2xl font-bold">Admin access required</h1>
          <p className="mt-2 text-sm text-muted">You’re signed in as an investor. Sign out, then choose “Continue as demo admin” on the sign-in page.</p>
          <button
            type="button"
            className="mt-5 rounded-full bg-brand px-6 py-3 text-sm font-semibold text-[#05050a] shadow-glow"
            onClick={() => { auth.logout(); navigate('/login') }}
          >
            Sign out and continue
          </button>
        </div>
      </div>
    )
  }
  const items: Item[] = [
    { to: '/admin', label: 'Overview', icon: '▦', end: true },
    { to: '/admin/kyc', label: 'KYC', icon: '🛡' },
    { to: '/admin/withdrawals', label: 'Withdraw', icon: '↑' },
    { to: '/admin/deposits', label: 'Deposits', icon: '↓' },
    { to: '/admin/projects', label: 'Projects', icon: '◈' },
    { to: '/admin/audit', label: 'Audit', icon: '≡' },
  ]
  const extra = (
    <div>
      <label className="mb-1 block text-xs text-muted" htmlFor="actor">Acting as (demo of dual control)</label>
      <select id="actor" className="input !py-2 text-sm" value={actor} onChange={(e) => admin.setActor(e.target.value)}>
        {ADMIN_ACTORS.map((a) => <option key={a}>{a}</option>)}
      </select>
      <button onClick={resetDemo} className="mt-3 text-xs text-muted underline">Reset demo data</button>
    </div>
  )
  return (
    <Shell items={items} role="Admin console" extra={extra}>
      <div className="mb-4 md:hidden">
        <label className="mb-1 block text-xs text-muted" htmlFor="actor-m">Acting as</label>
        <select id="actor-m" className="input !py-2 text-sm" value={actor} onChange={(e) => admin.setActor(e.target.value)}>
          {ADMIN_ACTORS.map((a) => <option key={a}>{a}</option>)}
        </select>
      </div>
      <Outlet />
    </Shell>
  )
}
