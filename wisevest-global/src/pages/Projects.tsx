import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useStore } from '../store'
import { wallet, ApiError } from '../api'
import { money, parseAmount } from '../lib/format'
import type { Project } from '../lib/types'
import { Button, Check, Field, Modal, Progress, RiskNotice, Tag, cx, riskTone, useToast } from '../components/ui'

const filters = ['All', 'Bitcoin', 'Energy', 'Real estate'] as const

export function ProjectCard({ p }: { p: Project }) {
  return (
    <Link to={`/projects/${p.id}`} className="flex flex-col gap-3 rounded-xl2 border border-line bg-surface p-5 transition duration-200 hover:-translate-y-1 hover:border-violet hover:shadow-glow">
      <div className="grid h-28 place-items-center rounded-xl border border-line bg-brand-soft text-5xl" aria-hidden>{p.icon}</div>
      <div className="flex items-center justify-between"><Tag>{p.category}</Tag><Tag tone={riskTone(p.risk)}>{p.risk} risk</Tag></div>
      <h2 className="font-head text-xl font-bold">{p.name}</h2>
      {[['Target return', p.targetReturn], ['Term', p.term], ['Minimum', money(p.minInvest)]].map(([k, v]) => (
        <div key={k} className="flex justify-between text-sm text-muted"><span>{k}</span><b className="font-medium text-ink">{v}</b></div>
      ))}
      <Progress value={p.raisedPct} />
      <div className="fine">{p.status === 'Open' ? `${p.raisedPct}% funded of ${p.goal}` : p.status}</div>
    </Link>
  )
}

export function ProjectsPage() {
  const projects = useStore((s) => s.projects)
  const [params, setParams] = useSearchParams()
  const cat = params.get('category') ?? 'All'
  const list = projects.filter((p) => p.status !== 'Draft' && (cat === 'All' || p.category === cat))
  return (
    <div className="mx-auto max-w-[1100px] px-5 pb-20 pt-10">
      <h1 className="text-[clamp(1.9rem,5vw,2.8rem)] font-bold">Choose your <span className="grad-text">next project.</span></h1>
      <p className="mt-2 text-muted">Every project lists its documents, risks, fees and exit terms before you invest.</p>
      <div className="my-6 flex flex-wrap gap-2" role="tablist">
        {filters.map((f) => (
          <button key={f} role="tab" aria-selected={cat === f} onClick={() => setParams(f === 'All' ? {} : { category: f })}
            className={cx('rounded-full border px-5 py-2 text-sm font-medium', cat === f ? 'border-neon text-ink ring-1 ring-neon' : 'border-line text-muted')}>{f}</button>
        ))}
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{list.map((p) => <ProjectCard key={p.id} p={p} />)}</div>
      <RiskNotice className="mt-8" />
    </div>
  )
}

const TABS = ['Overview', 'Documents', 'Updates', 'Risks'] as const
const DOCS = ['Information memorandum', 'Legal structure and ownership', 'Independent valuation or audit', 'Fee schedule', 'Full risk disclosure']

function Scenarios({ amount }: { amount: number }) {
  if (!Number.isFinite(amount) || amount <= 0) return null
  return (
    <>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {([['Loss', -0.2], ['Base', 0.1], ['High', 0.2]] as const).map(([k, r]) => (
          <div key={k} className="rounded-xl border border-line bg-bg p-2.5 text-center text-xs text-muted">
            {k}<b className={cx('block text-[0.95rem]', r < 0 ? 'text-danger' : 'text-neon')}>{r < 0 ? '−' : '+'}{money(Math.abs(amount * r))}</b>
          </div>
        ))}
      </div>
      <p className="fine mt-2">Illustrative per year only. Not a forecast.</p>
    </>
  )
}

export function ProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const project = useStore((s) => s.projects.find((p) => p.id === id))
  const user = useStore((s) => s.user)
  const cash = useStore((s) => s.cash)
  const [tab, setTab] = useState<(typeof TABS)[number]>('Overview')
  const [amount, setAmount] = useState('')
  const [err, setErr] = useState('')
  const [open, setOpen] = useState(false)
  if (!project) return <div className="mx-auto max-w-[1100px] px-5 py-20">Project not found. <Link className="text-neon" to="/projects">Back to projects</Link></div>
  const p = project
  const amt = parseAmount(amount || String(p.minInvest))

  const start = () => {
    if (!user) return navigate('/login')
    if (user.role !== 'client') return setErr('Sign in with an investor account to invest.')
    if (user.kyc !== 'approved') return setErr('Complete identity verification before you invest.')
    if (p.status !== 'Open') return setErr('This project is not open for investment.')
    if (!Number.isFinite(amt) || amt < p.minInvest) return setErr(`Minimum is ${money(p.minInvest)}.`)
    if (amt > cash) return setErr('Amount is more than your available balance. Deposit funds first.')
    setErr(''); setOpen(true)
  }

  const panel = (
    <div className="card bg-brand-soft">
      <h2 className="text-lg font-bold">Invest in this project</h2>
      <Field label="Amount (USD)" htmlFor="amt" error={err}>
        <input id="amt" inputMode="decimal" className="input" placeholder={String(p.minInvest)} value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <div className="fine">{user?.role === 'client' ? `Available: ${money(cash)} · ` : ''}Minimum: {money(p.minInvest)}</div>
      <Scenarios amount={amt} />
      <Button block onClick={start}>{user ? 'Continue' : 'Sign in to invest'}</Button>
      {user?.role === 'client' && cash < p.minInvest && <Link to="/app/deposit" className="mt-3 block text-center text-sm text-neon">Deposit funds</Link>}
    </div>
  )

  return (
    <div className="mx-auto max-w-[1100px] px-5 pb-28 pt-8">
      <Link to="/projects" className="text-sm text-muted hover:text-ink">← All projects</Link>
      <div className="mt-4 grid items-start gap-6 lg:grid-cols-[1fr_340px]">
        <div>
          <div className="mb-2"><Tag>{p.category}</Tag><Tag tone={riskTone(p.risk)}>{p.risk} risk</Tag></div>
          <h1 className="text-[clamp(1.9rem,5vw,2.8rem)] font-bold leading-tight">{p.name}</h1>
          <p className="mt-2 text-muted">{p.description}</p>
          <div className="my-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[['Target return', p.targetReturn, true], ['Term', p.term], ['Minimum', money(p.minInvest)], ['Funded', `${p.raisedPct}%`]].map(([k, v, g]) => (
              <div key={String(k)} className="rounded-2xl border border-line bg-surface p-3.5"><div className="text-xs text-muted">{k}</div><div className={cx('mt-0.5 font-head text-lg font-bold', g && 'text-neon')}>{v}</div></div>
            ))}
          </div>
          <div className="mb-5 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
            {TABS.map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cx('whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium', tab === t ? 'border-neon text-ink' : 'border-transparent text-muted')}>{t}</button>)}
          </div>
          {tab === 'Overview' && (
            <>
              <div className="card space-y-2.5 text-sm">
                {[['Fees', p.fees], ['Exit terms', p.exit], ['Funding goal', p.goal], ['Last valuation update', p.lastValuation]].map(([k, v]) => <div key={k} className="flex justify-between gap-4 text-muted"><span>{k}</span><b className="text-right font-medium text-ink">{v}</b></div>)}
                <Progress value={p.raisedPct} />
              </div>
              <p className="fine mt-3">Target returns are the company’s objectives based on its assumptions. They are not guaranteed and actual results may be lower, including a loss of capital.</p>
            </>
          )}
          {tab === 'Documents' && (
            <div>
              {DOCS.map((d) => <div key={d} className="flex items-center justify-between border-b border-line py-3.5 text-sm"><div>{d}<div className="fine">PDF · placeholder</div></div><Button variant="ghost" disabled className="!px-4 !py-2">View</Button></div>)}
              <p className="fine mt-3">Attach the real documents before launch. Clients must be able to read them before investing.</p>
            </div>
          )}
          {tab === 'Updates' && (
            <ul className="border-l-2 border-line pl-5 text-sm text-muted">
              {[['Funding open', 'Round opened to verified investors.', true], ['Due diligence complete', 'Legal and technical review finished.', true], ['Next milestone', 'Funding close and project start.', false]].map(([t, d, done]) => (
                <li key={String(t)} className="relative pb-5"><span className={cx('absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2', done ? 'border-neon bg-neon' : 'border-line bg-bg')} /><b className="block text-ink">{t}</b>{d}</li>
              ))}
            </ul>
          )}
          {tab === 'Risks' && (
            <div className="space-y-3">
              {[...p.risks, { title: 'Total loss', text: 'You may lose some or all of the money you invest.' }].map((r) => <div key={r.title} className="rounded-2xl border border-danger/25 bg-danger/5 p-4 text-sm text-muted"><b className="block text-ink">{r.title}</b>{r.text}</div>)}
            </div>
          )}
        </div>
        <aside className="hidden lg:sticky lg:top-24 lg:block">{panel}</aside>
      </div>
      <div className="mt-8 lg:hidden">{panel}</div>
      <InvestModal open={open} onClose={() => setOpen(false)} project={p} amount={amt} />
    </div>
  )
}

function InvestModal({ open, onClose, project: p, amount }: { open: boolean; onClose: () => void; project: Project; amount: number }) {
  const navigate = useNavigate()
  const toast = useToast()
  const [c, setC] = useState([false, false, false, false])
  const [ref, setRef] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const close = () => { setRef(''); setC([false, false, false, false]); setErr(''); onClose() }
  const confirm = async () => {
    if (!c.every(Boolean)) return setErr('Please confirm all statements to continue.')
    setBusy(true)
    try { setRef(await wallet.invest(p.id, amount)); toast('Investment confirmed') }
    catch (x) { setErr(x instanceof ApiError ? x.message : 'Something went wrong.') }
    finally { setBusy(false) }
  }
  const statements = ['I have read the project documents and risk disclosure.', 'I understand I may lose some or all of this investment and that returns are not guaranteed.', `I understand the exit terms: ${p.exit.toLowerCase()}.`, 'I am investing money I can afford to lose.']
  return (
    <Modal open={open} onClose={close}>
      {ref ? (
        <div className="text-center">
          <div className="mx-auto mb-4 grid h-[72px] w-[72px] place-items-center rounded-full bg-brand text-3xl text-[#05050a] shadow-glow">✓</div>
          <h2 className="text-xl font-bold">Investment confirmed</h2>
          <p className="mt-2 text-muted">{money(amount)} in {p.name} is confirmed. It now shows in your dashboard.</p>
          <div className="fine">Reference: {ref}</div>
          <Button block onClick={() => { close(); navigate('/app/investments') }}>View my investments</Button>
        </div>
      ) : (
        <>
          <h2 className="text-xl font-bold">Review your investment</h2>
          <dl className="mt-3 rounded-2xl border border-line bg-bg px-4 py-1 text-sm">
            {[['Project', p.name], ['Amount', money(amount)], ['Term', p.term], ['Fees', p.fees], ['Exit', p.exit], ['Paid from', 'Available balance']].map(([k, v]) => <div key={k} className="flex justify-between gap-4 border-b border-line py-2.5 last:border-0"><dt className="text-muted">{k}</dt><dd className="max-w-[60%] text-right">{v}</dd></div>)}
          </dl>
          {statements.map((s, i) => <Check key={s} checked={c[i]} onChange={(v) => setC(c.map((x, j) => (j === i ? v : x)))}>{s}</Check>)}
          <div className="err" role="alert">{err}</div>
          <Button block loading={busy} onClick={confirm}>Confirm investment</Button>
          <Button variant="ghost" block className="!mt-3" onClick={close}>Cancel</Button>
        </>
      )}
    </Modal>
  )
}
