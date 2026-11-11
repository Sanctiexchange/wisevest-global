# WiseVest Global (frontend)

React 18 + TypeScript + Tailwind CSS + React Router + Zustand. Implements Phase 1 of the PRD/BRD: the public site, signup and KYC, client dashboard, projects and invest flow, and the admin console, all running against a **mock API**. No real money, identity data or blockchain is involved.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build
```

Demo sign-in (on /login): "Continue as demo investor" (KYC approved, $2,450 cash, three investments) or "Continue as demo admin".

Try the connected flow: register a new account, finish the six KYC steps, sign in as demo admin and approve the case in the KYC queue, then sign back in as that investor to deposit, invest and withdraw. State is shared and saved in localStorage, so the client and admin views stay in sync. "Reset demo data" is in the admin sidebar.

## Structure

```
src/
  api.ts            Mock API: every business rule lives here (the only file to replace)
  store.ts          Persisted mock database (Zustand)
  lib/              types, seed data (demo only), formatters
  components/       ui.tsx primitives, charts.tsx, layouts.tsx (public, client, admin)
  pages/            Landing, Auth (login + KYC wizard), Projects (+ invest modal), Client, Admin
tailwind.config.js  Design tokens: colours, fonts, gradients
```

## Rules enforced in `api.ts` (move these to the server)

- Deposits, investments and withdrawals are blocked until KYC is approved.
- KYC cannot be approved with a sanctions flag or a face match under 80%; rejections need a reason.
- Withdrawals need 2FA and a valid destination; rejected withdrawals refund the balance.
- Withdrawals over $10,000 need two different admins (use "Acting as" in the admin sidebar).
- Deposits are credited only after the required confirmations.
- Valuation updates require a documented source; every admin action is audited.

## Replacing the mock with a real backend

1. Keep the function signatures in `src/api.ts` and re-implement each with `fetch` calls to your API.
2. Replace the Zustand mock database with server state (TanStack Query or similar) and keep the store for session only.
3. Enforce every rule above on the server. The UI checks are for usability, not security.

## Before launch (see the PRD/BRD, sections 6, 8, 9 and 16)

- Licensing and legal sign-off per jurisdiction; replace all demo figures, fees and documents with real, approved ones.
- Real authentication with TOTP 2FA, KYC/AML and sanctions provider, custody and wallet provider, bank integration.
- Security review, penetration test, audit logging that cannot be altered, accessibility audit (WCAG 2.2 AA).
