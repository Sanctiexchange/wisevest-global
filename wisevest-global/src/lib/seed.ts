import type { Deposit, Investment, KycCase, Project, Tx, User, Withdrawal } from './types'

// All figures are demo data. Replace with real, documented project data before launch.
export const seedProjects: Project[] = [
  {
    id: 'btc-a', name: 'Bitcoin Strategy Fund A', category: 'Bitcoin', icon: '₿', risk: 'High',
    minInvest: 100, term: '12 months', targetReturn: '10–25% (target)', raisedPct: 68, goal: '$2.0M',
    fees: '2% management, 10% performance', exit: 'Quarterly redemption windows, 30-day notice', status: 'Open', lastValuation: '2026-10-01',
    description: 'A company-managed strategy combining Bitcoin holdings with a rules-based allocation. Value moves closely with Bitcoin and can fall sharply.',
    risks: [
      { title: 'Price volatility', text: 'Bitcoin can lose a large share of its value in a short period.' },
      { title: 'Custody and security', text: 'Assets are held with third-party custodians and carry cyber and operational risk.' },
      { title: 'Liquidity', text: 'Redemptions are only available in set windows.' },
    ],
  },
  {
    id: 'btc-m', name: 'Bitcoin Mining Partnership', category: 'Bitcoin', icon: '⛏', risk: 'High',
    minInvest: 500, term: '24 months', targetReturn: '12–30% (target)', raisedPct: 41, goal: '$1.5M',
    fees: '1.5% management, 15% performance', exit: 'Held to term; secondary transfer subject to approval', status: 'Open', lastValuation: '2026-09-20',
    description: 'Participation in a managed mining operation. Returns depend on Bitcoin price, network difficulty, hardware performance and power costs.',
    risks: [
      { title: 'Price and difficulty', text: 'Lower prices or higher difficulty can erase margins.' },
      { title: 'Hardware and power', text: 'Equipment failure or energy cost rises reduce output.' },
      { title: 'Regulation', text: 'Mining rules vary and may change.' },
    ],
  },
  {
    id: 'solar', name: 'Solar Energy Project', category: 'Energy', icon: '☀', risk: 'Medium',
    minInvest: 250, term: '24 months', targetReturn: '8–14% (target)', raisedPct: 82, goal: '$3.2M',
    fees: '1.5% management', exit: 'Held to term; early exit at company discretion with fee', status: 'Open', lastValuation: '2026-09-15',
    description: 'Development and operation of a solar generation site with a planned power purchase agreement. Returns depend on construction, output and offtake.',
    risks: [
      { title: 'Construction delay', text: 'Delays push back income and can raise costs.' },
      { title: 'Offtake and pricing', text: 'Revenue depends on the power purchase agreement being honoured.' },
      { title: 'Regulatory and grid access', text: 'Permits and grid connection may change.' },
    ],
  },
  {
    id: 'grid', name: 'Community Power Grid', category: 'Energy', icon: '⚡', risk: 'Medium',
    minInvest: 500, term: '36 months', targetReturn: '9–15% (target)', raisedPct: 27, goal: '$4.0M',
    fees: '1.75% management', exit: 'Held to term', status: 'Open', lastValuation: '2026-09-01',
    description: 'Build-out of a distributed mini-grid serving businesses and households under metered contracts.',
    risks: [
      { title: 'Collection risk', text: 'Customer payment shortfalls reduce income.' },
      { title: 'Asset risk', text: 'Equipment damage or theft can interrupt revenue.' },
      { title: 'Currency', text: 'Local-currency revenue can lose value against the dollar.' },
    ],
  },
  {
    id: 'resi', name: 'Residential Development', category: 'Real estate', icon: '🏢', risk: 'Medium',
    minInvest: 1000, term: '36 months', targetReturn: '10–18% (target)', raisedPct: 55, goal: '$5.0M',
    fees: '2% management, 10% on profit', exit: 'Held to term; sale of units distributes proceeds', status: 'Open', lastValuation: '2026-10-10',
    description: 'Construction and sale of residential units on titled land, with independent valuation and staged build milestones.',
    risks: [
      { title: 'Construction and cost overruns', text: 'Budget or schedule slips reduce profit.' },
      { title: 'Sales market', text: 'Units may sell slower or for less than planned.' },
      { title: 'Title and permits', text: 'Legal or planning issues can halt the project.' },
    ],
  },
  {
    id: 'rent', name: 'Income Property Portfolio', category: 'Real estate', icon: '🏠', risk: 'Low–Medium',
    minInvest: 500, term: '48 months', targetReturn: '6–10% (target)', raisedPct: 90, goal: '$2.5M',
    fees: '1.25% management', exit: 'Annual redemption window, subject to liquidity', status: 'Open', lastValuation: '2026-10-05',
    description: 'A portfolio of rental properties generating income, with periodic independent valuations.',
    risks: [
      { title: 'Vacancy', text: 'Empty units reduce rental income.' },
      { title: 'Valuation', text: 'Property values can fall and valuations are estimates.' },
      { title: 'Liquidity', text: 'Property is hard to sell quickly.' },
    ],
  },
]

export const DEMO_USER_ID = 'U-DEMO'

export const seedUsers: User[] = [
  { id: DEMO_USER_ID, name: 'Amara Okafor', email: 'amara@example.com', role: 'client', kyc: 'approved', twoFa: true },
  { id: 'U-2', name: 'Daniel Mensah', email: 'daniel@example.com', role: 'client', kyc: 'under_review', twoFa: false },
  { id: 'U-3', name: 'Li Wen', email: 'li@example.com', role: 'client', kyc: 'under_review', twoFa: false },
  { id: 'U-4', name: 'Sara Khan', email: 'sara@example.com', role: 'client', kyc: 'under_review', twoFa: false },
  { id: 'U-5', name: 'Chidi Eze', email: 'chidi@example.com', role: 'client', kyc: 'approved', twoFa: true },
]

export const seedInvestments: Investment[] = [
  { id: 'I-1', projectId: 'btc-a', amount: 5000, value: 5420, date: '2026-08-20' },
  { id: 'I-2', projectId: 'solar', amount: 3000, value: 3090, date: '2026-09-02' },
  { id: 'I-3', projectId: 'resi', amount: 4000, value: 4000, date: '2026-10-12' },
]

export const seedTxs: Tx[] = [
  { id: 'T-5', date: '2026-10-12', type: 'Investment', detail: 'Residential Development', amount: -4000, status: 'Completed' },
  { id: 'T-4', date: '2026-09-28', type: 'Deposit', detail: 'USDT', amount: 4000, status: 'Completed' },
  { id: 'T-3', date: '2026-09-02', type: 'Investment', detail: 'Solar Energy Project', amount: -3000, status: 'Completed' },
  { id: 'T-2', date: '2026-08-20', type: 'Investment', detail: 'Bitcoin Strategy Fund A', amount: -5000, status: 'Completed' },
  { id: 'T-1', date: '2026-08-18', type: 'Deposit', detail: 'BTC', amount: 10450, status: 'Completed' },
]

export const seedKyc: KycCase[] = [
  { id: 'K-1042', userId: 'U-2', name: 'Daniel Mensah', country: 'Ghana', docType: 'National ID card', faceMatch: 71, sanctions: 'Clear', status: 'pending' },
  { id: 'K-1043', userId: 'U-3', name: 'Li Wen', country: 'Singapore', docType: 'Passport', faceMatch: 94, sanctions: 'Potential match', status: 'pending' },
  { id: 'K-1044', userId: 'U-4', name: 'Sara Khan', country: 'United Kingdom', docType: 'Driver’s licence', faceMatch: 88, sanctions: 'Clear', status: 'pending' },
]

export const seedWithdrawals: Withdrawal[] = [
  { id: 'W-2201', userName: 'Amara Okafor', amount: 1200, method: 'USDT', kycVerified: true, newAddress: false, status: 'pending' },
  { id: 'W-2202', userName: 'Chidi Eze', amount: 18500, method: 'BTC', kycVerified: true, newAddress: true, status: 'pending' },
  { id: 'W-2203', userName: 'Daniel Mensah', amount: 600, method: 'Bank', kycVerified: false, newAddress: false, status: 'pending' },
]

export const seedDeposits: Deposit[] = [
  { id: 'D-3101', userId: 'U-5', userName: 'Chidi Eze', amount: 10000, method: 'USDT', confirmations: 20, needed: 20, status: 'pending' },
  { id: 'D-3102', userId: 'U-4', userName: 'Sara Khan', amount: 750, method: 'Bank', confirmations: 0, needed: 1, status: 'pending' },
]

export const portfolioHistory = {
  labels: ['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'],
  values: [8000, 8350, 8200, 9100, 9600, 9350, 12000, 12510],
}
