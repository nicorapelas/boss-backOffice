import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  deleteStoredInvoice,
  downloadStoredInvoice,
  fetchStoredInvoicePageBlob,
  getStoredInvoice,
  isInvoiceIntakeConfigured,
  listStoredInvoices,
  updateStoredInvoicePayment,
} from '../api/client'
import type { StoredInvoice, StoredInvoiceSummary } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { hasPermission } from '../auth/permissions'
import { ConfirmModal } from '../components/ConfirmModal'
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
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

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

  const clearSelection = () => {
    setSelectedId(null)
    setDetail(null)
    setSearchParams({}, { replace: true })
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

  const downloadInvoice = async () => {
    if (!selectedId) return
    setBusy(true)
    setError(null)
    try {
      const { blob, filename } = await downloadStoredInvoice(selectedId)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      setNotice('Download started.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed')
    } finally {
      setBusy(false)
    }
  }

  const deleteInvoice = async () => {
    if (!selectedId || !detail) return
    setBusy(true)
    setError(null)
    try {
      await deleteStoredInvoice(selectedId)
      setDeleteConfirmOpen(false)
      clearSelection()
      setNotice('Invoice deleted.')
      void loadList()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  const deleteLabel = detail
    ? detail.invoiceNumber
      ? `${detail.supplier} #${detail.invoiceNumber}`
      : detail.supplier
    : ''

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

  const showingDetail = Boolean(selectedId)

  return (
    <BoShell>
      <h1>Supplier invoices</h1>
      <p className="small-print">
        Durable copies of invoices after stock Apply. Mark paid when the supplier is paid — separate from receiving
        stock. Download saves pages as a ZIP. Delete removes the stored record only (stock Apply is not reversed).
        Drafts still expire after 7 days; these records keep the pages.
      </p>

      {error ? <p className="error-text">{error}</p> : null}
      {notice ? <p className="small-print">{notice}</p> : null}

      <div
        className={`supplier-invoices-layout${showingDetail ? ' supplier-invoices-layout--detail' : ' supplier-invoices-layout--list'}`}
      >
        <section className="panel supplier-invoices-list">
          <div className="supplier-invoices-toolbar">
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
            <div className="supplier-invoices-list-wrap">
              <table className="data-table supplier-invoices-table supplier-invoices-list-table">
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
                    >
                      <td data-label="Supplier">
                        <span className="supplier-invoices-supplier">{r.supplier}</span>
                      </td>
                      <td data-label="Invoice #">{r.invoiceNumber ?? '—'}</td>
                      <td data-label="Applied">{formatDate(r.appliedAt)}</td>
                      <td data-label="Lines">{r.lineCount}</td>
                      <td data-label="Paid">
                        <span className={`supplier-invoices-pill supplier-invoices-pill--${r.paymentStatus}`}>
                          {r.paymentStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel supplier-invoices-detail">
          {!detail ? (
            <p className="muted supplier-invoices-detail-empty">
              Select an invoice to view pages and update payment.
            </p>
          ) : (
            <>
              <div className="supplier-invoices-detail-header">
                <button type="button" className="btn small ghost supplier-invoices-back" onClick={clearSelection}>
                  ← Back to list
                </button>
                <h2 className="bo-section-title supplier-invoices-detail-title">
                  {detail.supplier}
                  {detail.invoiceNumber ? ` · #${detail.invoiceNumber}` : ''}
                </h2>
                <p className="small-print">
                  Applied {formatDate(detail.appliedAt)} · {detail.lineCount} lines · {detail.pageCount} page
                  {detail.pageCount === 1 ? '' : 's'} · from{' '}
                  <Link to={`/receive-stock?draft=${encodeURIComponent(detail.draftId)}`}>draft</Link>
                </p>
              </div>

              <div className="supplier-invoices-payment">
                <div className="supplier-invoices-toolbar">
                  {detail.paymentStatus === 'unpaid' ? (
                    <button type="button" className="btn" disabled={busy} onClick={() => void setPayment('paid')}>
                      Mark paid
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn ghost"
                      disabled={busy}
                      onClick={() => void setPayment('unpaid')}
                    >
                      Mark unpaid
                    </button>
                  )}
                  <button type="button" className="btn small" disabled={busy} onClick={() => void downloadInvoice()}>
                    Download invoice
                  </button>
                  <button
                    type="button"
                    className="btn small ghost supplier-invoices-delete"
                    disabled={busy}
                    onClick={() => setDeleteConfirmOpen(true)}
                  >
                    Delete invoice
                  </button>
                  <span className={`supplier-invoices-pill supplier-invoices-pill--${detail.paymentStatus}`}>
                    {detail.paymentStatus}
                  </span>
                </div>
                <label className="supplier-invoices-note">
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
              </div>

              <h3 className="bo-section-title supplier-invoices-subhead">Lines</h3>
              <div className="supplier-invoices-lines-wrap">
                <table className="data-table supplier-invoices-table supplier-invoices-lines-table">
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
                        <td data-label="Code">{ln.code ?? '—'}</td>
                        <td data-label="Description">{ln.description}</td>
                        <td data-label="Qty">{ln.qty ?? '—'}</td>
                        <td data-label="Unit">{ln.unitCost ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h3 className="bo-section-title supplier-invoices-subhead">Source page</h3>
              {detail.pageCount > 1 ? (
                <div className="supplier-invoices-toolbar">
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
              <div className="supplier-invoices-page-scroll">
                {pageUrl ? (
                  <img src={pageUrl} alt={`Invoice page ${pageNo}`} className="supplier-invoices-page-image" />
                ) : (
                  <p className="muted">Loading page…</p>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      <ConfirmModal
        open={deleteConfirmOpen}
        title="Delete invoice?"
        confirmLabel={busy ? 'Deleting…' : 'Delete invoice'}
        cancelLabel="Cancel"
        busy={busy}
        confirmTone="danger"
        onConfirm={() => void deleteInvoice()}
        onCancel={() => {
          if (!busy) setDeleteConfirmOpen(false)
        }}
      >
        <p>
          Delete stored invoice <strong>{deleteLabel}</strong>?
        </p>
        <p className="muted">
          This removes the saved pages and payment record from Steve. It does not reverse stock that was
          already applied.
        </p>
      </ConfirmModal>
    </BoShell>
  )
}
