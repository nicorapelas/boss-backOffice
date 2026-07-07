import { useEffect, useId, useRef, useState } from 'react'
import { lookupCatalogProduct, searchCatalogProducts } from '../api/client'
import type { Product } from '../api/types'

type ProductSkuLookupModalProps = {
  open: boolean
  invoiceLine?: string | null
  onSelect: (product: Product) => void
  onClose: () => void
}

export function ProductSkuLookupModal({ open, invoiceLine, onSelect, onClose }: ProductSkuLookupModalProps) {
  const titleId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<Product[]>([])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setError(null)
    setResults([])
    const t = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setError(null)
      return
    }
    const handle = window.setTimeout(() => {
      void (async () => {
        setBusy(true)
        setError(null)
        try {
          const list = await searchCatalogProducts(q, 25)
          setResults(list)
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Search failed')
          setResults([])
        } finally {
          setBusy(false)
        }
      })()
    }, 250)
    return () => window.clearTimeout(handle)
  }, [open, query])

  async function runExactLookup() {
    const q = query.trim()
    if (!q) return
    setBusy(true)
    setError(null)
    try {
      const product = await lookupCatalogProduct(q)
      onSelect(product)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Lookup failed'
      if (msg.toLowerCase().includes('not found')) {
        setError('No exact SKU or barcode match — try a broader search below.')
      } else {
        setError(msg)
      }
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="modal-dialog panel product-form"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{ maxWidth: '42rem', width: 'min(42rem, 96vw)' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id={titleId}>SKU lookup</h2>
        {invoiceLine ? (
          <p className="muted modal-subtitle" style={{ marginBottom: '0.75rem' }}>
            Invoice line: {invoiceLine}
          </p>
        ) : null}
        <p className="muted" style={{ fontSize: '0.9rem', marginBottom: '0.75rem' }}>
          Type a SKU or barcode for an exact match, or search by name. Click a result to select it.
        </p>
        <div className="inline-form" style={{ alignItems: 'end', marginBottom: '0.75rem' }}>
          <label style={{ flex: 1 }}>
            SKU, barcode, or name
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void runExactLookup()
                }
              }}
              placeholder="e.g. 988 or skewer rear"
              autoComplete="off"
            />
          </label>
          <button type="button" className="btn small" disabled={busy || !query.trim()} onClick={() => void runExactLookup()}>
            Exact SKU
          </button>
        </div>
        {error ? <p className="error">{error}</p> : null}
        {busy && results.length === 0 ? <p className="muted">Searching…</p> : null}
        {!busy && query.trim().length >= 2 && results.length === 0 && !error ? (
          <p className="muted">No products match that search.</p>
        ) : null}
        {results.length > 0 ? (
          <div style={{ maxHeight: '18rem', overflow: 'auto', border: '1px solid var(--bo-border, #333)', borderRadius: 8 }}>
            <table className="table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th style={{ width: '5rem' }}>SKU</th>
                  <th>Name</th>
                  <th style={{ width: '5rem' }}>Stock</th>
                  <th style={{ width: '5rem' }}>Price</th>
                </tr>
              </thead>
              <tbody>
                {results.map((p) => (
                  <tr
                    key={p._id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => onSelect(p)}
                    title="Click to select"
                  >
                    <td>{p.sku}</td>
                    <td>{p.name}</td>
                    <td>{p.stock}</td>
                    <td>R{p.price}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <div className="form-actions" style={{ marginTop: '1rem' }}>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
