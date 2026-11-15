import { useEffect, useState } from 'react'
import { Link, NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom'
import { Logo, RiskNotice, cx, useToast } from './ui'
import { useStore } from '../store'
import { admin, auth, resetDemo, ApiError, wallet } from '../api'
import { ADMIN_ACTORS } from '../lib/types'
import SupportModal from './SupportModal'
import { isSupabaseConfigured } from '../lib/supabase'

export function PublicLayout() {
  const user = useStore((s) => s.user)
  const [open, setOpen] = useState(false)
  const home = user ? (user.role !== 'client' ? '/admin' : '/app') : '/login'
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
  const toast = useToast()
  const user = useStore((s) => s.user)
  const out = async () => {
    try {
      await auth.logout()
      navigate('/')
    } catch (issue) {
      toast(issue instanceof ApiError ? issue.message : 'Could not sign out.')
    }
  }
  return (
    <>
    <div className="grid min-h-screen md:grid-cols-[240px_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col gap-1 border-r border-[#0F3D33] bg-[#0B3D3B] p-5 md:flex">
        <Logo className="text-white [&>span]:!text-[#BBEC04]" />
        <div className="mb-4 mt-1 text-[0.72rem] uppercase tracking-widest text-[#BBEC04]">{role}</div>
        {items.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => cx('flex items-center gap-3 rounded-xl border px-3.5 py-3 text-sm font-medium transition-colors', isActive ? 'border-[#0F3D33] bg-[#0F3D33] text-[#BBEC04]' : 'border-transparent text-white/75 hover:bg-white/10 hover:text-white')}>
            <span aria-hidden>{i.icon}</span>{i.label}
          </NavLink>
        ))}
        <div className="mt-auto space-y-3">
          {extra}
          <div className="text-xs text-white/70">{user?.email}</div>
          <button onClick={out} className="text-sm text-white/70 hover:text-white">Sign out</button>
        </div>
      </aside>
      <main className="mx-auto w-full max-w-[1100px] px-4 pb-28 pt-6 md:px-7 md:pb-10">{children}</main>
      <nav aria-label="Dashboard navigation" className="fixed inset-x-0 bottom-0 z-[70] flex overflow-x-auto border-t border-[#0F3D33] bg-[#0B3D3B] px-1 pt-1.5 backdrop-blur-xl md:hidden" style={{ paddingBottom: 'calc(6px + env(safe-area-inset-bottom,0px))' }}>
        {items.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => cx('flex min-w-[64px] flex-1 flex-col items-center gap-0.5 py-1.5 text-[0.68rem]', isActive ? 'font-semibold text-[#BBEC04]' : 'text-white/70 hover:text-white')}>
            <span className="text-lg" aria-hidden>{i.icon}</span>{i.label}
          </NavLink>
        ))}
        <button type="button" onClick={out} className="flex min-w-[64px] flex-1 flex-col items-center gap-0.5 py-1.5 text-[0.68rem] text-white/70 hover:text-white">
          <span className="text-lg" aria-hidden>⇥</span>Sign out
        </button>
      </nav>
    </div>
    <SupportModal />
    </>
  )
}

export function ClientLayout() {
  const user = useStore((s) => s.user)
  const authReady = useStore((s) => s.authReady)
  const [loadError, setLoadError] = useState('')
  useEffect(() => {
    if (!isSupabaseConfigured || !user || user.role !== 'client' || user.accountStatus === 'suspended') return
    let active = true
    setLoadError('')
    void wallet.loadOwnRequests()
      .then(() => { if (active) setLoadError('') })
      .catch((issue: unknown) => {
        if (active) setLoadError(issue instanceof ApiError ? issue.message : 'Could not load your request history.')
      })
    return () => { active = false }
  }, [user?.id, user?.role, user?.accountStatus])
  if (isSupabaseConfigured && !authReady) return <div className="grid min-h-screen place-items-center text-muted" role="status">Restoring sign-in session…</div>
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'client') return <Navigate to="/admin" replace />
  if (user.accountStatus === 'suspended') return <div className="grid min-h-screen place-items-center px-5"><div className="card max-w-lg text-center"><h1 className="text-2xl font-bold">Account suspended</h1><p className="mt-2 text-sm text-muted">Contact support for help with this account.</p></div></div>
  const items: Item[] = [
    { to: '/app', label: 'Home', icon: '▦', end: true },
    { to: '/app/investments', label: 'Invest', icon: '◈' },
    { to: '/app/deposit', label: 'Deposit', icon: '↓' },
    { to: '/app/withdraw', label: 'Withdraw', icon: '↑' },
    { to: '/app/transactions', label: 'Transaction', icon: '≡' },
    { to: '/app/settings', label: 'Settings', icon: '⚙' },
  ]
  const banner =
    isSupabaseConfigured ? (
      <div className="mb-5 rounded-xl border border-amber/30 bg-amber/10 p-4 text-sm text-amber">
        KYC documents and deposit/withdrawal requests are stored for manual review. This prototype does not process payments, change balances, or execute payouts.
      </div>
    ) : user.kyc === 'approved' ? null : (
      <div className="mb-5 rounded-xl border border-amber/30 bg-amber/10 p-4 text-sm text-amber">
        {user.kyc === 'not_started' && <>Verify your identity to deposit, invest and withdraw. <Link className="underline" to="/register">Start verification</Link></>}
        {user.kyc === 'under_review' && <>Your verification is under review. Deposits, investing and withdrawals unlock once it is approved. (Demo: approve it from the admin console.)</>}
        {user.kyc === 'rejected' && <>Your verification was not approved. <Link className="underline" to="/register">Submit new documents</Link></>}
      </div>
    )
  return (
    <Shell items={items} role="Investor">
      {banner}
      {loadError && <div className="mb-4 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger" role="alert">{loadError}</div>}
      <Outlet />
    </Shell>
  )
}

export function AdminLayout() {
  const navigate = useNavigate()
  const toast = useToast()
  const user = useStore((s) => s.user)
  const authReady = useStore((s) => s.authReady)
  const actor = useStore((s) => s.adminActor)
  const [loadError, setLoadError] = useState('')
  useEffect(() => {
    if (!isSupabaseConfigured || !user || user.role === 'client') return
    let active = true
    setLoadError('')
    void admin.loadConsole().catch((issue: unknown) => {
      if (active) setLoadError(issue instanceof ApiError ? issue.message : 'Could not load the admin console.')
    })
    return () => { active = false }
  }, [user?.id, user?.role])
  if (isSupabaseConfigured && !authReady) return <div className="grid min-h-screen place-items-center text-muted" role="status">Restoring sign-in session…</div>
  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'client') {
    return (
      <div className="grid min-h-screen place-items-center px-5">
        <div className="card max-w-lg text-center">
          <h1 className="text-2xl font-bold">Admin access required</h1>
          <p className="mt-2 text-sm text-muted">
            {isSupabaseConfigured
              ? 'This account does not have trusted admin access. Sign in or register with the account you want to use, then ask a Supabase project owner to set its app_metadata.role to "super_admin". Sign out and back in after the change; the admin console will open automatically.'
              : 'You’re signed in as an investor. Sign out, then choose “Continue as demo admin” on the sign-in page.'}
          </p>
          <button
            type="button"
            className="mt-5 rounded-full bg-brand px-6 py-3 text-sm font-semibold text-[#05050a] shadow-glow"
            onClick={async () => {
              try {
                await auth.logout()
                navigate('/login')
              } catch (issue) {
                toast(issue instanceof ApiError ? issue.message : 'Could not sign out.')
              }
            }}
          >
            Sign out and continue
          </button>
        </div>
      </div>
    )
  }
  if (user.accountStatus === 'suspended' && user.role !== 'super_admin') {
    return <div className="grid min-h-screen place-items-center px-5"><div className="card max-w-lg text-center"><h1 className="text-2xl font-bold">Admin access suspended</h1><p className="mt-2 text-sm text-muted">Contact a super admin for help.</p></div></div>
  }
  const items: Item[] = [
    { to: '/admin', label: 'Overview', icon: '▦', end: true },
    { to: '/admin/users', label: 'Users', icon: '♙' },
    { to: '/admin/kyc', label: 'KYC', icon: '🛡' },
    { to: '/admin/withdrawals', label: 'Withdraw', icon: '↑' },
    { to: '/admin/deposits', label: 'Deposits', icon: '↓' },
    { to: '/admin/projects', label: 'Projects', icon: '◈' },
    { to: '/admin/audit', label: 'Audit', icon: '≡' },
  ]
  const extra = !isSupabaseConfigured && (
    <div>
      <label className="mb-1 block text-xs text-white/80" htmlFor="actor">Acting as (demo of dual control)</label>
      <select id="actor" className="input !py-2 text-sm" value={actor} onChange={(e) => admin.setActor(e.target.value)}>
        {ADMIN_ACTORS.map((a) => <option key={a}>{a}</option>)}
      </select>
      <button onClick={resetDemo} className="mt-3 text-xs text-[#BBEC04] underline">Reset demo data</button>
    </div>
  )
  return (
    <Shell items={items} role={user.role === 'super_admin' ? 'Super admin console' : 'Admin console'} extra={extra}>
      {isSupabaseConfigured && (
        <div className="mb-5 rounded-xl border border-amber/30 bg-amber/10 p-4 text-sm text-amber" role="status">
          Financial requests and KYC reviews are stored for manual review only. Verifying a deposit does not credit a balance, and approving a withdrawal does not send funds.
        </div>
      )}
      {loadError && <div className="mb-4 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger" role="alert">{loadError}</div>}
      {!isSupabaseConfigured && <div className="mb-4 md:hidden">
        <label className="mb-1 block text-xs text-muted" htmlFor="actor-m">Acting as</label>
        <select id="actor-m" className="input !py-2 text-sm" value={actor} onChange={(e) => admin.setActor(e.target.value)}>
          {ADMIN_ACTORS.map((a) => <option key={a}>{a}</option>)}
        </select>
      </div>}
      <Outlet />
    </Shell>
  )
}
