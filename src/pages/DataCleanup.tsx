import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api/client'
import type { MigrationAudit } from '../api/types'
import { BoShell } from '../layouts/BoShell'
import { useAuth } from '../auth/AuthContext'
import { hasPermission } from '../auth/permissions'

type BarcodeDraft = Record<string, string>
type BusyState = Record<string, boolean>

export function DataCleanupPage() {
  const { session } = useAuth()
  const isAdmin = hasPermission(session?.user, 'migration.access')
  const [audit, setAudit] = useState<MigrationAudit | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [barcodeDraft, setBarcodeDraft] = useState<BarcodeDraft>({})
  const [busy, setBusy] = useState<BusyState>({})

  const negativeRows = audit?.samples.negativeStockProducts ?? []
  const missingBarcodeRows = audit?.samples.missingBarcodeProducts ?? []

  const hasIssues = useMemo(
    () => negativeRows.length > 0 || missingBarcodeRows.length > 0,
    [negativeRows.length, missingBarcodeRows.length],
  )

  async function load() {
    if (!isAdmin) return
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch<MigrationAudit>('/migration/audit')
      setAudit(data)
      const nextDraft: BarcodeDraft = {}
      for (const p of data.samples.missingBarcodeProducts) {
        nextDraft[p._id] = p.barcode ?? ''
      }
      setBarcodeDraft(nextDraft)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load cleanup data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])

  async function setStockZero(id: string) {
    setBusy((b) => ({ ...b, [id]: true }))
    setError(null)
    try {
      await apiFetch(`/products/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ stock: 0 }),
      })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update stock')
    } finally {
      setBusy((b) => ({ ...b, [id]: false }))
    }
  }

  async function saveBarcode(id: string) {
    const value = barcodeDraft[id]?.trim()
    if (!value) {
      setError('Barcode cannot be empty')
      return
    }
    setBusy((b) => ({ ...b, [id]: true }))
    setError(null)
    try {
      await apiFetch(`/products/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ barcode: value }),
      })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save barcode')
    } finally {
      setBusy((b) => ({ ...b, [id]: false }))
    }
  }

  return (
    <BoShell>
      <h1>Data Cleanup</h1>
      <p className="muted">Fix migration data quality issues directly in Back Office.</p>

      {!isAdmin && <p className="error">Permission required: migration tools.</p>}
      {isAdmin && (
        <>
          <div className="panel audit-toolbar">
            <button type="button" className="btn primary" onClick={() => void load()} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh cleanup lists'}
            </button>
            {audit && <span className="muted">Generated {new Date(audit.generatedAt).toLocaleString()}</span>}
          </div>

          {error && <p className="error">{error}</p>}
          {!error && !loading && !hasIssues && <p className="success">No cleanup actions required.</p>}

          <section className="panel cleanup-section">
            <h2>Negative stock items ({audit?.issues.productsNegativeStock ?? 0})</h2>
            {negativeRows.length === 0 ? (
              <p className="muted">No negative stock items in sampled results.</p>
            ) : (
              <table className="table products-table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Name</th>
                    <th>Stock</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {negativeRows.map((p) => (
                    <tr key={p._id}>
                      <td>{p.sku}</td>
                      <td>{p.name}</td>
                      <td>{p.stock}</td>
                      <td className="actions-cell">
                        <button
                          type="button"
                          className="btn small"
                          disabled={!!busy[p._id]}
                          onClick={() => void setStockZero(p._id)}
                        >
                          Set to 0
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="panel cleanup-section">
            <h2>Missing barcode items ({audit?.issues.productsNoBarcode ?? 0})</h2>
            {missingBarcodeRows.length === 0 ? (
              <p className="muted">No missing barcode items in sampled results.</p>
            ) : (
              <table className="table products-table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Name</th>
                    <th>Barcode</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {missingBarcodeRows.map((p) => (
                    <tr key={p._id}>
                      <td>{p.sku}</td>
                      <td>{p.name}</td>
                      <td>
                        <input
                          className="cleanup-input"
                          value={barcodeDraft[p._id] ?? ''}
                          onChange={(e) =>
                            setBarcodeDraft((prev) => ({ ...prev, [p._id]: e.target.value }))
                          }
                          placeholder="Enter barcode"
                        />
                      </td>
                      <td className="actions-cell">
                        <button
                          type="button"
                          className="btn small"
                          disabled={!!busy[p._id]}
                          onClick={() => void saveBarcode(p._id)}
                        >
                          Save
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </BoShell>
  )
}

