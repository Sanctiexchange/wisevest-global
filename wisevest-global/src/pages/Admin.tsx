import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../store'
import { admin, ApiError } from '../api'
import { downloadCsv, money, parseAmount, today } from '../lib/format'
import { DUAL_APPROVAL_THRESHOLD, type Category, type KycDocuments, type NewProject, type Project } from '../lib/types'
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
const PROJECT_CATEGORIES = ['Bitcoin', 'Energy', 'Real estate'] as const
const PROJECT_RISK_LEVELS = ['High', 'Medium', 'Low–Medium'] as const

function KycFilePreview({ label, file, fileUrl }: { label: string; file?: File; fileUrl?: string }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (fileUrl) {
      setUrl(fileUrl)
      return
    }
    if (!file) return
    const objectUrl = URL.createObjectURL(file)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file, fileUrl])

  if (!file && !fileUrl) {
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
      <p className="mb-2 truncate text-xs text-muted" title={file?.name}>{file?.name ?? 'Secure, temporary link'}</p>
      {(file?.type.startsWith('image/') || (!file && !fileUrl?.toLowerCase().includes('.pdf'))) && url && <img src={url} alt={label} className="max-h-64 w-full rounded-lg object-contain" />}
      {(file?.type === 'application/pdf' || (!file && fileUrl?.toLowerCase().includes('.pdf'))) && url && <iframe src={url} title={label} className="h-64 w-full rounded-lg border border-line" />}
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
      <PageTitle title="Overview" sub="Operational queues and recorded administrative actions." />
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">{stats.map(([k, v]) => <div key={k} className="card"><div className="text-xs uppercase tracking-wider text-muted">{k}</div><div className="mt-1 font-head text-3xl font-bold">{v}</div></div>)}</div>
      <div className="card mt-4">
        <h2 className="mb-1 text-lg font-bold">Needs attention</h2>
        {stats[0][1] > 0 && <Row actions={<Link to="/admin/kyc" className="rounded-full border border-line px-4 py-2 text-sm">Open queue</Link>}><b>{stats[0][1]} identity checks waiting</b><div className="fine">Review submitted documents and record a decision.</div></Row>}
        {big > 0 && <Row actions={<Link to="/admin/withdrawals" className="rounded-full border border-line px-4 py-2 text-sm">Review</Link>}><b>{big} large withdrawal needs dual approval</b><div className="fine">Over {money(DUAL_APPROVAL_THRESHOLD)}.</div></Row>}
        {stats[2][1] > 0 && <Row actions={<Link to="/admin/deposits" className="rounded-full border border-line px-4 py-2 text-sm">Review</Link>}><b>{stats[2][1]} deposit requests awaiting review</b><div className="fine">Verify receipts independently; verification adds test balance only.</div></Row>}
        {stats[0][1] + stats[2][1] + big === 0 && <Empty>Nothing waiting. All caught up.</Empty>}
      </div>
    </>
  )
}

export function AdminUsers() {
  const users = useStore((state) => state.users)
  const currentUser = useStore((state) => state.user)
  const balances = useStore((state) => state.balances)
  const { open, modal } = useAsk()
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [creditTargetId, setCreditTargetId] = useState<string | null>(null)
  const [creditAmount, setCreditAmount] = useState('')
  const [creditReason, setCreditReason] = useState('')
  const [creditError, setCreditError] = useState('')
  const [creditBusy, setCreditBusy] = useState(false)
  const query = search.trim().toLowerCase()
  const visibleUsers = useMemo(
    () => users.filter((user) => [user.name, user.email, user.role, user.kyc].some((value) => value.toLowerCase().includes(query))),
    [users, query],
  )

  const changeRole = async (userId: string, role: 'client' | 'admin') => {
    try {
      await admin.setUserRole(userId, role)
      toast(`User role changed to ${role}.`)
    } catch (issue) {
      toast(issue instanceof ApiError ? issue.message : 'Could not change user role.')
    }
  }

  const closeCredit = () => {
    setCreditTargetId(null)
    setCreditAmount('')
    setCreditReason('')
    setCreditError('')
  }

  const submitCredit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!creditTargetId) return
    setCreditBusy(true)
    setCreditError('')
    try {
      await admin.simulateBalanceCredit(creditTargetId, parseAmount(creditAmount), creditReason)
      toast('Test balance credit recorded.')
      closeCredit()
    } catch (issue) {
      setCreditError(issue instanceof ApiError ? issue.message : 'Could not add the test credit.')
    } finally {
      setCreditBusy(false)
    }
  }

  return (
    <>
      <PageTitle title="Users" sub="Balance credits are test funds only and are recorded in the audit log." />
      <div className="mb-3 flex flex-wrap gap-2">
        <input
          type="search"
          aria-label="Search users"
          className="input !w-full !py-2 text-sm sm:!w-80"
          placeholder="Search name, email, role, or KYC status"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      <div className="card">
        {visibleUsers.length === 0 && <Empty>{users.length === 0 ? 'No user profiles found.' : 'No users match this search.'}</Empty>}
        {visibleUsers.map((user) => {
          const self = user.id === currentUser?.id
          const accountStatus = user.accountStatus ?? 'active'
          return (
            <Row key={user.id} actions={<>
              {currentUser?.role === 'super_admin' && user.role !== 'super_admin' && !self && (
                <select
                  aria-label={`Role for ${user.email}`}
                  className="input !w-32 !py-2 text-sm"
                  value={user.role}
                  onChange={(event) => {
                    if (event.target.value === 'admin' || event.target.value === 'client') void changeRole(user.id, event.target.value)
                  }}
                >
                  <option value="client">Investor</option>
                  <option value="admin">Admin</option>
                </select>
              )}
              {user.role === 'super_admin' && <Tag tone="ok">Owner-managed super admin</Tag>}
              {user.role === 'client' && accountStatus === 'active' && (
                <Button
                  variant="ghost"
                  className={small}
                  onClick={() => {
                    setCreditTargetId(user.id)
                    setCreditAmount('')
                    setCreditReason('')
                    setCreditError('')
                  }}
                >
                  Add test credit
                </Button>
              )}
              {!self && (
                <Button
                  variant={accountStatus === 'active' ? 'danger' : 'ghost'}
                  className={small}
                  onClick={() => open({
                    title: `${accountStatus === 'active' ? 'Suspend' : 'Reactivate'} ${user.name || user.email}?`,
                    text: 'This change is recorded in the audit log.',
                    reason: true,
                    run: async (reason) => {
                      await admin.setAccountStatus(user.id, accountStatus === 'active' ? 'suspended' : 'active', reason)
                    },
                  })}
                >
                  {accountStatus === 'active' ? 'Suspend' : 'Reactivate'}
                </Button>
              )}
            </>}>
              <b>{user.name || 'Name not provided'}{self ? ' (you)' : ''}</b>
              <div className="fine">{user.email} · {user.id}</div>
              {user.role === 'client' && <div className="fine">Test balance: <b className="text-ink">{money(balances[user.id] ?? 0, 2)}</b></div>}
              <Tag tone={user.role === 'client' ? 'default' : 'ok'}>{user.role.replace('_', ' ')}</Tag>
              <Tag tone={accountStatus === 'active' ? 'ok' : 'bad'}>{accountStatus}</Tag>
              <Tag tone={user.kyc === 'approved' ? 'ok' : user.kyc === 'rejected' ? 'bad' : 'warn'}>KYC: {user.kyc.replace(/_/g, ' ')}</Tag>
            </Row>
          )
        })}
      </div>
      {modal}
      <Modal open={!!creditTargetId} onClose={closeCredit}>
        <h2 className="text-xl font-bold">Add test balance credit</h2>
        <p className="mt-2 text-sm text-muted">
          This adds test-only balance and does not represent a payment or real funds. The credit and reason are recorded in the audit log.
        </p>
        <form className="mt-3" onSubmit={(event) => { void submitCredit(event) }}>
          <Field label="Amount (USD)" htmlFor="test-credit-amount">
            <input
              id="test-credit-amount"
              type="number"
              min="0.01"
              max="999999999999.99"
              step="0.01"
              required
              className="input"
              value={creditAmount}
              onChange={(event) => setCreditAmount(event.target.value)}
            />
          </Field>
          <Field label="Reason (required)" htmlFor="test-credit-reason" error={creditError}>
            <textarea
              id="test-credit-reason"
              className="input min-h-[80px]"
              minLength={5}
              maxLength={500}
              required
              value={creditReason}
              onChange={(event) => setCreditReason(event.target.value)}
            />
          </Field>
          <div className="mt-3 flex gap-2.5">
            <Button type="submit" loading={creditBusy}>Add test credit</Button>
            <Button type="button" variant="ghost" onClick={closeCredit}>Cancel</Button>
          </div>
        </form>
      </Modal>
    </>
  )
}

export function AdminKyc() {
  const cases = useStore((s) => s.kycCases)
  const { open, modal } = useAsk()
  const toast = useToast()
  const [view, setView] = useState<string | null>(null)
  const [documents, setDocuments] = useState<KycDocuments | { identityDocumentUrl: string; selfieUrl: string }>()
  const [documentsLoading, setDocumentsLoading] = useState(false)
  const showDocuments = async (id: string) => {
    setView(id)
    setDocuments(undefined)
    setDocumentsLoading(true)
    try {
      setDocuments(await admin.getKycDocuments(id))
    } catch (issue) {
      toast(issue instanceof ApiError ? issue.message : 'Could not load identity documents.')
    } finally {
      setDocumentsLoading(false)
    }
  }
  return (
    <>
      <PageTitle title="KYC queue" />
      <div className="card">
        {cases.length === 0 && <Empty>No cases.</Empty>}
        {cases.map((k) => (
          <Row key={k.id} actions={<>
            <Button variant="ghost" className={small} onClick={() => { void showDocuments(k.id) }}>View documents</Button>
            {k.status === 'pending' && <>
              <Button className={small} onClick={() => open({ title: `Approve ${k.name}?`, text: 'The account will be able to deposit and invest.', run: () => admin.reviewKyc(k.id, 'approved') })}>Approve</Button>
              <Button variant="danger" className={small} onClick={() => open({ title: `Reject ${k.name}?`, text: 'The applicant will be emailed this reason.', reason: true, run: (r) => admin.reviewKyc(k.id, 'rejected', r) })}>Reject</Button>
            </>}
          </>}>
            <b>{k.name} · {k.id}</b>
            <div className="fine">{k.country} · {k.docType}</div>
            {k.faceMatch !== undefined && <Tag tone={k.faceMatch >= 90 ? 'ok' : 'warn'}>Demo face match {k.faceMatch}%</Tag>}
            {k.sanctions && <Tag tone={k.sanctions === 'Clear' ? 'ok' : 'bad'}>Demo sanctions: {k.sanctions}</Tag>}
            {k.createdAt && <div className="fine">Submitted {new Date(k.createdAt).toLocaleString()}</div>}
            {k.reviewReason && <div className="fine">Review note: {k.reviewReason}</div>}
            {k.status !== 'pending' && <Tag tone={k.status === 'approved' ? 'ok' : 'bad'}>{k.status === 'approved' ? 'Approved' : 'Rejected'}</Tag>}
          </Row>
        ))}
      </div>
      {modal}
      <Modal open={!!view} onClose={() => { setView(null); setDocuments(undefined) }}>
        <h2 className="text-xl font-bold">Submitted documents</h2>
        <p className="fine mt-1">Case {view}</p>
        <div className="mt-3 space-y-3">
          {documents && 'identityDocumentUrl' in documents ? (
            <>
              <KycFilePreview label="Identity document" fileUrl={documents.identityDocumentUrl} />
              <KycFilePreview label="Selfie" fileUrl={documents.selfieUrl} />
            </>
          ) : documents && (
            <>
              <KycFilePreview label="Identity document" file={documents.identityDocument} />
              <KycFilePreview label="Selfie" file={documents.selfie} />
            </>
          )}
        </div>
        {documentsLoading && <p className="fine mt-3" role="status">Loading secure documents…</p>}
        {!documents && !documentsLoading && <p className="fine mt-3">No documents are available for this case.</p>}
        <p className="fine mt-3">Document links are private and expire after one minute.</p>
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
      <div className="mb-4 rounded-xl border border-amber/30 bg-amber/10 p-3.5 text-sm text-amber">
        Requests over {money(DUAL_APPROVAL_THRESHOLD)} need approval from two different admins. Approval records a decision only; no payout is sent.
      </div>
      <div className="card">
        {list.map((w) => {
          const done = w.status === 'approved' || w.status === 'rejected'
          const big = w.amount > DUAL_APPROVAL_THRESHOLD
          return (
            <Row key={w.id} actions={!done && (<>
              <Button className={small} onClick={() => open({ title: big && w.status === 'pending' ? `First approval for ${money(w.amount)}?` : `Approve ${money(w.amount)} ${w.method}?`, text: big && w.status === 'pending' ? 'A different administrator must approve this request next. No funds are transferred.' : 'This records approval for manual external processing. No payout is sent by this app.', run: () => admin.reviewWithdrawal(w.id, 'approve') })}>{w.status === 'awaiting_second' ? 'Second approval' : 'Approve'}</Button>
              <Button variant="danger" className={small} onClick={() => open({ title: `Reject withdrawal ${w.id}?`, text: 'Funds return to the client’s available balance.', reason: true, run: (r) => admin.reviewWithdrawal(w.id, 'reject', r) })}>Reject</Button>
            </>)}>
              <b>{money(w.amount)} · {w.method} · {w.id}</b>
              <div className="fine">{w.userName} · Destination: {w.destination ?? 'Demo request'}</div>
              <Tag tone={w.kycVerified ? 'ok' : 'bad'}>{w.kycVerified ? 'KYC verified' : 'KYC not verified'}</Tag>
              {w.newAddress && <Tag tone="warn">New address</Tag>}
              {big && <Tag tone="warn">Dual approval</Tag>}
              {w.status === 'awaiting_second' && <Tag tone="warn">Awaiting second approver{w.firstApprover ? ` (first: ${w.firstApprover})` : ''}</Tag>}
              {w.status === 'approved' && <Tag tone="ok">Approved for manual payout</Tag>}
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
  const toast = useToast()
  const advanceConfirmation = async (id: string) => {
    try {
      await admin.advanceConfirmation(id)
      toast('Test confirmation added.')
    } catch (issue) {
      toast(issue instanceof ApiError ? issue.message : 'Could not add a test confirmation.')
    }
  }
  return (
    <>
      <PageTitle title="Deposit requests" sub="Verifying a Supabase deposit adds test balance only. Demo deposits use test confirmations." />
      <div className="card">
        {list.length === 0 && <Empty>No deposit requests.</Empty>}
        {list.map((d) => (
            <Row key={d.id} actions={<>
              {d.status === 'pending' && <>
                <Button className={small} onClick={() => open({
                  title: d.needed === undefined ? `Verify and credit ${money(d.amount)} ${d.method}?` : `Verify ${money(d.amount)} ${d.method}?`,
                  text: d.needed === undefined
                    ? 'Confirm the external receipt independently. This records verification and adds test balance atomically; it does not represent real funds.'
                    : 'Confirm the external receipt independently. This records verification; the demo balance can be credited after test confirmations.',
                  run: () => admin.reviewDeposit(d.id, 'verified'),
                })}>{d.needed === undefined ? 'Verify & credit test balance' : 'Verify receipt'}</Button>
                <Button variant="danger" className={small} onClick={() => open({ title: `Reject deposit request ${d.id}?`, text: 'Provide a reason for the audit log.', reason: true, run: (reason) => admin.reviewDeposit(d.id, 'rejected', reason) })}>Reject</Button>
              </>}
              {d.needed !== undefined && d.status !== 'credited' && d.status !== 'rejected' && (
                <Button
                  variant="ghost"
                  className={small}
                  disabled={(d.confirmations ?? 0) >= d.needed}
                  onClick={() => { void advanceConfirmation(d.id) }}
                >
                  Add test confirmation
                </Button>
              )}
              {d.needed !== undefined && d.status === 'verified' && (d.confirmations ?? 0) >= d.needed && (
                <Button
                  className={small}
                  onClick={() => open({
                    title: `Credit ${money(d.amount)} to the test balance?`,
                    text: 'This test credit is not a payment and does not represent real funds.',
                    run: () => admin.creditDeposit(d.id),
                  })}
                >
                  Credit test balance
                </Button>
              )}
            </>}>
              <b>{money(d.amount)} · {d.method} · {d.id}</b>
              <div className="fine">{d.userName} · Account {d.userId}</div>
              <div className="fine">External reference: {d.externalReference ?? 'Demo request'}</div>
              {d.needed !== undefined && <div className="fine">Test confirmations: {d.confirmations ?? 0}/{d.needed}</div>}
              <Tag tone={d.status === 'verified' || d.status === 'credited' ? 'ok' : d.status === 'rejected' ? 'bad' : 'warn'}>
                {d.status === 'verified' && d.needed === undefined ? 'verified · test balance credited' : d.status}
              </Tag>
              {d.reviewReason && <div className="fine">Review note: {d.reviewReason}</div>}
            </Row>
        ))}
      </div>
      {modal}
    </>
  )
}

export function AdminProjects() {
  const projects = useStore((s) => s.projects)
  const toast = useToast()
  const [createOpen, setCreateOpen] = useState(false)
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState('')
  const [newProject, setNewProject] = useState({
    name: '',
    category: 'Bitcoin' as Category,
    icon: '₿',
    risk: 'Medium' as Project['risk'],
    minInvest: '',
    term: '',
    targetReturn: '',
    goal: '',
    fees: '',
    exit: '',
    description: '',
    risks: '',
  })
  const [target, setTarget] = useState<Project | null>(null)
  const [pct, setPct] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const resetCreateForm = () => {
    setNewProject({
      name: '',
      category: 'Bitcoin',
      icon: '₿',
      risk: 'Medium',
      minInvest: '',
      term: '',
      targetReturn: '',
      goal: '',
      fees: '',
      exit: '',
      description: '',
      risks: '',
    })
    setCreateError('')
  }
  const createProject = async (event: React.FormEvent) => {
    event.preventDefault()
    setCreateError('')
    const riskLines = newProject.risks.split('\n').map((line) => line.trim()).filter(Boolean)
    const risks = riskLines.map((line) => {
      const separator = line.indexOf(':')
      return separator < 0
        ? { title: line, text: '' }
        : { title: line.slice(0, separator).trim(), text: line.slice(separator + 1).trim() }
    })
    if (risks.length === 0 || risks.some((risk) => !risk.title || !risk.text)) {
      setCreateError('Add at least one risk using “Title: description” on each line.')
      return
    }

    const input: NewProject = {
      name: newProject.name,
      category: newProject.category,
      icon: newProject.icon,
      risk: newProject.risk,
      minInvest: parseAmount(newProject.minInvest),
      term: newProject.term,
      targetReturn: newProject.targetReturn,
      goal: newProject.goal,
      fees: newProject.fees,
      exit: newProject.exit,
      description: newProject.description,
      risks,
    }
    setCreateBusy(true)
    try {
      const project = await admin.createProject(input)
      toast(`${project.name} added as a draft.`)
      setCreateOpen(false)
      resetCreateForm()
    } catch (issue) {
      setCreateError(issue instanceof ApiError ? issue.message : 'Could not create the project.')
    } finally {
      setCreateBusy(false)
    }
  }
  const publish = async () => {
    if (!target) return
    setBusy(true); setErr('')
    try { await admin.postValuation(target.id, parseFloat(pct), note); toast('Valuation published'); setTarget(null); setPct(''); setNote('') }
    catch (x) { setErr(x instanceof ApiError ? x.message : 'Something went wrong.') }
    finally { setBusy(false) }
  }
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold md:text-[1.7rem]">Projects</h1>
          <p className="mt-1 text-sm text-muted">Create projects as drafts, then review and publish them.</p>
        </div>
        <Button onClick={() => { resetCreateForm(); setCreateOpen(true) }}>Add new project</Button>
      </div>
      <div className="card">
        {projects.map((p) => (
          <Row key={p.id} actions={(<>
            <select aria-label={`Status of ${p.name}`} className="input !w-32 !py-2 text-sm" value={p.status} onChange={async (e) => {
              const status = e.target.value as Project['status']
              try {
                await admin.setProjectStatus(p.id, status)
                toast('Project status updated.')
              } catch (issue) {
                toast(issue instanceof ApiError ? issue.message : 'Could not update project status.')
              }
            }}>
              {['Draft', 'Open', 'Funded', 'Closed'].map((s) => <option key={s}>{s}</option>)}
            </select>
            <Button variant="ghost" className={small} onClick={() => setTarget(p)}>Post valuation</Button>
          </>)}>
            <b>{p.name}</b>
            <div className="fine">Category: {p.category} · Risk: {p.risk} · Last valuation: {p.lastValuation}</div>
            <div className="mt-1.5 max-w-[240px]"><Progress value={p.raisedPct} /></div>
            <div className="fine">{p.raisedPct}% funded</div>
          </Row>
        ))}
      </div>
      <Modal open={createOpen} onClose={() => { if (!createBusy) { setCreateOpen(false); resetCreateForm() } }}>
        <h2 className="text-xl font-bold">Add new project</h2>
        <p className="mt-1 text-sm text-muted">New projects are saved as drafts and stay hidden from investors until opened.</p>
        <form className="mt-2" onSubmit={(event) => { void createProject(event) }}>
          <Field label="Project name" htmlFor="project-name">
            <input id="project-name" className="input" value={newProject.name} onChange={(event) => setNewProject((current) => ({ ...current, name: event.target.value }))} maxLength={100} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category" htmlFor="project-category">
              <select id="project-category" className="input" value={newProject.category} onChange={(event) => {
                const category = PROJECT_CATEGORIES.find((item) => item === event.target.value)
                if (category) setNewProject((current) => ({ ...current, category }))
              }}>
                {PROJECT_CATEGORIES.map((category) => <option key={category}>{category}</option>)}
              </select>
            </Field>
            <Field label="Risk level" htmlFor="project-risk">
              <select id="project-risk" className="input" value={newProject.risk} onChange={(event) => {
                const risk = PROJECT_RISK_LEVELS.find((item) => item === event.target.value)
                if (risk) setNewProject((current) => ({ ...current, risk }))
              }}>
                {PROJECT_RISK_LEVELS.map((risk) => <option key={risk}>{risk}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Project icon" htmlFor="project-icon">
              <input id="project-icon" className="input" value={newProject.icon} onChange={(event) => setNewProject((current) => ({ ...current, icon: event.target.value }))} maxLength={4} required />
            </Field>
            <Field label="Minimum investment (USD)" htmlFor="project-minimum">
              <input id="project-minimum" type="number" min="0.01" step="0.01" className="input" value={newProject.minInvest} onChange={(event) => setNewProject((current) => ({ ...current, minInvest: event.target.value }))} placeholder="e.g. 500" required />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Term" htmlFor="project-term">
              <input id="project-term" className="input" value={newProject.term} onChange={(event) => setNewProject((current) => ({ ...current, term: event.target.value }))} placeholder="e.g. 24 months" required />
            </Field>
            <Field label="Target return" htmlFor="project-return">
              <input id="project-return" className="input" value={newProject.targetReturn} onChange={(event) => setNewProject((current) => ({ ...current, targetReturn: event.target.value }))} placeholder="e.g. 8–12% (target)" required />
            </Field>
          </div>
          <Field label="Funding goal" htmlFor="project-goal">
            <input id="project-goal" className="input" value={newProject.goal} onChange={(event) => setNewProject((current) => ({ ...current, goal: event.target.value }))} placeholder="e.g. $2.0M" required />
          </Field>
          <Field label="Fees" htmlFor="project-fees">
            <input id="project-fees" className="input" value={newProject.fees} onChange={(event) => setNewProject((current) => ({ ...current, fees: event.target.value }))} placeholder="Describe management and performance fees" required />
          </Field>
          <Field label="Exit terms" htmlFor="project-exit">
            <textarea id="project-exit" className="input min-h-20 resize-y" value={newProject.exit} onChange={(event) => setNewProject((current) => ({ ...current, exit: event.target.value }))} required />
          </Field>
          <Field label="Project description" htmlFor="project-description">
            <textarea id="project-description" className="input min-h-24 resize-y" value={newProject.description} onChange={(event) => setNewProject((current) => ({ ...current, description: event.target.value }))} maxLength={1000} required />
          </Field>
          <Field label="Risk disclosures (one “Title: description” per line)" htmlFor="project-risks">
            <textarea id="project-risks" className="input min-h-24 resize-y" value={newProject.risks} onChange={(event) => setNewProject((current) => ({ ...current, risks: event.target.value }))} placeholder={'Liquidity: Exits may be limited.\nMarket risk: The investment may lose value.'} required />
          </Field>
          <div className="err" role="alert">{createError}</div>
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="ghost" className="!px-4 !py-2 text-sm" disabled={createBusy} onClick={() => { setCreateOpen(false); resetCreateForm() }}>Cancel</Button>
            <Button type="submit" className="!px-4 !py-2 text-sm" loading={createBusy}>Save as draft</Button>
          </div>
        </form>
      </Modal>
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
  const [search, setSearch] = useState('')
  const [adminFilter, setAdminFilter] = useState('All')
  const searchTerm = search.trim().toLowerCase()
  const admins = [...new Set(audit.map((entry) => entry.actor))].sort()
  const filteredAudit = audit.filter((entry) => {
    const matchesAdmin = adminFilter === 'All' || entry.actor === adminFilter
    const matchesSearch = !searchTerm || [entry.time, entry.actor, entry.action, entry.reason]
      .some((value) => value.toLowerCase().includes(searchTerm))
    return matchesAdmin && matchesSearch
  })
  const exportAudit = () => downloadCsv(
    `wisevest-audit-log-${today()}.csv`,
    ['Time', 'Admin', 'Action', 'Reason or note'],
    filteredAudit.map((entry) => [entry.time, entry.actor, entry.action, entry.reason]),
  )
  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="mb-0">
          <PageTitle title="Audit log" sub="Entries cannot be edited or deleted from this screen." />
        </div>
        <Button type="button" variant="ghost" className="!px-4 !py-2 text-sm" disabled={filteredAudit.length === 0} onClick={exportAudit}>
          <span aria-hidden>↓</span> Export CSV
        </Button>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <input
          type="search"
          aria-label="Search audit log"
          className="input !w-full !py-2 text-sm sm:!w-64"
          placeholder="Search audit log"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          aria-label="Filter audit log by admin"
          className="input !w-auto !py-2 text-sm"
          value={adminFilter}
          onChange={(event) => setAdminFilter(event.target.value)}
        >
          <option value="All">All admins</option>
          {admins.map((actor) => <option key={actor} value={actor}>{actor}</option>)}
        </select>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-muted"><tr>{['Time', 'Admin', 'Action', 'Reason or note'].map((h) => <th key={h} className="border-b border-line p-2.5 font-medium">{h}</th>)}</tr></thead>
          <tbody>{filteredAudit.map((a) => <tr key={a.id}>{[a.time, a.actor, a.action, a.reason].map((v, i) => <td key={i} className="border-b border-line p-3 align-top">{v}</td>)}</tr>)}</tbody>
        </table>
        {filteredAudit.length === 0 && <Empty>{audit.length === 0 ? 'No actions yet.' : 'No entries match the current search or filter.'}</Empty>}
      </div>
    </>
  )
}
