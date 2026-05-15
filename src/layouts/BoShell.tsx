import { Children, isValidElement, useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { apiFetch } from '../api/client'
import type { OfflineSyncConflictListResponse } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { hasPermission } from '../auth/permissions'
import { useServerConnection } from '../network/useServerConnection'
import { IconCloseWindow, IconMinimize } from '../icons/windowChrome'
import { resolveBoLogoSrc } from '../theme/boLogo'
import { useBoTheme } from '../theme/BoThemeContext'

function navCls({ isActive }: { isActive: boolean }) {
  return `shell-nav-link${isActive ? ' shell-nav-link--active' : ''}`
}

/** First top-level `<h1>` becomes the fixed title chrome; remaining nodes scroll in the main column. */
function partitionShellMainChildren(children: ReactNode): { title: ReactNode | null; body: ReactNode } {
  const nodes = Children.toArray(children)
  let i = 0
  while (i < nodes.length && typeof nodes[i] === 'string' && String(nodes[i]).trim() === '') {
    i++
  }
  const first = nodes[i]
  if (isValidElement(first) && first.type === 'h1') {
    return { title: first, body: nodes.slice(i + 1) }
  }
  return { title: null, body: nodes }
}

export function BoShell({ children }: { children: ReactNode }) {
  const { theme } = useBoTheme()
  const logoMark = resolveBoLogoSrc(theme)
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

  const { title: shellTitle, body: shellBody } = partitionShellMainChildren(children)

  return (
    <div className="shell">
      <aside className="shell-sidebar" aria-label="Back office">
        <div className="shell-sidebar-brand">
          <Link to="/" className="shell-brand-link" aria-label="CogniPOS — Home">
            <img src={logoMark} alt="" className="shell-brand-logo" decoding="async" />
          </Link>
          <span className="shell-sub">Back office</span>
        </div>
        <nav className="shell-nav" aria-label="Sections">
          {hasPermission(u, 'catalog.read') ? (
            <>
              <NavLink to="/" end className={navCls}>
                Products
              </NavLink>
              <NavLink to="/label-settings" className={navCls}>
                Label settings
              </NavLink>
            </>
          ) : null}
          {hasPermission(u, 'suppliers.read') ? (
            <NavLink to="/suppliers" className={navCls}>
              Suppliers
            </NavLink>
          ) : null}
          {hasPermission(u, 'users.manage') ? (
            <>
              <NavLink to="/users" className={navCls}>
                Users
              </NavLink>
              <NavLink to="/roles" className={navCls}>
                Roles
              </NavLink>
            </>
          ) : null}
          {hasPermission(u, 'financials.read') ? (
            <NavLink to="/financials" className={navCls}>
              Financials
            </NavLink>
          ) : null}
          {hasPermission(u, 'sales.read') ? (
            <NavLink to="/sales" className={navCls}>
              Sales / receipts
            </NavLink>
          ) : null}
          {hasPermission(u, 'sales.read') ? (
            <NavLink to="/offline-conflicts" className={navCls}>
              Offline conflicts{openOfflineConflictCount > 0 ? ` (${openOfflineConflictCount})` : ''}
            </NavLink>
          ) : null}
          {hasPermission(u, 'shifts.read') ? (
            <NavLink to="/shifts" className={navCls}>
              Shifts / Z reports
            </NavLink>
          ) : null}
          {hasPermission(u, 'migration.access') ? (
            <>
              <NavLink to="/audit" className={navCls}>
                Migration Audit
              </NavLink>
              <NavLink to="/cleanup" className={navCls}>
                Data Cleanup
              </NavLink>
              <NavLink to="/store-backup" className={navCls}>
                Store backup
              </NavLink>
            </>
          ) : null}
          {hasPermission(u, 'settings.read') || hasPermission(u, 'settings.write') ? (
            <NavLink to="/store-settings" className={navCls}>
              Store settings
            </NavLink>
          ) : null}
          {hasPermission(u, 'laybys.admin') ? (
            <NavLink to="/lay-bys" className={navCls}>
              Lay-bys
            </NavLink>
          ) : null}
          {hasPermission(u, 'store_credit.access') ? (
            <NavLink to="/store-voucher" className={navCls}>
              Store vouchers
            </NavLink>
          ) : null}
          {hasPermission(u, 'house_accounts.access') ? (
            <NavLink to="/house-accounts" className={navCls}>
              House accounts
            </NavLink>
          ) : null}
          <NavLink to="/settings" className={navCls}>
            Settings
          </NavLink>
        </nav>
        <div className="shell-sidebar-footer">
          {session ? (
            <>
              <span className="shell-user" title={`${session.user.email} · ${session.user.role}`}>
                {session.user.email} · {session.user.role}
              </span>
              <button type="button" className="btn ghost shell-sidebar-signout" onClick={() => void logout()}>
                Sign out
              </button>
            </>
          ) : null}
        </div>
      </aside>
      <div className="shell-content">
        {window.electronApp ? (
          <div className="shell-window-actions" role="toolbar" aria-label="Window">
            <button
              type="button"
              className="btn ghost window-chrome-action"
              aria-label="Minimize window"
              title="Minimize"
              onClick={() => void window.electronApp?.minimize()}
            >
              <IconMinimize className="window-chrome-action-icon" />
            </button>
            <button
              type="button"
              className="btn ghost window-chrome-action"
              aria-label="Exit application"
              title="Exit app"
              onClick={() => void window.electronApp?.quit()}
            >
              <IconCloseWindow className="window-chrome-action-icon" />
            </button>
          </div>
        ) : null}
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
        <main className="shell-main">
          {shellTitle ? <div className="shell-main-title">{shellTitle}</div> : null}
          <div className="shell-main-scroll">{shellBody}</div>
        </main>
      </div>
    </div>
  )
}
