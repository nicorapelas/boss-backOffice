import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../api/client'
import type { PosTerminalRow } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { hasPermission } from '../auth/permissions'
import { BoShell } from '../layouts/BoShell'

const REFRESH_MS = 30_000

function formatLastSeen(iso: string, online: boolean): string {
  if (online) return 'Just now'
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 48) return `${hr}h ago`
  return new Date(iso).toLocaleString()
}

function platformLabel(platform?: string): string {
  if (!platform) return '—'
  if (platform === 'linux') return 'Linux'
  if (platform === 'win32') return 'Windows'
  if (platform === 'darwin') return 'macOS'
  return platform
}

export function PosTerminalsPage() {
  const { session } = useAuth()
  const canRead = hasPermission(session?.user, 'settings.read')
  const canEdit = hasPermission(session?.user, 'settings.write')
  const [rows, setRows] = useState<PosTerminalRow[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedTill, setSavedTill] = useState<string | null>(null)
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    if (!canRead) return
    setBusy(true)
    setError(null)
    try {
      const list = await apiFetch<PosTerminalRow[]>('/terminals')
      setRows(list)
      setNameDrafts((prev) => {
        const next = { ...prev }
        for (const row of list) {
          if (next[row.tillCode] === undefined) {
            next[row.tillCode] = row.displayName?.trim() || row.tillCode
          }
        }
        return next
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load terminals')
    } finally {
      setBusy(false)
    }
  }, [canRead])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!canRead) return
    const timer = window.setInterval(() => {
      void load()
    }, REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [canRead, load])

  async function saveDisplayName(tillCode: string) {
    if (!canEdit) return
    const displayName = (nameDrafts[tillCode] ?? tillCode).trim()
    setBusy(true)
    setError(null)
    setSavedTill(null)
    try {
      const updated = await apiFetch<PosTerminalRow>(`/terminals/${encodeURIComponent(tillCode)}`, {
        method: 'PATCH',
        body: JSON.stringify({ displayName }),
      })
      setRows((prev) => prev.map((r) => (r.tillCode === tillCode ? { ...r, ...updated } : r)))
      setNameDrafts((prev) => ({ ...prev, [tillCode]: updated.displayName?.trim() || tillCode }))
      setSavedTill(tillCode)
      window.setTimeout(() => setSavedTill((c) => (c === tillCode ? null : c)), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save name')
    } finally {
      setBusy(false)
    }
  }

  const onlineCount = rows.filter((r) => r.online).length

  return (
    <BoShell>
      <h1>POS terminals</h1>
      <p className="muted">
        Tills register automatically when a cashier signs in. Online = heartbeat within the last 2 minutes.
      </p>

      {!canRead && <p className="error">Permission required: settings.read</p>}

      {canRead && (
        <>
          <div className="panel audit-toolbar">
            <span className="muted">
              {rows.length} terminal{rows.length === 1 ? '' : 's'} · {onlineCount} online
            </span>
            <button type="button" className="btn ghost" disabled={busy} onClick={() => void load()}>
              {busy ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          {error ? <p className="error">{error}</p> : null}
          {savedTill ? <p className="success">Saved {savedTill}.</p> : null}

          <div className="panel" style={{ marginTop: '1rem' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Till</th>
                  <th>Name</th>
                  <th>Status</th>
                  <th>IP address</th>
                  <th>Cashier</th>
                  <th>Shift</th>
                  <th>Version</th>
                  <th>Platform</th>
                  <th>Last seen</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.tillCode}>
                    <td>
                      <strong>{r.tillCode}</strong>
                    </td>
                    <td>
                      {canEdit ? (
                        <div className="pos-terminals-name-cell">
                          <input
                            className="pos-terminals-name-input"
                            value={nameDrafts[r.tillCode] ?? r.displayName ?? r.tillCode}
                            onChange={(e) =>
                              setNameDrafts((prev) => ({ ...prev, [r.tillCode]: e.target.value }))
                            }
                            aria-label={`Display name for ${r.tillCode}`}
                          />
                          <button
                            type="button"
                            className="btn ghost small"
                            disabled={busy}
                            onClick={() => void saveDisplayName(r.tillCode)}
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        r.displayName || r.tillCode
                      )}
                    </td>
                    <td>
                      <span className={r.online ? 'pos-terminal-status pos-terminal-status--online' : 'pos-terminal-status pos-terminal-status--offline'}>
                        {r.online ? 'Online' : 'Offline'}
                      </span>
                    </td>
                    <td>{r.lastIp || '—'}</td>
                    <td>{r.cashierDisplayName || '—'}</td>
                    <td>{r.openShiftId ? 'Open' : '—'}</td>
                    <td>{r.appVersion || '—'}</td>
                    <td>{platformLabel(r.platform)}</td>
                    <td title={new Date(r.lastSeenAt).toLocaleString()}>
                      {formatLastSeen(r.lastSeenAt, r.online)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && !busy ? (
              <p className="muted" style={{ padding: '0.75rem 0' }}>
                No terminals yet. Sign in at a till to register it here.
              </p>
            ) : null}
          </div>
        </>
      )}
    </BoShell>
  )
}
