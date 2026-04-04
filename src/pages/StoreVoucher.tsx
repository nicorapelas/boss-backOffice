import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api/client'
import type { StoreCreditAccountRow, StoreCreditLedgerRow } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { BoShell } from '../layouts/BoShell'

function formatRefType(refType: StoreCreditLedgerRow['refType']) {
  if (refType === 'layby_cancel') return 'Lay-by cancel'
  if (refType === 'sale') return 'Sale'
  return refType
}

export function StoreVoucherPage() {
  const { session } = useAuth()
  const isAdmin = session?.user.role === 'admin'
  const [accounts, setAccounts] = useState<StoreCreditAccountRow[]>([])
  const [ledger, setLedger] = useState<StoreCreditLedgerRow[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const totalBalance = useMemo(
    () => accounts.reduce((s, a) => s + (a.balance ?? 0), 0),
    [accounts],
  )

  async function load() {
    if (!isAdmin) return
    setBusy(true)
    setError(null)
    try {
      const [a, l] = await Promise.all([
        apiFetch<StoreCreditAccountRow[]>('/store-credit/accounts'),
        apiFetch<StoreCreditLedgerRow[]>('/store-credit/ledger?limit=300'),
      ])
      setAccounts(a)
      setLedger(l)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])

  return (
    <BoShell>
      <h1>Store vouchers</h1>
      <p className="muted">Customer store credit balances and ledger (admin).</p>
      {!isAdmin && <p className="error">Admin role required.</p>}
      {isAdmin && (
        <>
          <div className="panel audit-toolbar">
            <span className="muted">
              Total on account (sum of balances):{' '}
              <strong>{totalBalance.toFixed(2)}</strong>
            </span>
            <button type="button" className="btn ghost" disabled={busy} onClick={() => void load()}>
              {busy ? 'Loading…' : 'Refresh'}
            </button>
          </div>
          {error && <p className="error">{error}</p>}

          <h2 className="bo-section-title">Accounts</h2>
          <div className="panel">
            <table className="table">
              <thead>
                <tr>
                  <th>Phone</th>
                  <th>Name</th>
                  <th>Balance</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((r) => (
                  <tr key={r._id}>
                    <td>{r.phone}</td>
                    <td>{r.name}</td>
                    <td>{r.balance.toFixed(2)}</td>
                    <td>{r.updatedAt ? new Date(r.updatedAt).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {accounts.length === 0 && !busy && <p className="muted">No store credit accounts yet.</p>}
          </div>

          <h2 className="bo-section-title">Recent ledger</h2>
          <p className="muted small-print">Issues add credit; redeems spend it (sale checkout or similar).</p>
          <div className="panel">
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Phone</th>
                  <th>Kind</th>
                  <th>Amount</th>
                  <th>Reference</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((r) => (
                  <tr key={r._id}>
                    <td>{r.createdAt ? new Date(r.createdAt).toLocaleString() : '—'}</td>
                    <td>{r.phone}</td>
                    <td>{r.kind}</td>
                    <td>{r.amount.toFixed(2)}</td>
                    <td>
                      {formatRefType(r.refType)} · <span className="muted">{String(r.refId)}</span>
                    </td>
                    <td>{r.note ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {ledger.length === 0 && !busy && <p className="muted">No ledger entries.</p>}
          </div>
        </>
      )}
    </BoShell>
  )
}
