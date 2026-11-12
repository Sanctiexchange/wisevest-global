import { useStore, type DB } from './store'
import { DEMO_USER_ID, seedInvestments, seedTxs } from './lib/seed'
import { DUAL_APPROVAL_THRESHOLD, type KycDocuments, type Method, type Project, type Tx, type User } from './lib/types'
import { MINIMUM_DEPOSIT, MINIMUM_WITHDRAWAL } from './lib/settings'
import { today, uid } from './lib/format'

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
function getBalance(userId: string) {
  const s = get()
  return s.balances[userId] ?? (s.user?.id === userId ? s.cash : 0)
}
function patchTx(id: string | undefined, patch: Partial<Tx>) {
  if (!id) return
  set((s) => ({ txs: s.txs.map((t) => (t.id === id ? { ...t, ...patch } : t)) }))
}

async function updateTwoFactor(enabled: boolean) {
  await wait()
  const user = requireUser()
  set((s) => ({
    user: s.user ? { ...s.user, twoFa: enabled } : s.user,
    users: s.users.map((item) => item.id === user.id ? { ...item, twoFa: enabled } : item),
  }))
}

/* ---------------- Session ---------------- */
export const auth = {
  async register(email: string, name: string, password: string) {
    await wait()
    const emailKey = normalizeEmail(email)
    const fullName = name.trim().replace(/\s+/g, ' ')
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
  logout() {
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
  async deposit(method: Method, amount: number) {
    await wait()
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

/* ---------------- Admin ---------------- */
export const admin = {
  setActor(actor: string) {
    set({ adminActor: actor })
  },
  getKycDocuments(id: string): KycDocuments | undefined {
    requireAdmin()
    if (!get().kycCases.some((x) => x.id === id)) throw new ApiError('Case not found.')
    return get().kycDocuments[id]
  },
  async reviewKyc(id: string, decision: 'approved' | 'rejected', reason = '') {
    await wait()
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
    requireAdmin()
    set((s) => ({ deposits: s.deposits.map((d) => (d.id === id && d.confirmations < d.needed ? { ...d, confirmations: d.confirmations + 1 } : d)) }))
  },
  async creditDeposit(id: string) {
    await wait()
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
    requireAdmin()
    const p = get().projects.find((x) => x.id === id)
    set((s) => ({ projects: s.projects.map((x) => (x.id === id ? { ...x, status } : x)) }))
    log(`Project status: ${p?.name} → ${status}`)
  },
  async postValuation(id: string, pct: number, note: string) {
    await wait()
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

export const resetDemo = () => {
  useStore.getState().reset()
}
