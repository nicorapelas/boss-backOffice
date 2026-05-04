import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { apiFetch } from '../api/client'
import type { Product, Supplier, SupplierOffer, SupplierOfferSupplierRef } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { hasPermission } from '../auth/permissions'
import { BoShell } from '../layouts/BoShell'

function offerProductRef(o: SupplierOffer): { id: string; name: string; sku: string } {
  const p = o.product
  if (typeof p === 'object' && p !== null && '_id' in p) {
    const x = p as SupplierOffer['product'] & { _id: string; name: string; sku: string }
    return { id: String(x._id), name: x.name, sku: x.sku }
  }
  return { id: String(p), name: '—', sku: '—' }
}

function offerSupplierRef(o: SupplierOffer): { id: string; name: string; code: string } | null {
  const s = o.supplier
  if (typeof s === 'object' && s !== null && '_id' in s) {
    const x = s as SupplierOfferSupplierRef
    return { id: String(x._id), name: x.name, code: x.code }
  }
  return null
}

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString()
}

export function SuppliersPage() {
  const { session } = useAuth()
  const canRead = hasPermission(session?.user, 'suppliers.read')
  const canWrite = hasPermission(session?.user, 'suppliers.write')
  const canCatalog = hasPermission(session?.user, 'catalog.read')

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [offers, setOffers] = useState<SupplierOffer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [compareProductId, setCompareProductId] = useState('')
  const [compareRows, setCompareRows] = useState<SupplierOffer[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [createName, setCreateName] = useState('')
  const [createCode, setCreateCode] = useState('')

  const selected = useMemo(
    () => (selectedId ? suppliers.find((s) => s._id === selectedId) ?? null : null),
    [selectedId, suppliers],
  )

  const [editName, setEditName] = useState('')
  const [editCode, setEditCode] = useState('')
  const [editActive, setEditActive] = useState(true)
  const [editContactName, setEditContactName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editAccountNumber, setEditAccountNumber] = useState('')
  const [editNotes, setEditNotes] = useState('')

  const [offerModal, setOfferModal] = useState<'add' | 'edit' | null>(null)
  const [editingOffer, setEditingOffer] = useState<SupplierOffer | null>(null)
  const [offerProductId, setOfferProductId] = useState('')
  const [offerSupplierSku, setOfferSupplierSku] = useState('')
  const [offerUnitCost, setOfferUnitCost] = useState('')
  const [offerUnitsPerPack, setOfferUnitsPerPack] = useState('1')
  const [offerMinOrder, setOfferMinOrder] = useState('1')
  const [offerLeadDays, setOfferLeadDays] = useState('')
  const [offerPreferred, setOfferPreferred] = useState(false)
  const [offerEffective, setOfferEffective] = useState('')

  const loadSuppliers = useCallback(async () => {
    if (!canRead) return
    setBusy(true)
    setError(null)
    try {
      const list = await apiFetch<Supplier[]>('/suppliers')
      setSuppliers(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load suppliers')
    } finally {
      setBusy(false)
    }
  }, [canRead])

  const loadOffers = useCallback(
    async (supplierId: string) => {
      if (!canRead) return
      try {
        const list = await apiFetch<SupplierOffer[]>(`/suppliers/${supplierId}/offers`)
        setOffers(list)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load offers')
        setOffers([])
      }
    },
    [canRead],
  )

  const loadProducts = useCallback(async () => {
    if (!canCatalog) return
    try {
      const list = await apiFetch<Product[]>('/products')
      setProducts(list)
    } catch {
      setProducts([])
    }
  }, [canCatalog])

  useEffect(() => {
    void loadSuppliers()
  }, [loadSuppliers])

  useEffect(() => {
    void loadProducts()
  }, [loadProducts])

  useEffect(() => {
    if (selected) {
      setEditName(selected.name)
      setEditCode(selected.code)
      setEditActive(selected.active !== false)
      setEditContactName(selected.contactName ?? '')
      setEditEmail(selected.email ?? '')
      setEditPhone(selected.phone ?? '')
      setEditAccountNumber(selected.accountNumber ?? '')
      setEditNotes(selected.notes ?? '')
      void loadOffers(selected._id)
    } else {
      setOffers([])
      setEditName('')
      setEditCode('')
      setEditActive(true)
      setEditContactName('')
      setEditEmail('')
      setEditPhone('')
      setEditAccountNumber('')
      setEditNotes('')
    }
  }, [selected, loadOffers])

  async function loadCompare(productId: string) {
    if (!productId.trim()) {
      setCompareRows([])
      return
    }
    setError(null)
    try {
      const q = new URLSearchParams({ productId: productId.trim() })
      const list = await apiFetch<SupplierOffer[]>(`/suppliers/offers/by-product?${q}`)
      setCompareRows(list)
    } catch (e) {
      setCompareRows([])
      setError(e instanceof Error ? e.message : 'Failed to compare offers')
    }
  }

  useEffect(() => {
    if (!compareProductId.trim()) {
      setCompareRows([])
      return
    }
    const t = window.setTimeout(() => void loadCompare(compareProductId), 300)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareProductId])

  async function onCreateSupplier(e: FormEvent) {
    e.preventDefault()
    if (!canWrite) return
    const name = createName.trim()
    const code = createCode.trim()
    if (!name || !code) {
      setError('Name and code are required')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const row = await apiFetch<Supplier>('/suppliers', {
        method: 'POST',
        body: JSON.stringify({ name, code }),
      })
      setCreateName('')
      setCreateCode('')
      await loadSuppliers()
      setSelectedId(row._id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed')
    } finally {
      setBusy(false)
    }
  }

  async function onSaveSupplier(e: FormEvent) {
    e.preventDefault()
    if (!canWrite || !selected) return
    setBusy(true)
    setError(null)
    try {
      await apiFetch(`/suppliers/${selected._id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editName.trim(),
          code: editCode.trim(),
          active: editActive,
          contactName: editContactName.trim() || null,
          email: editEmail.trim() || null,
          phone: editPhone.trim() || null,
          accountNumber: editAccountNumber.trim() || null,
          notes: editNotes.trim() || null,
        }),
      })
      await loadSuppliers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function onDeleteSupplier() {
    if (!canWrite || !selected) return
    if (!window.confirm(`Delete supplier "${selected.name}"? This is only allowed when there are no catalog offers.`)) return
    setBusy(true)
    setError(null)
    try {
      await apiFetch(`/suppliers/${selected._id}`, { method: 'DELETE' })
      setSelectedId(null)
      await loadSuppliers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  function openAddOffer() {
    if (!selected || !canWrite) return
    setEditingOffer(null)
    setOfferProductId('')
    setOfferSupplierSku('')
    setOfferUnitCost('')
    setOfferUnitsPerPack('1')
    setOfferMinOrder('1')
    setOfferLeadDays('')
    setOfferPreferred(false)
    setOfferEffective('')
    setOfferModal('add')
  }

  function openEditOffer(o: SupplierOffer) {
    const pr = offerProductRef(o)
    setEditingOffer(o)
    setOfferProductId(pr.id)
    setOfferSupplierSku(o.supplierSku ?? '')
    setOfferUnitCost(String(o.unitCost))
    setOfferUnitsPerPack(String(o.unitsPerPack))
    setOfferMinOrder(String(o.minOrderQty))
    setOfferLeadDays(o.leadTimeDays != null ? String(o.leadTimeDays) : '')
    setOfferPreferred(o.preferred)
    setOfferEffective(
      o.priceEffectiveDate ? o.priceEffectiveDate.slice(0, 10) : '',
    )
    setOfferModal('edit')
  }

  function closeOfferModal() {
    setOfferModal(null)
    setEditingOffer(null)
  }

  async function submitOffer(e: FormEvent) {
    e.preventDefault()
    if (!canWrite || !selected) return
    const unitCost = Number(offerUnitCost.replace(',', '.'))
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      setError('Unit cost must be a number ≥ 0')
      return
    }
    const unitsPerPack = Math.max(1, Math.floor(Number(offerUnitsPerPack) || 1))
    const minOrderQty = Math.max(1, Math.floor(Number(offerMinOrder) || 1))
    const leadRaw = offerLeadDays.trim()
    const leadTimeDays =
      leadRaw === ''
        ? null
        : (() => {
            const n = Number(leadRaw)
            return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null
          })()
    const priceEffectiveDate = offerEffective.trim() ? offerEffective.trim() : null

    setBusy(true)
    setError(null)
    try {
      if (offerModal === 'add') {
        const pid = offerProductId.trim()
        if (!pid) {
          setError('Choose a product')
          setBusy(false)
          return
        }
        await apiFetch(`/suppliers/${selected._id}/offers`, {
          method: 'POST',
          body: JSON.stringify({
            productId: pid,
            supplierSku: offerSupplierSku.trim() || null,
            unitCost,
            unitsPerPack,
            minOrderQty,
            leadTimeDays,
            preferred: offerPreferred,
            priceEffectiveDate,
          }),
        })
      } else if (offerModal === 'edit' && editingOffer) {
        const leadPatch =
          offerLeadDays.trim() === ''
            ? null
            : (() => {
                const n = Number(offerLeadDays)
                return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null
              })()
        await apiFetch(`/supplier-offers/${editingOffer._id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            supplierSku: offerSupplierSku.trim() || null,
            unitCost,
            unitsPerPack,
            minOrderQty,
            leadTimeDays: leadPatch,
            preferred: offerPreferred,
            priceEffectiveDate,
          }),
        })
      }
      closeOfferModal()
      await loadOffers(selected._id)
      await loadCompare(compareProductId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save offer failed')
    } finally {
      setBusy(false)
    }
  }

  async function deleteOffer(o: SupplierOffer) {
    if (!canWrite || !selected) return
    const pr = offerProductRef(o)
    if (!window.confirm(`Remove vendor offer for ${pr.name} (${pr.sku})?`)) return
    setBusy(true)
    setError(null)
    try {
      await apiFetch(`/supplier-offers/${o._id}`, { method: 'DELETE' })
      await loadOffers(selected._id)
      await loadCompare(compareProductId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  const productsSorted = useMemo(
    () =>
      [...products].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
      ),
    [products],
  )

  return (
    <BoShell>
      <h1>Suppliers</h1>
      <p className="muted">
        Vendor records for reordering and unit-cost comparison. Offers store cost per <strong>stock unit</strong> (same
        unit as catalog inventory).
      </p>

      {!canRead && <p className="error">Permission required: view suppliers.</p>}

      {canRead && (
        <>
          <div className="panel audit-toolbar">
            <button type="button" className="btn ghost" disabled={busy} onClick={() => void loadSuppliers()}>
              {busy ? 'Loading…' : 'Refresh'}
            </button>
          </div>
          {error && <p className="error">{error}</p>}

          {canWrite && (
            <form className="panel product-form" onSubmit={(e) => void onCreateSupplier(e)} style={{ marginBottom: '1rem' }}>
              <h2>New supplier</h2>
              <div className="inline-form">
                <label>
                  Name
                  <input value={createName} onChange={(e) => setCreateName(e.target.value)} required />
                </label>
                <label>
                  Code
                  <input
                    value={createCode}
                    onChange={(e) => setCreateCode(e.target.value)}
                    placeholder="e.g. ACME"
                    required
                  />
                </label>
              </div>
              <div className="form-actions">
                <button type="submit" className="btn primary" disabled={busy}>
                  Add supplier
                </button>
              </div>
            </form>
          )}

          <div className="panel" style={{ marginBottom: '1rem' }}>
            <h2>Compare offers by product</h2>
            <p className="muted help-note">
              See every supplier&apos;s unit cost for one SKU — sorted cheapest first.
            </p>
            {!canCatalog ? (
              <p className="muted">Catalog access required to pick a product.</p>
            ) : (
              <label>
                Product
                <select
                  value={compareProductId}
                  onChange={(e) => setCompareProductId(e.target.value)}
                  style={{ maxWidth: '100%', width: 'min(36rem, 100%)' }}
                >
                  <option value="">Choose…</option>
                  {productsSorted.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name} · {p.sku}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {compareRows.length > 0 ? (
              <table className="table products-table" style={{ marginTop: '1rem' }}>
                <thead>
                  <tr>
                    <th>Supplier</th>
                    <th>Code</th>
                    <th>Unit cost</th>
                    <th>Preferred</th>
                    <th>Lead (days)</th>
                    <th>Effective</th>
                  </tr>
                </thead>
                <tbody>
                  {compareRows.map((r) => {
                    const sr = offerSupplierRef(r)
                    return (
                      <tr key={r._id}>
                        <td>{sr?.name ?? '—'}</td>
                        <td>{sr?.code ?? '—'}</td>
                        <td>{r.unitCost.toFixed(2)}</td>
                        <td>{r.preferred ? 'Yes' : '—'}</td>
                        <td>{r.leadTimeDays ?? '—'}</td>
                        <td>{formatShortDate(r.priceEffectiveDate)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : compareProductId.trim() ? (
              <p className="muted" style={{ marginTop: '0.75rem' }}>
                No vendor offers for this product yet.
              </p>
            ) : null}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(14rem, 22%) 1fr', gap: '1rem' }}>
            <div className="panel">
              <h2>All suppliers</h2>
              <ul className="suppliers-side-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {suppliers.map((s) => (
                  <li key={s._id} style={{ marginBottom: '0.35rem' }}>
                    <button
                      type="button"
                      className={selectedId === s._id ? 'btn primary small' : 'btn ghost small'}
                      style={{ width: '100%', textAlign: 'left', justifyContent: 'flex-start' }}
                      onClick={() => setSelectedId(s._id)}
                    >
                      <span style={{ opacity: s.active ? 1 : 0.55 }}>
                        {s.name}{' '}
                        <span className="muted" style={{ fontWeight: 400 }}>
                          ({s.code})
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {suppliers.length === 0 && <p className="muted">No suppliers yet.</p>}
            </div>

            <div className="panel">
              {!selected ? (
                <p className="muted">Select a supplier to edit details and manage catalog offers.</p>
              ) : (
                <>
                  {canWrite ? (
                    <form onSubmit={(e) => void onSaveSupplier(e)}>
                      <h2>{selected.name}</h2>
                      <div className="inline-form">
                        <label>
                          Name
                          <input value={editName} onChange={(e) => setEditName(e.target.value)} required />
                        </label>
                        <label>
                          Code
                          <input value={editCode} onChange={(e) => setEditCode(e.target.value)} required />
                        </label>
                        <label className="checkbox-row">
                          <input type="checkbox" checked={editActive} onChange={(e) => setEditActive(e.target.checked)} />
                          <span>Active</span>
                        </label>
                      </div>
                      <div className="inline-form">
                        <label>
                          Contact name
                          <input value={editContactName} onChange={(e) => setEditContactName(e.target.value)} />
                        </label>
                        <label>
                          Email
                          <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
                        </label>
                        <label>
                          Phone
                          <input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
                        </label>
                        <label>
                          Your account #
                          <input value={editAccountNumber} onChange={(e) => setEditAccountNumber(e.target.value)} />
                        </label>
                      </div>
                      <label>
                        Notes (terms, min order, how to order…)
                        <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={3} />
                      </label>
                      <div className="form-actions">
                        <button type="submit" className="btn primary" disabled={busy}>
                          Save supplier
                        </button>
                        <button type="button" className="btn ghost" disabled={busy} onClick={() => void onDeleteSupplier()}>
                          Delete supplier
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <h2>{selected.name}</h2>
                      <p className="muted">
                        {selected.code} · {selected.active ? 'Active' : 'Inactive'}
                      </p>
                    </>
                  )}

                  <h3 style={{ marginTop: '1.5rem' }}>Catalog offers</h3>
                  <p className="muted help-note">
                    Unit cost is per inventory unit. Only one offer per product per supplier. Mark one supplier per
                    product as preferred when reordering.
                  </p>
                  {canWrite && (
                    <div className="form-actions" style={{ marginBottom: '0.75rem' }}>
                      <button type="button" className="btn small" disabled={!canCatalog || busy} onClick={openAddOffer}>
                        Add offer
                      </button>
                    </div>
                  )}
                  {!canCatalog && canWrite && (
                    <p className="muted">Catalog permission required to attach products.</p>
                  )}
                  <table className="table products-table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>SKU</th>
                        <th>Supplier SKU</th>
                        <th>Unit cost</th>
                        <th>Pack</th>
                        <th>Min order</th>
                        <th>Lead</th>
                        <th>Pref.</th>
                        <th>Effective</th>
                        {canWrite && <th />}
                      </tr>
                    </thead>
                    <tbody>
                      {offers.map((o) => {
                        const pr = offerProductRef(o)
                        return (
                          <tr key={o._id}>
                            <td>{pr.name}</td>
                            <td>{pr.sku}</td>
                            <td>{o.supplierSku ?? '—'}</td>
                            <td>{o.unitCost.toFixed(2)}</td>
                            <td>{o.unitsPerPack}</td>
                            <td>{o.minOrderQty}</td>
                            <td>{o.leadTimeDays ?? '—'}</td>
                            <td>{o.preferred ? 'Yes' : '—'}</td>
                            <td>{formatShortDate(o.priceEffectiveDate)}</td>
                            {canWrite && (
                              <td className="actions-cell">
                                <button type="button" className="btn small" onClick={() => openEditOffer(o)}>
                                  Edit
                                </button>
                                <button type="button" className="btn small" onClick={() => void deleteOffer(o)}>
                                  Remove
                                </button>
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {offers.length === 0 && <p className="muted">No offers for this supplier.</p>}
                </>
              )}
            </div>
          </div>

          {canWrite && offerModal && selected && (
            <div
              className="modal-backdrop"
              role="presentation"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) closeOfferModal()
              }}
            >
              <div
                className="modal-dialog panel product-form"
                role="dialog"
                aria-modal="true"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <h2>{offerModal === 'add' ? 'Add catalog offer' : 'Edit catalog offer'}</h2>
                <form onSubmit={(e) => void submitOffer(e)}>
                  <label>
                    Product
                    {offerModal === 'add' ? (
                      <select
                        value={offerProductId}
                        onChange={(e) => setOfferProductId(e.target.value)}
                        required
                      >
                        <option value="">Choose…</option>
                        {productsSorted.map((p) => (
                          <option key={p._id} value={p._id}>
                            {p.name} · {p.sku}
                          </option>
                        ))}
                      </select>
                    ) : editingOffer ? (
                      <input
                        readOnly
                        value={`${offerProductRef(editingOffer).name} · ${offerProductRef(editingOffer).sku}`}
                      />
                    ) : null}
                  </label>
                  <div className="inline-form">
                    <label>
                      Supplier SKU
                      <input value={offerSupplierSku} onChange={(e) => setOfferSupplierSku(e.target.value)} />
                    </label>
                    <label>
                      Unit cost
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={offerUnitCost}
                        onChange={(e) => setOfferUnitCost(e.target.value)}
                        required
                      />
                    </label>
                    <label>
                      Units / pack
                      <input
                        type="number"
                        min={1}
                        value={offerUnitsPerPack}
                        onChange={(e) => setOfferUnitsPerPack(e.target.value)}
                        required
                      />
                    </label>
                    <label>
                      Min order (units)
                      <input
                        type="number"
                        min={1}
                        value={offerMinOrder}
                        onChange={(e) => setOfferMinOrder(e.target.value)}
                        required
                      />
                    </label>
                    <label>
                      Lead time (days)
                      <input
                        type="number"
                        min={0}
                        value={offerLeadDays}
                        onChange={(e) => setOfferLeadDays(e.target.value)}
                        placeholder="optional"
                      />
                    </label>
                    <label>
                      Price effective
                      <input
                        type="date"
                        value={offerEffective}
                        onChange={(e) => setOfferEffective(e.target.value)}
                      />
                    </label>
                  </div>
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={offerPreferred}
                      onChange={(e) => setOfferPreferred(e.target.checked)}
                    />
                    <span>Preferred supplier for this product</span>
                  </label>
                  <div className="form-actions">
                    <button type="submit" className="btn primary" disabled={busy}>
                      Save
                    </button>
                    <button type="button" className="btn ghost" onClick={closeOfferModal}>
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}
    </BoShell>
  )
}
