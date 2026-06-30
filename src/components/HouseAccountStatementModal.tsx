import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '../api/client'
import type { HouseAccountStatement, HouseAccountRow } from '../api/types'
import { paymentTermsLabel } from '../houseAccounts/paymentTerms'
import { downloadHouseAccountStatementCsv, formatStatementDate } from '../houseAccounts/statementExport'

export type HouseAccountStatementModalProps = {
  account: HouseAccountRow | null
  onClose: () => void
}

export function HouseAccountStatementModal({ account, onClose }: HouseAccountStatementModalProps) {
  const [statement, setStatement] = useState<HouseAccountStatement | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const printRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async (accountId: string) => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch<HouseAccountStatement>(
        `/house-accounts/${encodeURIComponent(accountId)}/statement`,
      )
      setStatement(data)
    } catch (e) {
      setStatement(null)
      setError(e instanceof Error ? e.message : 'Failed to load statement')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!account) {
      setStatement(null)
      setError(null)
      return
    }
    void load(account._id)
  }, [account, load])

  function handlePrint() {
    window.print()
  }

  function handleDownload() {
    if (!statement) return
    downloadHouseAccountStatementCsv(statement)
  }

  if (!account) return null

  return (
    <div
      className="open-tabs-backdrop house-account-statement-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="house-statement-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="open-tabs-dialog quotes-modal-dialog house-account-statement-dialog">
        <div className="open-tabs-header house-account-statement-screen-only">
          <h2 id="house-statement-title">Account statement — {account.accountNumber}</h2>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn small" disabled={!statement || loading} onClick={handlePrint}>
              Print
            </button>
            <button type="button" className="btn small" disabled={!statement || loading} onClick={handleDownload}>
              Download CSV
            </button>
            <button type="button" className="btn ghost open-tabs-close" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <div className="quotes-modal-body house-account-statement-body">
          {loading ? <p className="muted">Loading statement…</p> : null}
          {error ? <p className="error">{error}</p> : null}
          {statement ? (
            <div ref={printRef} className="house-account-statement-printable">
              <header className="house-account-statement-header">
                <div>
                  <h3>{statement.store.name}</h3>
                  {statement.store.addressLines.map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                  {statement.store.phone ? <div>TEL {statement.store.phone}</div> : null}
                  {statement.store.vatNumber ? <div>VAT {statement.store.vatNumber}</div> : null}
                </div>
                <div className="house-account-statement-account-block">
                  <h3>{statement.account.name}</h3>
                  <div>
                    <strong>{statement.account.accountNumber}</strong>
                  </div>
                  {statement.account.vatNumber ? <div>VAT {statement.account.vatNumber}</div> : null}
                  {statement.account.companyRegistrationNumber ? (
                    <div>Reg {statement.account.companyRegistrationNumber}</div>
                  ) : null}
                  {statement.account.addressLines.map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                  {paymentTermsLabel(statement.account.paymentTerms) ? (
                    <div>Terms: {paymentTermsLabel(statement.account.paymentTerms)}</div>
                  ) : null}
                </div>
              </header>
              <p className="house-account-statement-meta">
                Statement period: <strong>{formatStatementDate(statement.periodFrom)}</strong> to{' '}
                <strong>{formatStatementDate(statement.periodTo)}</strong>
                {statement.periodMode === 'since_last_zero' ? (
                  <span className="muted"> · since last zero balance</span>
                ) : null}
              </p>
              <div className="house-account-statement-balances">
                <span>Opening balance: {statement.openingBalance.toFixed(2)}</span>
                <span>
                  <strong>Balance due: {statement.closingBalance.toFixed(2)}</strong>
                </span>
              </div>
              <table className="table house-account-statement-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th className="num">Debit</th>
                    <th className="num">Credit</th>
                    <th className="num">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {statement.rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="muted">
                        No activity in this period.
                      </td>
                    </tr>
                  ) : (
                    statement.rows.map((row) => (
                      <StatementRow key={row.id} row={row} />
                    ))
                  )}
                </tbody>
              </table>
              <p className="muted small house-account-statement-footer">
                Generated {formatStatementDate(statement.generatedAt)} · Closing balance{' '}
                {statement.closingBalance.toFixed(2)}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function StatementRow({ row }: { row: HouseAccountStatement['rows'][number] }) {
  const date = formatStatementDate(row.date)
  if (row.kind === 'charge' && row.charge) {
    const c = row.charge
    const header = [
      c.saleId ? `Sale ${c.saleId}` : null,
      c.purchaseOrderNumber ? `PO ${c.purchaseOrderNumber}` : null,
      c.tillCode ? `Till ${c.tillCode}` : null,
    ]
      .filter(Boolean)
      .join(' · ')
    return (
      <>
        <tr className="house-account-statement-charge-head">
          <td>{date}</td>
          <td colSpan={4}>
            <strong>Charge</strong>
            {header ? ` · ${header}` : ''}
            {c.saleTotal > c.onAccountAmount + 0.005 ? (
              <span className="muted">
                {' '}
                · Sale {c.saleTotal.toFixed(2)} · On account {c.onAccountAmount.toFixed(2)}
              </span>
            ) : null}
          </td>
        </tr>
        {c.items.length > 0 ? (
          c.items.map((item, i) => (
            <tr key={`${row.id}-${i}`} className="house-account-statement-item">
              <td />
              <td>
                {item.name} × {item.quantity} @ {item.unitPrice.toFixed(2)}
              </td>
              <td className="num">{i === 0 ? row.debit.toFixed(2) : ''}</td>
              <td />
              <td className="num">{i === 0 ? row.balanceAfter.toFixed(2) : ''}</td>
            </tr>
          ))
        ) : (
          <tr className="house-account-statement-item">
            <td />
            <td>{row.note ?? 'Charge (no sale detail)'}</td>
            <td className="num">{row.debit.toFixed(2)}</td>
            <td />
            <td className="num">{row.balanceAfter.toFixed(2)}</td>
          </tr>
        )}
      </>
    )
  }

  const payDetail = [
    row.note,
    row.cashAmount != null && row.cashAmount > 0 ? `cash ${row.cashAmount.toFixed(2)}` : null,
    row.cardAmount != null && row.cardAmount > 0 ? `card ${row.cardAmount.toFixed(2)}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <tr>
      <td>{date}</td>
      <td>Payment{payDetail ? ` · ${payDetail}` : ''}</td>
      <td className="num" />
      <td className="num">{row.credit.toFixed(2)}</td>
      <td className="num">{row.balanceAfter.toFixed(2)}</td>
    </tr>
  )
}
