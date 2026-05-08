import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../api/client'
import type { OfflineSyncConflict, OfflineSyncConflictListResponse } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { hasPermission } from '../auth/permissions'
import { BoShell } from '../layouts/BoShell'

type StatusFilter = 'open' | 'resolved' | 'all'
type ResolutionAction = 'stock_adjusted' | 'sale_retried' | 'waived' | 'other'

const RESOLUTION_ACTION_OPTIONS: Array<{ id: ResolutionAction; label: string }> = [
  { id: 'stock_adjusted', label: 'Stock adjusted' },
  { id: 'sale_retried', label: 'Sale retried' },
  { id: 'waived', label: 'Waived / accepted variance' },
  { id: 'other', label: 'Other' },
]
const RETRY_REQUEST_COOLDOWN_MS = 60_000

export function OfflineConflictsPage() {
  const { session } = useAuth()
  const canRead = hasPermission(session?.user, 'sales.read')
  const [status, setStatus] = useState<StatusFilter>('open')
  const [tillCode, setTillCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<OfflineSyncConflict[]>([])
  const [resolutionDrafts, setResolutionDrafts] = useState<
    Record<string, { action: ResolutionAction; note: string }>
  >({})

  const load = useCallback(async () => {
    if (!canRead) return
    setBusy(true)
    setError(null)
    try {
      const sp = new URLSearchParams()
      sp.set('status', status)
      if (tillCode.trim()) sp.set('tillCode', tillCode.trim().toUpperCase())
      sp.set('limit', '250')
      const result = await apiFetch<OfflineSyncConflictListResponse>(`/sales/offline-conflicts?${sp.toString()}`)
      setRows(result.conflicts ?? [])
      setResolutionDrafts((prev) => {
        const next: Record<string, { action: ResolutionAction; note: string }> = {}
        for (const row of result.conflicts ?? []) {
          next[row._id] = prev[row._id] ?? { action: 'stock_adjusted', note: '' }
        }
        return next
      })
    } catch (e) {
      setRows([])
      setError(e instanceof Error ? e.message : 'Failed to load offline sync conflicts')
    } finally {
      setBusy(false)
    }
  }, [canRead, status, tillCode])

  useEffect(() => {
    void load()
  }, [load])

  async function resolveConflict(id: string) {
    if (!canRead) return
    const draft = resolutionDrafts[id]
    if (!draft || !draft.note.trim()) {
      setError('Resolution note is required')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await apiFetch(`/sales/offline-conflicts/${encodeURIComponent(id)}/resolve`, {
        method: 'POST',
        body: JSON.stringify({
          action: draft.action,
          note: draft.note.trim(),
        }),
      })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to resolve conflict')
      setBusy(false)
    }
  }

  async function requestRetry(id: string) {
    if (!canRead) return
    setBusy(true)
    setError(null)
    try {
      await apiFetch(`/sales/offline-conflicts/${encodeURIComponent(id)}/retry-request`, { method: 'POST' })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to request retry')
      setBusy(false)
    }
  }

  return (
    <BoShell>
      <h1>Offline Sync Conflicts</h1>
      <p className="muted">
        Shows POS sales that failed to sync (for example: insufficient stock after offline oversell). Resolve items after
        stock corrections or manual investigation.
      </p>
      {!canRead && <p className="error">Permission required: sales.read</p>}
      {canRead ? (
        <>
          <div className="panel audit-toolbar" style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label>
              Status
              <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
                <option value="open">Open</option>
                <option value="resolved">Resolved</option>
                <option value="all">All</option>
              </select>
            </label>
            <label>
              Till
              <input value={tillCode} onChange={(e) => setTillCode(e.target.value)} placeholder="T1 / T2 / T3" />
            </label>
            <button type="button" className="btn primary" disabled={busy} onClick={() => void load()}>
              {busy ? 'Loading...' : 'Refresh'}
            </button>
          </div>
          {error ? <p className="error">{error}</p> : null}
          <div className="panel" style={{ marginTop: '1rem' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Last seen</th>
                    <th>Till</th>
                    <th>Scope</th>
                    <th>Error</th>
                    <th>Items</th>
                    <th>Attempts</th>
                    <th>Status</th>
                    <th>Retry requested</th>
                    <th>Resolution note</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row._id}>
                      <td>{new Date(row.lastSeenAt).toLocaleString()}</td>
                      <td>{row.tillCode || '—'}</td>
                      <td>{row.scope}</td>
                      <td>{row.errorMessage}</td>
                      <td>
                        {(row.lines ?? []).map((line) => `${line.name} x${line.qty}`).join(', ') || '—'}
                      </td>
                      <td>{row.attemptCount}</td>
                      <td>
                        {row.status === 'resolved'
                          ? `Resolved${row.resolvedAt ? ` ${new Date(row.resolvedAt).toLocaleString()}` : ''}`
                          : 'Open'}
                      </td>
                      <td>
                        {row.retryRequestedAt ? (
                          <>
                            <div>Yes · {new Date(row.retryRequestedAt).toLocaleString()}</div>
                            <div className="muted">
                              by {row.retryRequestedBy?.displayName || row.retryRequestedBy?.email || 'system'}
                            </div>
                          </>
                        ) : (
                          'No'
                        )}
                      </td>
                      <td style={{ minWidth: '16rem' }}>
                        {row.status === 'open' ? (
                          <input
                            value={resolutionDrafts[row._id]?.note ?? ''}
                            onChange={(e) =>
                              setResolutionDrafts((prev) => ({
                                ...prev,
                                [row._id]: {
                                  action: prev[row._id]?.action ?? 'stock_adjusted',
                                  note: e.target.value,
                                },
                              }))
                            }
                            placeholder="Describe how this was resolved"
                          />
                        ) : (
                          <span className="muted">{row.resolutionNote || '—'}</span>
                        )}
                      </td>
                      <td>
                        {row.status === 'open' ? (
                          <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                            <select
                              value={resolutionDrafts[row._id]?.action ?? 'stock_adjusted'}
                              onChange={(e) =>
                                setResolutionDrafts((prev) => ({
                                  ...prev,
                                  [row._id]: {
                                    action: e.target.value as ResolutionAction,
                                    note: prev[row._id]?.note ?? '',
                                  },
                                }))
                              }
                            >
                              {RESOLUTION_ACTION_OPTIONS.map((opt) => (
                                <option key={opt.id} value={opt.id}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className="btn ghost small"
                              disabled={
                                busy ||
                                (row.retryRequestedAt != null &&
                                  Date.now() - new Date(row.retryRequestedAt).getTime() < RETRY_REQUEST_COOLDOWN_MS)
                              }
                              onClick={() => void requestRetry(row._id)}
                            >
                              {row.retryRequestedAt != null &&
                              Date.now() - new Date(row.retryRequestedAt).getTime() < RETRY_REQUEST_COOLDOWN_MS
                                ? 'Retry requested'
                                : 'Retry sync now'}
                            </button>
                            <button
                              type="button"
                              className="btn ghost small"
                              disabled={busy || !(resolutionDrafts[row._id]?.note ?? '').trim()}
                              onClick={() => void resolveConflict(row._id)}
                            >
                              Mark resolved
                            </button>
                          </div>
                        ) : (
                          <span className="muted">
                            {row.resolutionAction
                              ? RESOLUTION_ACTION_OPTIONS.find((opt) => opt.id === row.resolutionAction)?.label ?? row.resolutionAction
                              : '—'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length === 0 && !busy ? <p className="muted">No conflicts.</p> : null}
          </div>
        </>
      ) : null}
    </BoShell>
  )
}
