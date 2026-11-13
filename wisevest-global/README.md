# WiseVest Global

WiseVest Global is a React + TypeScript front-end prototype for a digital investment platform that combines a public investor-facing experience with internal compliance and operations workflows. The app models a simplified fintech investment flow, including onboarding, KYC review, project investing, deposits, withdrawals, and an admin operations dashboard.

This repository is a product prototype. Supabase can provide authentication, project listings, role-controlled admin operations, KYC document intake, and request-only deposit and withdrawal review. It does not process payments, hold funds, or execute payouts.

## Product overview

WiseVest Global helps investors:

- Explore available investment opportunities
- Create an account and complete KYC
- Deposit funds
- Invest in projects
- Track portfolio performance and transaction history
- Withdraw funds in a controlled compliance flow

It also supports admin users who can:

- Review and approve KYC submissions
- Review deposit and withdrawal requests without moving funds
- Manage flagged or rejected cases
- Monitor project status and operational activity
- Audit admin actions and decision history

## Key features

- Public landing page for the brand and investment proposition
- Project listing and project detail pages
- Investor registration and login flow
- Guided KYC flow with validation rules
- Client dashboard with balances, portfolio activity, and transactions
- Account settings for profile details, transaction rules, notifications, referrals, and security
- Investment flows for funding and allocation decisions
- Withdrawal process with compliance and 2FA-related checks
- Transaction disputes and in-app Help & Support requests
- CSV exports for client transactions and the admin audit log
- Search and filters for transaction and audit tables; exports respect active filters
- Admin console for operations and compliance review
- Admin project creation with required risk disclosures; new projects remain drafts until explicitly opened
- Supabase-backed authentication, projects, admin operations, KYC intake, and review-only financial requests when configured
- Persistent mock data layer using Zustand for the remaining demo workflows
- Responsive UI built with Tailwind CSS

## Tech stack

- React 18
- TypeScript
- Vite
- React Router
- Tailwind CSS
- Zustand
- Supabase Auth and Postgres (initial backend foundation)

## Architecture

The app uses a simplified mock architecture intended to mirror a real fintech product while keeping the repo lightweight and easy to understand.

- `src/App.tsx` defines the route structure
- `src/pages/` contains the public, client, and admin screens
- `src/components/` contains shared layout, chart, and UI primitives
- `src/lib/settings.ts` defines the account settings tabs and demo transaction/notification configuration
- Admin project creation validates required offering details and disclosures before adding a draft to the mock store
- `src/api.ts` contains the client API layer, including Supabase-backed user and admin operations
- `src/store.ts` holds the persisted mock data store
- `src/lib/supabase.ts` configures the optional Supabase client and database types
- `supabase/migrations/` contains the profile/project foundation and the admin-console schema, row-level security policies, and RPCs

## Project structure

```text
wisevest-global/
├── src/
│   ├── api.ts
│   ├── App.tsx
│   ├── index.css
│   ├── main.tsx
│   ├── store.ts
│   ├── lib/
│   │   ├── format.ts
│   │   ├── seed.ts
│   │   ├── settings.ts
│   │   ├── supabase.ts
│   │   └── types.ts
│   ├── components/
│   │   ├── charts.tsx
│   │   ├── layouts.tsx
│   │   ├── SupportModal.tsx
│   │   └── ui.tsx
│   └── pages/
│       ├── Admin.tsx
│       ├── Auth.tsx
│       ├── Client.tsx
│       ├── Landing.tsx
│       ├── Projects.tsx
│       └── Settings.tsx
├── index.html
├── supabase/
│   └── migrations/
├── package.json
├── package-lock.json
├── postcss.config.js
├── tailwind.config.js
├── tsconfig.json
├── vite.config.ts
├── .gitignore
└── README.md
```

## Getting started

### Prerequisites

- Node.js 18+
- npm

### Install dependencies

```bash
npm install
```

### Configure Supabase

1. Create a Supabase project.
2. Apply both migrations in `supabase/migrations/` in filename order, using the Supabase CLI or SQL Editor.
3. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from the project API settings. The browser key is public; never put a service-role key in a `VITE_` variable.
4. In Supabase Auth settings, configure the site URL and redirect URLs for your local and deployed app.
5. Restart the Vite server after changing environment variables.
6. To provision a super-admin, the Supabase project owner must set `"role": "super_admin"` in that user's **app_metadata** in Supabase Auth. Never set roles in user-editable metadata. After the user's next sign-in, a super-admin can assign regular admin roles from the console.

With both environment variables set, registration/sign-in use Supabase Auth and project/admin data use Postgres. Without them, the browser demo remains available. The foundation migration inserts example project listings; replace these with reviewed, accurate offering information before use.

The second migration adds protected profile roles, KYC cases and a private document bucket, deposit/withdrawal request queues, project controls, and persistent audit events. KYC decisions are manual; no identity-match or sanctions provider is connected. Deposits marked verified and withdrawals marked approved are only reviewed/authorized requests, not completed payments or payouts. Withdrawals require approved KYC and verified Supabase TOTP; requests over $10,000 require a second, distinct admin approval. No wallet balances are stored or changed.

### Run locally

```bash
npm run dev
```

Then open:

- http://localhost:5173

### Production build

```bash
npm run build
```

## Demo access

The app includes demo user flows for quick testing:

- Demo investor login
- Demo admin login
- Sample KYC approval and rejection scenarios
- Preloaded project, investment, and transaction data

Use the demo paths in the UI to explore the investor and compliance workflows without needing a backend service.

## Business rules modeled in the app

The demo backend in `src/api.ts` enforces key product rules such as:

- Deposits, investments, and withdrawals are blocked until KYC is approved
- KYC approval requires a clean sanctions result and a face match above threshold
- Withdrawals require 2FA and valid destination details
- Large withdrawals require multi-admin authorization
- Deposits only credit after the required number of confirmations
- Valuation updates need a documented source
- Admin activity is tracked in an audit trail

These rules are intentionally documented in a way that makes it easy to move them to a real backend API later.

## Important note

This project remains a prototype and is not production-ready finance software. The app remains a prototype and is not production-ready finance software. Investment execution, custody, payment rails, real identity and sanctions checks, and support workflows are not integrated. Real deployment would also require:

- secure authentication and identity verification
- real document and sanctions checks
- custody or wallet integration
- approved banking and payment rails
- audit logging that cannot be altered
- compliance reviews and legal sign-off

## Suggested next steps

1. Replace the remaining Zustand mock workflows with server-side, transaction-safe APIs
2. Add verified role-based authorization and audited admin operations
3. Integrate KYC/AML and sanctions providers
4. Add approved custody, banking and payout integrations
5. Harden security, accessibility, and audit controls
6. Prepare product documentation and regulatory review materials

## License

This project currently does not include a formal license file. If you plan to distribute or commercialize it, add the appropriate open-source or commercial license before launch.

## Documentation note

A Notion-ready project brief is also included in the repository under `docs/notion-project-brief.md` for easy copy/paste into Notion or project planning tools.
