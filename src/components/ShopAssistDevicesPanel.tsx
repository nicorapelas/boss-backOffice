import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../api/client'
import type { ShopAssistDeviceRow } from '../api/types'

function formatWhen(iso?: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString()
}

function deviceOnline(lastSeenAt: string) {
  const ms = Date.now() - new Date(lastSeenAt).getTime()
  return Number.isFinite(ms) && ms >= 0 && ms <= 5 * 60 * 1000
}

export function ShopAssistDevicesPanel() {
  const [rows, setRows] = useState<ShopAssistDeviceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch<{ devices: ShopAssistDeviceRow[] }>('/shop-assist/devices')
      setRows(res.devices)
    } catch (e) {
      setRows([])
      setError(e instanceof Error ? e.message : 'Failed to load ShopAssist devices')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function revoke(deviceId: string) {
    if (!window.confirm('Revoke this ShopAssist device? Staff on that phone will need admin re-enrollment.')) return
    setBusyId(deviceId)
    setError(null)
    try {
      await apiFetch('/shop-assist/devices/revoke', {
        method: 'POST',
        body: JSON.stringify({ deviceId }),
      })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Revoke failed')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="panel bo-shopassist-devices" aria-labelledby="bo-shopassist-devices-heading">
      <h2 id="bo-shopassist-devices-heading" className="bo-settings-section-title">
        ShopAssist devices
      </h2>
      <p className="muted bo-settings-section-lead">
        Phones enrolled by the store admin for floor catalog access. Revoke lost devices here; staff badge sign-in
        stops working on that handset until it is enrolled again.
      </p>
      {error ? <p className="error">{error}</p> : null}
      {loading ? <p className="muted">Loading devices…</p> : null}
      {!loading && rows.length === 0 ? <p className="muted">No enrolled ShopAssist devices yet.</p> : null}
      {!loading && rows.length > 0 ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Device</th>
                <th>Platform</th>
                <th>Last seen</th>
                <th>Enrolled</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const online = deviceOnline(row.lastSeenAt)
                const label = row.label?.trim() || row.deviceId.slice(0, 8)
                return (
                  <tr key={row.deviceId}>
                    <td>
                      <strong>{label}</strong>
                      <div className="muted" style={{ fontSize: '0.85rem' }}>
                        {row.enrolledByEmail ? `by ${row.enrolledByEmail}` : row.deviceId}
                      </div>
                    </td>
                    <td>
                      {[row.platform, row.appVersion].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td>
                      <span className={online ? 'status-pill status-pill--ok' : 'status-pill'}>
                        {online ? 'Recent' : 'Idle'}
                      </span>
                      <div className="muted" style={{ fontSize: '0.85rem', marginTop: 4 }}>
                        {formatWhen(row.lastSeenAt)}
                      </div>
                    </td>
                    <td>{formatWhen(row.enrolledAt)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn small danger"
                        disabled={busyId === row.deviceId}
                        onClick={() => void revoke(row.deviceId)}
                      >
                        {busyId === row.deviceId ? 'Revoking…' : 'Revoke'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}
