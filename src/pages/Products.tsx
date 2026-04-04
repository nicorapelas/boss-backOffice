import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type FormEvent,
} from 'react'
import { apiFetch } from '../api/client'
import type { Product, ProductPresetsState } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { BoShell } from '../layouts/BoShell'
import {
  assignPresetEntry,
  PRESET_ENTRY_MAX,
  removePresetAt as removePresetFromState,
} from '../utils/productPresets'

export function Products() {
  const { session } = useAuth()
  const isAdmin = session?.user.role === 'admin'
  const [products, setProducts] = useState<Product[]>([])
  const [error, setError] = useState<string | null>(null)

  const [createName, setCreateName] = useState('')
  const [createSku, setCreateSku] = useState('')
  const [createPrice, setCreatePrice] = useState('')
  const [createStock, setCreateStock] = useState('0')
  const [createTrackInventory, setCreateTrackInventory] = useState(true)

  const [editing, setEditing] = useState<Product | null>(null)
  const [editName, setEditName] = useState('')
  const [editSku, setEditSku] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [editStock, setEditStock] = useState('0')
  const [editTrackInventory, setEditTrackInventory] = useState(true)

  const [sharedPresets, setSharedPresets] = useState<ProductPresetsState | null>(null)
  const [presetLoading, setPresetLoading] = useState(false)
  const [presetError, setPresetError] = useState<string | null>(null)
  const [presetBusy, setPresetBusy] = useState(false)
  const [addPresetCat, setAddPresetCat] = useState('')
  const [addPresetSub, setAddPresetSub] = useState('')
  const [presetReplaceIndex, setPresetReplaceIndex] = useState(-1)

  const [productSearch, setProductSearch] = useState('')

  const presetCatDatalistId = useId()
  const presetSubDatalistId = useId()

  const presetCategoryOptions = useMemo(() => {
    if (!sharedPresets) return []
    const fromTax = sharedPresets.categories ?? []
    const fromEntries = sharedPresets.entries.map((e) => e.category)
    return [...new Set([...fromTax, ...fromEntries].filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' }),
    )
  }, [sharedPresets])

  const presetSubCategoryOptions = useMemo(() => {
    if (!sharedPresets) return []
    const cat = addPresetCat.trim()
    if (!cat) return []
    const fromMap = sharedPresets.subCategoriesByCategory[cat] ?? []
    const fromEntries = sharedPresets.entries
      .filter((e) => e.category === cat)
      .map((e) => e.subCategory)
    return [...new Set([...fromMap, ...fromEntries].filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' }),
    )
  }, [sharedPresets, addPresetCat])

  const load = useCallback(async () => {
    setError(null)
    try {
      const list = await apiFetch<Product[]>('/products')
      setProducts(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const closeEditModal = useCallback(() => {
    setEditing(null)
    setEditName('')
    setEditSku('')
    setEditPrice('')
    setEditStock('0')
    setEditTrackInventory(true)
    setSharedPresets(null)
    setPresetLoading(false)
    setPresetError(null)
    setPresetBusy(false)
    setAddPresetCat('')
    setAddPresetSub('')
    setPresetReplaceIndex(-1)
  }, [])

  useEffect(() => {
    if (!editing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeEditModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing, closeEditModal])

  useEffect(() => {
    if (!editing || !isAdmin) {
      setSharedPresets(null)
      setPresetLoading(false)
      return
    }
    setPresetLoading(true)
    setPresetError(null)
    void apiFetch<ProductPresetsState>('/settings/product-presets')
      .then((d) => setSharedPresets(d))
      .catch((e) => {
        setPresetError(e instanceof Error ? e.message : 'Failed to load presets')
        setSharedPresets(null)
      })
      .finally(() => setPresetLoading(false))
  }, [editing?._id, isAdmin])

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase()
    if (!q) return products
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q),
    )
  }, [products, productSearch])

  function startEdit(p: Product) {
    setEditing(p)
    setEditName(p.name)
    setEditSku(p.sku)
    setEditPrice(String(p.price))
    setEditStock(String(p.stock))
    setEditTrackInventory(p.trackInventory !== false)
  }

  function resetCreateForm() {
    setCreateName('')
    setCreateSku('')
    setCreatePrice('')
    setCreateStock('0')
    setCreateTrackInventory(true)
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    if (!isAdmin) return
    setError(null)
    try {
      await apiFetch('/products', {
        method: 'POST',
        body: JSON.stringify({
          name: createName,
          sku: createSku,
          price: Number(createPrice),
          stock: Number(createStock) || 0,
          trackInventory: createTrackInventory,
        }),
      })
      resetCreateForm()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    }
  }

  async function onUpdate(e: FormEvent) {
    e.preventDefault()
    if (!editing || !isAdmin) return
    setError(null)
    try {
      await apiFetch(`/products/${editing._id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editName,
          sku: editSku,
          price: Number(editPrice),
          stock: Number(editStock),
          trackInventory: editTrackInventory,
        }),
      })
      closeEditModal()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    }
  }

  async function onDelete(id: string) {
    if (!isAdmin) return
    if (!confirm('Delete this product?')) return
    setError(null)
    try {
      await apiFetch(`/products/${id}`, { method: 'DELETE' })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  async function persistSharedPresets(next: ProductPresetsState) {
    const saved = await apiFetch<ProductPresetsState>('/settings/product-presets', {
      method: 'PUT',
      body: JSON.stringify(next),
    })
    setSharedPresets(saved)
  }

  async function removeSharedPresetSlot(globalIndex: number) {
    if (!sharedPresets) return
    setPresetBusy(true)
    setPresetError(null)
    try {
      const next = removePresetFromState(sharedPresets, globalIndex)
      await persistSharedPresets(next)
    } catch (e) {
      setPresetError(e instanceof Error ? e.message : 'Could not update presets')
    } finally {
      setPresetBusy(false)
    }
  }

  async function addSharedPresetSlot() {
    if (!editing || !sharedPresets) return
    const full = sharedPresets.entries.length >= PRESET_ENTRY_MAX
    if (full) {
      if (presetReplaceIndex < 0 || presetReplaceIndex >= sharedPresets.entries.length) {
        setPresetError(`All ${PRESET_ENTRY_MAX} preset slots are used — choose one to replace.`)
        return
      }
    }
    const replaceAt = full ? presetReplaceIndex : null
    setPresetBusy(true)
    setPresetError(null)
    try {
      const product: Product = {
        ...editing,
        name: editName,
        sku: editSku,
        price: Number(editPrice),
        stock: Number(editStock),
        trackInventory: editTrackInventory,
      }
      const next = assignPresetEntry(sharedPresets, product, addPresetCat, addPresetSub, replaceAt)
      if (next === sharedPresets) {
        setPresetError('Enter category and sub-category.')
        return
      }
      await persistSharedPresets(next)
      setAddPresetCat('')
      setAddPresetSub('')
      setPresetReplaceIndex(-1)
    } catch (e) {
      setPresetError(e instanceof Error ? e.message : 'Could not update presets')
    } finally {
      setPresetBusy(false)
    }
  }

  return (
    <BoShell>
      <h1>Products</h1>
      <p className="muted">Manage catalog and stock.</p>

      {isAdmin && (
        <form className="panel product-form" onSubmit={onCreate}>
          <h2>New product</h2>
          <div className="inline-form">
            <label>
              Name
              <input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                required
              />
            </label>
            <label>
              SKU
              <input
                value={createSku}
                onChange={(e) => setCreateSku(e.target.value)}
                required
              />
            </label>
            <label>
              Price
              <input
                type="number"
                step="0.01"
                min={0}
                value={createPrice}
                onChange={(e) => setCreatePrice(e.target.value)}
                required
              />
            </label>
            <label className={createTrackInventory ? undefined : 'muted'}>
              Stock
              <input
                type="number"
                min={0}
                value={createStock}
                onChange={(e) => setCreateStock(e.target.value)}
                required
                disabled={!createTrackInventory}
              />
            </label>
          </div>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={createTrackInventory}
              onChange={(e) => setCreateTrackInventory(e.target.checked)}
            />
            <span>
              Track inventory
              <span className="muted help-note">
                Off for services or labour — stock is not checked or reduced on sale.
              </span>
            </span>
          </label>
          <div className="form-actions">
            <button type="submit" className="btn primary">
              Create
            </button>
          </div>
        </form>
      )}

      {!isAdmin && (
        <p className="muted">You can view products. Ask an admin to change the catalog.</p>
      )}

      {error && <p className="error">{error}</p>}

      <div className="panel">
        <div className="products-toolbar">
          <label className="products-search-field">
            Search products
            <input
              type="search"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="Filter by name or SKU…"
              autoComplete="off"
              enterKeyHint="search"
            />
          </label>
          {products.length > 0 && productSearch.trim() ? (
            <p className="muted products-search-meta">
              {filteredProducts.length} of {products.length} shown
            </p>
          ) : null}
        </div>
        <table className="table products-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>SKU</th>
              <th>Price</th>
              <th>Stock</th>
              <th>Inv.</th>
              {isAdmin && <th />}
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map((p) => (
              <tr key={p._id}>
                <td>{p.name}</td>
                <td>{p.sku}</td>
                <td>{p.price.toFixed(2)}</td>
                <td>{p.trackInventory === false ? '—' : p.stock}</td>
                <td>{p.trackInventory === false ? 'No' : 'Yes'}</td>
                {isAdmin && (
                  <td className="actions-cell">
                    <button type="button" className="btn small" onClick={() => startEdit(p)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn small"
                      onClick={() => void onDelete(p._id)}
                    >
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {products.length === 0 && <p className="muted">No products yet.</p>}
        {products.length > 0 && filteredProducts.length === 0 && (
          <p className="muted">No products match your search.</p>
        )}
      </div>

      {isAdmin && editing && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeEditModal()
          }}
        >
          <div
            className="modal-dialog panel product-form"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-product-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <form onSubmit={onUpdate}>
              <h2 id="edit-product-title">Edit product</h2>
              <p className="muted modal-subtitle">
                {editing.name} <span className="muted">({editing.sku})</span>
              </p>
              <div className="inline-form">
                <label>
                  Name
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                  />
                </label>
                <label>
                  SKU
                  <input
                    value={editSku}
                    onChange={(e) => setEditSku(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Price
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                    required
                  />
                </label>
                <label className={editTrackInventory ? undefined : 'muted'}>
                  Stock
                  <input
                    type="number"
                    min={0}
                    value={editStock}
                    onChange={(e) => setEditStock(e.target.value)}
                    required
                    disabled={!editTrackInventory}
                  />
                </label>
              </div>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={editTrackInventory}
                  onChange={(e) => setEditTrackInventory(e.target.checked)}
                />
                <span>
                  Track inventory
                  <span className="muted help-note">
                    Off for services or labour — stock is not checked or reduced on sale.
                  </span>
                </span>
              </label>

              <div className="product-edit-presets">
                <h3 className="product-edit-presets-title">Preset buttons</h3>
                <p className="muted help-note">
                  Shared by all tills. On the POS, open the Presets panel, then category → sub-category → item.
                </p>
                {presetLoading && <p className="muted">Loading preset layout…</p>}
                {presetError && <p className="error">{presetError}</p>}
                {sharedPresets && !presetLoading && (
                  <>
                    <ul className="product-edit-preset-list">
                      {sharedPresets.entries
                        .map((e, i) => ({ e, i }))
                        .filter(({ e }) => e.productId === editing._id)
                        .map(({ e, i }) => (
                          <li key={i} className="product-edit-preset-row">
                            <span>
                              <strong>{e.category}</strong> › {e.subCategory}
                              <span className="muted"> · {e.label}</span>
                            </span>
                            <button
                              type="button"
                              className="btn ghost small"
                              disabled={presetBusy}
                              onClick={() => void removeSharedPresetSlot(i)}
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                    </ul>
                    {sharedPresets.entries.every((e) => e.productId !== editing._id) ? (
                      <p className="muted">This product is not on any preset slot yet.</p>
                    ) : null}
                    <div className="product-edit-preset-add">
                      <p className="muted help-note product-edit-preset-datalist-hint">
                        Suggestions come from existing presets; you can still type a new category or sub-category.
                      </p>
                      <div className="inline-form">
                        <label>
                          Category
                          <input
                            value={addPresetCat}
                            onChange={(e) => setAddPresetCat(e.target.value)}
                            placeholder="e.g. Drinks"
                            list={presetCategoryOptions.length > 0 ? presetCatDatalistId : undefined}
                            autoComplete="off"
                          />
                        </label>
                        {presetCategoryOptions.length > 0 ? (
                          <datalist id={presetCatDatalistId}>
                            {presetCategoryOptions.map((c) => (
                              <option key={c} value={c} />
                            ))}
                          </datalist>
                        ) : null}
                        <label>
                          Sub-category
                          <input
                            value={addPresetSub}
                            onChange={(e) => setAddPresetSub(e.target.value)}
                            placeholder="e.g. Cold"
                            list={presetSubCategoryOptions.length > 0 ? presetSubDatalistId : undefined}
                            autoComplete="off"
                          />
                        </label>
                        {presetSubCategoryOptions.length > 0 ? (
                          <datalist id={presetSubDatalistId}>
                            {presetSubCategoryOptions.map((s) => (
                              <option key={s} value={s} />
                            ))}
                          </datalist>
                        ) : null}
                        {sharedPresets.entries.length >= PRESET_ENTRY_MAX ? (
                          <label>
                            Replace slot
                            <select
                              value={presetReplaceIndex}
                              onChange={(e) => setPresetReplaceIndex(Number(e.target.value))}
                            >
                              <option value={-1}>Choose…</option>
                              {sharedPresets.entries.map((e, idx) => (
                                <option key={idx} value={idx}>
                                  #{idx + 1}: {e.category} › {e.subCategory} ({e.label})
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}
                      </div>
                      <div className="form-actions">
                        <button
                          type="button"
                          className="btn small"
                          disabled={presetBusy}
                          onClick={() => void addSharedPresetSlot()}
                        >
                          Add to presets
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="form-actions">
                <button type="submit" className="btn primary">
                  Save
                </button>
                <button type="button" className="btn ghost" onClick={closeEditModal}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </BoShell>
  )
}
