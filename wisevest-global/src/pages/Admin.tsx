import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../store'
import { admin, ApiError } from '../api'
import { money } from '../lib/format'
import { DUAL_APPROVAL_THRESHOLD, type KycDocuments, type Project } from '../lib/types'
import { Button, Empty, Field, Modal, PageTitle, Progress, Tag, useToast } from '../components/ui'

type Ask = { title: string; text: string; reason?: boolean; run: (reason: string) => Promise<void> } | null

function useAsk() {
  const toast = useToast()
  const [ask, setAsk] = useState<Ask>(null)
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const close = () => { setAsk(null); setReason(''); setErr('') }
  const go = async () => {
    if (!ask) return
    setBusy(true); setErr('')
    try { await ask.run(reason); toast('Done. Logged in audit trail.'); close() }
    catch (x) { setErr(x instanceof ApiError ? x.message : 'Something went wrong.') }
    finally { setBusy(false) }
  }
  const modal = (
    <Modal open={!!ask} onClose={close}>
      <h2 className="text-xl font-bold">{ask?.title}</h2>
      <p className="mt-2 text-sm text-muted">{ask?.text}</p>
      {ask?.reason && <Field label="Reason (required)" htmlFor="rs"><textarea id="rs" className="input min-h-[80px]" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>}
      <div className="err" role="alert">{err}</div>
      <div className="mt-3 flex gap-2.5"><Button loading={busy} onClick={go}>Confirm</Button><Button variant="ghost" onClick={close}>Cancel</Button></div>
    </Modal>
  )
  return { open: setAsk, modal }
}

const Row = ({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) => (
  <div className="flex flex-wrap items-center justify-between gap-3.5 border-b border-line py-4 last:border-0">
    <div className="min-w-[240px] flex-1">{children}</div>
    {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
  </div>
)
const small = '!px-4 !py-2 !text-[0.82rem]'

function KycFilePreview({ label, file }: { label: string; file?: File }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!file) return
    const objectUrl = URL.createObjectURL(file)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])

  if (!file) {
    return (
      <div className="grid min-h-28 place-items-center rounded-xl border border-dashed border-line bg-bg p-4 text-center text-xs text-muted">
        {label}: no file available for this case in this session
      </div>
    )
  }

  return (
    <div className="min-w-0 rounded-xl border border-line bg-bg p-3">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs">
        <b>{label}</b>
        <a href={url} target="_blank" rel="noreferrer" className="shrink-0 underline">Open file</a>
      </div>
      <p className="mb-2 truncate text-xs text-muted" title={file.name}>{file.name}</p>
      {file.type.startsWith('image/') && url && <img src={url} alt={label} className="max-h-64 w-full rounded-lg object-contain" />}
      {file.type === 'application/pdf' && url && <iframe src={url} title={label} className="h-64 w-full rounded-lg border border-line" />}
    </div>
  )
}

export function AdminOverview() {
  const s = useStore()
  const stats = [
    ['KYC pending', s.kycCases.filter((k) => k.status === 'pending').length],
    ['Withdrawals pending', s.withdrawals.filter((w) => w.status === 'pending' || w.status === 'awaiting_second').length],
    ['Deposits pending', s.deposits.filter((d) => d.status === 'pending').length],
    ['Projects open', s.projects.filter((p) => p.status === 'Open').length],
  ] as const
  const big = s.withdrawals.filter((w) => w.status !== 'approved' && w.status !== 'rejected' && w.amount > DUAL_APPROVAL_THRESHOLD).length
  return (
    <>
      <PageTitle title="Overview" sub="Demo data. Every action is written to the audit log." />
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">{stats.map(([k, v]) => <div key={k} className="card"><div className="text-xs uppercase tracking-wider text-muted">{k}</div><div className="mt-1 font-head text-3xl font-bold">{v}</div></div>)}</div>
      <div className="card mt-4">
        <h2 className="mb-1 text-lg font-bold">Needs attention</h2>
        {stats[0][1] > 0 && <Row actions={<Link to="/admin/kyc" className="rounded-full border border-line px-4 py-2 text-sm">Open queue</Link>}><b>{stats[0][1]} identity checks waiting</b><div className="fine">Review document match and sanctions screening.</div></Row>}
        {big > 0 && <Row actions={<Link to="/admin/withdrawals" className="rounded-full border border-line px-4 py-2 text-sm">Review</Link>}><b>{big} large withdrawal needs dual approval</b><div className="fine">Over {money(DUAL_APPROVAL_THRESHOLD)}.</div></Row>}
        {stats[2][1] > 0 && <Row actions={<Link to="/admin/deposits" className="rounded-full border border-line px-4 py-2 text-sm">Review</Link>}><b>{stats[2][1]} deposits awaiting confirmation</b><div className="fine">Credit only after required confirmations.</div></Row>}
        {stats[0][1] + stats[2][1] + big === 0 && <Empty>Nothing waiting. All caught up.</Empty>}
      </div>
    </>
  )
}

export function AdminKyc() {
  const cases = useStore((s) => s.kycCases)
  const { open, modal } = useAsk()
  const [view, setView] = useState<string | null>(null)
  const [documents, setDocuments] = useState<KycDocuments>()
  const showDocuments = (id: string) => {
    setDocuments(admin.getKycDocuments(id))
    setView(id)
  }
  return (
    <>
      <PageTitle title="KYC queue" />
      <div className="card">
        {cases.length === 0 && <Empty>No cases.</Empty>}
        {cases.map((k) => (
          <Row key={k.id} actions={<>
            <Button variant="ghost" className={small} onClick={() => showDocuments(k.id)}>View documents</Button>
            {k.status === 'pending' && <>
              <Button className={small} onClick={() => open({ title: `Approve ${k.name}?`, text: 'The account will be able to deposit and invest.', run: () => admin.reviewKyc(k.id, 'approved') })}>Approve</Button>
              <Button variant="danger" className={small} onClick={() => open({ title: `Reject ${k.name}?`, text: 'The applicant will be emailed this reason.', reason: true, run: (r) => admin.reviewKyc(k.id, 'rejected', r) })}>Reject</Button>
            </>}
          </>}>
            <b>{k.name} · {k.id}</b>
            <div className="fine">{k.country} · {k.docType}</div>
            <Tag tone={k.faceMatch >= 90 ? 'ok' : 'warn'}>Face match {k.faceMatch}%</Tag>
            <Tag tone={k.sanctions === 'Clear' ? 'ok' : 'bad'}>Sanctions: {k.sanctions}</Tag>
            {k.status !== 'pending' && <Tag tone={k.status === 'approved' ? 'ok' : 'bad'}>{k.status === 'approved' ? 'Approved' : 'Rejected'}</Tag>}
          </Row>
        ))}
      </div>
      {modal}
      <Modal open={!!view} onClose={() => { setView(null); setDocuments(undefined) }}>
        <h2 className="text-xl font-bold">Submitted documents</h2>
        <p className="fine mt-1">Case {view}</p>
        <div className="mt-3 space-y-3">
          <KycFilePreview label="Identity document" file={documents?.identityDocument} />
          <KycFilePreview label="Selfie" file={documents?.selfie} />
        </div>
        {!documents && <p className="fine mt-3">This case has no files available in the current browser session. Earlier demo submissions did not retain uploads; ask the client to resubmit.</p>}
        <p className="fine mt-3">Demo uploads stay in memory and are cleared on page reload. Production KYC documents should use secure, access-logged server-side storage.</p>
        <Button variant="ghost" block onClick={() => { setView(null); setDocuments(undefined) }}>Close</Button>
      </Modal>
    </>
  )
}

export function AdminWithdrawals() {
  const list = useStore((s) => s.withdrawals)
  const { open, modal } = useAsk()
  return (
    <>
      <PageTitle title="Withdrawals" />
      <div className="mb-4 rounded-xl border border-amber/30 bg-amber/10 p-3.5 text-sm text-amber">Withdrawals over {money(DUAL_APPROVAL_THRESHOLD)} need a second, different approver. Switch “Acting as” in the sidebar to try it.</div>
      <div className="card">
        {list.map((w) => {
          const done = w.status === 'approved' || w.status === 'rejected'
          const big = w.amount > DUAL_APPROVAL_THRESHOLD
          return (
            <Row key={w.id} actions={!done && (<>
              <Button className={small} onClick={() => open({ title: big && w.status === 'pending' ? `First approval for ${money(w.amount)}?` : `Release ${money(w.amount)} ${w.method}?`, text: big && w.status === 'pending' ? 'This amount needs a second approver before funds are released.' : `${w.newAddress ? 'Destination is a new address: confirm it with the client first. ' : ''}This cannot be undone.`, run: () => admin.reviewWithdrawal(w.id, 'approve') })}>{w.status === 'awaiting_second' ? 'Second approval' : 'Approve'}</Button>
              <Button variant="danger" className={small} onClick={() => open({ title: `Reject withdrawal ${w.id}?`, text: 'Funds return to the client’s available balance.', reason: true, run: (r) => admin.reviewWithdrawal(w.id, 'reject', r) })}>Reject</Button>
            </>)}>
              <b>{money(w.amount)} · {w.method} · {w.id}</b>
              <div className="fine">{w.userName}</div>
              <Tag tone={w.kycVerified ? 'ok' : 'bad'}>{w.kycVerified ? 'KYC verified' : 'KYC not verified'}</Tag>
              {w.newAddress && <Tag tone="warn">New address</Tag>}
              {big && <Tag tone="warn">Dual approval</Tag>}
              {w.status === 'awaiting_second' && <Tag tone="warn">Awaiting 2nd approver (first: {w.firstApprover})</Tag>}
              {w.status === 'approved' && <Tag tone="ok">Approved</Tag>}
              {w.status === 'rejected' && <Tag tone="bad">Rejected</Tag>}
            </Row>
          )
        })}
      </div>
      {modal}
    </>
  )
}

export function AdminDeposits() {
  const list = useStore((s) => s.deposits)
  const { open, modal } = useAsk()
  return (
    <>
      <PageTitle title="Deposits" sub="Credit confirmed deposits to the linked client account." />
      <div className="card">
        {list.map((d) => {
          const ready = d.confirmations >= d.needed
          return (
            <Row key={d.id} actions={d.status === 'pending' && (<>
              {!ready && <Button variant="ghost" className={small} onClick={() => admin.advanceConfirmation(d.id)}>Simulate confirmation</Button>}
              <Button className={small} disabled={!ready || !d.userId} onClick={() => open({ title: `Credit ${money(d.amount)} to ${d.userName}?`, text: 'The client balance will be updated after the required confirmations.', run: () => admin.creditDeposit(d.id) })}>Credit account</Button>
            </>)}>
              <b>{money(d.amount)} · {d.method} · {d.id}</b>
              <div className="fine">{d.userName}{d.userId ? ` · Account ${d.userId}` : ' · No linked client account'}</div>
              <Tag tone={ready ? 'ok' : 'warn'}>{d.confirmations}/{d.needed} confirmations</Tag>
              {d.status === 'credited' && <Tag tone="ok">Credited</Tag>}
            </Row>
          )
        })}
      </div>
      {modal}
    </>
  )
}

export function AdminProjects() {
  const projects = useStore((s) => s.projects)
  const toast = useToast()
  const [target, setTarget] = useState<Project | null>(null)
  const [pct, setPct] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const publish = async () => {
    if (!target) return
    setBusy(true); setErr('')
    try { await admin.postValuation(target.id, parseFloat(pct), note); toast('Valuation published'); setTarget(null); setPct(''); setNote('') }
    catch (x) { setErr(x instanceof ApiError ? x.message : 'Something went wrong.') }
    finally { setBusy(false) }
  }
  return (
    <>
      <PageTitle title="Projects" />
      <div className="card">
        {projects.map((p) => (
          <Row key={p.id} actions={(<>
            <select aria-label={`Status of ${p.name}`} className="input !w-32 !py-2 text-sm" value={p.status} onChange={(e) => admin.setProjectStatus(p.id, e.target.value as Project['status'])}>
              {['Draft', 'Open', 'Funded', 'Closed'].map((s) => <option key={s}>{s}</option>)}
            </select>
            <Button variant="ghost" className={small} onClick={() => setTarget(p)}>Post valuation</Button>
          </>)}>
            <b>{p.name}</b>
            <div className="fine">Last valuation: {p.lastValuation}</div>
            <div className="mt-1.5 max-w-[240px]"><Progress value={p.raisedPct} /></div>
            <div className="fine">{p.raisedPct}% funded</div>
          </Row>
        ))}
      </div>
      <Modal open={!!target} onClose={() => setTarget(null)}>
        <h2 className="text-xl font-bold">Post valuation update</h2>
        <p className="fine">{target?.name}. Clients see this as the reported value, so it needs a documented source.</p>
        <Field label="Change in reported value (%)" htmlFor="vp"><input id="vp" inputMode="decimal" className="input" placeholder="e.g. 2.5 or -4" value={pct} onChange={(e) => setPct(e.target.value)} /></Field>
        <Field label="Source or note (required)" htmlFor="vn" error={err}><textarea id="vn" className="input min-h-[80px]" placeholder="e.g. Independent valuation report, 10 Oct 2026" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <div className="mt-2 flex gap-2.5"><Button loading={busy} onClick={publish}>Publish update</Button><Button variant="ghost" onClick={() => setTarget(null)}>Cancel</Button></div>
      </Modal>
    </>
  )
}

export function AdminAudit() {
  const audit = useStore((s) => s.audit)
  return (
    <>
      <PageTitle title="Audit log" sub="Entries cannot be edited or deleted from this screen." />
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-muted"><tr>{['Time', 'Admin', 'Action', 'Reason or note'].map((h) => <th key={h} className="border-b border-line p-2.5 font-medium">{h}</th>)}</tr></thead>
          <tbody>{audit.map((a) => <tr key={a.id}>{[a.time, a.actor, a.action, a.reason].map((v, i) => <td key={i} className="border-b border-line p-3 align-top">{v}</td>)}</tr>)}</tbody>
        </table>
        {audit.length === 0 && <Empty>No actions yet.</Empty>}
      </div>
    </>
  )
}
