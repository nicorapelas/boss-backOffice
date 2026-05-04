import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { apiFetch } from '../api/client'
import type { FinancialsSummary } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { hasPermission } from '../auth/permissions'
import { BoShell } from '../layouts/BoShell'

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10)
}

export function FinancialsPage() {
  const { session } = useAuth()
  const isAdmin = hasPermission(session?.user, 'financials.read')

  const [from, setFrom] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 7)
    return isoDay(d)
  })
  const [to, setTo] = useState(() => isoDay(new Date()))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<FinancialsSummary | null>(null)

  const query = useMemo(() => {
    // include whole "to" day by setting it to end-of-day in local time
    const fromDate = new Date(`${from}T00:00:00`)
    const toDate = new Date(`${to}T23:59:59.999`)
    return `from=${encodeURIComponent(fromDate.toISOString())}&to=${encodeURIComponent(toDate.toISOString())}`
  }, [from, to])

  async function load() {
    if (!isAdmin) return
    setBusy(true)
    setError(null)
    try {
      const result = await apiFetch<FinancialsSummary>(`/financials/summary?${query}`)
      setData(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load financials')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void load()
  }

  return (
    <BoShell>
      <h1>Financials</h1>
      <p className="muted">Sales totals by date range.</p>

      {!isAdmin && <p className="error">Permission required: financials.</p>}

      {isAdmin && (
        <>
          <form className="panel audit-toolbar" onSubmit={onSubmit}>
            <label>
              From
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} required />
            </label>
            <label>
              To
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} required />
            </label>
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? 'Loading…' : 'Refresh'}
            </button>
          </form>

          {error && <p className="error">{error}</p>}

          {data && (
            <>
              <section className="panel">
                <h2>Totals</h2>
                <div className="audit-kpi-grid">
                  <div className="audit-kpi">
                    <span className="audit-kpi-label">Sales count</span>
                    <strong className="audit-kpi-value">{data.totals.saleCount.toLocaleString()}</strong>
                  </div>
                  <div className="audit-kpi">
                    <span className="audit-kpi-label">Gross total</span>
                    <strong className="audit-kpi-value">{data.totals.grossTotal.toFixed(2)}</strong>
                  </div>
                </div>
                <p className="muted" style={{ marginTop: '0.75rem' }}>
                  Gross total excludes lay-by completion tickets (stock release). Lay-by instalments are listed
                  below.
                </p>
              </section>

              <section className="panel">
                <h2>Lay-by payments (instalments)</h2>
                <div className="audit-kpi-grid">
                  <div className="audit-kpi">
                    <span className="audit-kpi-label">Payments</span>
                    <strong className="audit-kpi-value">{(data.layByPayments?.paymentCount ?? 0).toLocaleString()}</strong>
                  </div>
                  <div className="audit-kpi">
                    <span className="audit-kpi-label">Amount</span>
                    <strong className="audit-kpi-value">{(data.layByPayments?.amountTotal ?? 0).toFixed(2)}</strong>
                  </div>
                  <div className="audit-kpi">
                    <span className="audit-kpi-label">Cash</span>
                    <strong className="audit-kpi-value">{(data.layByPayments?.cashTotal ?? 0).toFixed(2)}</strong>
                  </div>
                  <div className="audit-kpi">
                    <span className="audit-kpi-label">Card</span>
                    <strong className="audit-kpi-value">{(data.layByPayments?.cardTotal ?? 0).toFixed(2)}</strong>
                  </div>
                  <div className="audit-kpi">
                    <span className="audit-kpi-label">Store credit used</span>
                    <strong className="audit-kpi-value">{(data.layByPayments?.storeCreditTotal ?? 0).toFixed(2)}</strong>
                  </div>
                </div>
              </section>

              <section className="panel">
                <h2>By payment method</h2>
                {data.byPaymentMethod.length === 0 ? (
                  <p className="muted">No sales in range.</p>
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Method</th>
                        <th>Sales</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byPaymentMethod.map((r) => (
                        <tr key={r.paymentMethod}>
                          <td>{r.paymentMethod}</td>
                          <td>{r.saleCount.toLocaleString()}</td>
                          <td>{r.grossTotal.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>

              <section className="panel">
                <h2>By day</h2>
                {data.byDay.length === 0 ? (
                  <p className="muted">No sales in range.</p>
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Sales</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byDay.map((r) => (
                        <tr key={r.day}>
                          <td>{r.day}</td>
                          <td>{r.saleCount.toLocaleString()}</td>
                          <td>{r.grossTotal.toFixed(2)}</td>
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

