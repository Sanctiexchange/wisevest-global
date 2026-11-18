import { useStore, type DB } from './store'
import { DEMO_USER_ID, seedInvestments, seedTxs } from './lib/seed'
import { DUAL_APPROVAL_THRESHOLD, type AuditEntry, type Deposit, type DisputeReason, type KycCase, type KycDocuments, type Method, type NewProject, type Project, type SupportRequest, type TransactionDispute, type Tx, type User, type Withdrawal } from './lib/types'
import { MINIMUM_DEPOSIT, MINIMUM_WITHDRAWAL } from './lib/settings'
import { money, today, uid } from './lib/format'
import {
  isSupabaseConfigured,
  supabase,
  type AuditEventRow,
  type DepositRequestRow,
  type InvestmentRow,
  type KycCaseRow,
  type ProfileRow,
  type ProjectRow,
  type SimulatedBalanceCreditRow,
  type WithdrawalRequestRow,
} from './lib/supabase'
import type { Session } from '@supabase/supabase-js'

export class ApiError extends Error {}

const wait = (ms = 220) => new Promise((r) => setTimeout(r, ms))
const get = () => useStore.getState()
const set = (p: Partial<DB> | ((s: DB) => Partial<DB>)) => useStore.setState(p as never)
const normalizeEmail = (email: string) => email.trim().toLowerCase()
const normalizeFullName = (name: string) => name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
function parseFundingGoal(value: string): number | null {
  const match = /^\$?\s*([\d,]+(?:\.\d+)?)\s*([KMB])?$/i.exec(value.trim())
  if (!match) return null
  const amount = Number(match[1].replace(/,/g, ''))
  const multiplier = { K: 1_000, M: 1_000_000, B: 1_000_000_000 }[match[2]?.toUpperCase() ?? ''] ?? 1
  const goal = Math.round(amount * multiplier * 100) / 100
  return Number.isFinite(goal) && goal > 0 && goal <= 999999999999.99 ? goal : null
}

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
  if (u.role === 'client') throw new ApiError('Admin access required.')
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
async function setBackendUser(session: Session, isCurrent: () => boolean = () => true) {
  if (!supabase) throw new ApiError('Supabase is not configured.')
  set({ authReady: false, authError: null })
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .maybeSingle()
  if (profileError) throw new ApiError(`Could not load your account profile: ${profileError.message}`)
  if (!profile) throw new ApiError('Your account profile is missing. Contact support.')

  const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors()
  if (factorsError) throw new ApiError(`Could not load your security settings: ${factorsError.message}`)
  const { data: walletBalance, error: walletBalanceError } = await supabase
    .from('simulated_wallet_balances')
    .select('balance')
    .eq('user_id', session.user.id)
    .maybeSingle()
  if (walletBalanceError) throw new ApiError(`Could not load your test balance: ${walletBalanceError.message}`)
  if (!isCurrent()) return
  const metadata = session.user.user_metadata
  const balance = walletBalance ? Number(walletBalance.balance) : 0
  const user: User = {
    id: session.user.id,
    name: profile.full_name || (typeof metadata.full_name === 'string' ? metadata.full_name : ''),
    email: profile.email || session.user.email || '',
    role: profile.is_super_admin ? 'super_admin' : profile.role,
    kyc: profile.kyc_status,
    twoFa: factors.totp.some((factor) => factor.status === 'verified'),
    accountStatus: profile.account_status,
  }
  set({
    user,
    users: [user],
    credentials: [],
    cash: balance,
    balances: { [user.id]: balance },
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

function userFromProfile(row: ProfileRow, twoFa = false): User {
  return {
    id: row.id,
    name: row.full_name,
    email: row.email,
    role: row.is_super_admin ? 'super_admin' : row.role,
    kyc: row.kyc_status,
    twoFa,
    accountStatus: row.account_status,
  }
}

function kycFromRow(row: KycCaseRow): KycCase {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    country: row.country,
    docType: row.doc_type,
    status: row.status,
    reviewReason: row.review_reason ?? undefined,
    createdAt: row.created_at,
  }
}

function depositFromRow(row: DepositRequestRow, users: Map<string, User>): Deposit {
  return {
    id: row.id,
    userId: row.user_id,
    userName: users.get(row.user_id)?.name ?? row.user_id,
    amount: Number(row.amount),
    method: row.method,
    externalReference: row.external_reference,
    status: row.status,
    reviewReason: row.review_reason ?? undefined,
    createdAt: row.created_at,
  }
}

function withdrawalFromRow(row: WithdrawalRequestRow, users: Map<string, User>): Withdrawal {
  return {
    id: row.id,
    userId: row.user_id,
    userName: users.get(row.user_id)?.name ?? row.user_id,
    amount: Number(row.amount),
    method: row.method,
    destination: row.destination,
    kycVerified: users.get(row.user_id)?.kyc === 'approved',
    newAddress: false,
    status: row.status,
    firstApprover: row.first_approver_id ? users.get(row.first_approver_id)?.email ?? 'Another administrator' : undefined,
    reviewReason: row.review_reason ?? undefined,
    createdAt: row.created_at,
  }
}

function auditFromRow(row: AuditEventRow): AuditEntry {
  return {
    id: String(row.id),
    time: new Date(row.created_at).toLocaleString('en-GB', { hour12: false }),
    actor: row.actor_email || row.actor_id || 'System',
    action: row.action.replace(/simulated/gi, 'test'),
    reason: row.reason.replace(/simulated/gi, 'test') || '—',
  }
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
    let authRequest = 0
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      receivedAuthEvent = true
      const request = ++authRequest
      if (!session) {
        clearBackendUser()
        return
      }
      window.setTimeout(() => {
        void setBackendUser(session, () => active && request === authRequest).catch((error: unknown) => {
          if (!active || request !== authRequest) return
          clearBackendUser()
          set({ authError: error instanceof Error ? error.message : 'Could not load your account.' })
        })
      }, 0)
    })
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active || receivedAuthEvent) return
      if (error) {
        clearBackendUser()
        set({ authError: error.message })
        return
      }
      if (data.session) return setBackendUser(data.session, () => active && !receivedAuthEvent && authRequest === 0)
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
      await setBackendUser(data.session)
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
      await setBackendUser(data.session)
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
  async beginTwoFactor() {
    if (!supabase) {
      await updateTwoFactor(true)
      return null
    }
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'WiseVest authenticator',
    })
    if (error) throw new ApiError(`Could not start authenticator setup: ${error.message}`)
    return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret }
  },
  async cancelTwoFactorEnrollment(factorId: string) {
    if (!supabase) return
    const { error } = await supabase.auth.mfa.unenroll({ factorId })
    if (error) throw new ApiError(`Could not cancel authenticator setup: ${error.message}`)
  },
  async verifyTwoFactor(factorId: string, code: string) {
    if (!supabase) throw new ApiError('Authenticator setup is only available with Supabase.')
    if (!/^\d{6}$/.test(code)) throw new ApiError('Enter your 6-digit authenticator code.')
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId })
    if (challengeError) throw new ApiError(`Could not verify the authenticator: ${challengeError.message}`)
    const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code })
    if (error) throw new ApiError(`Could not verify the authenticator: ${error.message}`)
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) throw new ApiError(`Could not refresh your session: ${sessionError.message}`)
    if (!session) throw new ApiError('Sign in again to continue.')
    await setBackendUser(session)
  },
  async disableTwoFactor() {
    if (!supabase) return updateTwoFactor(false)
    const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors()
    if (factorsError) throw new ApiError(`Could not load authenticator: ${factorsError.message}`)
    for (const factor of factors.totp.filter((item) => item.status === 'verified')) {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id })
      if (error) throw new ApiError(`Could not remove authenticator: ${error.message}`)
    }
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) throw new ApiError(`Could not refresh your session: ${sessionError.message}`)
    if (!session) throw new ApiError('Sign in again to continue.')
    await setBackendUser(session)
  },
  async setTwoFactor(enabled: boolean) {
    return updateTwoFactor(enabled)
  },
  async changePassword(currentPassword: string, newPassword: string) {
    await wait()
    const user = requireUser()
    if (supabase) {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword })
      if (signInError) throw new ApiError('Current password is incorrect.')
      const score =
        (newPassword.length >= 10 ? 1 : 0) +
        (/[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword) ? 1 : 0) +
        (/\d/.test(newPassword) ? 1 : 0) +
        (/[^A-Za-z0-9]/.test(newPassword) ? 1 : 0)
      if (newPassword.length < 10 || score < 3)
        throw new ApiError('Use 10+ characters with a mix of letters, numbers and symbols.')
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw new ApiError(`Could not update the password: ${error.message}`)
      return
    }
    requireMockMode()
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
    if (supabase) {
      if (!data.identityDocument.type.match(/^image\/(jpeg|png)$/) && data.identityDocument.type !== 'application/pdf')
        throw new ApiError('Upload a JPG, PNG, or PDF identity document.')
      if (!data.selfie.type.match(/^image\/(jpeg|png)$/))
        throw new ApiError('Upload a JPG or PNG selfie.')
      const extension = (file: File) => file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg'
      const id = crypto.randomUUID()
      const paths = [
        `${u.id}/${id}-identity.${extension(data.identityDocument)}`,
        `${u.id}/${id}-selfie.${extension(data.selfie)}`,
      ]
      const uploaded: string[] = []
      try {
        const identityUpload = await supabase.storage.from('kyc-documents').upload(paths[0], data.identityDocument, {
          cacheControl: '3600',
          contentType: data.identityDocument.type,
          upsert: false,
        })
        if (identityUpload.error) throw new ApiError(`Could not upload identity document: ${identityUpload.error.message}`)
        uploaded.push(paths[0])

        const selfieUpload = await supabase.storage.from('kyc-documents').upload(paths[1], data.selfie, {
          cacheControl: '3600',
          contentType: data.selfie.type,
          upsert: false,
        })
        if (selfieUpload.error) throw new ApiError(`Could not upload selfie: ${selfieUpload.error.message}`)
        uploaded.push(paths[1])

        const { error } = await supabase.rpc('submit_kyc', {
          p_name: name,
          p_country: data.country,
          p_doc_type: data.docType,
          p_identity_document_path: paths[0],
          p_selfie_path: paths[1],
        })
        if (error) throw new ApiError(`Could not submit identity verification: ${error.message}`)
      } catch (issue) {
        if (uploaded.length) {
          const { error: cleanupError } = await supabase.storage.from('kyc-documents').remove(uploaded)
          if (cleanupError) {
            const message = issue instanceof Error ? issue.message : 'Could not submit identity verification.'
            throw new ApiError(`${message} Temporary uploads could not be removed; contact support.`)
          }
        }
        if (issue instanceof ApiError) throw issue
        throw new ApiError(issue instanceof Error ? issue.message : 'Could not submit identity verification.')
      }

      set((state) => ({
        user: state.user ? { ...state.user, name, kyc: 'under_review' } : state.user,
        users: state.users.map((item) => item.id === u.id ? { ...item, name, kyc: 'under_review' } : item),
      }))
      return
    }

    requireMockMode()
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
  async loadOwnRequests() {
    if (!supabase) return
    const user = requireUser()
    const [depositsResult, withdrawalsResult, creditsResult, balanceResult, investmentsResult] = await Promise.all([
      supabase.from('deposit_requests').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('withdrawal_requests').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('simulated_balance_credits').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('simulated_wallet_balances').select('balance').eq('user_id', user.id).maybeSingle(),
      supabase.from('investments').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    ])
    if (depositsResult.error) throw new ApiError(`Could not load deposit history: ${depositsResult.error.message}`)
    if (withdrawalsResult.error) throw new ApiError(`Could not load withdrawal history: ${withdrawalsResult.error.message}`)
    if (creditsResult.error) throw new ApiError(`Could not load test balance history: ${creditsResult.error.message}`)
    if (balanceResult.error) throw new ApiError(`Could not load your test balance: ${balanceResult.error.message}`)
    if (investmentsResult.error) throw new ApiError(`Could not load your investments: ${investmentsResult.error.message}`)

    const investmentRows: InvestmentRow[] = investmentsResult.data
    const portfolioProjectIds = [...new Set(investmentRows.map((investment) => investment.project_id))]
    let portfolioProjects: Project[] = []
    if (portfolioProjectIds.length > 0) {
      const { data, error } = await supabase.from('projects').select('*').in('id', portfolioProjectIds)
      if (error) throw new ApiError(`Could not load projects in your portfolio: ${error.message}`)
      portfolioProjects = data.map(projectFromRow)
      if (portfolioProjects.length !== portfolioProjectIds.length)
        throw new ApiError('Could not load one or more projects in your portfolio.')
    }

    const users = new Map([[user.id, user]])
    const portfolioProjectsById = new Map(portfolioProjects.map((project) => [project.id, project]))
    const deposits = depositsResult.data.map((row) => depositFromRow(row, users))
    const withdrawals = withdrawalsResult.data.map((row) => withdrawalFromRow(row, users))
    const credits: SimulatedBalanceCreditRow[] = creditsResult.data
    const investments = investmentRows.map((investment) => ({
      id: investment.id,
      projectId: investment.project_id,
      amount: Number(investment.amount),
      value: Number(investment.value),
      date: investment.created_at.slice(0, 10),
    }))
    const transactions: Tx[] = [
      ...deposits.filter((deposit) => deposit.status !== 'verified').map((deposit) => ({
        id: deposit.id,
        date: deposit.createdAt?.slice(0, 10) ?? today(),
        type: 'Deposit' as const,
        detail: deposit.method,
        amount: deposit.amount,
        status: deposit.status === 'verified' ? 'Completed' as const : deposit.status === 'rejected' ? 'Rejected' as const : 'Pending' as const,
      })),
      ...withdrawals.map((withdrawal) => ({
        id: withdrawal.id,
        date: withdrawal.createdAt?.slice(0, 10) ?? today(),
        type: 'Withdrawal' as const,
        detail: withdrawal.method,
        amount: -withdrawal.amount,
        status: withdrawal.status === 'approved' ? 'Completed' as const : withdrawal.status === 'rejected' ? 'Rejected' as const : 'Pending' as const,
      })),
      ...credits.map((credit) => ({
        id: credit.id,
        date: credit.created_at.slice(0, 10),
        type: 'Adjustment' as const,
        detail: `Admin test credit — ${credit.reason.replace(/simulated/gi, 'test')}`,
        amount: Number(credit.amount),
        status: 'Completed' as const,
      })),
      ...investmentRows.map((investment) => ({
        id: investment.id,
        date: investment.created_at.slice(0, 10),
        type: 'Investment' as const,
        detail: portfolioProjectsById.get(investment.project_id)?.name ?? investment.project_id,
        amount: -Number(investment.amount),
        status: 'Completed' as const,
      })),
    ].sort((a, b) => b.date.localeCompare(a.date))
    const balance = balanceResult.data ? Number(balanceResult.data.balance) : 0
    set((state) => ({
      deposits,
      withdrawals,
      investments,
      txs: transactions,
      cash: state.user?.id === user.id ? balance : state.cash,
      balances: { ...state.balances, [user.id]: balance },
      projects: [...new Map([...state.projects, ...portfolioProjects].map((project) => [project.id, project])).values()],
    }))
  },
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
  async deposit(method: Method, amount: number, externalReference = '') {
    await wait()
    if (supabase) {
      requireUser()
      const { data, error } = await supabase.rpc('submit_deposit_request', {
        p_amount: amount,
        p_method: method,
        p_external_reference: externalReference.trim(),
      })
      if (error) throw new ApiError(error.message)
      if (!data) throw new ApiError('Deposit request was not created.')
      await wallet.loadOwnRequests()
      return
    }
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
    if (supabase) {
      requireUser()
      const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors()
      if (factorsError) throw new ApiError(`Could not load authenticator: ${factorsError.message}`)
      const factor = factors.totp.find((item) => item.status === 'verified')
      if (!factor) throw new ApiError('Enroll in an authenticator in Account settings before requesting a withdrawal.')
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: factor.id })
      if (challengeError) throw new ApiError(`Could not verify the authenticator: ${challengeError.message}`)
      const { error: verifyError } = await supabase.auth.mfa.verify({ factorId: factor.id, challengeId: challenge.id, code })
      if (verifyError) throw new ApiError(`Authenticator code was not accepted: ${verifyError.message}`)

      const { data, error } = await supabase.rpc('submit_withdrawal_request', {
        p_amount: amount,
        p_method: method,
        p_destination: destination.trim(),
      })
      if (error) throw new ApiError(error.message)
      if (!data) throw new ApiError('Withdrawal request was not created.')
      await wallet.loadOwnRequests()
      return
    }
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
    if (supabase) {
      const user = requireApproved()
      if (user.role !== 'client') throw new ApiError('Sign in with an investor account to invest.')
      const { data, error } = await supabase.rpc('invest_in_project', {
        p_project_id: projectId,
        p_amount: amount,
      })
      if (error) throw new ApiError(error.message)
      if (!data) throw new ApiError('Investment was not recorded.')
      await wallet.loadOwnRequests()
      return data
    }
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
  async loadConsole() {
    if (!supabase) return
    const [profilesResult, casesResult, depositsResult, withdrawalsResult, auditResult, projectsResult, balancesResult] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('kyc_cases').select('*').order('created_at', { ascending: false }),
      supabase.from('deposit_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('withdrawal_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('audit_events').select('*').order('created_at', { ascending: false }).limit(500),
      supabase.from('projects').select('*').order('name'),
      supabase.from('simulated_wallet_balances').select('user_id,balance'),
    ])
    if (profilesResult.error) throw new ApiError(`Could not load users: ${profilesResult.error.message}`)
    if (casesResult.error) throw new ApiError(`Could not load KYC cases: ${casesResult.error.message}`)
    if (depositsResult.error) throw new ApiError(`Could not load deposit requests: ${depositsResult.error.message}`)
    if (withdrawalsResult.error) throw new ApiError(`Could not load withdrawal requests: ${withdrawalsResult.error.message}`)
    if (auditResult.error) throw new ApiError(`Could not load the audit log: ${auditResult.error.message}`)
    if (projectsResult.error) throw new ApiError(`Could not load projects: ${projectsResult.error.message}`)
    if (balancesResult.error) throw new ApiError(`Could not load test balances: ${balancesResult.error.message}`)

    const currentUser = get().user
    const balances = balancesResult.data.reduce<Record<string, number>>((result, row) => {
      result[row.user_id] = Number(row.balance)
      return result
    }, {})
    const users = profilesResult.data.map((row) => userFromProfile(row, row.id === currentUser?.id ? currentUser.twoFa : false))
    const usersById = new Map(users.map((user) => [user.id, user]))
    const refreshedUser = currentUser ? usersById.get(currentUser.id) : undefined
    set({
      users,
      user: currentUser && refreshedUser ? { ...refreshedUser, twoFa: currentUser.twoFa } : currentUser,
      cash: currentUser ? balances[currentUser.id] ?? 0 : 0,
      balances,
      kycCases: casesResult.data.map(kycFromRow),
      deposits: depositsResult.data.map((row) => depositFromRow(row, usersById)),
      withdrawals: withdrawalsResult.data.map((row) => withdrawalFromRow(row, usersById)),
      audit: auditResult.data.map(auditFromRow),
      projects: projectsResult.data.map(projectFromRow),
    })
  },
  setActor(actor: string) {
    set({ adminActor: actor })
  },
  async simulateBalanceCredit(userId: string, amount: number, reason: string) {
    requireAdmin()
    const target = get().users.find((user) => user.id === userId)
    if (!target || target.role !== 'client') throw new ApiError('Choose a client account.')
    if (target.accountStatus === 'suspended') throw new ApiError('Reactivate this account before adding a test credit.')
    if (!Number.isFinite(amount) || amount <= 0 || amount > 999999999999.99 || Math.round(amount * 100) / 100 !== amount)
      throw new ApiError('Enter a positive amount with no more than two decimal places.')
    if (reason.trim().length < 5 || reason.trim().length > 500)
      throw new ApiError('Give a reason between 5 and 500 characters.')

    if (supabase) {
      const { error } = await supabase.rpc('admin_simulate_balance_credit', {
        p_user_id: userId,
        p_amount: amount,
        p_reason: reason.trim(),
      })
      if (error) throw new ApiError(error.message)
      await admin.loadConsole()
      return
    }

    requireMockMode()
    const nextBalance = getBalance(userId) + amount
    set((state) => ({
      cash: state.user?.id === userId ? nextBalance : state.cash,
      balances: { ...state.balances, [userId]: nextBalance },
    }))
    log(`Test balance credit for ${target.email}`, `${money(amount, 2)} — ${reason.trim()}`)
  },
  async setUserRole(userId: string, role: 'client' | 'admin') {
    if (supabase) {
      const { error } = await supabase.rpc('admin_set_user_role', { p_user_id: userId, p_role: role })
      if (error) throw new ApiError(error.message)
      await admin.loadConsole()
      return
    }
    requireMockMode()
    requireAdmin()
    if (get().user?.role !== 'super_admin') throw new ApiError('Super admin access required.')
    set((state) => ({ users: state.users.map((user) => user.id === userId ? { ...user, role } : user) }))
  },
  async setAccountStatus(userId: string, status: 'active' | 'suspended', reason: string) {
    if (supabase) {
      const { error } = await supabase.rpc('admin_set_account_status', {
        p_user_id: userId,
        p_status: status,
        p_reason: reason.trim(),
      })
      if (error) throw new ApiError(error.message)
      await admin.loadConsole()
      return
    }
    requireMockMode()
    requireAdmin()
    if (reason.trim().length < 5) throw new ApiError('Give a reason of at least 5 characters.')
    set((state) => ({
      users: state.users.map((user) => user.id === userId ? { ...user, accountStatus: status } : user),
    }))
    log(`Account ${status}: ${userId}`, reason.trim())
  },
  async createProject(input: NewProject) {
    await wait()
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

    if (supabase) {
      const fundingGoal = parseFundingGoal(input.goal)
      if (!fundingGoal) throw new ApiError('Enter a funding goal as an amount, such as $2.0M.')
      const { data, error } = await supabase.from('projects').insert({
        name,
        category: input.category,
        icon: input.icon,
        risk: input.risk,
        min_invest: input.minInvest,
        term: input.term,
        target_return: input.targetReturn,
        raised_pct: 0,
        goal: input.goal,
        funding_goal: fundingGoal,
        fees: input.fees,
        exit_terms: input.exit,
        description: input.description,
        risks,
        status: 'Draft',
        last_valuation: 'Not yet valued',
      }).select('*').single()
      if (error) throw new ApiError(`Could not create project: ${error.message}`)
      const project = projectFromRow(data)
      await admin.loadConsole()
      return project
    }

    requireMockMode()
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
  async getKycDocuments(id: string): Promise<KycDocuments | { identityDocumentUrl: string; selfieUrl: string } | undefined> {
    requireAdmin()
    if (supabase) {
      const { data: kase, error } = await supabase
        .from('kyc_cases')
        .select('identity_document_path,selfie_path')
        .eq('id', id)
        .maybeSingle()
      if (error) throw new ApiError(`Could not load identity documents: ${error.message}`)
      if (!kase) throw new ApiError('Case not found.')
      const [identity, selfie] = await Promise.all([
        supabase.storage.from('kyc-documents').createSignedUrl(kase.identity_document_path, 60),
        supabase.storage.from('kyc-documents').createSignedUrl(kase.selfie_path, 60),
      ])
      if (identity.error) throw new ApiError(`Could not open identity document: ${identity.error.message}`)
      if (selfie.error) throw new ApiError(`Could not open selfie: ${selfie.error.message}`)
      return { identityDocumentUrl: identity.data.signedUrl, selfieUrl: selfie.data.signedUrl }
    }
    requireMockMode()
    if (!get().kycCases.some((x) => x.id === id)) throw new ApiError('Case not found.')
    return get().kycDocuments[id]
  },
  async reviewKyc(id: string, decision: 'approved' | 'rejected', reason = '') {
    await wait()
    requireAdmin()
    if (supabase) {
      const { error } = await supabase.rpc('admin_review_kyc', {
        p_case_id: id,
        p_decision: decision,
        p_reason: reason.trim(),
      })
      if (error) throw new ApiError(error.message)
      await admin.loadConsole()
      return
    }
    requireMockMode()
    const k = get().kycCases.find((x) => x.id === id)
    if (!k) throw new ApiError('Case not found.')
    if (decision === 'approved') {
      if (k.sanctions !== 'Clear') throw new ApiError('Resolve the sanctions screening result before approving.')
      if (k.faceMatch !== undefined && k.faceMatch < 80) throw new ApiError(`Face match is low (${k.faceMatch}%). Request a new selfie or reject with a reason.`)
    } else if (reason.trim().length < 5) throw new ApiError('Give a reason of at least 5 characters.')
    set((s) => ({
      kycCases: s.kycCases.map((x) => (x.id === id ? { ...x, status: decision } : x)),
      users: s.users.map((x) => (x.id === k.userId ? { ...x, kyc: decision } : x)),
      user: s.user && s.user.id === k.userId ? { ...s.user, kyc: decision } : s.user,
    }))
    log(`${decision === 'approved' ? 'Approved' : 'Rejected'} KYC ${id}`, reason || undefined)
  },
  async reviewDeposit(id: string, decision: 'verified' | 'rejected', reason = '') {
    if (supabase) {
      const { error } = await supabase.rpc('admin_review_deposit', {
        p_request_id: id,
        p_decision: decision,
        p_reason: reason.trim(),
      })
      if (error) throw new ApiError(error.message)
      await admin.loadConsole()
      return
    }
    requireMockMode()
    requireAdmin()
    if (decision === 'rejected' && reason.trim().length < 5) throw new ApiError('Give a reason of at least 5 characters.')
    set((state) => ({
      deposits: state.deposits.map((deposit) =>
        deposit.id === id ? { ...deposit, status: decision, reviewReason: reason.trim() || undefined } : deposit,
      ),
    }))
    log(`Deposit ${decision}: ${id}`, reason.trim() || undefined)
  },
  async advanceConfirmation(id: string) {
    await wait(120)
    requireMockMode()
    requireAdmin()
    const deposit = get().deposits.find((item) => item.id === id)
    if (!deposit) throw new ApiError('Deposit not found.')
    if (deposit.status !== 'pending' && deposit.status !== 'verified')
      throw new ApiError('Only pending or verified deposits can receive test confirmations.')
    if ((deposit.confirmations ?? 0) >= (deposit.needed ?? 0))
      throw new ApiError('This deposit already has the required confirmations.')
    set((s) => ({ deposits: s.deposits.map((d) => (d.id === id && (d.confirmations ?? 0) < (d.needed ?? 0) ? { ...d, confirmations: (d.confirmations ?? 0) + 1 } : d)) }))
  },
  async creditDeposit(id: string) {
    await wait()
    requireMockMode()
    requireAdmin()
    const d = get().deposits.find((x) => x.id === id)
    if (!d) throw new ApiError('Deposit not found.')
    if (d.status === 'credited') throw new ApiError('This deposit has already been credited.')
    if (d.status !== 'verified') throw new ApiError('Verify the deposit receipt before crediting the test balance.')
    if (!d.userId) throw new ApiError('This deposit is not linked to a client account.')
    if ((d.confirmations ?? 0) < (d.needed ?? 0)) throw new ApiError('Wait for the required confirmations before crediting.')
    if (!Number.isFinite(d.amount) || d.amount <= 0) throw new ApiError('Deposit amount must be greater than zero.')
    const userId = d.userId
    const balance = getBalance(userId)
    set((s) => ({
      deposits: s.deposits.map((x) => (x.id === id ? { ...x, status: 'credited' } : x)),
      cash: s.user?.id === userId ? balance + d.amount : s.cash,
      balances: { ...s.balances, [userId]: balance + d.amount },
    }))
    patchTx(d.txId, { status: 'Completed' })
    log(`Test credit for deposit ${id}`)
  },
  async reviewWithdrawal(id: string, decision: 'approve' | 'reject', reason = '') {
    await wait()
    requireAdmin()
    if (supabase) {
      const { error } = await supabase.rpc('admin_review_withdrawal', {
        p_request_id: id,
        p_decision: decision,
        p_reason: reason.trim(),
      })
      if (error) throw new ApiError(error.message)
      await admin.loadConsole()
      return
    }
    requireMockMode()
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
    if (supabase) {
      const { error } = await supabase.from('projects').update({ status }).eq('id', id)
      if (error) throw new ApiError(`Could not update project status: ${error.message}`)
      await admin.loadConsole()
      return
    }
    requireMockMode()
    const p = get().projects.find((x) => x.id === id)
    set((s) => ({ projects: s.projects.map((x) => (x.id === id ? { ...x, status } : x)) }))
    log(`Project status: ${p?.name} → ${status}`)
  },
  async postValuation(id: string, pct: number, note: string) {
    await wait()
    requireAdmin()
    if (!Number.isFinite(pct) || Math.abs(pct) > 100) throw new ApiError('Enter a percentage between −100 and 100.')
    if (note.trim().length < 10) throw new ApiError('Add the source of this valuation (at least 10 characters).')
    if (supabase) {
      const { error } = await supabase.rpc('admin_post_project_valuation', {
        p_project_id: id,
        p_change_pct: pct,
        p_source_note: note.trim(),
      })
      if (error) throw new ApiError(error.message)
      await admin.loadConsole()
      return
    }
    requireMockMode()
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
