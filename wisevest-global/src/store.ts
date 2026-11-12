import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuditEntry, Deposit, Investment, KycCase, KycDocuments, Project, SupportRequest, TransactionDispute, Tx, User, Withdrawal } from './lib/types'
import { DEMO_USER_ID, seedDeposits, seedKyc, seedProjects, seedUsers, seedWithdrawals } from './lib/seed'

/**
 * Mock database. In production this state lives on the server; the UI only ever
 * talks to `src/api.ts`, so swapping in a real backend means rewriting that file.
 */
export interface DB {
  user: User | null
  users: User[]
  credentials: { email: string; password: string }[]
  cash: number
  balances: Record<string, number>
  kycDocuments: Record<string, KycDocuments>
  investments: Investment[]
  txs: Tx[]
  projects: Project[]
  kycCases: KycCase[]
  deposits: Deposit[]
  withdrawals: Withdrawal[]
  audit: AuditEntry[]
  adminActor: string
  notificationPreferences: Record<string, Record<string, boolean>>
}

const initial = (): DB => ({
  user: null,
  users: seedUsers,
  credentials: [],
  cash: 0,
  balances: { [DEMO_USER_ID]: 2450 },
  kycDocuments: {},
  investments: [],
  txs: [],
  projects: seedProjects,
  kycCases: seedKyc,
  deposits: seedDeposits,
  withdrawals: seedWithdrawals,
  audit: [],
  adminActor: 'Compliance A',
  notificationPreferences: {},
})

/** Before v5 one preference map was shared by every account; keep it only for the user who was signed in. */
function migrateNotificationPreferences(previous: Partial<DB>, version: number): DB['notificationPreferences'] {
  const stored = previous.notificationPreferences as unknown
  if (!stored || typeof stored !== 'object') return {}
  if (version >= 5) return stored as DB['notificationPreferences']
  const userId = previous.user?.id
  return userId ? { [userId]: stored as Record<string, boolean> } : {}
}

export const useStore = create<DB & { reset: () => void }>()(
  persist(
    (set) => ({
      ...initial(),
      reset: () => set(initial()),
    }),
    {
      name: 'wisevest-mock-db-v1',
      version: 5,
      partialize: (state) => ({ ...state, kycDocuments: {} }),
      migrate: (persistedState, version) => {
        const previous = persistedState as Partial<DB> & {
          credentials?: DB['credentials'] | { email: string; password: string } | null
        }
        const credentials: DB['credentials'] = Array.isArray(previous.credentials)
          ? previous.credentials
          : previous.credentials ? [previous.credentials as { email: string; password: string }] : []
        const notificationPreferences = migrateNotificationPreferences(previous, version)
        if (version >= 2) return { ...initial(), ...previous, credentials, notificationPreferences } as DB
        const users = [...(previous.users ?? seedUsers)]
        if (previous.user?.role === 'client' && !users.some((user) => user.id === previous.user?.id))
          users.push(previous.user)
        const balances = { ...(previous.balances ?? {}) }
        if (previous.user?.role === 'client' && balances[previous.user.id] === undefined)
          balances[previous.user.id] = previous.cash ?? 0
        const deposits = (previous.deposits ?? seedDeposits).map((deposit) => {
          if (deposit.userId) return deposit
          if (deposit.id === 'D-3101') return { ...deposit, userId: 'U-5' }
          if (deposit.id === 'D-3102') return { ...deposit, userId: 'U-4' }
          return deposit
        })
        return { ...initial(), ...previous, users, balances, deposits, credentials, notificationPreferences }
      },
    },
  ),
)

export const emptyDb = initial
