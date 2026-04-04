import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { RequireAuth } from './layouts/RequireAuth'
import { DataCleanupPage } from './pages/DataCleanup'
import { LayBysPage } from './pages/LayBys'
import { FinancialsPage } from './pages/Financials'
import { HouseAccountsPage } from './pages/HouseAccounts'
import { Login } from './pages/Login'
import { MigrationAuditPage } from './pages/MigrationAudit'
import { Products } from './pages/Products'
import { StoreSettingsPage } from './pages/StoreSettings'
import { StoreVoucherPage } from './pages/StoreVoucher'
import { UsersPage } from './pages/Users'
import './App.css'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<RequireAuth />}>
            <Route path="/" element={<Products />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/financials" element={<FinancialsPage />} />
            <Route path="/audit" element={<MigrationAuditPage />} />
            <Route path="/cleanup" element={<DataCleanupPage />} />
            <Route path="/store-settings" element={<StoreSettingsPage />} />
            <Route path="/lay-bys" element={<LayBysPage />} />
            <Route path="/store-voucher" element={<StoreVoucherPage />} />
            <Route path="/house-accounts" element={<HouseAccountsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
