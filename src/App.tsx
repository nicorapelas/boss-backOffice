import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { RequireAuth } from './layouts/RequireAuth'
import { ScrollToTopOnNavigate } from './layouts/ScrollToTopOnNavigate'
import { BoThemeProvider } from './theme/BoThemeContext'
import { DataCleanupPage } from './pages/DataCleanup'
import { DashboardPage } from './pages/Dashboard'
import { LayBysPage } from './pages/LayBys'
import { FinancialsPage } from './pages/Financials'
import { HouseAccountsPage } from './pages/HouseAccounts'
import { LabelSettingsPage } from './pages/LabelSettings'
import { Login } from './pages/Login'
import { MigrationAuditPage } from './pages/MigrationAudit'
import { CatalogMigrationPage } from './pages/CatalogMigration'
import { StoreBackupPage } from './pages/StoreBackup'
import { Products } from './pages/Products'
import { ReceiveStockPage } from './pages/ReceiveStock'
import { InvoiceLayoutTeachPage } from './pages/InvoiceLayoutTeach'
import { SuppliersPage } from './pages/Suppliers'
import { StoreSettingsPage } from './pages/StoreSettings'
import { StoreVoucherPage } from './pages/StoreVoucher'
import { LoyaltyPage } from './pages/Loyalty'
import { RolesPage } from './pages/Roles'
import { ShiftsPage } from './pages/Shifts'
import { SalesReceiptsPage } from './pages/SalesReceipts'
import { OfflineConflictsPage } from './pages/OfflineConflicts'
import { UsersPage } from './pages/Users'
import { BoSettingsPage } from './pages/BoSettings'
import { PosTerminalsPage } from './pages/PosTerminals'
import './App.css'

export default function App() {
  return (
    <AuthProvider>
      <BoThemeProvider>
      <BrowserRouter>
        <ScrollToTopOnNavigate />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<RequireAuth />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/products" element={<Products />} />
            <Route path="/receive-stock" element={<ReceiveStockPage />} />
            <Route path="/invoice-layouts" element={<InvoiceLayoutTeachPage />} />
            <Route path="/suppliers" element={<SuppliersPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/pos-terminals" element={<PosTerminalsPage />} />
            <Route path="/roles" element={<RolesPage />} />
            <Route path="/financials" element={<FinancialsPage />} />
            <Route path="/sales" element={<SalesReceiptsPage />} />
            <Route path="/offline-conflicts" element={<OfflineConflictsPage />} />
            <Route path="/shifts" element={<ShiftsPage />} />
            <Route path="/label-settings" element={<LabelSettingsPage />} />
            <Route path="/audit" element={<MigrationAuditPage />} />
            <Route path="/cleanup" element={<DataCleanupPage />} />
            <Route path="/store-backup" element={<StoreBackupPage />} />
            <Route path="/catalog-migration" element={<CatalogMigrationPage />} />
            <Route path="/store-settings" element={<StoreSettingsPage />} />
            <Route path="/lay-bys" element={<LayBysPage />} />
            <Route path="/store-voucher" element={<StoreVoucherPage />} />
            <Route path="/loyalty" element={<LoyaltyPage />} />
            <Route path="/house-accounts" element={<HouseAccountsPage />} />
            <Route path="/settings" element={<BoSettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      </BoThemeProvider>
    </AuthProvider>
  )
}
