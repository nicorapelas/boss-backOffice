import { Fragment, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { apiFetch } from '../api/client'
import type { Sale, SaleListResponse } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { hasPermission } from '../auth/permissions'
import { BoShell } from '../layouts/BoShell'

/** Local calendar YYYY-MM-DD, aligned with `input type="date"`. */
function localIsoDay(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function cashierLabel(c: Sale['cashier']): string {
  if (!c || typeof c === 'string') return typeof c === 'string' && c.trim() ? c : '—'
  const bits = [c.displayName, c.email].filter(Boolean)
  return bits.length ? bits.join(' · ') : '—'
}

const PAGE_SIZE = 50

const PAYMENT_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Any method' },
  { value: 'cash', label: 'cash' },
  { value: 'card', label: 'card' },
  { value: 'split', label: 'split' },
  { value: 'store_credit', label: 'store_credit' },
  { value: 'on_account', label: 'on_account' },
  { value: 'layby_complete', label: 'layby_complete' },
]

type FilterForm = {
  from: string
  to: string
  allDates: boolean
  tillCode: string
  paymentMethod: string
  refund: 'all' | 'yes' | 'no'
  stockOverride: 'all' | 'yes' | 'no'
  q: string
}

function defaultTwoWeekRange(): { from: string; to: string } {
  const d = new Date()
  d.setDate(d.getDate() - 14)
  return { from: localIsoDay(d), to: localIsoDay(new Date()) }
}

function initialFilters(): FilterForm {
  const r = defaultTwoWeekRange()
  return {
    from: r.from,
    to: r.to,
    allDates: false,
    tillCode: '',
    paymentMethod: '',
    refund: 'all',
    stockOverride: 'all',
    q: '',
  }
}

function filtersToQueryString(f: FilterForm, skip: number): string {
  const sp = new URLSearchParams()
  if (!f.allDates) {
    const fromDate = new Date(`${f.from}T00:00:00`)
    const toDate = new Date(`${f.to}T23:59:59.999`)
    sp.set('from', fromDate.toISOString())
    sp.set('to', toDate.toISOString())
  }
  if (f.tillCode.trim()) sp.set('tillCode', f.tillCode.trim().toUpperCase())
  if (f.paymentMethod.trim()) sp.set('paymentMethod', f.paymentMethod.trim())
  if (f.refund !== 'all') sp.set('refund', f.refund)
  if (f.stockOverride !== 'all') sp.set('stockOverride', f.stockOverride)
  if (f.q.trim()) sp.set('q', f.q.trim())
  sp.set('skip', String(skip))
  sp.set('limit', String(PAGE_SIZE))
  return sp.toString()
}

export function SalesReceiptsPage() {
  const { session } = useAuth()
  const canRead = hasPermission(session?.user, 'sales.read')

  const [form, setForm] = useState<FilterForm>(initialFilters)
  const [query, setQuery] = useState<FilterForm>(initialFilters)
  const [skip, setSkip] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<SaleListResponse | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [copyFlash, setCopyFlash] = useState<string | null>(null)

  const queryString = useMemo(() => filtersToQueryString(query, skip), [query, skip])

  const load = useCallback(async () => {
    if (!canRead) return
    setBusy(true)
    setError(null)
    try {
      const result = await apiFetch<SaleListResponse>(`/sales?${queryString}`)
      setData(result)
    } catch (e) {
      setData(null)
      setError(e instanceof Error ? e.message : 'Failed to load sales')
    } finally {
      setBusy(false)
    }
  }, [canRead, queryString])

  useEffect(() => {
    void load()
  }, [load])

  function onApply(e: FormEvent) {
    e.preventDefault()
    setQuery({ ...form })
    setSkip(0)
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function copyId(id: string) {
    try {
      await navigator.clipboard.writeText(id)
      setCopyFlash(id)
      window.setTimeout(() => setCopyFlash((x) => (x === id ? null : x)), 1500)
    } catch {
      setCopyFlash(null)
    }
  }

  const total = data?.total ?? 0
  const sales = data?.sales ?? []
  const pageStart = total === 0 ? 0 : skip + 1
  const pageEnd = skip + sales.length
  const hasPrev = skip > 0
  const hasNext = skip + sales.length < total

  const todayStr = localIsoDay(new Date())
  const yDate = new Date()
  yDate.setDate(yDate.getDate() - 1)
  const yesterdayStr = localIsoDay(yDate)
  const todayActive = !form.allDates && form.from === todayStr && form.to === todayStr
  const yesterdayActive = !form.allDates && form.from === yesterdayStr && form.to === yesterdayStr

  return (
    <BoShell>
      <h1>Sales & receipts</h1>
      <p className="muted">
        New sales get a 10-character <strong>sale id</strong> (printed on receipts). Use that or the internal MongoDB{' '}
        <code>_id</code> for POS refunds and lookups. Older migrated sales may only have an <code>_id</code>.
      </p>

      {!canRead && <p className="error">Permission required: sales.read</p>}

      {canRead && (
        <>
          <form className="panel sales-filters-panel" onSubmit={onApply}>
            <h2 className="sales-filters-title">Search &amp; filters</h2>
            <div className="sales-fields-grid">
              <div className="sales-field sales-field--full sales-filter-quick-dates">
                <label className="bo-filter-check">
                  <input
                    type="checkbox"
                    checked={form.allDates}
                    onChange={(e) => setForm((f) => ({ ...f, allDates: e.target.checked }))}
                  />
                  All dates
                </label>
                <label className="bo-filter-check">
                  <input
                    type="checkbox"
                    disabled={form.allDates}
                    checked={todayActive}
                    onChange={(e) => {
                      if (form.allDates) return
                      if (e.target.checked) {
                        setForm((f) => ({ ...f, from: todayStr, to: todayStr, allDates: false }))
                      } else {
                        setForm((f) => {
                          if (f.from === todayStr && f.to === todayStr) {
                            return { ...f, ...defaultTwoWeekRange() }
                          }
                          return f
                        })
                      }
                    }}
                  />
                  Today
                </label>
                <label className="bo-filter-check">
                  <input
                    type="checkbox"
                    disabled={form.allDates}
                    checked={yesterdayActive}
                    onChange={(e) => {
                      if (form.allDates) return
                      if (e.target.checked) {
                        setForm((f) => ({ ...f, from: yesterdayStr, to: yesterdayStr, allDates: false }))
                      } else {
                        setForm((f) => {
                          if (f.from === yesterdayStr && f.to === yesterdayStr) {
                            return { ...f, ...defaultTwoWeekRange() }
                          }
                          return f
                        })
                      }
                    }}
                  />
                  Yesterday
                </label>
              </div>
              {!form.allDates ? (
                <>
                  <label className="sales-field sales-field--half">
                    From
                    <input
                      type="date"
                      value={form.from}
                      onChange={(e) => setForm((f) => ({ ...f, from: e.target.value }))}
                      required={!form.allDates}
                    />
                  </label>
                  <label className="sales-field sales-field--half">
                    To
                    <input
                      type="date"
                      value={form.to}
                      onChange={(e) => setForm((f) => ({ ...f, to: e.target.value }))}
                      required={!form.allDates}
                    />
                  </label>
                </>
              ) : null}
              <label className="sales-field sales-field--quarter">
                Till
                <input
                  value={form.tillCode}
                  onChange={(e) => setForm((f) => ({ ...f, tillCode: e.target.value }))}
                  placeholder="T1 / T2 / T3"
                  autoComplete="off"
                />
              </label>
              <label className="sales-field sales-field--quarter">
                Payment
                <select
                  value={form.paymentMethod}
                  onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value }))}
                >
                  {PAYMENT_OPTIONS.map((o) => (
                    <option key={o.value || 'any'} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="sales-field sales-field--quarter">
                Refund
                <select
                  value={form.refund}
                  onChange={(e) => setForm((f) => ({ ...f, refund: e.target.value as FilterForm['refund'] }))}
                >
                  <option value="all">All</option>
                  <option value="no">Not refunded</option>
                  <option value="yes">Refunded</option>
                </select>
              </label>
              <label className="sales-field sales-field--quarter">
                Stock override
                <select
                  value={form.stockOverride}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, stockOverride: e.target.value as FilterForm['stockOverride'] }))
                  }
                >
                  <option value="all">All</option>
                  <option value="yes">Override used</option>
                  <option value="no">No override</option>
                </select>
              </label>
              <label className="sales-field sales-field--full">
                Search
                <input
                  type="search"
                  value={form.q}
                  onChange={(e) => setForm((f) => ({ ...f, q: e.target.value }))}
                  placeholder="Sale id, id prefix, legacy receipt #, line name…"
                  title="24-char id = exact match; hex prefix = id starts with; 3+ digits = legacy receipt number; else line item name contains"
                />
              </label>
              <div className="sales-field sales-field--full sales-filter-actions">
                <button type="submit" className="btn primary" disabled={busy}>
                  {busy ? 'Loading…' : 'Apply filters'}
                </button>
                <button type="button" className="btn ghost" disabled={busy} onClick={() => void load()}>
                  Refresh
                </button>
              </div>
            </div>
          </form>

          {error && <p className="error">{error}</p>}

          <div className="panel" style={{ marginTop: '1rem' }}>
            <div className="audit-toolbar" style={{ justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <p className="muted" style={{ margin: 0 }}>
                {total === 0
                  ? 'No sales match.'
                  : `Showing ${pageStart}–${pageEnd} of ${total.toLocaleString()}`}
              </p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn ghost small"
                  disabled={!hasPrev || busy}
                  onClick={() => setSkip((s) => Math.max(0, s - PAGE_SIZE))}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="btn ghost small"
                  disabled={!hasNext || busy}
                  onClick={() => setSkip((s) => s + PAGE_SIZE)}
                >
                  Next
                </button>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: '2.5rem' }} aria-label="expand" />
                    <th>When</th>
                    <th>Sale id</th>
                    <th>Cashier</th>
                    <th>Till</th>
                    <th>Total</th>
                    <th>Payment</th>
                    <th>Lines</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((s) => {
                    const open = expanded.has(s._id)
                    return (
                      <Fragment key={s._id}>
                        <tr>
                          <td>
                            <button
                              type="button"
                              className="btn ghost small"
                              aria-expanded={open}
                              aria-label={open ? 'Collapse' : 'Expand'}
                              onClick={() => toggleExpand(s._id)}
                            >
                              {open ? '▼' : '▶'}
                            </button>
                          </td>
                          <td>{s.createdAt ? new Date(s.createdAt).toLocaleString() : '—'}</td>
                          <td>
                            <code
                              style={{ fontSize: '0.85em' }}
                              title={s.saleId ? `Sale id ${s.saleId} · _id ${s._id}` : s._id}
                            >
                              {s.saleId ?? '—'}
                            </code>
                            <button
                              type="button"
                              className="btn ghost small"
                              style={{ marginLeft: '0.35rem' }}
                              onClick={() => void copyId(s.saleId ?? s._id)}
                            >
                              {copyFlash === (s.saleId ?? s._id) ? 'Copied' : 'Copy'}
                            </button>
                          </td>
                          <td>{cashierLabel(s.cashier)}</td>
                          <td>{s.tillCode ?? '—'}</td>
                          <td>{s.total.toFixed(2)}</td>
                          <td>{s.paymentMethod ?? '—'}</td>
                          <td>{s.items?.length ?? 0}</td>
                          <td>
                            {s.refundStatus === 'refunded' ? (
                              <span className="muted">Refunded</span>
                            ) : s.layById ? (
                              <span className="muted">Lay-by</span>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                        </tr>
                        {open ? (
                          <tr className="sale-detail-row">
                            <td colSpan={9} style={{ background: 'var(--bo-panel-subtle, rgba(0,0,0,0.04))' }}>
                              <div style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>
                                <p style={{ margin: '0 0 0.5rem' }}>
                                  <strong>Sale id (10):</strong>{' '}
                                  {s.saleId ? <code>{s.saleId}</code> : <span className="muted">not set (legacy sale)</span>}
                                </p>
                                <p style={{ margin: '0 0 0.5rem' }} className="muted">
                                  <strong>Mongo _id:</strong> <code>{s._id}</code>
                                </p>
                                <p style={{ margin: '0 0 0.5rem' }} className="muted">
                                  <strong>Till:</strong> {s.tillCode ?? 'not set'}
                                </p>
                                {s.legacy?.receiptNo != null && (
                                  <p className="muted" style={{ margin: '0 0 0.35rem' }}>
                                    Legacy receipt #{s.legacy.receiptNo}
                                    {s.legacy.terminal != null ? ` · terminal ${s.legacy.terminal}` : ''}
                                    {s.legacy.source ? ` · ${s.legacy.source}` : ''}
                                  </p>
                                )}
                                {s.quoteId && (
                                  <p className="muted" style={{ margin: '0 0 0.35rem' }}>
                                    Quote: <code>{String(s.quoteId)}</code>
                                  </p>
                                )}
                                {(s.storeCreditAmount ?? 0) > 0.005 && (
                                  <p className="muted" style={{ margin: '0 0 0.35rem' }}>
                                    Store credit: {s.storeCreditAmount?.toFixed(2)}
                                  </p>
                                )}
                                {(s.onAccountAmount ?? 0) > 0.005 && (
                                  <p className="muted" style={{ margin: '0 0 0.35rem' }}>
                                    On account: {s.onAccountAmount?.toFixed(2)}
                                    {s.houseAccountNumber ? ` (${s.houseAccountNumber})` : ''}
                                  </p>
                                )}
                                {s.payment && (
                                  <p className="muted" style={{ margin: '0 0 0.35rem' }}>
                                    Cash {s.payment.cashAmount?.toFixed(2) ?? '0'} · Card{' '}
                                    {s.payment.cardAmount?.toFixed(2) ?? '0'}
                                    {s.payment.changeDue != null && s.payment.changeDue > 0
                                      ? ` · Change ${s.payment.changeDue.toFixed(2)}`
                                      : ''}
                                  </p>
                                )}
                                {s.refundStatus === 'refunded' && s.refundedAt && (
                                  <p className="muted" style={{ margin: '0 0 0.5rem' }}>
                                    Refunded {new Date(s.refundedAt).toLocaleString()}
                                    {s.refundNote ? ` · ${s.refundNote}` : ''}
                                  </p>
                                )}
                                <table className="table" style={{ marginTop: '0.5rem' }}>
                                  <thead>
                                    <tr>
                                      <th>Name</th>
                                      <th>Qty</th>
                                      <th>Unit</th>
                                      <th>Line total</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(s.items ?? []).map((line, i) => (
                                      <tr key={i}>
                                        <td>
                                          {line.name}
                                          {line.stockOverrideApproved ? (
                                            <span className="muted" style={{ marginLeft: '0.4rem' }}>
                                              [override {line.stockOverrideScope ?? 'online'}
                                              {typeof line.stockOverrideAvailableQty === 'number'
                                                ? ` · avail ${line.stockOverrideAvailableQty}`
                                                : ''}
                                              ]
                                            </span>
                                          ) : null}
                                        </td>
                                        <td>{line.quantity}</td>
                                        <td>{line.unitPrice.toFixed(2)}</td>
                                        <td>{line.lineTotal.toFixed(2)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {sales.length === 0 && !busy && <p className="muted">No rows.</p>}
          </div>
        </>
      )}
    </BoShell>
  )
}
