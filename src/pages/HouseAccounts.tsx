import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { apiFetch } from '../api/client'
import type { HouseAccountLedgerRow, HouseAccountRow } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { hasPermission } from '../auth/permissions'
import {
  HOUSE_ACCOUNT_PAYMENT_TERM_OPTIONS,
  paymentTermsLabel,
  type HouseAccountPaymentTerms,
} from '../houseAccounts/paymentTerms'
import { BoShell } from '../layouts/BoShell'

function round2(n: number) {
  return Math.round(n * 100) / 100
}

type AccountFormState = {
  name: string
  phone: string
  contactPerson: string
  email: string
  vatNumber: string
  companyRegistrationNumber: string
  addressText: string
  paymentTerms: HouseAccountPaymentTerms
  notes: string
  creditLimit: string
}

function emptyAccountForm(): AccountFormState {
  return {
    name: '',
    phone: '',
    contactPerson: '',
    email: '',
    vatNumber: '',
    companyRegistrationNumber: '',
    addressText: '',
    paymentTerms: '',
    notes: '',
    creditLimit: '',
  }
}

function accountToForm(row: HouseAccountRow): AccountFormState {
  return {
    name: row.name,
    phone: row.phone ?? '',
    contactPerson: row.contactPerson ?? '',
    email: row.email ?? '',
    vatNumber: row.vatNumber ?? '',
    companyRegistrationNumber: row.companyRegistrationNumber ?? '',
    addressText: (row.addressLines ?? []).join('\n'),
    paymentTerms: (row.paymentTerms as HouseAccountPaymentTerms) ?? '',
    notes: row.notes ?? '',
    creditLimit: row.creditLimit != null ? String(row.creditLimit) : '',
  }
}

function parseCreditLimit(raw: string): { ok: true; value: number | null } | { ok: false; message: string } {
  const limRaw = raw.trim()
  if (!limRaw) return { ok: true, value: null }
  const n = Number(limRaw.replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, message: 'Credit limit must be a number ≥ 0' }
  }
  return { ok: true, value: round2(n) }
}

function formToPayload(form: AccountFormState) {
  const limit = parseCreditLimit(form.creditLimit)
  if (!limit.ok) return { ok: false as const, message: limit.message }
  const name = form.name.trim()
  if (!name) return { ok: false as const, message: 'Name is required' }
  return {
    ok: true as const,
    body: {
      name,
      phone: form.phone.trim(),
      contactPerson: form.contactPerson.trim(),
      email: form.email.trim(),
      vatNumber: form.vatNumber.trim(),
      companyRegistrationNumber: form.companyRegistrationNumber.trim(),
      addressLines: form.addressText.split('\n').map((s) => s.trim()).filter(Boolean),
      paymentTerms: form.paymentTerms,
      notes: form.notes.trim(),
      creditLimit: limit.value,
    },
  }
}

function AccountFieldsGrid({
  form,
  setForm,
  idPrefix,
}: {
  form: AccountFormState
  setForm: React.Dispatch<React.SetStateAction<AccountFormState>>
  idPrefix: string
}) {
  return (
    <div className="sales-fields-grid">
      <label className="sales-field sales-field--wide">
        Account / business name
        <input
          id={`${idPrefix}-name`}
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          placeholder="Customer or company"
          required
        />
      </label>
      <label className="sales-field sales-field--half">
        Contact person
        <input
          id={`${idPrefix}-contact`}
          value={form.contactPerson}
          onChange={(e) => setForm((p) => ({ ...p, contactPerson: e.target.value }))}
          placeholder="Optional"
          autoComplete="name"
        />
      </label>
      <label className="sales-field sales-field--half">
        Phone
        <input
          id={`${idPrefix}-phone`}
          value={form.phone}
          onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
          autoComplete="tel"
        />
      </label>
      <label className="sales-field sales-field--half">
        Email
        <input
          type="email"
          id={`${idPrefix}-email`}
          value={form.email}
          onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
          autoComplete="email"
        />
      </label>
      <label className="sales-field sales-field--half">
        VAT registration number
        <input
          id={`${idPrefix}-vat`}
          value={form.vatNumber}
          onChange={(e) => setForm((p) => ({ ...p, vatNumber: e.target.value }))}
          placeholder="Optional"
        />
      </label>
      <label className="sales-field sales-field--half">
        Company registration number
        <input
          id={`${idPrefix}-company-reg`}
          value={form.companyRegistrationNumber}
          onChange={(e) => setForm((p) => ({ ...p, companyRegistrationNumber: e.target.value }))}
          placeholder="Optional"
        />
      </label>
      <label className="sales-field sales-field--half">
        Payment terms
        <select
          id={`${idPrefix}-terms`}
          value={form.paymentTerms}
          onChange={(e) =>
            setForm((p) => ({ ...p, paymentTerms: e.target.value as HouseAccountPaymentTerms }))
          }
        >
          {HOUSE_ACCOUNT_PAYMENT_TERM_OPTIONS.map((o) => (
            <option key={o.value || 'unset'} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="sales-field sales-field--quarter">
        Credit limit
        <input
          id={`${idPrefix}-limit`}
          value={form.creditLimit}
          onChange={(e) => setForm((p) => ({ ...p, creditLimit: e.target.value }))}
          placeholder="Blank = none"
        />
      </label>
      <label className="sales-field sales-field--full">
        Billing / delivery address
        <textarea
          id={`${idPrefix}-address`}
          rows={2}
          value={form.addressText}
          onChange={(e) => setForm((p) => ({ ...p, addressText: e.target.value }))}
          placeholder="One line per row (optional)"
        />
      </label>
      <label className="sales-field sales-field--full">
        Internal notes
        <textarea
          id={`${idPrefix}-notes`}
          rows={2}
          value={form.notes}
          onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
          placeholder="Staff only — e.g. payment habits, who may charge"
        />
      </label>
    </div>
  )
}

function DetailCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="house-account-detail-cell">
      <span className="muted house-account-detail-label">{label}</span>
      <span>{children}</span>
    </div>
  )
}

export function HouseAccountsPage() {
  const { session } = useAuth()
  const isAdmin = hasPermission(session?.user, 'house_accounts.access')
  const [accounts, setAccounts] = useState<HouseAccountRow[]>([])
  const [ledgerByAccount, setLedgerByAccount] = useState<Record<string, HouseAccountLedgerRow[]>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createForm, setCreateForm] = useState<AccountFormState>(emptyAccountForm)
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<AccountFormState>(emptyAccountForm)
  const [payId, setPayId] = useState<string | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payCash, setPayCash] = useState('')
  const [payCard, setPayCard] = useState('')
  const [payNote, setPayNote] = useState('')

  const totalOwed = useMemo(() => accounts.reduce((s, a) => s + (a.balance ?? 0), 0), [accounts])
  const editingAccount = editId ? accounts.find((a) => a._id === editId) : null

  async function loadAccounts() {
    if (!isAdmin) return
    setBusy(true)
    setError(null)
    try {
      const list = await apiFetch<HouseAccountRow[]>('/house-accounts?limit=500&includeClosed=1')
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

  async function createAccount(e: FormEvent) {
    e.preventDefault()
    if (!isAdmin) return
    const payload = formToPayload(createForm)
    if (!payload.ok) {
      setError(payload.message)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await apiFetch<HouseAccountRow>('/house-accounts', {
        method: 'POST',
        body: JSON.stringify(payload.body),
      })
      setCreateForm(emptyAccountForm())
      await loadAccounts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed')
    } finally {
      setBusy(false)
    }
  }

  function startEdit(row: HouseAccountRow) {
    setEditId(row._id)
    setEditForm(accountToForm(row))
    setPayId(null)
    setError(null)
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault()
    if (!editId || !isAdmin) return
    const payload = formToPayload(editForm)
    if (!payload.ok) {
      setError(payload.message)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await apiFetch<HouseAccountRow>(`/house-accounts/${editId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload.body),
      })
      setEditId(null)
      await loadAccounts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  async function submitPayment(e: FormEvent) {
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
      if (editId === id) setEditId(null)
      await loadAccounts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  async function reopenAccount(id: string) {
    setBusy(true)
    setError(null)
    try {
      await apiFetch(`/house-accounts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'active' }),
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
      <p className="muted">
        On-account customers: balances owed to the store. Cashiers charge sales on the POS; record payments here or at
        the till.
      </p>
      {!isAdmin && <p className="error">Permission required: house accounts.</p>}
      {isAdmin && (
        <>
          <div className="panel audit-toolbar">
            <span className="muted">
              Total AR (active balances): <strong>{totalOwed.toFixed(2)}</strong>
            </span>
            <button type="button" className="btn ghost" disabled={busy} onClick={() => void loadAccounts()}>
              {busy ? 'Loading…' : 'Refresh'}
            </button>
          </div>
          {error && <p className="error">{error}</p>}

          <section className="panel sales-filters-panel">
            <h2 className="sales-filters-title">New account</h2>
            <p className="muted label-settings-section-lead">
              Only the account name is required. Other fields help staff at the till and on statements.
            </p>
            <form className="house-account-form" onSubmit={(e) => void createAccount(e)}>
              <AccountFieldsGrid form={createForm} setForm={setCreateForm} idPrefix="create" />
              <div className="sales-field sales-field--full sales-filter-actions">
                <button type="submit" className="btn primary" disabled={busy}>
                  Create account
                </button>
              </div>
            </form>
          </section>

          {editId && editingAccount ? (
            <section className="panel sales-filters-panel">
              <h2 className="sales-filters-title">
                Edit {editingAccount.accountNumber}
              </h2>
              <form className="house-account-form" onSubmit={(e) => void saveEdit(e)}>
                <AccountFieldsGrid form={editForm} setForm={setEditForm} idPrefix="edit" />
                <div className="sales-field sales-field--full sales-filter-actions">
                  <button type="submit" className="btn primary" disabled={busy}>
                    Save changes
                  </button>
                  <button type="button" className="btn ghost" onClick={() => setEditId(null)}>
                    Cancel
                  </button>
                </div>
              </form>
            </section>
          ) : null}

          <h2 className="bo-section-title">Accounts</h2>
          <div className="panel">
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Name</th>
                    <th>Contact</th>
                    <th>Phone</th>
                    <th>Terms</th>
                    <th>Owed</th>
                    <th>Limit</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((r) => (
                    <tr key={r._id} className={r.status === 'closed' ? 'muted' : undefined}>
                      <td>{r.accountNumber}</td>
                      <td>
                        {r.name}
                        {r.vatNumber ? (
                          <span className="muted" style={{ display: 'block', fontSize: '0.8rem' }}>
                            VAT {r.vatNumber}
                          </span>
                        ) : null}
                        {r.companyRegistrationNumber ? (
                          <span className="muted" style={{ display: 'block', fontSize: '0.8rem' }}>
                            Reg {r.companyRegistrationNumber}
                          </span>
                        ) : null}
                      </td>
                      <td>
                        {r.contactPerson || '—'}
                        {r.email ? (
                          <span className="muted" style={{ display: 'block', fontSize: '0.8rem' }}>
                            {r.email}
                          </span>
                        ) : null}
                      </td>
                      <td>{r.phone || '—'}</td>
                      <td>{paymentTermsLabel(r.paymentTerms)}</td>
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
                        <button type="button" className="btn ghost small" onClick={() => startEdit(r)} disabled={busy}>
                          Edit
                        </button>{' '}
                        {r.status === 'active' && r.balance > 0.01 ? (
                          <button type="button" className="btn small" onClick={() => setPayId(r._id)} disabled={busy}>
                            Pay
                          </button>
                        ) : null}{' '}
                        {r.status === 'active' ? (
                          <button
                            type="button"
                            className="btn ghost small"
                            onClick={() => void closeAccount(r._id)}
                            disabled={busy}
                          >
                            Close
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn ghost small"
                            onClick={() => void reopenAccount(r._id)}
                            disabled={busy}
                          >
                            Reopen
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {accounts.length === 0 && !busy && <p className="muted">No house accounts yet.</p>}
          </div>

          {payId ? (
            <section className="panel sales-filters-panel" style={{ marginTop: '1rem' }}>
              <h2 className="sales-filters-title">Record payment</h2>
              <form onSubmit={(e) => void submitPayment(e)}>
                <div className="sales-fields-grid">
                  <label className="sales-field sales-field--quarter">
                    Total
                    <input value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
                  </label>
                  <label className="sales-field sales-field--quarter">
                    Cash
                    <input value={payCash} onChange={(e) => setPayCash(e.target.value)} />
                  </label>
                  <label className="sales-field sales-field--quarter">
                    Card
                    <input value={payCard} onChange={(e) => setPayCard(e.target.value)} />
                  </label>
                  <label className="sales-field sales-field--quarter">
                    Note
                    <input value={payNote} onChange={(e) => setPayNote(e.target.value)} />
                  </label>
                  <div className="sales-field sales-field--full sales-filter-actions">
                    <button type="submit" className="btn primary" disabled={busy}>
                      Apply payment
                    </button>
                    <button type="button" className="btn ghost" onClick={() => setPayId(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              </form>
            </section>
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
                    {acct ? (
                      <div className="house-account-detail-grid">
                        <DetailCell label="Name">{acct.name}</DetailCell>
                        <DetailCell label="Contact">{acct.contactPerson || '—'}</DetailCell>
                        <DetailCell label="Phone">{acct.phone || '—'}</DetailCell>
                        <DetailCell label="Email">{acct.email || '—'}</DetailCell>
                        <DetailCell label="VAT">{acct.vatNumber || '—'}</DetailCell>
                        <DetailCell label="Company reg.">{acct.companyRegistrationNumber || '—'}</DetailCell>
                        <DetailCell label="Terms">{paymentTermsLabel(acct.paymentTerms)}</DetailCell>
                        <DetailCell label="Address">
                          {(acct.addressLines ?? []).length > 0 ? (
                            <span style={{ whiteSpace: 'pre-line' }}>{(acct.addressLines ?? []).join('\n')}</span>
                          ) : (
                            '—'
                          )}
                        </DetailCell>
                        {acct.notes ? (
                          <DetailCell label="Notes">
                            <span style={{ whiteSpace: 'pre-wrap' }}>{acct.notes}</span>
                          </DetailCell>
                        ) : null}
                      </div>
                    ) : null}
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
