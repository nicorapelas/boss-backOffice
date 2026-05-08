import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../api/client'
import type { OfflineSyncConflictListResponse } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { hasPermission } from '../auth/permissions'
import { useServerConnection } from '../network/useServerConnection'

export function BoShell({ children }: { children: ReactNode }) {
  const { session, logout } = useAuth()
  const u = session?.user
  const { disconnected, recovered } = useServerConnection()
  const canReadSales = hasPermission(u, 'sales.read')
  const [openOfflineConflictCount, setOpenOfflineConflictCount] = useState(0)

  useEffect(() => {
    if (!canReadSales) {
      setOpenOfflineConflictCount(0)
      return
    }
    let cancelled = false
    const load = async () => {
      try {
        const result = await apiFetch<OfflineSyncConflictListResponse>('/sales/offline-conflicts?status=open&limit=500')
        if (!cancelled) setOpenOfflineConflictCount(Math.max(0, Number(result.total ?? 0)))
      } catch {
        if (!cancelled) setOpenOfflineConflictCount(0)
      }
    }
    void load()
    const t = window.setInterval(() => {
      void load()
    }, 30000)
    return () => {
      cancelled = true
      window.clearInterval(t)
    }
  }, [canReadSales])

  return (
    <div className="shell">
      <header className="shell-header">
        <div className="shell-header-main">
          <div className="shell-brand">
            <Link to="/">ElectroPOS</Link>
            <span className="shell-sub">Back office</span>
          </div>
          <div className="shell-actions">
            {session && (
              <>
                <span className="shell-user">
                  {session.user.email} · {session.user.role}
                </span>
                <button type="button" className="btn ghost" onClick={() => void logout()}>
                  Sign out
                </button>
              </>
            )}
          </div>
        </div>
        <nav className="shell-nav">
          {hasPermission(u, 'catalog.read') ? (
            <>
              <Link to="/">Products</Link>
              <Link to="/label-settings">Label settings</Link>
            </>
          ) : null}
          {hasPermission(u, 'suppliers.read') ? <Link to="/suppliers">Suppliers</Link> : null}
          {hasPermission(u, 'users.manage') ? (
            <>
              <Link to="/users">Users</Link>
              <Link to="/roles">Roles</Link>
            </>
          ) : null}
          {hasPermission(u, 'financials.read') ? <Link to="/financials">Financials</Link> : null}
          {hasPermission(u, 'sales.read') ? <Link to="/sales">Sales / receipts</Link> : null}
          {hasPermission(u, 'sales.read') ? (
            <Link to="/offline-conflicts">
              Offline conflicts{openOfflineConflictCount > 0 ? ` (${openOfflineConflictCount})` : ''}
            </Link>
          ) : null}
          {hasPermission(u, 'shifts.read') ? <Link to="/shifts">Shifts / Z reports</Link> : null}
          {hasPermission(u, 'migration.access') ? (
            <>
              <Link to="/audit">Migration Audit</Link>
              <Link to="/cleanup">Data Cleanup</Link>
            </>
          ) : null}
          {hasPermission(u, 'settings.read') || hasPermission(u, 'settings.write') ? (
            <Link to="/store-settings">Store settings</Link>
          ) : null}
          {hasPermission(u, 'laybys.admin') ? <Link to="/lay-bys">Lay-bys</Link> : null}
          {hasPermission(u, 'store_credit.access') ? <Link to="/store-voucher">Store vouchers</Link> : null}
          {hasPermission(u, 'house_accounts.access') ? <Link to="/house-accounts">House accounts</Link> : null}
        </nav>
      </header>
      {disconnected ? (
        <div className="server-connection-banner server-connection-banner--offline" role="status" aria-live="polite">
          Cannot reach server. Trying to reconnect...
        </div>
      ) : null}
      {!disconnected && recovered ? (
        <div className="server-connection-banner server-connection-banner--online" role="status" aria-live="polite">
          Connected to server again.
        </div>
      ) : null}
      <main className="shell-main">{children}</main>
    </div>
  )
}
