import { useStore, type DB } from './store'
import { DEMO_USER_ID, seedInvestments, seedTxs } from './lib/seed'
import { DUAL_APPROVAL_THRESHOLD, type DisputeReason, type KycDocuments, type Method, type NewProject, type Project, type SupportRequest, type TransactionDispute, type Tx, type User } from './lib/types'
import { MINIMUM_DEPOSIT, MINIMUM_WITHDRAWAL } from './lib/settings'
import { today, uid } from './lib/format'
import { isSupabaseConfigured, supabase, type ProjectRow } from './lib/supabase'
import type { Session } from '@supabase/supabase-js'

export class ApiError extends Error {}

const wait = (ms = 220) => new Promise((r) => setTimeout(r, ms))
const get = () => useStore.getState()
const set = (p: Partial<DB> | ((s: DB) => Partial<DB>)) => useStore.setState(p as never)
const normalizeEmail = (email: string) => email.trim().toLowerCase()
const normalizeFullName = (name: string) => name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()

function log(action: string, reason = '—') {
  const entry = {
    id: uid('A'),
    time: new Date().toLocaleString('en-GB', { hour12: false }),
    actor: get().adminActor,
    action,
    reason,
  }
  set((s) => ({ audit: [entry, ...s.audit] }))
}

function requireUser(): User {
  const u = get().user
  if (!u) throw new ApiError('Please sign in to continue.')
  return u
}
function requireApproved(): User {
  const u = requireUser()
  if (u.kyc !== 'approved') throw new ApiError('Complete identity verification before you deposit, invest or withdraw.')
  return u
}
function requireAdmin() {
  const u = requireUser()
  if (u.role !== 'admin') throw new ApiError('Admin access required.')
}
function requireMockMode() {
  if (isSupabaseConfigured) throw new ApiError('This workflow is not connected to the backend yet.')
}
function projectFromRow(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    icon: row.icon,
    risk: row.risk,
    minInvest: Number(row.min_invest),
    term: row.term,
    targetReturn: row.target_return,
    raisedPct: Number(row.raised_pct),
    goal: row.goal,
    fees: row.fees,
    exit: row.exit_terms,
    description: row.description,
    risks: row.risks,
    status: row.status,
    lastValuation: row.last_valuation,
  }
}
function setBackendUser(session: Session) {
  const metadata = session.user.user_metadata
  const user: User = {
    id: session.user.id,
    name: typeof metadata.full_name === 'string' ? metadata.full_name : '',
    email: session.user.email ?? '',
    role: session.user.app_metadata?.role === 'admin' ? 'admin' : 'client',
    kyc: 'not_started',
    twoFa: false,
  }
  set({
    user,
    users: [user],
    credentials: [],
    cash: 0,
    balances: { [user.id]: 0 },
    investments: [],
    txs: [],
    kycDocuments: {},
    kycCases: [],
    deposits: [],
    withdrawals: [],
    disputes: [],
    supportRequests: [],
    authError: null,
    authReady: true,
  })
}
function clearBackendUser() {
  set({
    user: null,
    users: [],
    credentials: [],
    cash: 0,
    balances: {},
    investments: [],
    txs: [],
    kycDocuments: {},
    kycCases: [],
    deposits: [],
    withdrawals: [],
    disputes: [],
    supportRequests: [],
    authReady: true,
    authError: null,
  })
}
function getBalance(userId: string) {
  const s = get()
  return s.balances[userId] ?? (s.user?.id === userId ? s.cash : 0)
}
function patchTx(id: string | undefined, patch: Partial<Tx>) {
  if (!id) return
  set((s) => ({ txs: s.txs.map((t) => (t.id === id ? { ...t, ...patch } : t)) }))
}

async function updateTwoFactor(enabled: boolean) {
  requireMockMode()
  await wait()
  const user = requireUser()
  set((s) => ({
    user: s.user ? { ...s.user, twoFa: enabled } : s.user,
    users: s.users.map((item) => item.id === user.id ? { ...item, twoFa: enabled } : item),
  }))
}

/* ---------------- Session ---------------- */
export const auth = {
  initialize() {
    if (!supabase) return () => {}
    let active = true
    let receivedAuthEvent = false
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      receivedAuthEvent = true
      if (session) setBackendUser(session)
      else clearBackendUser()
    })
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active || receivedAuthEvent) return
      if (error) {
        clearBackendUser()
        set({ authError: error.message })
        return
      }
      if (data.session) setBackendUser(data.session)
      else clearBackendUser()
    }).catch((error: unknown) => {
      if (active && !receivedAuthEvent) {
        clearBackendUser()
        set({ authError: error instanceof Error ? error.message : 'Could not restore the sign-in session.' })
      }
    })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  },
  async register(email: string, name: string, password: string) {
    await wait()
    const emailKey = normalizeEmail(email)
    const fullName = name.trim().replace(/\s+/g, ' ')
    if (supabase) {
      const { data, error } = await supabase.auth.signUp({
        email: emailKey,
        password,
        options: { data: { full_name: fullName } },
      })
      if (error) throw new ApiError(error.message)
      if (!data.session) return null
      setBackendUser(data.session)
      return get().user
    }
    const fullNameKey = normalizeFullName(fullName)
    const users = get().users
    if (users.some((x) => normalizeEmail(x.email) === emailKey))
      throw new ApiError('An account with this email address already exists. Sign in instead.')
    if (users.some((x) => normalizeFullName(x.name) === fullNameKey))
      throw new ApiError('An account with this full legal name already exists. Check the details or contact support.')
    const user: User = { id: uid('U'), name: fullName, email: email.trim(), role: 'client', kyc: 'not_started', twoFa: false }
    set((s) => ({
      user,
      users: [...s.users.filter((x) => x.id !== user.id), user],
      credentials: [...s.credentials, { email: user.email, password }],
      cash: 0,
      balances: { ...s.balances, [user.id]: 0 },
      investments: [],
      txs: [],
    }))
    return user
  },
  async login(email: string, password: string) {
    await wait()
    const emailKey = normalizeEmail(email)
    if (supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({ email: emailKey, password })
      if (error) throw new ApiError(error.message)
      if (!data.session) throw new ApiError('Sign-in did not return an active session.')
      setBackendUser(data.session)
      return get().user!
    }
    const c = get().credentials.find((x) => normalizeEmail(x.email) === emailKey)
    if (!c || c.password !== password)
      throw new ApiError('Email or password is incorrect. Use a demo account below, or register first.')
    const activeUser = get().user
    const user = get().users.find((x) => normalizeEmail(x.email) === emailKey)
      ?? (activeUser?.role === 'client' && normalizeEmail(activeUser.email) === emailKey ? activeUser : null)
    if (!user) throw new ApiError('Session expired. Please register again.')
    const balance = getBalance(user.id)
    set((s) => ({
      user,
      users: s.users.some((x) => x.id === user.id) ? s.users : [...s.users, user],
      cash: balance,
      balances: { ...s.balances, [user.id]: balance },
    }))
    return user
  },
  async loginDemo(role: 'client' | 'admin') {
    await wait(120)
    requireMockMode()
    if (role === 'admin') {
      set({ user: { id: 'U-ADMIN', name: 'Compliance Officer', email: 'admin@wisevest.example', role: 'admin', kyc: 'approved', twoFa: true }, cash: 0 })
    } else {
      const demoUser = get().users.find((x) => x.id === DEMO_USER_ID)
        ?? { id: DEMO_USER_ID, name: 'Amara Okafor', email: 'amara@example.com', role: 'client' as const, kyc: 'approved' as const, twoFa: true }
      const savedBalance = get().balances[DEMO_USER_ID]
      const balance = savedBalance ?? (get().user?.id === DEMO_USER_ID ? get().cash : 2450)
      set((s) => ({
        user: demoUser,
        users: s.users.some((x) => x.id === demoUser.id) ? s.users : [...s.users, demoUser],
        cash: balance,
        balances: { ...s.balances, [DEMO_USER_ID]: balance },
        investments: seedInvestments,
        txs: seedTxs,
      }))
    }
  },
  async logout() {
    if (supabase) {
      const { error } = await supabase.auth.signOut()
      if (error) throw new ApiError(error.message)
      clearBackendUser()
      return
    }
    set({ user: null, cash: 0 })
  },
  async enable2fa() {
    return updateTwoFactor(true)
  },
  async setTwoFactor(enabled: boolean) {
    return updateTwoFactor(enabled)
  },
  async changePassword(currentPassword: string, newPassword: string) {
    await wait()
    requireMockMode()
    const user = requireUser()
    const credential = get().credentials.find((item) => normalizeEmail(item.email) === normalizeEmail(user.email))
    if (!credential) throw new ApiError('Password changes are unavailable for demo accounts.')
    if (credential.password !== currentPassword) throw new ApiError('Current password is incorrect.')
    const score =
      (newPassword.length >= 10 ? 1 : 0) +
      (/[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword) ? 1 : 0) +
      (/\d/.test(newPassword) ? 1 : 0) +
      (/[^A-Za-z0-9]/.test(newPassword) ? 1 : 0)
    if (newPassword.length < 10 || score < 3)
      throw new ApiError('Use 10+ characters with a mix of letters, numbers and symbols.')
    set((s) => ({
      credentials: s.credentials.map((item) =>
        normalizeEmail(item.email) === normalizeEmail(user.email)
          ? { ...item, password: newPassword }
          : item,
      ),
    }))
  },
}

/* ---------------- KYC ---------------- */
export const kyc = {
  async submit(data: { name: string; country: string; docType: string; identityDocument: File; selfie: File }) {
    await wait(400)
    requireMockMode()
    const u = requireUser()
    if (!data.identityDocument || !data.selfie) throw new ApiError('Upload your identity document and selfie.')
    const name = data.name.trim().replace(/\s+/g, ' ')
    const nameKey = normalizeFullName(name)
    if (get().users.some((x) => x.id !== u.id && normalizeFullName(x.name) === nameKey))
      throw new ApiError('An account already uses this full legal name. Check the details or contact support.')
    const kase = {
      id: uid('K'), userId: u.id, name, country: data.country, docType: data.docType,
      faceMatch: 90 + Math.floor(Math.random() * 8), sanctions: 'Clear' as const, status: 'pending' as const,
    }
    set((s) => ({
      kycCases: [kase, ...s.kycCases],
      kycDocuments: { ...s.kycDocuments, [kase.id]: { identityDocument: data.identityDocument, selfie: data.selfie } },
      user: s.user ? { ...s.user, name, kyc: 'under_review' } : s.user,
      users: s.users.map((x) => x.id === u.id ? { ...x, name, kyc: 'under_review' } : x),
    }))
  },
}

/* ---------------- Client money flows ---------------- */
export const wallet = {
  async logDispute(transactionId: string, reason: DisputeReason, description: string) {
    await wait()
    requireMockMode()
    requireUser()
    if (!get().txs.some((transaction) => transaction.id === transactionId))
      throw new ApiError('Transaction not found.')
    if (get().disputes.some((dispute) => dispute.transactionId === transactionId))
      throw new ApiError('A dispute has already been logged for this transaction.')
    if (!['DELAYED', 'NOT_RECEIVED', 'INCORRECT_AMOUNT', 'OTHER'].includes(reason))
      throw new ApiError('Choose a valid dispute reason.')
    const dispute: TransactionDispute = {
      id: uid('DSP'),
      transactionId,
      reason,
      description: description.trim(),
      createdAt: today(),
      status: 'Under review',
    }
    set((state) => ({ disputes: [dispute, ...state.disputes] }))
    return dispute
  },
  async deposit(method: Method, amount: number) {
    await wait()
    requireMockMode()
    const u = requireApproved()
    if (!(amount >= MINIMUM_DEPOSIT)) throw new ApiError(`Minimum deposit is $${MINIMUM_DEPOSIT}.`)
    const tx: Tx = { id: uid('T'), date: today(), type: 'Deposit', detail: method, amount, status: 'Pending' }
    const needed = method === 'Bank' ? 1 : method === 'BTC' ? 3 : 20
    set((s) => ({
      txs: [tx, ...s.txs],
      deposits: [{ id: uid('D'), userId: u.id, userName: u.name, amount, method, confirmations: 0, needed, status: 'pending', txId: tx.id }, ...s.deposits],
    }))
  },
  async withdraw(method: Method, amount: number, destination: string, code: string) {
    await wait()
    requireMockMode()
    const u = requireApproved()
    if (!u.twoFa) throw new ApiError('Turn on two-factor authentication before you withdraw.')
    if (!/^\d{6}$/.test(code)) throw new ApiError('Enter your 6-digit authenticator code.')
    if (destination.trim().length < 8) throw new ApiError('Enter a valid destination.')
    if (!(amount >= MINIMUM_WITHDRAWAL)) throw new ApiError(`Minimum withdrawal is $${MINIMUM_WITHDRAWAL}.`)
    const balance = getBalance(u.id)
    if (amount > balance) throw new ApiError('Amount is more than your available balance.')
    const tx: Tx = { id: uid('T'), date: today(), type: 'Withdrawal', detail: method, amount: -amount, status: 'Pending' }
    set((s) => ({
      cash: s.user?.id === u.id ? balance - amount : s.cash,
      balances: { ...s.balances, [u.id]: balance - amount },
      txs: [tx, ...s.txs],
      withdrawals: [{ id: uid('W'), userId: u.id, userName: u.name, amount, method, kycVerified: true, newAddress: true, status: 'pending', txId: tx.id }, ...s.withdrawals],
    }))
  },
  async invest(projectId: string, amount: number) {
    await wait(350)
    requireMockMode()
    requireApproved()
    const p = get().projects.find((x) => x.id === projectId)
    if (!p) throw new ApiError('Project not found.')
    if (p.status !== 'Open') throw new ApiError('This project is not open for investment.')
    if (!Number.isFinite(amount) || amount < p.minInvest) throw new ApiError(`Minimum investment is $${p.minInvest.toLocaleString()}.`)
    const u = requireUser()
    const balance = getBalance(u.id)
    if (amount > balance) throw new ApiError('Amount is more than your available balance.')
    const ref = uid('WV')
    set((s) => ({
      cash: s.user?.id === u.id ? balance - amount : s.cash,
      balances: { ...s.balances, [u.id]: balance - amount },
      investments: [{ id: uid('I'), projectId, amount, value: amount, date: today() }, ...s.investments],
      txs: [{ id: uid('T'), date: today(), type: 'Investment', detail: p.name, amount: -amount, status: 'Completed' }, ...s.txs],
      projects: s.projects.map((x) => (x.id === projectId ? { ...x, raisedPct: Math.min(100, x.raisedPct + 1) } : x)),
    }))
    return ref
  },
}

export const support = {
  async createRequest(topic: string, message: string) {
    await wait()
    requireMockMode()
    const user = requireUser()
    if (!topic.trim()) throw new ApiError('Choose a support topic.')
    if (message.trim().length < 10) throw new ApiError('Please describe your issue in at least 10 characters.')
    const request: SupportRequest = {
      id: uid('SUP'),
      userId: user.id,
      topic: topic.trim(),
      message: message.trim(),
      createdAt: today(),
    }
    set((state) => ({ supportRequests: [request, ...state.supportRequests] }))
    return request
  },
}

/* ---------------- Admin ---------------- */
export const admin = {
  setActor(actor: string) {
    set({ adminActor: actor })
  },
  async createProject(input: NewProject) {
    await wait()
    requireMockMode()
    requireAdmin()
    const name = input.name.trim()
    if (name.length < 3) throw new ApiError('Project name must be at least 3 characters.')
    if (get().projects.some((project) => project.name.toLowerCase() === name.toLowerCase()))
      throw new ApiError('A project with this name already exists.')
    if (!Number.isFinite(input.minInvest) || input.minInvest <= 0)
      throw new ApiError('Minimum investment must be a positive amount.')
    if (![input.category, input.icon, input.term, input.targetReturn, input.goal, input.fees, input.exit, input.description].every((value) => value.trim()))
      throw new ApiError('Complete all required project details.')
    const risks = input.risks.map((risk) => ({ title: risk.title.trim(), text: risk.text.trim() }))
    if (risks.length === 0 || risks.some((risk) => !risk.title || !risk.text))
      throw new ApiError('Add at least one risk with a title and description, and complete every risk.')

    const project: Project = {
      ...input,
      id: uid('P'),
      name,
      risks,
      raisedPct: 0,
      status: 'Draft',
      lastValuation: 'Not yet valued',
    }
    set((state) => ({ projects: [project, ...state.projects] }))
    log(`Created project: ${name}`, 'Created as draft')
    return project
  },
  getKycDocuments(id: string): KycDocuments | undefined {
    requireMockMode()
    requireAdmin()
    if (!get().kycCases.some((x) => x.id === id)) throw new ApiError('Case not found.')
    return get().kycDocuments[id]
  },
  async reviewKyc(id: string, decision: 'approved' | 'rejected', reason = '') {
    await wait()
    requireMockMode()
    requireAdmin()
    const k = get().kycCases.find((x) => x.id === id)
    if (!k) throw new ApiError('Case not found.')
    if (decision === 'approved') {
      if (k.sanctions !== 'Clear') throw new ApiError('Resolve the sanctions screening result before approving.')
      if (k.faceMatch < 80) throw new ApiError(`Face match is low (${k.faceMatch}%). Request a new selfie or reject with a reason.`)
    } else if (reason.trim().length < 5) throw new ApiError('Give a reason of at least 5 characters.')
    set((s) => ({
      kycCases: s.kycCases.map((x) => (x.id === id ? { ...x, status: decision } : x)),
      users: s.users.map((x) => (x.id === k.userId ? { ...x, kyc: decision } : x)),
      user: s.user && s.user.id === k.userId ? { ...s.user, kyc: decision } : s.user,
    }))
    log(`${decision === 'approved' ? 'Approved' : 'Rejected'} KYC ${id}`, reason || undefined)
  },
  async advanceConfirmation(id: string) {
    await wait(120)
    requireMockMode()
    requireAdmin()
    set((s) => ({ deposits: s.deposits.map((d) => (d.id === id && d.confirmations < d.needed ? { ...d, confirmations: d.confirmations + 1 } : d)) }))
  },
  async creditDeposit(id: string) {
    await wait()
    requireMockMode()
    requireAdmin()
    const d = get().deposits.find((x) => x.id === id)
    if (!d) throw new ApiError('Deposit not found.')
    if (d.status === 'credited') throw new ApiError('This deposit has already been credited.')
    if (!d.userId) throw new ApiError('This deposit is not linked to a client account.')
    if (d.confirmations < d.needed) throw new ApiError('Wait for the required confirmations before crediting.')
    if (!Number.isFinite(d.amount) || d.amount <= 0) throw new ApiError('Deposit amount must be greater than zero.')
    const userId = d.userId
    const balance = getBalance(userId)
    set((s) => ({
      deposits: s.deposits.map((x) => (x.id === id ? { ...x, status: 'credited' } : x)),
      cash: s.user?.id === userId ? balance + d.amount : s.cash,
      balances: { ...s.balances, [userId]: balance + d.amount },
    }))
    patchTx(d.txId, { status: 'Completed' })
    log(`Credited deposit ${id}`)
  },
  async reviewWithdrawal(id: string, decision: 'approve' | 'reject', reason = '') {
    await wait()
    requireMockMode()
    requireAdmin()
    const w = get().withdrawals.find((x) => x.id === id)
    const actor = get().adminActor
    if (!w) throw new ApiError('Withdrawal not found.')
    if (decision === 'reject') {
      if (reason.trim().length < 5) throw new ApiError('Give a reason of at least 5 characters.')
      set((s) => ({
        withdrawals: s.withdrawals.map((x) => (x.id === id ? { ...x, status: 'rejected' } : x)),
        cash: w.userId && s.user?.id === w.userId ? getBalance(w.userId) + w.amount : s.cash,
        balances: w.userId ? { ...s.balances, [w.userId]: getBalance(w.userId) + w.amount } : s.balances,
      }))
      patchTx(w.txId, { status: 'Rejected' })
      log(`Rejected withdrawal ${id}`, reason)
      return
    }
    if (!w.kycVerified) throw new ApiError('Account is not KYC verified. Withdrawal cannot be approved.')
    const dual = w.amount > DUAL_APPROVAL_THRESHOLD
    if (dual && w.status === 'pending') {
      set((s) => ({ withdrawals: s.withdrawals.map((x) => (x.id === id ? { ...x, status: 'awaiting_second', firstApprover: actor } : x)) }))
      log(`First approval, withdrawal ${id}`, 'Awaiting second approver')
      return
    }
    if (dual && w.firstApprover === actor) throw new ApiError('A different admin must give the second approval.')
    set((s) => ({ withdrawals: s.withdrawals.map((x) => (x.id === id ? { ...x, status: 'approved' } : x)) }))
    patchTx(w.txId, { status: 'Completed' })
    log(`Approved withdrawal ${id}`, dual ? `Second approval (first: ${w.firstApprover})` : undefined)
  },
  async setProjectStatus(id: string, status: Project['status']) {
    await wait(120)
    requireMockMode()
    requireAdmin()
    const p = get().projects.find((x) => x.id === id)
    set((s) => ({ projects: s.projects.map((x) => (x.id === id ? { ...x, status } : x)) }))
    log(`Project status: ${p?.name} → ${status}`)
  },
  async postValuation(id: string, pct: number, note: string) {
    await wait()
    requireMockMode()
    requireAdmin()
    if (!Number.isFinite(pct) || Math.abs(pct) > 100) throw new ApiError('Enter a percentage between −100 and 100.')
    if (note.trim().length < 10) throw new ApiError('Add the source of this valuation (at least 10 characters).')
    const p = get().projects.find((x) => x.id === id)
    set((s) => ({
      investments: s.investments.map((i) => (i.projectId === id ? { ...i, value: Math.round(i.value * (1 + pct / 100) * 100) / 100 } : i)),
      projects: s.projects.map((x) => (x.id === id ? { ...x, lastValuation: today() } : x)),
    }))
    log(`Valuation update: ${p?.name} (${pct >= 0 ? '+' : ''}${pct}%)`, note)
  },
}

export const publicProjects = {
  async list() {
    if (!supabase) return get().projects
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .in('status', ['Open', 'Funded'])
      .order('name')
    if (error) throw new ApiError(`Could not load projects: ${error.message}`)
    return data.map(projectFromRow)
  },
  async getById(id: string) {
    if (!supabase) return get().projects.find((project) => project.id === id) ?? null
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .in('status', ['Open', 'Funded'])
      .maybeSingle()
    if (error) throw new ApiError(`Could not load this project: ${error.message}`)
    return data ? projectFromRow(data) : null
  },
}

export const resetDemo = () => {
  requireMockMode()
  useStore.getState().reset()
}
