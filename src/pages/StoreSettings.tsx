import { useEffect, useState, type FormEvent } from 'react'
import { apiFetch } from '../api/client'
import type { StoreSettings } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { BoShell } from '../layouts/BoShell'

export function StoreSettingsPage() {
  const { session } = useAuth()
  const isAdmin = session?.user.role === 'admin'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [form, setForm] = useState<Partial<StoreSettings>>({})

  useEffect(() => {
    if (!isAdmin) return
    void apiFetch<StoreSettings>('/settings/store').then((d) => {
      setForm(d)
    })
  }, [isAdmin])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!isAdmin) return
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const updated = await apiFetch<StoreSettings>('/settings/store', {
        method: 'PATCH',
        body: JSON.stringify({
          storeName: form.storeName,
          storeAddressLines: form.storeAddressLines,
          storePhone: form.storePhone,
          storeVatNumber: form.storeVatNumber,
          layByTerms: form.layByTerms,
          defaultDepositPercent: form.defaultDepositPercent,
          defaultExpiryMonths: form.defaultExpiryMonths,
          vatRate: form.vatRate,
        }),
      })
      setForm(updated)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <BoShell>
      <h1>Store &amp; lay-by settings</h1>
      <p className="muted">Used on POS receipts and lay-by forms (VAT-inclusive pricing, SA 14% default).</p>
      {!isAdmin && <p className="error">Admin role required.</p>}
      {isAdmin && (
        <form className="panel" onSubmit={(e) => void onSubmit(e)}>
          {error && <p className="error">{error}</p>}
          {saved && <p className="success">Saved.</p>}
          <label className="stack">
            Store name
            <input
              value={form.storeName ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, storeName: e.target.value }))}
            />
          </label>
          <label className="stack">
            Address lines (one per line)
            <textarea
              rows={3}
              value={(form.storeAddressLines ?? []).join('\n')}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  storeAddressLines: e.target.value.split('\n').map((s) => s.trim()),
                }))
              }
            />
          </label>
          <label className="stack">
            Phone
            <input
              value={form.storePhone ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, storePhone: e.target.value }))}
            />
          </label>
          <label className="stack">
            VAT registration number
            <input
              value={form.storeVatNumber ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, storeVatNumber: e.target.value }))}
            />
          </label>
          <label className="stack">
            Lay-by terms (receipts)
            <textarea
              rows={6}
              value={form.layByTerms ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, layByTerms: e.target.value }))}
            />
          </label>
          <label className="stack">
            Default deposit %
            <input
              type="number"
              min={0}
              max={100}
              value={form.defaultDepositPercent ?? 30}
              onChange={(e) => setForm((f) => ({ ...f, defaultDepositPercent: Number(e.target.value) }))}
            />
          </label>
          <label className="stack">
            Default expiry (months from first payment)
            <input
              type="number"
              min={1}
              max={120}
              value={form.defaultExpiryMonths ?? 3}
              onChange={(e) => setForm((f) => ({ ...f, defaultExpiryMonths: Number(e.target.value) }))}
            />
          </label>
          <label className="stack">
            VAT rate (decimal, e.g. 0.14 for 14%)
            <input
              type="number"
              step="0.01"
              min={0}
              max={0.5}
              value={form.vatRate ?? 0.14}
              onChange={(e) => setForm((f) => ({ ...f, vatRate: Number(e.target.value) }))}
            />
          </label>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </form>
      )}
    </BoShell>
  )
}
