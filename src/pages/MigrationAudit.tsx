import { useEffect, useState } from 'react'
import { apiFetch } from '../api/client'
import type { MigrationAudit } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { hasPermission } from '../auth/permissions'
import { BoShell } from '../layouts/BoShell'

function Item({ label, value }: { label: string; value: number }) {
  return (
    <div className="audit-kpi">
      <span className="audit-kpi-label">{label}</span>
      <strong className="audit-kpi-value">{value.toLocaleString()}</strong>
    </div>
  )
}

export function MigrationAuditPage() {
  const { session } = useAuth()
  const isAdmin = hasPermission(session?.user, 'migration.access')
  const [data, setData] = useState<MigrationAudit | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    if (!isAdmin) return
    setBusy(true)
    setError(null)
    try {
      const result = await apiFetch<MigrationAudit>('/migration/audit')
      setData(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load migration audit')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])

  return (
    <BoShell>
      <h1>Migration Audit</h1>
      <p className="muted">
        Snapshot of Vector import quality and data integrity.
      </p>

      {!isAdmin && (
        <p className="error">Permission required: migration audit.</p>
      )}

      {isAdmin && (
        <>
          <div className="panel audit-toolbar">
            <button type="button" className="btn primary" onClick={() => void load()} disabled={busy}>
              {busy ? 'Refreshing…' : 'Refresh audit'}
            </button>
            {data && (
              <span className="muted">
                Generated {new Date(data.generatedAt).toLocaleString()}
              </span>
            )}
          </div>

          {error && <p className="error">{error}</p>}

          {data && (
            <>
              <div className="audit-grid">
                <section className="panel">
                  <h2>Summary</h2>
                  <div className="audit-kpi-grid">
                    <Item label="Products total" value={data.summary.productsTotal} />
                    <Item label="Products from Vector" value={data.summary.productsVector} />
                    <Item label="Users total" value={data.summary.usersTotal} />
                    <Item label="Users from Vector" value={data.summary.usersVector} />
                    <Item label="Sales total" value={data.summary.salesTotal} />
                    <Item label="Sales from Vector" value={data.summary.salesVector} />
                  </div>
                </section>

                <section className="panel">
                  <h2>Issues</h2>
                  <div className="audit-kpi-grid">
                    <Item label="Products negative stock" value={data.issues.productsNegativeStock} />
                    <Item label="Products missing barcode" value={data.issues.productsNoBarcode} />
                    <Item label="Products not from Vector" value={data.issues.productsNoLegacyMapping} />
                    <Item label="Vector users locked" value={data.issues.usersVectorLocked} />
                    <Item label="Vector sales without cashier link" value={data.issues.salesVectorNoCashier} />
                    <Item label="Sales line orphan links" value={data.issues.salesLineOrphans} />
                  </div>
                </section>
              </div>

              <section className="panel">
                <h2>Sample: Sales missing cashier link</h2>
                {data.samples.orphanCashierSales.length === 0 ? (
                  <p className="muted">No orphan-cashier sales found.</p>
                ) : (
                  <table className="table products-table">
                    <thead>
                      <tr>
                        <th>Receipt</th>
                        <th>Terminal</th>
                        <th>Total</th>
                        <th>Method</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.samples.orphanCashierSales.map((s) => (
                        <tr key={s._id}>
                          <td>{s.legacy?.receiptNo ?? '-'}</td>
                          <td>{s.legacy?.terminal ?? '-'}</td>
                          <td>{s.total.toFixed(2)}</td>
                          <td>{s.paymentMethod ?? '-'}</td>
                          <td>{s.createdAt ? new Date(s.createdAt).toLocaleString() : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            </>
          )}
        </>
      )}
    </BoShell>
  )
}

