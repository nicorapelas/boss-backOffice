import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../api/client'
import type { UserSoldBySalesReport } from '../api/types'

type UserSoldByPanelProps = {
  userId: string
  userLabel: string
}

const PERIOD_OPTIONS = [7, 30, 90] as const

function formatMoney(value: number): string {
  return `R ${value.toFixed(2)}`
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function UserSoldByPanel({ userId, userLabel }: UserSoldByPanelProps) {
  const [days, setDays] = useState<(typeof PERIOD_OPTIONS)[number]>(30)
  const [data, setData] = useState<UserSoldBySalesReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const report = await apiFetch<UserSoldBySalesReport>(
        `/users/${encodeURIComponent(userId)}/sold-by-sales?days=${days}`,
      )
      setData(report)
    } catch (err) {
      setData(null)
      setError(err instanceof Error ? err.message : 'Could not load sold-by sales')
    } finally {
      setLoading(false)
    }
  }, [userId, days])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <section className="user-card-block user-sold-by-panel">
      <div className="user-card-block-header">
        <h4>Sold by sales</h4>
        <div className="user-score-card-period" role="group" aria-label="Sold-by period">
          {PERIOD_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              className={`btn ghost small${days === option ? ' active' : ''}`}
              disabled={loading}
              onClick={() => setDays(option)}
            >
              {option}d
            </button>
          ))}
          <button type="button" className="btn ghost small" disabled={loading} onClick={() => void load()}>
            Refresh
          </button>
        </div>
      </div>
      <p className="muted user-sold-by-lead">
        Products with <strong>Sold by</strong> enabled in the catalog, credited to {userLabel} when they were logged
        in at checkout. Refunds reduce the counts below.
      </p>
      {loading ? <p className="muted">Loading sold-by lines…</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {!loading && !error && data ? (
        <>
          <p className="user-sold-by-totals">
            Net <strong>{data.totals.quantity.toFixed(2)}</strong> units ·{' '}
            <strong>{formatMoney(data.totals.lineTotal)}</strong>
          </p>
          {data.lines.length === 0 ? (
            <p className="muted">No sold-by lines in this period.</p>
          ) : (
            <div className="dashboard-staff-shift-table-wrap">
              <table className="table user-sold-by-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Sale</th>
                    <th>Product</th>
                    <th>Qty</th>
                    <th>Unit</th>
                    <th>Line</th>
                    <th>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lines.map((row, i) => (
                    <tr key={`${row.saleId}-${row.occurredAt}-${row.kind}-${i}`} className={row.kind === 'refund' ? 'user-sold-by-row--refund' : undefined}>
                      <td>{formatWhen(row.occurredAt)}</td>
                      <td>{row.saleShortId ?? row.saleId.slice(-10)}</td>
                      <td>
                        {row.productName}
                        {row.sku ? <span className="muted user-sold-by-sku"> · {row.sku}</span> : null}
                      </td>
                      <td>{row.quantity.toFixed(2)}</td>
                      <td>{formatMoney(row.unitPrice)}</td>
                      <td>{formatMoney(row.lineTotal)}</td>
                      <td>{row.kind === 'refund' ? 'Refund' : 'Sale'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </section>
  )
}
