import { Fragment, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../api/client'
import type {
  LoyaltyMemberRow,
  LoyaltyProgramConfig,
  LoyaltyPurchaseListResponse,
} from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { hasPermission } from '../auth/permissions'
import { BoShell } from '../layouts/BoShell'
import { maskPhone, normalizePhone } from '../utils/maskPhone'

function formatPaymentMethod(method?: string): string {
  const m = (method ?? '').toLowerCase()
  if (!m) return '—'
  if (m.includes('split')) return 'Split'
  if (m === 'on_account') return 'On account'
  if (m.includes('store')) return 'Store voucher'
  if (m.includes('card')) return 'Card'
  if (m.includes('loyalty')) return 'Loyalty'
  if (m.includes('cash')) return 'Cash'
  return method ?? '—'
}

export function LoyaltyPage() {
  const { session } = useAuth()
  const canAccess = hasPermission(session?.user, 'loyalty.access')
  const canAdmin = hasPermission(session?.user, 'loyalty.admin')
  const [members, setMembers] = useState<LoyaltyMemberRow[]>([])
  const [program, setProgram] = useState<LoyaltyProgramConfig | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [adjustMemberId, setAdjustMemberId] = useState('')
  const [adjustPoints, setAdjustPoints] = useState('')
  const [adjustNote, setAdjustNote] = useState('')
  const [fromPhone, setFromPhone] = useState('')
  const [toPhone, setToPhone] = useState('')
  const [phoneChangeNote, setPhoneChangeNote] = useState('')
  const [historyMember, setHistoryMember] = useState<LoyaltyMemberRow | null>(null)
  const [purchases, setPurchases] = useState<LoyaltyPurchaseListResponse | null>(null)
  const [historyBusy, setHistoryBusy] = useState(false)

  async function load() {
    if (!canAccess) return
    setBusy(true)
    setError(null)
    try {
      const q = normalizePhone(search)
      const qs = q ? `?q=${encodeURIComponent(q)}` : ''
      const [list, prog] = await Promise.all([
        apiFetch<LoyaltyMemberRow[]>(`/loyalty/members${qs}`),
        apiFetch<LoyaltyProgramConfig>('/loyalty/program'),
      ])
      setMembers(list)
      setProgram(prog)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load loyalty')
    } finally {
      setBusy(false)
    }
  }

  async function loadMemberHistory(member: LoyaltyMemberRow) {
    setHistoryMember(member)
    setPurchases(null)
    setHistoryBusy(true)
    setError(null)
    try {
      const result = await apiFetch<LoyaltyPurchaseListResponse>(
        `/loyalty/members/${encodeURIComponent(member._id)}/purchases?limit=100`,
      )
      setPurchases(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load purchase history')
      setHistoryMember(null)
    } finally {
      setHistoryBusy(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccess])

  async function onAdjust(e: FormEvent) {
    e.preventDefault()
    if (!canAdmin || !adjustMemberId) return
    const points = Number.parseInt(adjustPoints, 10)
    if (!Number.isFinite(points) || points === 0) {
      setError('Enter a non-zero points adjustment')
      return
    }
    setError(null)
    try {
      await apiFetch(`/loyalty/members/${adjustMemberId}/adjust`, {
        method: 'POST',
        body: JSON.stringify({ memberId: adjustMemberId, points, note: adjustNote || undefined }),
      })
      setAdjustPoints('')
      setAdjustNote('')
      await load()
      if (historyMember?._id === adjustMemberId) {
        await loadMemberHistory(historyMember)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Adjust failed')
    }
  }

  async function onChangePhone(e: FormEvent) {
    e.preventDefault()
    if (!canAdmin) return
    setError(null)
    try {
      await apiFetch('/loyalty/change-phone', {
        method: 'POST',
        body: JSON.stringify({
          fromPhone: normalizePhone(fromPhone),
          toPhone: normalizePhone(toPhone),
          note: phoneChangeNote || undefined,
        }),
      })
      setFromPhone('')
      setToPhone('')
      setPhoneChangeNote('')
      setHistoryMember(null)
      setPurchases(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Phone change failed')
    }
  }

  return (
    <BoShell>
      <h1>Loyalty</h1>
      <p className="muted">
        Phone-based loyalty members. Configure earn/redeem rules in{' '}
        <Link to="/store-settings">Store settings</Link>. View purchase history per member below.
      </p>

      {!canAccess && <p className="error">Permission required: loyalty.access</p>}
      {canAccess && (
        <>
          <div className="panel audit-toolbar">
            <span className="muted">
              Program:{' '}
              <strong>{program?.enabled ? 'Enabled' : 'Disabled'}</strong>
              {program?.enabled
                ? ` · ${program.pointsPerRand} pt/R · R${program.redeemValuePerPoint}/pt · min redeem ${program.minRedeemPoints}`
                : null}
            </span>
            <button type="button" className="btn primary" disabled={busy} onClick={() => void load()}>
              {busy ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
          {error && <p className="error">{error}</p>}

          <section className="panel">
            <h2>Members</h2>
            <form
              className="inline-password"
              onSubmit={(e) => {
                e.preventDefault()
                void load()
              }}
            >
              <input
                type="search"
                placeholder="Search phone digits"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button type="submit" className="btn small">
                Search
              </button>
            </form>
            <table className="table">
              <thead>
                <tr>
                  <th>Phone</th>
                  <th>Points</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <Fragment key={m._id}>
                    <tr className={historyMember?._id === m._id ? 'loyalty-member-row--selected' : undefined}>
                      <td>{m.phoneMasked}</td>
                      <td>{m.pointsBalance.toLocaleString()}</td>
                      <td>{m.status}</td>
                      <td>{m.updatedAt ? new Date(m.updatedAt).toLocaleString() : '—'}</td>
                      <td>
                        <button
                          type="button"
                          className="btn ghost small"
                          disabled={historyBusy && historyMember?._id === m._id}
                          onClick={() => {
                            if (historyMember?._id === m._id) {
                              setHistoryMember(null)
                              setPurchases(null)
                            } else {
                              void loadMemberHistory(m)
                            }
                          }}
                        >
                          {historyMember?._id === m._id
                            ? historyBusy
                              ? 'Loading…'
                              : 'Hide history'
                            : 'Purchase history'}
                        </button>
                      </td>
                    </tr>
                    {historyMember?._id === m._id ? (
                      <tr className="loyalty-history-row">
                        <td colSpan={5}>
                          <div className="loyalty-purchase-history">
                            <h3 className="loyalty-purchase-history-title">
                              Purchase history — {m.phoneMasked}
                              {purchases ? (
                                <span className="muted">
                                  {' '}
                                  ({purchases.total.toLocaleString()} sale
                                  {purchases.total === 1 ? '' : 's'})
                                </span>
                              ) : null}
                            </h3>
                            {historyBusy && !purchases ? (
                              <p className="muted">Loading purchases…</p>
                            ) : purchases && purchases.purchases.length > 0 ? (
                              <table className="table loyalty-purchase-table">
                                <thead>
                                  <tr>
                                    <th>Date</th>
                                    <th>Sale id</th>
                                    <th>Till</th>
                                    <th>Items</th>
                                    <th>Total</th>
                                    <th>Loyalty</th>
                                    <th>Payment</th>
                                    <th>Status</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {purchases.purchases.map((p) => (
                                    <tr key={p._id}>
                                      <td>
                                        {p.createdAt ? new Date(p.createdAt).toLocaleString() : '—'}
                                      </td>
                                      <td>
                                        <code>{p.saleId ?? p._id.slice(-8)}</code>
                                      </td>
                                      <td>{p.tillCode ?? '—'}</td>
                                      <td>{p.itemCount}</td>
                                      <td>R {p.total.toFixed(2)}</td>
                                      <td className="loyalty-purchase-loyalty-cell">
                                        {(p.loyaltyPointsRedeemed ?? 0) > 0 ? (
                                          <span>−{p.loyaltyPointsRedeemed?.toLocaleString()} pts</span>
                                        ) : null}
                                        {(p.loyaltyPointsEarned ?? 0) > 0 ? (
                                          <span>
                                            {(p.loyaltyPointsRedeemed ?? 0) > 0 ? ' · ' : ''}+
                                            {p.loyaltyPointsEarned?.toLocaleString()} pts
                                          </span>
                                        ) : null}
                                        {(p.loyaltyDiscountAmount ?? 0) > 0.005 ? (
                                          <span className="muted">
                                            {' '}
                                            (−R {p.loyaltyDiscountAmount?.toFixed(2)})
                                          </span>
                                        ) : null}
                                        {(p.loyaltyPointsRedeemed ?? 0) <= 0 &&
                                        (p.loyaltyPointsEarned ?? 0) <= 0 ? (
                                          <span className="muted">Linked</span>
                                        ) : null}
                                      </td>
                                      <td>{formatPaymentMethod(p.paymentMethod)}</td>
                                      <td>
                                        {p.refundStatus === 'refunded' ? (
                                          <span className="muted">Refunded</span>
                                        ) : p.refundStatus === 'partial' ? (
                                          <span className="muted">Partial refund</span>
                                        ) : (
                                          '—'
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : (
                              <p className="muted">No linked sales yet for this member.</p>
                            )}
                            <p className="muted small-print">
                              See full receipt detail in{' '}
                              <Link to="/sales">Sales &amp; receipts</Link> (search by sale id).
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
            {members.length === 0 ? <p className="muted">No members yet.</p> : null}
          </section>

          {canAdmin ? (
            <>
              <section className="panel">
                <h2>Adjust points</h2>
                <form className="user-create-form" onSubmit={(e) => void onAdjust(e)}>
                  <div className="user-fields-grid">
                    <label className="user-field user-field--half">
                      Member id
                      <input
                        value={adjustMemberId}
                        onChange={(e) => setAdjustMemberId(e.target.value)}
                        placeholder="Paste _id from table or purchase history"
                        required
                      />
                    </label>
                    <label className="user-field user-field--half">
                      Points (+ / −)
                      <input
                        type="number"
                        value={adjustPoints}
                        onChange={(e) => setAdjustPoints(e.target.value)}
                        required
                      />
                    </label>
                    <label className="user-field user-field--full">
                      Note
                      <input value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} />
                    </label>
                    <div className="user-field user-field--full user-create-actions">
                      <button type="submit" className="btn primary">
                        Apply adjustment
                      </button>
                    </div>
                  </div>
                </form>
              </section>

              <section className="panel">
                <h2>Change member phone (admin)</h2>
                <p className="muted">Full numbers required — not shown in lists. Moves the account to a new phone.</p>
                <form className="user-create-form" onSubmit={(e) => void onChangePhone(e)}>
                  <div className="user-fields-grid">
                    <label className="user-field user-field--half">
                      Current phone
                      <input
                        type="tel"
                        value={fromPhone}
                        onChange={(e) => setFromPhone(e.target.value)}
                        autoComplete="off"
                        required
                      />
                    </label>
                    <label className="user-field user-field--half">
                      New phone
                      <input
                        type="tel"
                        value={toPhone}
                        onChange={(e) => setToPhone(e.target.value)}
                        autoComplete="off"
                        required
                      />
                    </label>
                    <label className="user-field user-field--full">
                      Note
                      <input value={phoneChangeNote} onChange={(e) => setPhoneChangeNote(e.target.value)} />
                    </label>
                    <div className="user-field user-field--full user-create-actions">
                      <button type="submit" className="btn primary">
                        Change phone
                      </button>
                    </div>
                  </div>
                </form>
                {(fromPhone || toPhone) && (
                  <p className="muted">
                    Preview masked: {fromPhone ? maskPhone(fromPhone) : '—'} → {toPhone ? maskPhone(toPhone) : '—'}
                  </p>
                )}
              </section>
            </>
          ) : null}
        </>
      )}
    </BoShell>
  )
}
