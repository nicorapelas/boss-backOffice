import { useEffect, useState } from 'react'
import { apiFetch } from '../api/client'
import type { LayByListItem } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { BoShell } from '../layouts/BoShell'

export function LayBysPage() {
  const { session } = useAuth()
  const isAdmin = session?.user.role === 'admin'
  const [status, setStatus] = useState<string>('')
  const [list, setList] = useState<LayByListItem[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    if (!isAdmin) return
    setBusy(true)
    setError(null)
    try {
      const q = status ? `?status=${encodeURIComponent(status)}&limit=200` : '?limit=200'
      const data = await apiFetch<LayByListItem[]>(`/lay-bys${q}`)
      setList(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, status])

  return (
    <BoShell>
      <h1>Lay-bys</h1>
      <p className="muted">All lay-by agreements (admin).</p>
      {!isAdmin && <p className="error">Admin role required.</p>}
      {isAdmin && (
        <>
          <div className="panel audit-toolbar">
            <label>
              Status
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
            <button type="button" className="btn ghost" disabled={busy} onClick={() => void load()}>
              Refresh
            </button>
          </div>
          {error && <p className="error">{error}</p>}
          <div className="panel">
            <table className="table">
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Customer</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th>Balance</th>
                  <th>Expires</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r._id}>
                    <td>{r.layByNumber}</td>
                    <td>{r.customerName}</td>
                    <td>{r.phone}</td>
                    <td>{r.status}</td>
                    <td>{r.totalInclVat.toFixed(2)}</td>
                    <td>{r.balance.toFixed(2)}</td>
                    <td>{new Date(r.expiresAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {list.length === 0 && !busy && <p className="muted">No records.</p>}
          </div>
        </>
      )}
    </BoShell>
  )
}
