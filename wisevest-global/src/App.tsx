import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AdminLayout, ClientLayout, PublicLayout } from './components/layouts'
import Landing from './pages/Landing'
import { Login, Register } from './pages/Auth'
import { ProjectDetail, ProjectsPage } from './pages/Projects'
import { Dashboard, Deposit, Investments, Transactions, Withdraw } from './pages/Client'
import { AdminAudit, AdminDeposits, AdminKyc, AdminOverview, AdminProjects, AdminUsers, AdminWithdrawals } from './pages/Admin'
import Settings from './pages/Settings'
import { auth } from './api'

export default function App() {
  useEffect(() => auth.initialize(), [])

  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<Landing />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:id" element={<ProjectDetail />} />
      </Route>
      <Route path="login" element={<Login />} />
      <Route path="register" element={<Register />} />
      <Route path="app" element={<ClientLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="investments" element={<Investments />} />
        <Route path="deposit" element={<Deposit />} />
        <Route path="withdraw" element={<Withdraw />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="admin" element={<AdminLayout />}>
        <Route index element={<AdminOverview />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="kyc" element={<AdminKyc />} />
        <Route path="withdrawals" element={<AdminWithdrawals />} />
        <Route path="deposits" element={<AdminDeposits />} />
        <Route path="projects" element={<AdminProjects />} />
        <Route path="audit" element={<AdminAudit />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
