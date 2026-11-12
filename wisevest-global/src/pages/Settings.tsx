import { useState } from 'react'
import { ApiError, auth } from '../api'
import { Button, Field, Modal, PageTitle, cx, useToast } from '../components/ui'
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_GROUPS,
  SETTINGS_TABS,
  TRANSACTION_RULES,
  type SettingsTabId,
} from '../lib/settings'
import { money } from '../lib/format'
import { useStore } from '../store'

function ProfileSettings() {
  const user = useStore((state) => state.user)!
  const kycLabel = user.kyc.replace(/_/g, ' ')
  const badgeTone = user.kyc === 'approved'
    ? 'border-neon/40 bg-brand-soft text-neon'
    : 'border-amber/40 bg-amber/10 text-amber'

  return (
    <div className="space-y-4">
      <section className="card flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">{user.name}</h2>
          <p className="truncate text-sm text-muted">{user.email}</p>
        </div>
        <span className={cx('rounded-full border px-3 py-1 text-xs font-medium capitalize', badgeTone)}>
          Identity {kycLabel}
        </span>
      </section>

      <section className="card">
        <h2 className="mb-3 text-base font-semibold">Account information</h2>
        <dl className="divide-y divide-line">
          {[
            ['Full name', user.name],
            ['Email address', user.email],
            ['Identity verification', kycLabel],
            ['Two-factor authentication', user.twoFa ? 'Enabled' : 'Not enabled'],
          ].map(([label, value]) => (
            <div key={label} className="flex flex-col gap-1 py-3 text-sm sm:flex-row sm:justify-between">
              <dt className="text-muted">{label}</dt>
              <dd className="break-all font-medium capitalize sm:text-right">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="fine">
        Identity details are read-only in this prototype. Changes to verified information require a compliance review.
      </p>
    </div>
  )
}

function TransactionLimitsSettings() {
  return (
    <section className="space-y-3">
      <p className="fine">These are WiseVest demo transaction rules, not user-specific account limits.</p>
      <div className="grid gap-3 md:grid-cols-3">
        {TRANSACTION_RULES.map((rule) => (
          <article key={rule.id} className="card">
            <h2 className="text-sm font-semibold">{rule.label}</h2>
            <p className="mt-2 font-head text-2xl font-bold">{money(rule.amount, 0)}</p>
            <p className="mt-2 text-xs leading-relaxed text-muted">{rule.detail}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function NotificationSettings() {
  const preferences = useStore((state) => state.notificationPreferences)
  const updatePreference = (id: string, enabled: boolean) => {
    useStore.setState((state) => ({
      notificationPreferences: { ...state.notificationPreferences, [id]: enabled },
    }))
  }

  return (
    <div className="max-w-2xl space-y-5">
      <p className="fine">Preferences are saved in this browser for the demo account.</p>
      {NOTIFICATION_GROUPS.map((group) => (
        <section key={group.id}>
          <h2 className="mb-2 text-sm font-semibold">{group.title}</h2>
          <div className="card space-y-1">
            {group.preferences.map((preference) => {
              const checked = preferences[preference.id] ?? DEFAULT_NOTIFICATION_PREFERENCES[preference.id]
              return (
                <label key={preference.id} className="flex items-center justify-between gap-4 border-b border-line py-3 last:border-0">
                  <span className="text-sm">{preference.label}</span>
                  <input
                    type="checkbox"
                    role="switch"
                    aria-label={preference.label}
                    checked={checked}
                    disabled={'required' in preference && preference.required}
                    onChange={(event) => updatePreference(preference.id, event.target.checked)}
                    className="h-4 w-4 accent-neon disabled:cursor-not-allowed"
                  />
                </label>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

function ReferralsSettings() {
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-line bg-surface p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-neon">Referral programme</p>
        <h2 className="mt-2 text-xl font-bold">Invite friends to invest with confidence</h2>
        <p className="mt-1 text-sm text-muted">Referral rewards are not configured in this prototype.</p>
      </section>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ['Referrals', '0'],
          ['Active investors', '0'],
          ['Rewards earned', money(0, 0)],
        ].map(([label, value]) => (
          <article key={label} className="card">
            <p className="text-xs text-muted">{label}</p>
            <p className="mt-2 text-xl font-semibold">{value}</p>
          </article>
        ))}
      </div>
    </div>
  )
}

function SecuritySettings() {
  const user = useStore((state) => state.user)!
  const toast = useToast()
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [twoFactorBusy, setTwoFactorBusy] = useState(false)

  const closePassword = () => {
    setPasswordOpen(false)
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setError('')
  }

  const setTwoFactor = async (enabled: boolean) => {
    setTwoFactorBusy(true)
    try {
      await auth.setTwoFactor(enabled)
      toast(`Two-factor authentication ${enabled ? 'enabled' : 'disabled'}.`)
    } catch (issue) {
      toast(issue instanceof ApiError ? issue.message : 'Could not update two-factor authentication.')
    } finally {
      setTwoFactorBusy(false)
    }
  }

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.')
      return
    }
    setBusy(true)
    try {
      await auth.changePassword(currentPassword, newPassword)
      closePassword()
      toast('Password updated.')
    } catch (issue) {
      setError(issue instanceof ApiError ? issue.message : 'Could not update the password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <section className="card max-w-2xl divide-y divide-line">
        <div className="flex flex-wrap items-center justify-between gap-4 py-3 first:pt-0">
          <div>
            <h2 className="text-sm font-semibold">Password</h2>
            <p className="mt-1 text-xs text-muted">Use a unique password with at least 10 characters.</p>
          </div>
          <Button variant="ghost" className="!px-4 !py-2 text-sm" onClick={() => { setError(''); setPasswordOpen(true) }}>
            Change password
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Two-factor authentication</h2>
            <p className="mt-1 text-xs text-muted">Required before you can request a withdrawal.</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span>{user.twoFa ? 'On' : 'Off'}</span>
            <input
              type="checkbox"
              role="switch"
              aria-label="Two-factor authentication"
              checked={user.twoFa}
              disabled={twoFactorBusy}
              onChange={(event) => { void setTwoFactor(event.target.checked) }}
              className="h-4 w-4 accent-neon"
            />
          </label>
        </div>
        <p className="pt-3 text-xs leading-relaxed text-muted">
          Demo mode stores the enabled status only; it does not provision authenticator codes or deliver verification messages.
        </p>
      </section>

      <Modal open={passwordOpen} onClose={closePassword}>
        <h2 className="text-xl font-bold">Change password</h2>
        <p className="mt-1 text-sm text-muted">Choose a strong password for your account.</p>
        <form className="mt-2" onSubmit={changePassword}>
          <Field label="Current password" htmlFor="settings-current-password">
            <input
              id="settings-current-password"
              type="password"
              autoComplete="current-password"
              className="input"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
          </Field>
          <Field label="New password" htmlFor="settings-new-password">
            <input
              id="settings-new-password"
              type="password"
              autoComplete="new-password"
              className="input"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              minLength={10}
              required
            />
          </Field>
          <Field label="Confirm new password" htmlFor="settings-confirm-password" error={error}>
            <input
              id="settings-confirm-password"
              type="password"
              autoComplete="new-password"
              className="input"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </Field>
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="ghost" className="!px-4 !py-2 text-sm" onClick={closePassword}>
              Cancel
            </Button>
            <Button type="submit" className="!px-4 !py-2 text-sm" loading={busy}>
              Update password
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}

export default function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTabId>('profile')
  const activeContent = {
    profile: <ProfileSettings />,
    'transaction-limits': <TransactionLimitsSettings />,
    notifications: <NotificationSettings />,
    referrals: <ReferralsSettings />,
    security: <SecuritySettings />,
  }[activeTab]

  return (
    <>
      <PageTitle title="Account settings" sub="Manage your account preferences and security." />
      <div className="mb-5 overflow-x-auto rounded-xl border border-line bg-surface2 p-1">
        <div className="flex min-w-max gap-1" role="tablist" aria-label="Account settings">
          {SETTINGS_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cx(
                'rounded-lg px-3 py-2 text-xs font-medium transition-colors',
                activeTab === tab.id ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:bg-surface/60 hover:text-ink',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <div role="tabpanel">{activeContent}</div>
    </>
  )
}
