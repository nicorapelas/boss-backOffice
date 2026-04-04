import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api/client'
import type { HouseAccountLedgerRow, HouseAccountRow } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { BoShell } from '../layouts/BoShell'

function round2(n: number) {
  return Math.round(n * 100) / 100
}

export function HouseAccountsPage() {
  const { session } = useAuth()
  const isAdmin = session?.user.role === 'admin'
  const [accounts, setAccounts] = useState<HouseAccountRow[]>([])
  const [ledgerByAccount, setLedgerByAccount] = useState<Record<string, HouseAccountLedgerRow[]>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createName, setCreateName] = useState('')
  const [createPhone, setCreatePhone] = useState('')
  const [createLimit, setCreateLimit] = useState('')
  const [payId, setPayId] = useState<string | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payCash, setPayCash] = useState('')
  const [payCard, setPayCard] = useState('')
  const [payNote, setPayNote] = useState('')

  const totalOwed = useMemo(() => accounts.reduce((s, a) => s + (a.balance ?? 0), 0), [accounts])

  async function loadAccounts() {
    if (!isAdmin) return
    setBusy(true)
    setError(null)
    try {
      const list = await apiFetch<HouseAccountRow[]>('/house-accounts?limit=500')
      setAccounts(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setBusy(false)
    }
  }

  async function loadLedger(accountId: string) {
    try {
      const rows = await apiFetch<HouseAccountLedgerRow[]>(`/house-accounts/${accountId}/ledger?limit=80`)
      setLedgerByAccount((prev) => ({ ...prev, [accountId]: rows }))
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    void loadAccounts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])

  async function createAccount(e: React.FormEvent) {
    e.preventDefault()
    if (!isAdmin) return
    const name = createName.trim()
    if (!name) {
      setError('Name is required')
      return
    }
    setBusy(true)
    setError(null)
    try {
      let creditLimit: number | null = null
      const limRaw = createLimit.trim()
      if (limRaw) {
        const n = Number(limRaw.replace(',', '.'))
        if (!Number.isFinite(n) || n < 0) {
          setError('Credit limit must be a number ≥ 0')
          setBusy(false)
          return
        }
        creditLimit = round2(n)
      }
      await apiFetch<HouseAccountRow>('/house-accounts', {
        method: 'POST',
        body: JSON.stringify({
          name,
          phone: createPhone.trim(),
          creditLimit,
        }),
      })
      setCreateName('')
      setCreatePhone('')
      setCreateLimit('')
      await loadAccounts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed')
    } finally {
      setBusy(false)
    }
  }

  async function submitPayment(e: React.FormEvent) {
    e.preventDefault()
    if (!payId || !isAdmin) return
    const amount = round2(Number(payAmount.replace(',', '.')) || 0)
    const cash = round2(Number(payCash.replace(',', '.')) || 0)
    const card = round2(Number(payCard.replace(',', '.')) || 0)
    if (amount <= 0) {
      setError('Enter payment amount')
      return
    }
    if (Math.abs(round2(cash + card) - amount) > 0.02) {
      setError('Cash + card must equal total payment')
      return
    }
    const accountId = payId
    setBusy(true)
    setError(null)
    try {
      await apiFetch(`/house-accounts/${accountId}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          amount,
          cashAmount: cash,
          cardAmount: card,
          note: payNote.trim() || undefined,
        }),
      })
      setPayId(null)
      setPayAmount('')
      setPayCash('')
      setPayCard('')
      setPayNote('')
      await loadAccounts()
      await loadLedger(accountId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed')
    } finally {
      setBusy(false)
    }
  }

  async function closeAccount(id: string) {
    if (!isAdmin) return
    if (!window.confirm('Close this account? It will no longer appear for new charges on the POS.')) return
    setBusy(true)
    setError(null)
    try {
      await apiFetch(`/house-accounts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'closed' }),
      })
      await loadAccounts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <BoShell>
      <h1>House accounts (AR)</h1>
      <p className="muted">On-account customers: balances owed to the store. Cashiers charge sales on the POS; record payments here or at the till.</p>
      {!isAdmin && <p className="error">Admin role required.</p>}
      {isAdmin && (
        <>
          <div className="panel audit-toolbar">
            <span className="muted">
              Total AR (sum of balances): <strong>{totalOwed.toFixed(2)}</strong>
            </span>
            <button type="button" className="btn ghost" disabled={busy} onClick={() => void loadAccounts()}>
              {busy ? 'Loading…' : 'Refresh'}
            </button>
          </div>
          {error && <p className="error">{error}</p>}

          <h2 className="bo-section-title">New account</h2>
          <form className="panel" onSubmit={(e) => void createAccount(e)} style={{ marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
              <label>
                <span className="muted" style={{ display: 'block', fontSize: '0.85rem' }}>
                  Name
                </span>
                <input
                  className="input"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Customer / business"
                />
              </label>
              <label>
                <span className="muted" style={{ display: 'block', fontSize: '0.85rem' }}>
                  Phone (optional)
                </span>
                <input
                  className="input"
                  value={createPhone}
                  onChange={(e) => setCreatePhone(e.target.value)}
                />
              </label>
              <label>
                <span className="muted" style={{ display: 'block', fontSize: '0.85rem' }}>
                  Credit limit (blank = none)
                </span>
                <input
                  className="input"
                  value={createLimit}
                  onChange={(e) => setCreateLimit(e.target.value)}
                  placeholder="e.g. 5000"
                />
              </label>
              <button type="submit" className="btn primary" disabled={busy}>
                Create
              </button>
            </div>
          </form>

          <h2 className="bo-section-title">Accounts</h2>
          <div className="panel">
            <table className="table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Owed</th>
                  <th>Limit</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {accounts.map((r) => (
                  <tr key={r._id}>
                    <td>{r.accountNumber}</td>
                    <td>{r.name}</td>
                    <td>{r.phone || '—'}</td>
                    <td>{r.balance.toFixed(2)}</td>
                    <td>{r.creditLimit != null ? r.creditLimit.toFixed(2) : '—'}</td>
                    <td>{r.status}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        className="btn ghost small"
                        onClick={() => void loadLedger(r._id)}
                        disabled={busy}
                      >
                        Ledger
                      </button>{' '}
                      {r.status === 'active' && r.balance > 0.01 ? (
                        <button type="button" className="btn small" onClick={() => setPayId(r._id)} disabled={busy}>
                          Pay
                        </button>
                      ) : null}{' '}
                      {r.status === 'active' ? (
                        <button type="button" className="btn ghost small" onClick={() => void closeAccount(r._id)} disabled={busy}>
                          Close
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {accounts.length === 0 && !busy && <p className="muted">No house accounts yet.</p>}
          </div>

          {payId ? (
            <div className="panel" style={{ marginTop: '1rem' }}>
              <h3 className="bo-section-title">Record payment</h3>
              <form onSubmit={(e) => void submitPayment(e)} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
                <label>
                  <span className="muted" style={{ display: 'block', fontSize: '0.85rem' }}>
                    Total
                  </span>
                  <input className="input" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
                </label>
                <label>
                  <span className="muted" style={{ display: 'block', fontSize: '0.85rem' }}>
                    Cash
                  </span>
                  <input className="input" value={payCash} onChange={(e) => setPayCash(e.target.value)} />
                </label>
                <label>
                  <span className="muted" style={{ display: 'block', fontSize: '0.85rem' }}>
                    Card
                  </span>
                  <input className="input" value={payCard} onChange={(e) => setPayCard(e.target.value)} />
                </label>
                <label>
                  <span className="muted" style={{ display: 'block', fontSize: '0.85rem' }}>
                    Note
                  </span>
                  <input className="input" value={payNote} onChange={(e) => setPayNote(e.target.value)} />
                </label>
                <button type="submit" className="btn primary" disabled={busy}>
                  Apply payment
                </button>
                <button type="button" className="btn ghost" onClick={() => setPayId(null)}>
                  Cancel
                </button>
              </form>
            </div>
          ) : null}

          {Object.keys(ledgerByAccount).length > 0 ? (
            <>
              <h2 className="bo-section-title" style={{ marginTop: '1.5rem' }}>
                Ledgers (loaded)
              </h2>
              {Object.entries(ledgerByAccount).map(([aid, rows]) => {
                const acct = accounts.find((a) => a._id === aid)
                return (
                  <div key={aid} className="panel" style={{ marginBottom: '1rem' }}>
                    <h3>{acct?.accountNumber ?? aid}</h3>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>When</th>
                          <th>Kind</th>
                          <th>Amount</th>
                          <th>Detail</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((x) => (
                          <tr key={x._id}>
                            <td>{x.createdAt ? new Date(x.createdAt).toLocaleString() : '—'}</td>
                            <td>{x.kind}</td>
                            <td>{x.amount.toFixed(2)}</td>
                            <td className="muted">
                              {x.kind === 'payment' ? (
                                <>
                                  cash {x.cashAmount?.toFixed(2) ?? '0'} · card {x.cardAmount?.toFixed(2) ?? '0'}
                                  {x.note ? ` · ${x.note}` : ''}
                                </>
                              ) : (
                                <>Sale {x.saleId ? String(x.saleId).slice(-8) : '—'}</>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              })}
            </>
          ) : null}
        </>
      )}
    </BoShell>
  )
}
