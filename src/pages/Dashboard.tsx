import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../api/client'
import type {
  CatalogSyncStatus,
  FinancialsSummary,
  OfflineSyncConflictListResponse,
  Product,
  Sale,
  SaleListResponse,
  StaffShiftPerformanceResponse,
} from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { hasPermission } from '../auth/permissions'
import { StaffShiftPerformancePanel } from '../components/StaffShiftPerformancePanel'
import { BoShell } from '../layouts/BoShell'

type CatalogStats = {
  totalProducts: number
  trackedProducts: number
  lowStockProducts: number
  outOfStockProducts: number
}

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfToday() {
  const d = new Date()
  d.setHours(23, 59, 59, 999)
  return d
}

function money(value: number | undefined) {
  return `R ${(value ?? 0).toFixed(2)}`
}

function cashierName(sale: Sale) {
  if (typeof sale.cashier === 'string') return sale.cashier
  return sale.cashier.displayName || sale.cashier.email || 'Unknown'
}

export function DashboardPage() {
  const { session } = useAuth()
  const user = session?.user
  const canReadCatalog = hasPermission(user, 'catalog.read')
  const canReadFinancials = hasPermission(user, 'financials.read')
  const canReadSales = hasPermission(user, 'sales.read')
  const canViewStaffShift =
    hasPermission(user, 'users.manage') || hasPermission(user, 'sales.read')

  const [financials, setFinancials] = useState<FinancialsSummary | null>(null)
  const [catalogStats, setCatalogStats] = useState<CatalogStats | null>(null)
  const [catalogSync, setCatalogSync] = useState<CatalogSyncStatus | null>(null)
  const [recentSales, setRecentSales] = useState<Sale[]>([])
  const [openConflictCount, setOpenConflictCount] = useState<number | null>(null)
  const [staffShiftPerformance, setStaffShiftPerformance] = useState<StaffShiftPerformanceResponse | null>(
    null,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const financialsQuery = useMemo(() => {
    const from = startOfToday().toISOString()
    const to = endOfToday().toISOString()
    return `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
  }, [])

  async function load() {
    setBusy(true)
    setError(null)
    try {
      const tasks: Promise<void>[] = []

      if (canReadFinancials) {
        tasks.push(
          apiFetch<FinancialsSummary>(`/financials/summary?${financialsQuery}`).then(setFinancials),
        )
      }

      if (canReadCatalog) {
        tasks.push(
          apiFetch<Product[]>('/products').then((products) => {
            const tracked = products.filter((p) => p.trackInventory !== false)
            setCatalogStats({
              totalProducts: products.length,
              trackedProducts: tracked.length,
              lowStockProducts: tracked.filter((p) => p.stock > 0 && p.stock <= 3).length,
              outOfStockProducts: tracked.filter((p) => p.stock <= 0).length,
            })
          }),
        )
        tasks.push(apiFetch<CatalogSyncStatus>('/settings/catalog-sync').then(setCatalogSync))
      }

      if (canReadSales) {
        tasks.push(
          apiFetch<SaleListResponse>(`/sales?${financialsQuery}&limit=5`).then((res) => {
            setRecentSales(res.sales)
          }),
        )
        tasks.push(
          apiFetch<OfflineSyncConflictListResponse>('/sales/offline-conflicts?status=open&limit=1').then((res) => {
            setOpenConflictCount(Math.max(0, Number(res.total ?? 0)))
          }),
        )
      }

      if (canViewStaffShift) {
        tasks.push(
          apiFetch<StaffShiftPerformanceResponse>('/attendance/staff-shift-performance').then(
            setStaffShiftPerformance,
          ),
        )
      }

      await Promise.all(tasks)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canReadCatalog, canReadFinancials, canReadSales, canViewStaffShift])

  return (
    <BoShell>
      <h1>Dashboard</h1>
      <p className="muted">Quick store overview for today.</p>

      <section className="panel dashboard-hero-panel">
        <div>
          <h2>Today</h2>
          <p className="muted">Live summary based on your current Back Office permissions.</p>
        </div>
        <button type="button" className="btn primary" onClick={() => void load()} disabled={busy}>
          {busy ? 'Refreshing...' : 'Refresh'}
        </button>
      </section>

      {error ? <p className="error">{error}</p> : null}

      <section className="dashboard-kpi-grid">
        <MetricCard
          label="Sales today"
          value={financials ? money(financials.totals.grossTotal) : canReadFinancials ? '-' : 'No access'}
          detail={financials ? `${financials.totals.saleCount.toLocaleString()} sales` : undefined}
        />
        <MetricCard
          label="Lay-by payments"
          value={financials ? money(financials.layByPayments.amountTotal) : canReadFinancials ? '-' : 'No access'}
          detail={financials ? `${financials.layByPayments.paymentCount.toLocaleString()} payments` : undefined}
        />
        <MetricCard
          label="Products"
          value={catalogStats ? catalogStats.totalProducts.toLocaleString() : canReadCatalog ? '-' : 'No access'}
          detail={catalogStats ? `${catalogStats.trackedProducts.toLocaleString()} stock-tracked` : undefined}
        />
        <MetricCard
          label="Stock alerts"
          value={
            catalogStats
              ? (catalogStats.lowStockProducts + catalogStats.outOfStockProducts).toLocaleString()
              : canReadCatalog
                ? '-'
                : 'No access'
          }
          detail={
            catalogStats
              ? `${catalogStats.outOfStockProducts} out, ${catalogStats.lowStockProducts} low`
              : undefined
          }
        />
      </section>

      {canViewStaffShift ? (
        <section className="panel dashboard-staff-shift-panel">
          <h2>Staff shift performance</h2>
          <StaffShiftPerformancePanel data={staffShiftPerformance} />
        </section>
      ) : null}

      <div className="dashboard-grid">
        <section className="panel">
          <h2>Recent sales</h2>
          {!canReadSales ? (
            <p className="muted">Permission required: sales.read.</p>
          ) : recentSales.length === 0 ? (
            <p className="muted">No sales today.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Sale</th>
                  <th>Cashier</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {recentSales.map((sale) => (
                  <tr key={sale._id}>
                    <td>
                      <Link to={`/sales?q=${encodeURIComponent(sale.saleId ?? sale._id)}`}>
                        {sale.saleId ?? sale._id.slice(-8)}
                      </Link>
                    </td>
                    <td>{cashierName(sale)}</td>
                    <td>{money(sale.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="panel">
          <h2>Operations</h2>
          <div className="dashboard-status-list">
            <StatusRow
              label="Catalog sync"
              value={
                !canReadCatalog
                  ? 'No access'
                  : catalogSync?.catalogPushedAt
                    ? `Pushed ${new Date(catalogSync.catalogPushedAt).toLocaleString()}`
                    : catalogSync
                      ? `Revision ${catalogSync.catalogRevision}`
                      : '-'
              }
            />
            <StatusRow
              label="Offline conflicts"
              value={
                !canReadSales
                  ? 'No access'
                  : openConflictCount == null
                    ? '-'
                    : openConflictCount > 0
                      ? `${openConflictCount} open`
                      : 'None open'
              }
              link={canReadSales && openConflictCount ? '/offline-conflicts' : undefined}
            />
            <StatusRow
              label="Catalog tools"
              value={canReadCatalog ? 'Available' : 'No access'}
              link={canReadCatalog ? '/products' : undefined}
            />
          </div>
        </section>
      </div>
    </BoShell>
  )
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="panel dashboard-metric-card">
      <span className="dashboard-metric-label">{label}</span>
      <strong className="dashboard-metric-value">{value}</strong>
      {detail ? <span className="dashboard-metric-detail">{detail}</span> : null}
    </div>
  )
}

function StatusRow({ label, value, link }: { label: string; value: string; link?: string }) {
  const content = (
    <>
      <span className="dashboard-status-label">{label}</span>
      <strong>{value}</strong>
    </>
  )
  return link ? (
    <Link className="dashboard-status-row dashboard-status-row--link" to={link}>
      {content}
    </Link>
  ) : (
    <div className="dashboard-status-row">{content}</div>
  )
}
