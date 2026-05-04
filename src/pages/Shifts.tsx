import { useEffect, useState } from 'react'
import { apiFetch } from '../api/client'
import type { ShiftRow } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { hasPermission } from '../auth/permissions'
import { BoShell } from '../layouts/BoShell'

export function ShiftsPage() {
  const { session } = useAuth()
  const canRead = hasPermission(session?.user, 'shifts.read')
  const canManage = hasPermission(session?.user, 'shifts.manage')
  const [rows, setRows] = useState<ShiftRow[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [status, setStatus] = useState<'all' | 'open' | 'closed'>('all')
  const [tillCode, setTillCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [kind, setKind] = useState<'over' | 'under'>('over')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')

  async function load() {
    if (!canRead) return
    setBusy(true)
    setError(null)
    try {
      const sp = new URLSearchParams()
      if (status !== 'all') sp.set('status', status)
      if (tillCode.trim()) sp.set('tillCode', tillCode.trim().toUpperCase())
      const list = await apiFetch<ShiftRow[]>(`/shifts?${sp.toString()}`)
      setRows(list)
      if (list.length > 0 && !selectedId) setSelectedId(list[0]!._id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load shifts')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRead])

  const selected = rows.find((x) => x._id === selectedId) ?? null

  async function addDifference() {
    if (!selected || !canManage) return
    const val = Number(amount)
    if (!Number.isFinite(val) || val <= 0) return setError('Amount must be greater than 0')
    if (!note.trim()) return setError('Reason note required')
    setBusy(true)
    setError(null)
    try {
      await apiFetch(`/shifts/${selected._id}/differences`, {
        method: 'POST',
        body: JSON.stringify({ kind, amount: val, note, source: 'backoffice' }),
      })
      setAmount('')
      setNote('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save difference')
    } finally {
      setBusy(false)
    }
  }

  return (
    <BoShell>
      <h1>Shifts / Z reports</h1>
      <p className="muted">Track till shifts, close snapshots, and cash differences.</p>
      {!canRead && <p className="error">Permission required: shifts.read</p>}
      {canRead && (
        <>
          <div className="panel audit-toolbar">
            <label>
              Status
              <select value={status} onChange={(e) => setStatus(e.target.value as 'all' | 'open' | 'closed')}>
                <option value="all">All</option>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
              </select>
            </label>
            <label>
              Till
              <input value={tillCode} onChange={(e) => setTillCode(e.target.value)} placeholder="T1 / T2 / T3" />
            </label>
            <button type="button" className="btn ghost" disabled={busy} onClick={() => void load()}>
              {busy ? 'Loading…' : 'Refresh'}
            </button>
          </div>
          {error && <p className="error">{error}</p>}
          <div className="panel" style={{ marginTop: '1rem' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Till</th>
                  <th>Status</th>
                  <th>Opened</th>
                  <th>Closed</th>
                  <th>Z #</th>
                  <th>Turnover</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r._id} onClick={() => setSelectedId(r._id)} style={{ cursor: 'pointer' }}>
                    <td>{r.tillCode}</td>
                    <td>{r.status}</td>
                    <td>{new Date(r.openedAt).toLocaleString()}</td>
                    <td>{r.closedAt ? new Date(r.closedAt).toLocaleString() : '—'}</td>
                    <td>{r.zNumber ?? '—'}</td>
                    <td>{r.summary?.turnover?.toFixed(2) ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && !busy ? <p className="muted">No shifts.</p> : null}
          </div>
          {selected ? (
            <div className="panel" style={{ marginTop: '1rem' }}>
              <h2>Selected shift</h2>
              <p className="muted">
                Till {selected.tillCode} · {selected.status} · Z {selected.zNumber ?? 'pending'}
              </p>
              <p className="muted">
                Cash {selected.summary?.cashSales?.toFixed(2) ?? '0.00'} · Card {selected.summary?.cardSales?.toFixed(2) ?? '0.00'} ·
                Vouchers {selected.summary?.voucherTotal?.toFixed(2) ?? '0.00'} · Accounts {selected.summary?.onAccountTotal?.toFixed(2) ?? '0.00'}
              </p>
              <h3>Cash differences</h3>
              <ul>
                {(selected.cashDifferences ?? []).map((d, i) => (
                  <li key={i}>
                    {new Date(d.createdAt).toLocaleString()} · {d.source} · {d.kind} {d.amount.toFixed(2)}
                    {d.note ? ` · ${d.note}` : ''}
                  </li>
                ))}
              </ul>
              {(selected.cashDifferences?.length ?? 0) === 0 ? <p className="muted">No differences logged.</p> : null}
              {canManage ? (
                <div className="audit-toolbar" style={{ marginTop: '0.8rem' }}>
                  <label>
                    Type
                    <select value={kind} onChange={(e) => setKind(e.target.value as 'over' | 'under')}>
                      <option value="over">Over</option>
                      <option value="under">Under</option>
                    </select>
                  </label>
                  <label>
                    Amount
                    <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
                  </label>
                  <label>
                    Reason
                    <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason note" />
                  </label>
                  <button type="button" className="btn" disabled={busy} onClick={() => void addDifference()}>
                    Add Difference
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </BoShell>
  )
}
