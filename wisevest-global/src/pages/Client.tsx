import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { wallet, auth, ApiError } from '../api'
import { downloadCsv, money, parseAmount, signed, today } from '../lib/format'
import { DEMO_USER_ID, portfolioHistory } from '../lib/seed'
import type { DisputeReason, Method, Tx } from '../lib/types'
import { MINIMUM_DEPOSIT, MINIMUM_WITHDRAWAL } from '../lib/settings'
import { Button, Empty, Field, Modal, PageTitle, Progress, RiskNotice, Segmented, Tag, cx, riskTone, useToast } from '../components/ui'
import { Donut, LineChart } from '../components/charts'
import { isSupabaseConfigured } from '../lib/supabase'

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
    ['Available cash', money(cash, 2), isSupabaseConfigured ? 'balance' : 'Ready to invest or withdraw', 'text-muted', false],
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

function SupabaseDepositRequest() {
  const navigate = useNavigate()
  const toast = useToast()
  const [method, setMethod] = useState<Method>('BTC')
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      await wallet.deposit(method, parseAmount(amount), reference)
      toast('Deposit request submitted for manual review.')
      navigate('/app/transactions')
    } catch (issue) {
      setError(issue instanceof ApiError ? issue.message : 'Could not submit the deposit request.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="card mx-auto w-full max-w-[560px]">
      <h1 className="text-2xl font-bold">Submit deposit for review</h1>
      <label className="lbl">Method</label>
      <Segmented options={METHODS} value={method} onChange={setMethod} labels={{ BTC: 'BTC', USDT: 'USDT', USDC: 'USDC', Bank: 'Bank' }} />
      <Field label="Amount (USD)" htmlFor="deposit-amount">
        <input id="deposit-amount" type="number" min={MINIMUM_DEPOSIT} step="0.01" className="input" value={amount} onChange={(event) => setAmount(event.target.value)} />
      </Field>
      <Field label="External transaction/reference ID" htmlFor="deposit-reference" error={error}>
        <input id="deposit-reference" autoComplete="off" className="input" value={reference} onChange={(event) => setReference(event.target.value)} />
      </Field>
      <Button block loading={busy} onClick={() => { void submit() }}>Submit for review</Button>
    </div>
  )
}

function SupabaseWithdrawalRequest() {
  const navigate = useNavigate()
  const toast = useToast()
  const user = useStore((state) => state.user)!
  const balance = useStore((state) => state.cash)
  const [method, setMethod] = useState<Method>('BTC')
  const [amount, setAmount] = useState('')
  const [destination, setDestination] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      await wallet.withdraw(method, parseAmount(amount), destination, code)
      toast('Withdrawal request submitted for review.')
      navigate('/app/transactions')
    } catch (issue) {
      setError(issue instanceof ApiError ? issue.message : 'Could not submit the withdrawal request.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="card mx-auto w-full max-w-[560px]">
      <h1 className="text-2xl font-bold">Submit withdrawal for review</h1>
      <p className="mb-3 mt-2 text-sm text-muted">Available test balance: <b className="text-ink">{money(balance, 2)}</b></p>
      <p className="mb-3 rounded-xl border border-amber/30 bg-amber/10 p-3 text-sm text-amber" role="status">
        Requests reserve your test balance. This app records requests for manual review; it does not send funds.
      </p>
      {user.kyc !== 'approved' && <p className="err" role="alert">Complete identity verification before requesting a withdrawal.</p>}
      <label className="lbl">Method</label>
      <Segmented options={METHODS} value={method} onChange={setMethod} labels={{ BTC: 'BTC', USDT: 'USDT', USDC: 'USDC', Bank: 'Bank' }} />
      <Field label="Amount (USD)" htmlFor="withdrawal-amount">
        <input id="withdrawal-amount" type="number" min={MINIMUM_WITHDRAWAL} step="0.01" className="input" value={amount} onChange={(event) => setAmount(event.target.value)} />
      </Field>
      <Field label="Destination" htmlFor="withdrawal-destination">
        <input id="withdrawal-destination" autoComplete="off" className="input" value={destination} onChange={(event) => setDestination(event.target.value)} />
      </Field>
      <Field label="Authenticator code" htmlFor="withdrawal-code" error={error}>
        <input id="withdrawal-code" type="password" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="input" value={code} onChange={(event) => setCode(event.target.value)} />
      </Field>
      <Button block loading={busy} disabled={user.kyc !== 'approved'} onClick={() => { void submit() }}>Submit for review</Button>
    </div>
  )
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
  if (isSupabaseConfigured) return <SupabaseDepositRequest />
  return (
    <div className="card mx-auto w-full max-w-[560px]">
      <Link to="/app" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted transition hover:text-neon">
        <span aria-hidden className="text-lg leading-none">←</span>
        Back to dashboard
      </Link>
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
  if (isSupabaseConfigured) return <SupabaseWithdrawalRequest />
  return (
    <div className="card mx-auto w-full max-w-[560px]">
      <Link to="/app" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted transition hover:text-neon">
        <span aria-hidden className="text-lg leading-none">←</span>
        Back to dashboard
      </Link>
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

const TYPES = ['All', 'Deposit', 'Withdrawal', 'Investment', 'Adjustment'] as const
const DISPUTE_REASONS: { value: DisputeReason; label: string }[] = [
  { value: 'DELAYED', label: 'Transaction is delayed' },
  { value: 'NOT_RECEIVED', label: 'Funds were not received' },
  { value: 'INCORRECT_AMOUNT', label: 'Incorrect amount' },
  { value: 'OTHER', label: 'Other' },
]

export function Transactions() {
  const txs = useStore((s) => s.txs)
  const disputes = useStore((s) => s.disputes)
  const [selectedTransaction, setSelectedTransaction] = useState<Tx | null>(null)
  const [reason, setReason] = useState<DisputeReason | ''>('')
  const [description, setDescription] = useState('')
  const [disputeError, setDisputeError] = useState('')
  const [disputeBusy, setDisputeBusy] = useState(false)
  const [disputeSubmitted, setDisputeSubmitted] = useState(false)
  const [f, setF] = useState<(typeof TYPES)[number]>('All')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'All' | Tx['status']>('All')
  const searchTerm = search.trim().toLowerCase()
  const rows = txs.filter((transaction) => {
    const matchesType = f === 'All' || transaction.type === f
    const matchesStatus = statusFilter === 'All' || transaction.status === statusFilter
    const disputeStatus = disputes.some((dispute) => dispute.transactionId === transaction.id) ? 'dispute logged' : 'not reported'
    const matchesSearch = !searchTerm || [
      transaction.id,
      transaction.date,
      transaction.type,
      transaction.detail,
      String(transaction.amount),
      transaction.status,
      disputeStatus,
    ].some((value) => value.toLowerCase().includes(searchTerm))
    return matchesType && matchesStatus && matchesSearch
  })
  const exportTransactions = () => {
    downloadCsv(
      `wisevest-transactions-${f.toLowerCase()}-${today()}.csv`,
      ['Date', 'Type', 'Details', 'Amount (USD)', 'Status', 'Dispute status'],
      rows.map((transaction) => [
        transaction.date,
        transaction.type,
        transaction.detail,
        transaction.amount,
        transaction.status,
        disputes.some((dispute) => dispute.transactionId === transaction.id) ? 'Dispute logged' : 'Not reported',
      ]),
    )
  }

  const closeDispute = () => {
    setSelectedTransaction(null)
    setReason('')
    setDescription('')
    setDisputeError('')
    setDisputeSubmitted(false)
  }

  const submitDispute = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedTransaction || !reason) return
    setDisputeBusy(true)
    setDisputeError('')
    try {
      await wallet.logDispute(selectedTransaction.id, reason, description)
      setDisputeSubmitted(true)
    } catch (issue) {
      setDisputeError(issue instanceof ApiError ? issue.message : 'Could not log the dispute.')
    } finally {
      setDisputeBusy(false)
    }
  }

  return (
    <>
      <PageTitle title="Transactions" sub="Review activity and report an issue with any transaction." />
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {TYPES.map((t) => <button key={t} onClick={() => setF(t)} className={cx('rounded-full border px-4 py-2 text-sm', f === t ? 'border-neon text-ink' : 'border-line text-muted')}>{t === 'All' ? 'All' : t + 's'}</button>)}
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
          <input
            type="search"
            aria-label="Search transactions"
            className="input !w-full !py-2 text-sm sm:!w-52"
            placeholder="Search transactions"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            aria-label="Filter transactions by status"
            className="input !w-auto !py-2 text-sm"
            value={statusFilter}
            onChange={(event) => {
              const status = event.target.value
              setStatusFilter(status === 'Completed' || status === 'Pending' || status === 'Rejected' ? status : 'All')
            }}
          >
            <option value="All">All statuses</option>
            <option value="Completed">Completed</option>
            <option value="Reviewed">Reviewed (not processed)</option>
            <option value="Pending">Pending</option>
            <option value="Rejected">Rejected</option>
          </select>
          <Button type="button" variant="ghost" className="!px-4 !py-2 text-sm" disabled={rows.length === 0} onClick={exportTransactions}>
            <span aria-hidden>↓</span> Export CSV
          </Button>
        </div>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[690px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-muted"><tr>{['Date', 'Type', 'Details', 'Amount', 'Status', 'Dispute'].map((h) => <th key={h} className="border-b border-line p-2.5 font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td className="border-b border-line p-3">{t.date}</td><td className="border-b border-line p-3">{t.type}</td><td className="border-b border-line p-3">{t.detail}</td>
                <td className={cx('border-b border-line p-3', t.amount > 0 && 'text-neon')}>{signed(t.amount)}</td>
                <td className="border-b border-line p-3"><Tag tone={t.status === 'Completed' ? 'ok' : t.status === 'Rejected' ? 'bad' : 'warn'}>{t.status}</Tag></td>
                <td className="border-b border-line p-3">
                  {t.type === 'Adjustment' ? (
                    <span className="text-xs text-muted">Test balance credit</span>
                  ) : disputes.some((dispute) => dispute.transactionId === t.id) ? (
                    <span className="text-xs font-medium text-muted">Dispute logged</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setSelectedTransaction(t); setDisputeError('') }}
                      className="whitespace-nowrap text-xs font-semibold text-neon underline underline-offset-2 hover:text-violet"
                    >
                      Log dispute
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <Empty>No transactions yet.</Empty>}
      </div>

      <Modal open={!!selectedTransaction} onClose={closeDispute}>
        {disputeSubmitted ? (
          <div className="text-center">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-brand text-2xl text-[#05050a]">✓</div>
            <h2 className="text-xl font-bold">Dispute logged</h2>
            <p className="mt-2 text-sm text-muted">Your report for transaction {selectedTransaction?.id} is saved and marked for review.</p>
            <Button block onClick={closeDispute}>Done</Button>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-bold">Log a transaction dispute</h2>
            <p className="mt-1 text-sm text-muted">Reference: {selectedTransaction?.id}</p>
            <form className="mt-2" onSubmit={(event) => { void submitDispute(event) }}>
              <Field label="Reason" htmlFor="dispute-reason">
                <select
                  id="dispute-reason"
                  className="input"
                  value={reason}
                  onChange={(event) => {
                    const selected = DISPUTE_REASONS.find((item) => item.value === event.target.value)
                    setReason(selected?.value ?? '')
                  }}
                  required
                >
                  <option value="">Choose a reason</option>
                  {DISPUTE_REASONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </Field>
              <Field label="Description (optional)" htmlFor="dispute-description" error={disputeError}>
                <textarea
                  id="dispute-description"
                  className="input min-h-24 resize-y"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={300}
                  placeholder="Share any details that may help our review."
                />
              </Field>
              <div className="fine text-right">{description.length}/300</div>
              <div className="mt-3 flex justify-end gap-2">
                <Button type="button" variant="ghost" className="!px-4 !py-2 text-sm" onClick={closeDispute}>Cancel</Button>
                <Button type="submit" className="!px-4 !py-2 text-sm" loading={disputeBusy}>Submit dispute</Button>
              </div>
            </form>
          </>
        )}
      </Modal>
    </>
  )
}
