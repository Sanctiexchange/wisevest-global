import { createClient } from '@supabase/supabase-js'
import type { Category, Project } from './types'

export type ProjectRow = {
  id: string
  name: string
  category: Category
  icon: string
  risk: Project['risk']
  min_invest: number
  term: string
  target_return: string
  raised_pct: number
  goal: string
  funding_goal: number | null
  fees: string
  exit_terms: string
  description: string
  risks: Project['risks']
  status: Project['status']
  last_valuation: string
}

export type ProfileRow = {
  id: string
  email: string
  full_name: string
  role: 'client' | 'admin'
  is_super_admin: boolean
  account_status: 'active' | 'suspended'
  kyc_status: 'not_started' | 'under_review' | 'approved' | 'rejected'
  created_at: string
  updated_at: string
}

export type KycCaseRow = {
  id: string
  user_id: string
  name: string
  country: string
  doc_type: string
  identity_document_path: string
  selfie_path: string
  status: 'pending' | 'approved' | 'rejected'
  review_reason: string | null
  reviewed_by: string | null
  created_at: string
  updated_at: string
}

export type DepositRequestRow = {
  id: string
  user_id: string
  amount: number
  method: 'BTC' | 'USDT' | 'USDC' | 'Bank'
  external_reference: string
  status: 'pending' | 'verified' | 'rejected'
  review_reason: string | null
  reviewed_by: string | null
  created_at: string
  updated_at: string
}

export type WithdrawalRequestRow = {
  id: string
  user_id: string
  amount: number
  method: 'BTC' | 'USDT' | 'USDC' | 'Bank'
  destination: string
  status: 'pending' | 'awaiting_second' | 'approved' | 'rejected'
  first_approver_id: string | null
  review_reason: string | null
  reviewed_by: string | null
  created_at: string
  updated_at: string
}

export type AuditEventRow = {
  id: number
  actor_id: string | null
  actor_email: string
  action: string
  target_type: string
  target_id: string | null
  reason: string
  created_at: string
}

export type SimulatedWalletBalanceRow = {
  user_id: string
  balance: number
  updated_at: string
}

export type SimulatedBalanceCreditRow = {
  id: string
  user_id: string
  amount: number
  balance_after: number
  reason: string
  created_by: string | null
  created_at: string
}

export type InvestmentRow = {
  id: string
  user_id: string
  project_id: string
  amount: number
  value: number
  created_at: string
}

type EmptyRow = Record<string, never>

type Database = {
  public: {
    Tables: {
      projects: {
        Row: ProjectRow
        Insert: Omit<ProjectRow, 'id' | 'funding_goal'> & { id?: string; funding_goal?: number | null }
        Update: Partial<Omit<ProjectRow, 'id'>>
        Relationships: []
      }
      investments: {
        Row: InvestmentRow
        Insert: EmptyRow
        Update: EmptyRow
        Relationships: []
      }
      profiles: {
        Row: ProfileRow
        Insert: { id: string; email?: string; full_name?: string }
        Update: { full_name?: string }
        Relationships: []
      }
      kyc_cases: {
        Row: KycCaseRow
        Insert: EmptyRow
        Update: EmptyRow
        Relationships: []
      }
      deposit_requests: {
        Row: DepositRequestRow
        Insert: EmptyRow
        Update: EmptyRow
        Relationships: []
      }
      withdrawal_requests: {
        Row: WithdrawalRequestRow
        Insert: EmptyRow
        Update: EmptyRow
        Relationships: []
      }
      audit_events: {
        Row: AuditEventRow
        Insert: EmptyRow
        Update: EmptyRow
        Relationships: []
      }
      simulated_wallet_balances: {
        Row: SimulatedWalletBalanceRow
        Insert: EmptyRow
        Update: EmptyRow
        Relationships: []
      }
      simulated_balance_credits: {
        Row: SimulatedBalanceCreditRow
        Insert: EmptyRow
        Update: EmptyRow
        Relationships: []
      }
      project_valuations: {
        Row: { id: string; project_id: string; change_pct: number; source_note: string; created_by: string | null; created_at: string }
        Insert: EmptyRow
        Update: EmptyRow
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      admin_set_user_role: { Args: { p_user_id: string; p_role: 'client' | 'admin' }; Returns: undefined }
      admin_set_account_status: { Args: { p_user_id: string; p_status: 'active' | 'suspended'; p_reason: string }; Returns: undefined }
      submit_kyc: { Args: { p_name: string; p_country: string; p_doc_type: string; p_identity_document_path: string; p_selfie_path: string }; Returns: string }
      admin_review_kyc: { Args: { p_case_id: string; p_decision: 'approved' | 'rejected'; p_reason?: string }; Returns: undefined }
      submit_deposit_request: { Args: { p_amount: number; p_method: 'BTC' | 'USDT' | 'USDC' | 'Bank'; p_external_reference: string }; Returns: string }
      admin_review_deposit: { Args: { p_request_id: string; p_decision: 'verified' | 'rejected'; p_reason?: string }; Returns: undefined }
      submit_withdrawal_request: { Args: { p_amount: number; p_method: 'BTC' | 'USDT' | 'USDC' | 'Bank'; p_destination: string }; Returns: string }
      admin_review_withdrawal: { Args: { p_request_id: string; p_decision: 'approve' | 'reject'; p_reason?: string }; Returns: string }
      admin_simulate_balance_credit: { Args: { p_user_id: string; p_amount: number; p_reason: string }; Returns: string }
      admin_post_project_valuation: { Args: { p_project_id: string; p_change_pct: number; p_source_note: string }; Returns: undefined }
      invest_in_project: { Args: { p_project_id: string; p_amount: number }; Returns: string }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

if (Boolean(supabaseUrl) !== Boolean(supabaseKey)) {
  throw new Error('Set both VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable Supabase.')
}

export const supabase = supabaseUrl && supabaseKey
  ? createClient<Database>(supabaseUrl, supabaseKey)
  : null
export const isSupabaseConfigured = supabase !== null
