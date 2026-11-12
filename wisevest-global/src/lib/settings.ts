import { DUAL_APPROVAL_THRESHOLD } from './types'

export const MINIMUM_DEPOSIT = 100
export const MINIMUM_WITHDRAWAL = 50

export type SettingsTabId = 'profile' | 'transaction-limits' | 'notifications' | 'referrals' | 'security'

export const SETTINGS_TABS: { id: SettingsTabId; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'transaction-limits', label: 'Transaction limits' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'referrals', label: 'Referrals' },
  { id: 'security', label: 'Security' },
]

export const NOTIFICATION_GROUPS = [
  {
    id: 'delivery',
    title: 'Delivery channels',
    preferences: [
      { id: 'in-app', label: 'In-app notifications', enabled: true, required: true },
      { id: 'email', label: 'Email alerts', enabled: true },
      { id: 'push', label: 'Push notifications', enabled: false },
    ],
  },
  {
    id: 'account-activity',
    title: 'Account activity',
    preferences: [
      { id: 'deposits', label: 'Deposit confirmations', enabled: true },
      { id: 'investments', label: 'Investment activity', enabled: true },
      { id: 'withdrawals', label: 'Withdrawal status updates', enabled: true },
      { id: 'valuations', label: 'Project valuation updates', enabled: true },
    ],
  },
  {
    id: 'security',
    title: 'Security and compliance',
    preferences: [
      { id: 'new-login', label: 'New sign-in alerts', enabled: true },
      { id: 'security-changes', label: 'Security setting changes', enabled: true },
      { id: 'kyc', label: 'Identity verification updates', enabled: true },
      { id: 'account-restrictions', label: 'Account restriction notices', enabled: true },
    ],
  },
  {
    id: 'product-updates',
    title: 'Product updates',
    preferences: [
      { id: 'announcements', label: 'Product announcements', enabled: true },
      { id: 'education', label: 'Investment education', enabled: false },
    ],
  },
] as const

export const DEFAULT_NOTIFICATION_PREFERENCES: Record<string, boolean> = Object.fromEntries(
  NOTIFICATION_GROUPS.flatMap((group) => group.preferences.map(({ id, enabled }) => [id, enabled] as const)),
)

export const TRANSACTION_RULES = [
  { id: 'deposit-minimum', label: 'Minimum deposit', amount: MINIMUM_DEPOSIT, detail: 'Deposits below this amount are not accepted.' },
  { id: 'withdrawal-minimum', label: 'Minimum withdrawal', amount: MINIMUM_WITHDRAWAL, detail: 'Withdrawals below this amount are not accepted.' },
  {
    id: 'dual-approval',
    label: 'Additional withdrawal review',
    amount: DUAL_APPROVAL_THRESHOLD,
    detail: 'Withdrawals above this amount require approval from a second administrator.',
  },
] as const
