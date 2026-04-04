import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export function BoShell({ children }: { children: ReactNode }) {
  const { session, logout } = useAuth()

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
          <Link to="/">Products</Link>
          <Link to="/users">Users</Link>
          <Link to="/financials">Financials</Link>
          <Link to="/audit">Migration Audit</Link>
          <Link to="/cleanup">Data Cleanup</Link>
          <Link to="/store-settings">Store settings</Link>
          <Link to="/lay-bys">Lay-bys</Link>
          <Link to="/store-voucher">Store vouchers</Link>
          <Link to="/house-accounts">House accounts</Link>
        </nav>
      </header>
      <main className="shell-main">{children}</main>
    </div>
  )
}
