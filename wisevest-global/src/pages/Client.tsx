import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { wallet, auth, ApiError } from '../api'
import { money, parseAmount, signed } from '../lib/format'
import { DEMO_USER_ID, portfolioHistory } from '../lib/seed'
import type { Method } from '../lib/types'
import { MINIMUM_DEPOSIT } from '../lib/settings'
import { Button, Empty, Field, PageTitle, Progress, RiskNotice, Segmented, Tag, cx, riskTone, useToast } from '../components/ui'
import { Donut, LineChart } from '../components/charts'

const catColor: Record<string, string> = { Bitcoin: '#0F3D33', Energy: '#BBEC04', 'Real estate': '#82978E' }

function useHoldings() {
  const investments = useStore((s) => s.investments)
  const projects = useStore((s) => s.projects)
  return useMemo(() => investments.map((i) => ({ ...i, project: projects.find((p) => p.id === i.projectId)! })).filter((i) => i.project), [investments, projects])
}

export function Dashboard() {
  const user = useStore((s) => s.user)!
  const cash = useStore((s) => s.cash)
  const holdings = useHoldings()
  const invested = holdings.reduce((a, h) => a + h.amount, 0)
  const value = holdings.reduce((a, h) => a + h.value, 0)
  const pl = value - invested
  const pct = invested ? (pl / invested) * 100 : 0
  const byCat = Object.values(holdings.reduce<Record<string, { label: string; value: number; color: string }>>((acc, h) => {
    const k = h.project.category
    acc[k] = acc[k] ?? { label: k, value: 0, color: catColor[k] }
    acc[k].value += h.value
    return acc
  }, {}))
  const cards = [
    ['Total portfolio', money(value + cash, 2), invested ? `${signed(pl)} reported gain` : 'Fund your account to begin', pl >= 0 ? 'text-neon' : 'text-danger', true],
    ['Invested', money(invested, 2), `${holdings.length} active project${holdings.length === 1 ? '' : 's'}`, 'text-muted', false],
    ['Available cash', money(cash, 2), 'Ready to invest or withdraw', 'text-muted', false],
    ['Reported return', invested ? `${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(1)}%` : '—', 'Since first investment', 'text-muted', false],
  ] as const
  return (
    <>
      <PageTitle title={`Welcome back, ${user.name.split(' ')[0]}`} sub="Reported values reflect the latest company valuation." />
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {cards.map(([k, v, s, tone, hero]) => (
          <div key={k} className={cx('card', hero && 'bg-brand-soft')}>
            <div className="text-xs uppercase tracking-wider text-muted">{k}</div>
            <div className="mt-1 font-head text-2xl font-bold">{v}</div>
            <div className={cx('text-[0.82rem]', tone)}>{s}</div>
          </div>
        ))}
      </div>
      {holdings.length === 0 ? (
        <div className="card mt-4"><Empty>No investments yet. <Link className="text-neon" to="/projects">Browse projects</Link> or <Link className="text-neon" to="/app/deposit">deposit funds</Link>.</Empty></div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <div className="card">
            <h2 className="mb-2 text-lg font-bold">Portfolio value</h2>
            {user.id === DEMO_USER_ID ? (<><LineChart values={portfolioHistory.values} labels={portfolioHistory.labels} /><p className="fine">Demo history. Values can fall as well as rise.</p></>) : <Empty>Your value history builds up as valuations are published.</Empty>}
          </div>
          <div className="card"><h2 className="mb-2 text-lg font-bold">Allocation</h2><Donut items={byCat} /></div>
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2.5">
        <Link to="/app/deposit" className="rounded-full bg-brand px-6 py-3 text-sm font-semibold text-[#05050a] shadow-glow">Deposit funds</Link>
        <Link to="/app/investments" className="rounded-full border border-line px-6 py-3 text-sm font-semibold">View investments</Link>
      </div>
      <RiskNotice className="mt-6" />
    </>
  )
}

export function Investments() {
  const holdings = useHoldings()
  return (
    <>
      <PageTitle title="Your investments" />
      {holdings.length === 0 ? <div className="card"><Empty>You have no investments yet. <Link className="text-neon" to="/projects">Browse projects</Link></Empty></div> : (
        <div className="grid gap-4 sm:grid-cols-[repeat(auto-fit,minmax(290px,1fr))]">
          {holdings.map((h) => {
            const pl = h.value - h.amount
            return (
              <div key={h.id} className="card flex flex-col gap-2.5">
                <div className="flex items-center justify-between gap-2"><h2 className="font-head text-lg font-bold">{h.project.name}</h2><Tag tone={riskTone(h.project.risk)}>{h.project.risk} risk</Tag></div>
                <div><Tag>{h.project.category}</Tag></div>
                {[['Invested', money(h.amount, 2)], ['Reported value', money(h.value, 2)], ['Term', h.project.term], ['Invested on', h.date]].map(([k, v]) => <div key={k} className="flex justify-between text-sm text-muted"><span>{k}</span><b className="font-medium text-ink">{v}</b></div>)}
                <div className="flex justify-between text-sm text-muted"><span>Change</span><b className={cx('font-medium', pl >= 0 ? 'text-neon' : 'text-danger')}>{signed(pl)}</b></div>
                <Progress value={h.project.raisedPct} />
                <Link to={`/projects/${h.project.id}`} className="text-sm text-neon">Project details</Link>
              </div>
            )
          })}
        </div>
      )}
      <p className="fine mt-4">Reported values reflect the latest company valuation and are not a guaranteed sale price.</p>
    </>
  )
}

const METHODS = ['BTC', 'USDT', 'USDC', 'Bank'] as const
const labelMap: Record<string, string> = { BTC: '₿ BTC', USDT: '◎ USDT', USDC: '◎ USDC', Bank: '🏦 Bank · Coming soon' }
const NETWORK: Record<Method, string> = { BTC: 'Bitcoin network', USDT: 'TRC-20 or ERC-20', USDC: 'ERC-20', Bank: 'Bank transfer' }
const ADDR: Record<Method, string> = {
  BTC: 'bc1q-demo-address-replace-with-real-wallet',
  USDT: 'T-demo-address-replace-with-real-wallet',
  USDC: '0x-demo-address-replace-with-real-wallet',
  Bank: 'Account name: WiseVest Global Ltd\nBank and account number: shown here once configured\nReference: WV-DEMO-1042',
}

export function Deposit() {
  const navigate = useNavigate()
  const toast = useToast()
  const approved = useStore((s) => s.user?.kyc === 'approved')
  const [method, setMethod] = useState<Method>('BTC')
  const [amount, setAmount] = useState('')
  const [err, setErr] = useState('')
  const [shown, setShown] = useState(false)
  const [busy, setBusy] = useState(false)
  const generate = () => {
    const n = parseAmount(amount)
    if (!approved) return setErr('Complete identity verification first.')
    if (!Number.isFinite(n) || n < MINIMUM_DEPOSIT) return setErr(`Minimum deposit is ${money(MINIMUM_DEPOSIT, 0)}.`)
    setErr(''); setShown(true)
  }
  const sent = async () => {
    setBusy(true)
    try { await wallet.deposit(method, parseAmount(amount)); toast('Deposit logged. Credited after confirmation.'); navigate('/app/transactions') }
    catch (x) { setErr(x instanceof ApiError ? x.message : 'Something went wrong.') }
    finally { setBusy(false) }
  }
  return (
    <div className="card max-w-[560px]">
      <h1 className="text-2xl font-bold">Deposit funds</h1>
      <p className="mb-2 mt-1 text-sm text-muted">Choose a payment method and amount.</p>
      <label className="lbl">Method</label>
      <Segmented options={METHODS} value={method} onChange={(m) => { setMethod(m); setShown(false) }} labels={labelMap} disabledOptions={['Bank']} />
      <Field label="Amount (USD)" htmlFor="d" error={err}><input id="d" inputMode="decimal" className="input" placeholder={`Minimum ${money(MINIMUM_DEPOSIT, 0)}`} value={amount} onChange={(e) => { setAmount(e.target.value); setShown(false) }} /></Field>
      <div className="fine">Network: <b className="text-ink">{NETWORK[method]}</b> · Minimum deposit {money(MINIMUM_DEPOSIT, 0)}</div>
      {!shown ? <Button block onClick={generate}>Generate deposit details</Button> : (
        <>
          <div className="mt-4 whitespace-pre-line break-all rounded-2xl border border-dashed border-violet bg-bg p-4 font-mono text-[0.82rem]">{ADDR[method]}</div>
          <div className="mt-3 rounded-xl border border-amber/30 bg-amber/10 p-3 text-[0.82rem] text-amber">
            {method === 'Bank' ? 'Use the exact reference so we can match your payment.' : `Send only ${method} on the ${NETWORK[method]}. Funds sent on another network may be lost. This is a demo address.`}
          </div>
          <Button variant="ghost" block loading={busy} onClick={sent}>I have sent the payment</Button>
        </>
      )}
    </div>
  )
}

export function Withdraw() {
  const navigate = useNavigate()
  const toast = useToast()
  const user = useStore((s) => s.user)!
  const cash = useStore((s) => s.cash)
  const [method, setMethod] = useState<Method>('BTC')
  const [f, setF] = useState({ amount: '', dest: '', code: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true); setErr('')
    try { await wallet.withdraw(method, parseAmount(f.amount), f.dest, f.code); toast('Withdrawal requested. Under security review.'); navigate('/app/transactions') }
    catch (x) { setErr(x instanceof ApiError ? x.message : 'Something went wrong.') }
    finally { setBusy(false) }
  }
  return (
    <div className="card max-w-[560px]">
      <h1 className="text-2xl font-bold">Withdraw</h1>
      <p className="mb-2 mt-1 text-sm text-muted">Available: <b className="text-ink">{money(cash, 2)}</b></p>
      {!user.twoFa && (
        <div className="my-3 rounded-xl border border-amber/30 bg-amber/10 p-3 text-sm text-amber">
          Two-factor authentication is required before your first withdrawal. <button className="underline" onClick={() => auth.enable2fa()}>Turn on 2FA (demo)</button>
        </div>
      )}
      <label className="lbl">Method</label>
      <Segmented options={METHODS} value={method} onChange={setMethod} labels={labelMap} disabledOptions={['Bank']} />
      <Field label="Amount (USD)" htmlFor="wa"><input id="wa" inputMode="decimal" className="input" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
      <Field label={method === 'Bank' ? 'Bank account details' : 'Wallet address'} htmlFor="wd"><input id="wd" autoComplete="off" className="input" value={f.dest} onChange={(e) => setF({ ...f, dest: e.target.value })} /></Field>
      <Field label="Authenticator code" htmlFor="wc" error={err}><input id="wc" type="password" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="6-digit code" className="input" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>
      <div className="rounded-xl border border-amber/30 bg-amber/10 p-3 text-[0.82rem] text-amber">Withdrawals are reviewed for security and usually complete within 24 hours. Double-check the destination: crypto transfers cannot be reversed.</div>
      <Button block loading={busy} onClick={submit}>Request withdrawal</Button>
    </div>
  )
}

const TYPES = ['All', 'Deposit', 'Withdrawal', 'Investment'] as const
export function Transactions() {
  const txs = useStore((s) => s.txs)
  const [f, setF] = useState<(typeof TYPES)[number]>('All')
  const rows = txs.filter((t) => f === 'All' || t.type === f)
  return (
    <>
      <PageTitle title="Transactions" />
      <div className="mb-3.5 flex flex-wrap gap-2">
        {TYPES.map((t) => <button key={t} onClick={() => setF(t)} className={cx('rounded-full border px-4 py-2 text-sm', f === t ? 'border-neon text-ink' : 'border-line text-muted')}>{t === 'All' ? 'All' : t + 's'}</button>)}
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-muted"><tr>{['Date', 'Type', 'Details', 'Amount', 'Status'].map((h) => <th key={h} className="border-b border-line p-2.5 font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td className="border-b border-line p-3">{t.date}</td><td className="border-b border-line p-3">{t.type}</td><td className="border-b border-line p-3">{t.detail}</td>
                <td className={cx('border-b border-line p-3', t.amount > 0 && 'text-neon')}>{signed(t.amount)}</td>
                <td className="border-b border-line p-3"><Tag tone={t.status === 'Completed' ? 'ok' : t.status === 'Rejected' ? 'bad' : 'warn'}>{t.status}</Tag></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <Empty>No transactions yet.</Empty>}
      </div>
    </>
  )
}
