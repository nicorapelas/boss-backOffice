import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { apiFetch } from '../api/client'
import type { Product } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { BoShell } from '../layouts/BoShell'

export function Products() {
  const { session } = useAuth()
  const isAdmin = session?.user.role === 'admin'
  const [products, setProducts] = useState<Product[]>([])
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [sku, setSku] = useState('')
  const [price, setPrice] = useState('')
  const [stock, setStock] = useState('0')
  const [editing, setEditing] = useState<Product | null>(null)

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

  function startEdit(p: Product) {
    setEditing(p)
    setName(p.name)
    setSku(p.sku)
    setPrice(String(p.price))
    setStock(String(p.stock))
  }

  function cancelEdit() {
    setEditing(null)
    setName('')
    setSku('')
    setPrice('')
    setStock('0')
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    if (!isAdmin) return
    setError(null)
    try {
      await apiFetch('/products', {
        method: 'POST',
        body: JSON.stringify({
          name,
          sku,
          price: Number(price),
          stock: Number(stock) || 0,
        }),
      })
      cancelEdit()
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
          name,
          sku,
          price: Number(price),
          stock: Number(stock),
        }),
      })
      cancelEdit()
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

  return (
    <BoShell>
      <h1>Products</h1>
      <p className="muted">Manage catalog and stock.</p>

      {isAdmin && (
        <form
          className="panel product-form"
          onSubmit={editing ? onUpdate : onCreate}
        >
          <h2>{editing ? 'Edit product' : 'New product'}</h2>
          <div className="inline-form">
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label>
              SKU
              <input value={sku} onChange={(e) => setSku(e.target.value)} required />
            </label>
            <label>
              Price
              <input
                type="number"
                step="0.01"
                min={0}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
              />
            </label>
            <label>
              Stock
              <input
                type="number"
                min={0}
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                required
              />
            </label>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn primary">
              {editing ? 'Save' : 'Create'}
            </button>
            {editing && (
              <button type="button" className="btn ghost" onClick={cancelEdit}>
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      {!isAdmin && (
        <p className="muted">You can view products. Ask an admin to change the catalog.</p>
      )}

      {error && <p className="error">{error}</p>}

      <div className="panel">
        <table className="table products-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>SKU</th>
              <th>Price</th>
              <th>Stock</th>
              {isAdmin && <th />}
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p._id}>
                <td>{p.name}</td>
                <td>{p.sku}</td>
                <td>{p.price.toFixed(2)}</td>
                <td>{p.stock}</td>
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
      </div>
    </BoShell>
  )
}
