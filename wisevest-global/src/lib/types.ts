export type Category = 'Bitcoin' | 'Energy' | 'Real estate'
export type Method = 'BTC' | 'USDT' | 'USDC' | 'Bank'
export type KycStatus = 'not_started' | 'under_review' | 'approved' | 'rejected'
export type Role = 'client' | 'admin'

export interface User {
  id: string
  name: string
  email: string
  role: Role
  kyc: KycStatus
  twoFa: boolean
}

export interface KycDocuments {
  identityDocument: File
  selfie: File
}

export interface Project {
  id: string
  name: string
  category: Category
  icon: string
  risk: 'High' | 'Medium' | 'Low–Medium'
  minInvest: number
  term: string
  targetReturn: string
  raisedPct: number
  goal: string
  fees: string
  exit: string
  description: string
  risks: { title: string; text: string }[]
  status: 'Draft' | 'Open' | 'Funded' | 'Closed'
  lastValuation: string
}

export interface Investment {
  id: string
  projectId: string
  amount: number
  value: number
  date: string
}

export type TxType = 'Deposit' | 'Withdrawal' | 'Investment'
export interface Tx {
  id: string
  date: string
  type: TxType
  detail: string
  amount: number
  status: 'Completed' | 'Pending' | 'Rejected'
}

export type DisputeReason = 'DELAYED' | 'NOT_RECEIVED' | 'INCORRECT_AMOUNT' | 'OTHER'

export interface TransactionDispute {
  id: string
  transactionId: string
  reason: DisputeReason
  description: string
  createdAt: string
  status: 'Under review'
}

export interface SupportRequest {
  id: string
  userId: string
  topic: string
  message: string
  createdAt: string
}

export interface KycCase {
  id: string
  userId: string
  name: string
  country: string
  docType: string
  faceMatch: number
  sanctions: 'Clear' | 'Potential match'
  status: 'pending' | 'approved' | 'rejected'
}

export interface Deposit {
  id: string
  userName: string
  amount: number
  method: Method
  confirmations: number
  needed: number
  status: 'pending' | 'credited'
  userId?: string
  txId?: string
}

export interface Withdrawal {
  id: string
  userId?: string
  userName: string
  amount: number
  method: Method
  kycVerified: boolean
  newAddress: boolean
  status: 'pending' | 'awaiting_second' | 'approved' | 'rejected'
  firstApprover?: string
  txId?: string
}

export interface AuditEntry {
  id: string
  time: string
  actor: string
  action: string
  reason: string
}

export const DUAL_APPROVAL_THRESHOLD = 10_000
export const ADMIN_ACTORS = ['Compliance A', 'Compliance B'] as const
