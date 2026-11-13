import { createClient } from '@supabase/supabase-js'
import type { Category, Project } from './types'

export interface ProjectRow {
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
  fees: string
  exit_terms: string
  description: string
  risks: Project['risks']
  status: Project['status']
  last_valuation: string
}

interface Database {
  public: {
    Tables: {
      projects: {
        Row: ProjectRow
        Insert: Omit<ProjectRow, 'id'> & { id?: string }
        Update: Partial<Omit<ProjectRow, 'id'>>
        Relationships: []
      }
      profiles: {
        Row: { id: string; full_name: string; created_at: string; updated_at: string }
        Insert: { id: string; full_name?: string }
        Update: { full_name?: string; updated_at?: string }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
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
