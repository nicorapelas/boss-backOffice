import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  fetchStoredInvoicePageBlob,
  getStoredInvoice,
  isInvoiceIntakeConfigured,
  listStoredInvoices,
  updateStoredInvoicePayment,
} from '../api/client'
import type { StoredInvoice, StoredInvoiceSummary } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { hasPermission } from '../auth/permissions'
import { BoShell } from '../layouts/BoShell'

type PayFilter = 'all' | 'unpaid' | 'paid'

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString()
}

export function SupplierInvoicesPage() {
  const { session } = useAuth()
  const canWrite = hasPermission(session?.user, 'catalog.write')
  const intakeOk = isInvoiceIntakeConfigured()
  const [searchParams, setSearchParams] = useSearchParams()

  const [rows, setRows] = useState<StoredInvoiceSummary[]>([])
  const [payFilter, setPayFilter] = useState<PayFilter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('id'))
  const [detail, setDetail] = useState<StoredInvoice | null>(null)
  const [pageUrl, setPageUrl] = useState<string | null>(null)
  const [pageNo, setPageNo] = useState(1)
  const [paymentNote, setPaymentNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const loadList = useCallback(async () => {
    setError(null)
    try {
      const list = await listStoredInvoices(
        payFilter === 'all' ? undefined : { paymentStatus: payFilter },
      )
      setRows(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load invoices')
      setRows([])
    }
  }, [payFilter])

  useEffect(() => {
    if (!canWrite || !intakeOk) return
    void loadList()
  }, [canWrite, intakeOk, loadList])

  useEffect(() => {
    const id = searchParams.get('id')
    if (id) setSelectedId(id)
  }, [searchParams])

  useEffect(() => {
    if (!selectedId || !intakeOk) {
      setDetail(null)
      setPageUrl(null)
      return
    }
    let cancelled = false
    let objectUrl: string | null = null
    void (async () => {
      setBusy(true)
      setError(null)
      try {
        const inv = await getStoredInvoice(selectedId)
        if (cancelled) return
        setDetail(inv)
        setPaymentNote(inv.paymentNote ?? '')
        setPageNo(1)
        const blob = await fetchStoredInvoicePageBlob(selectedId, 1)
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setPageUrl(objectUrl)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load invoice')
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [selectedId, intakeOk])

  const unpaidCount = useMemo(() => rows.filter((r) => r.paymentStatus === 'unpaid').length, [rows])

  const selectInvoice = (id: string) => {
    setSelectedId(id)
    setSearchParams({ id }, { replace: true })
    setNotice(null)
  }

  const changePage = async (next: number) => {
    if (!selectedId || !detail) return
    const page = Math.max(1, Math.min(next, detail.pageCount))
    setPageNo(page)
    setBusy(true)
    try {
      const blob = await fetchStoredInvoicePageBlob(selectedId, page)
      setPageUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return URL.createObjectURL(blob)
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load page')
    } finally {
      setBusy(false)
    }
  }

  const setPayment = async (status: 'unpaid' | 'paid') => {
    if (!selectedId) return
    setBusy(true)
    setError(null)
    try {
      const updated = await updateStoredInvoicePayment(selectedId, status, paymentNote)
      setDetail(updated)
      setNotice(status === 'paid' ? 'Marked paid.' : 'Marked unpaid.')
      void loadList()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  if (!canWrite) {
    return (
      <BoShell>
        <h1>Supplier invoices</h1>
        <p>You need catalog.write permission.</p>
      </BoShell>
    )
  }

  if (!intakeOk) {
    return (
      <BoShell>
        <h1>Supplier invoices</h1>
        <p>
          Configure <code>VITE_INVOICE_INTAKE_URL</code> — invoices are stored by the Steve intake service after Apply
          on Receive stock.
        </p>
      </BoShell>
    )
  }

  return (
    <BoShell>
      <h1>Supplier invoices</h1>
      <p className="small-print">
        Durable copies of invoices after stock Apply. Mark paid when the supplier is paid — separate from receiving
        stock. Drafts still expire after 7 days; these records keep the pages.
      </p>

      {error ? <p className="error-text">{error}</p> : null}
      {notice ? <p className="small-print">{notice}</p> : null}

      <div className="supplier-invoices-layout">
        <section className="panel">
          <div className="layout-teach-actions" style={{ marginTop: 0 }}>
            <button
              type="button"
              className={`btn small${payFilter === 'all' ? '' : ' ghost'}`}
              onClick={() => setPayFilter('all')}
            >
              All
            </button>
            <button
              type="button"
              className={`btn small${payFilter === 'unpaid' ? '' : ' ghost'}`}
              onClick={() => setPayFilter('unpaid')}
            >
              Unpaid{payFilter === 'all' && unpaidCount ? ` (${unpaidCount})` : ''}
            </button>
            <button
              type="button"
              className={`btn small${payFilter === 'paid' ? '' : ' ghost'}`}
              onClick={() => setPayFilter('paid')}
            >
              Paid
            </button>
            <button type="button" className="btn small ghost" disabled={busy} onClick={() => void loadList()}>
              Refresh
            </button>
          </div>

          {rows.length === 0 ? (
            <p className="muted">No stored invoices yet. Apply stock from a draft on Receive stock to save one.</p>
          ) : (
            <table className="data-table supplier-invoices-table">
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>Invoice #</th>
                  <th>Applied</th>
                  <th>Lines</th>
                  <th>Paid</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.invoiceId}
                    className={selectedId === r.invoiceId ? 'supplier-invoices-row--active' : undefined}
                    onClick={() => selectInvoice(r.invoiceId)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>{r.supplier}</td>
                    <td>{r.invoiceNumber ?? '—'}</td>
                    <td>{formatDate(r.appliedAt)}</td>
                    <td>{r.lineCount}</td>
                    <td>
                      <span className={`supplier-invoices-pill supplier-invoices-pill--${r.paymentStatus}`}>
                        {r.paymentStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="panel">
          {!detail ? (
            <p className="muted">Select an invoice to view pages and update payment.</p>
          ) : (
            <>
              <h2 className="bo-section-title" style={{ marginTop: 0 }}>
                {detail.supplier}
                {detail.invoiceNumber ? ` · #${detail.invoiceNumber}` : ''}
              </h2>
              <p className="small-print">
                Applied {formatDate(detail.appliedAt)} · {detail.lineCount} lines · {detail.pageCount} page
                {detail.pageCount === 1 ? '' : 's'} · from{' '}
                <Link to={`/receive-stock?draft=${encodeURIComponent(detail.draftId)}`}>draft</Link>
              </p>

              <div className="layout-teach-actions">
                {detail.paymentStatus === 'unpaid' ? (
                  <button type="button" className="btn" disabled={busy} onClick={() => void setPayment('paid')}>
                    Mark paid
                  </button>
                ) : (
                  <button type="button" className="btn ghost" disabled={busy} onClick={() => void setPayment('unpaid')}>
                    Mark unpaid
                  </button>
                )}
              </div>
              <label>
                Payment note
                <input
                  type="text"
                  value={paymentNote}
                  disabled={busy}
                  placeholder="e.g. EFT Absa 13 Jul"
                  onChange={(e) => setPaymentNote(e.target.value)}
                  onBlur={() => {
                    if (detail && (paymentNote.trim() || '') !== (detail.paymentNote ?? '')) {
                      void setPayment(detail.paymentStatus)
                    }
                  }}
                />
              </label>
              {detail.paidAt ? <p className="small-print">Paid on {formatDate(detail.paidAt)}</p> : null}

              <h3 className="bo-section-title" style={{ fontSize: '1rem' }}>
                Lines
              </h3>
              <table className="data-table supplier-invoices-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Description</th>
                    <th>Qty</th>
                    <th>Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.lines.map((ln, i) => (
                    <tr key={i}>
                      <td>{ln.code ?? '—'}</td>
                      <td>{ln.description}</td>
                      <td>{ln.qty ?? '—'}</td>
                      <td>{ln.unitCost ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <h3 className="bo-section-title" style={{ fontSize: '1rem' }}>
                Source page
              </h3>
              {detail.pageCount > 1 ? (
                <div className="layout-teach-actions">
                  <button
                    type="button"
                    className="btn small ghost"
                    disabled={busy || pageNo <= 1}
                    onClick={() => void changePage(pageNo - 1)}
                  >
                    Prev
                  </button>
                  <span className="small-print">
                    Page {pageNo} / {detail.pageCount}
                  </span>
                  <button
                    type="button"
                    className="btn small ghost"
                    disabled={busy || pageNo >= detail.pageCount}
                    onClick={() => void changePage(pageNo + 1)}
                  >
                    Next
                  </button>
                </div>
              ) : null}
              <div className="layout-teach-canvas-scroll" style={{ maxHeight: '55vh' }}>
                {pageUrl ? (
                  <img src={pageUrl} alt={`Invoice page ${pageNo}`} className="layout-teach-image" />
                ) : (
                  <p className="muted">Loading page…</p>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </BoShell>
  )
}
