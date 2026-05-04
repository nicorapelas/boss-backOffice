import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { hasPermission } from '../auth/permissions'
import { useServerConnection } from '../network/useServerConnection'

export function BoShell({ children }: { children: ReactNode }) {
  const { session, logout } = useAuth()
  const u = session?.user
  const { disconnected, recovered } = useServerConnection()

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
