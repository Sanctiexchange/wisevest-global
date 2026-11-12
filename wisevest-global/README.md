# WiseVest Global

WiseVest Global is a React + TypeScript front-end prototype for a digital investment platform that combines a public investor-facing experience with internal compliance and operations workflows. The app models a simplified fintech investment flow, including onboarding, KYC review, project investing, deposits, withdrawals, and an admin operations dashboard.

This repository is built as a working demo and a product blueprint. It is designed to demonstrate how a regulated investment platform could behave from a UX and workflow standpoint, while keeping business rules explicit and easy to replace with a real backend later.

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
- Review and process deposit and withdrawal requests
- Manage flagged or rejected cases
- Monitor project status and operational activity
- Audit admin actions and decision history

## Key features

- Public landing page for the brand and investment proposition
- Project listing and project detail pages
- Investor registration and login flow
- Guided KYC flow with validation rules
- Client dashboard with balances, portfolio activity, and transactions
- Investment flows for funding and allocation decisions
- Withdrawal process with compliance and 2FA-related checks
- Admin console for operations and compliance review
- Persistent mock data layer using Zustand to simulate a database
- Responsive UI built with Tailwind CSS

## Tech stack

- React 18
- TypeScript
- Vite
- React Router
- Tailwind CSS
- Zustand

## Architecture

The app uses a simplified mock architecture intended to mirror a real fintech product while keeping the repo lightweight and easy to understand.

- `src/App.tsx` defines the route structure
- `src/pages/` contains the public, client, and admin screens
- `src/components/` contains shared layout, chart, and UI primitives
- `src/api.ts` contains the mocked business logic and rules
- `src/store.ts` holds the persisted mock data store

## Project structure

```text
wisevest-global/
├── src/
│   ├── api.ts
│   ├── App.tsx
│   ├── index.css
│   ├── main.tsx
│   ├── store.ts
│   ├── components/
│   │   ├── charts.tsx
│   │   ├── layouts.tsx
│   │   └── ui.tsx
│   └── pages/
│       ├── Admin.tsx
│       ├── Auth.tsx
│       ├── Client.tsx
│       ├── Landing.tsx
│       └── Projects.tsx
├── index.html
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

The mock backend in `src/api.ts` enforces key product rules such as:

- Deposits, investments, and withdrawals are blocked until KYC is approved
- KYC approval requires a clean sanctions result and a face match above threshold
- Withdrawals require 2FA and valid destination details
- Large withdrawals require multi-admin authorization
- Deposits only credit after the required number of confirmations
- Valuation updates need a documented source
- Admin activity is tracked in an audit trail

These rules are intentionally documented in a way that makes it easy to move them to a real backend API later.

## Important note

This project is a front-end prototype and mock business layer. It is not yet production-ready finance software. It demonstrates the user experience and workflow logic, but real deployment would require:

- secure authentication and identity verification
- real document and sanctions checks
- custody or wallet integration
- approved banking and payment rails
- audit logging that cannot be altered
- compliance reviews and legal sign-off

## Suggested next steps

1. Connect the UI to a real API and database
2. Replace the Zustand mock store with server-driven state management
3. Add authentication, authorization, and role-based access control
4. Integrate KYC/AML and sanctions providers
5. Add bank deposit and payout integrations
6. Harden security, accessibility, and audit controls
7. Prepare product documentation and regulatory review materials

## License

This project currently does not include a formal license file. If you plan to distribute or commercialize it, add the appropriate open-source or commercial license before launch.

## Documentation note

A Notion-ready project brief is also included in the repository under `docs/notion-project-brief.md` for easy copy/paste into Notion or project planning tools.
