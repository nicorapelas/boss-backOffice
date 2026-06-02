import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../api/client'
import type { CustomerDisplaySettings, LoyaltyProgramConfig, StoreSettings } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { hasPermission } from '../auth/permissions'
import { BoShell } from '../layouts/BoShell'

function defaultCustomerDisplay(prev?: CustomerDisplaySettings): CustomerDisplaySettings {
  return {
    enabled: prev?.enabled !== false,
    idle: {
      headline: prev?.idle?.headline ?? 'Welcome',
      subtext: prev?.idle?.subtext ?? '',
      imageUrl: prev?.idle?.imageUrl ?? '',
    },
    theme: {
      backgroundColor: prev?.theme?.backgroundColor ?? '#0f1419',
      accentColor: prev?.theme?.accentColor ?? '#3b82f6',
    },
    footerText: prev?.footerText ?? 'All prices include VAT',
  }
}

function patchCustomerDisplay(
  f: Partial<StoreSettings>,
  patch: {
    enabled?: boolean
    idle?: Partial<NonNullable<CustomerDisplaySettings['idle']>>
    theme?: Partial<NonNullable<CustomerDisplaySettings['theme']>>
    footerText?: string
  },
): CustomerDisplaySettings {
  const base = defaultCustomerDisplay(f.customerDisplay)
  return {
    ...base,
    ...patch,
    enabled: patch.enabled ?? base.enabled,
    idle: { ...base.idle, ...patch.idle },
    theme: { ...base.theme, ...patch.theme },
    footerText: patch.footerText ?? base.footerText,
  }
}

export function StoreSettingsPage() {
  const { session } = useAuth()
  const canRead =
    hasPermission(session?.user, 'settings.read') || hasPermission(session?.user, 'settings.write')
  const canSave = hasPermission(session?.user, 'settings.write')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [form, setForm] = useState<Partial<StoreSettings>>({})

  useEffect(() => {
    if (!canRead) return
    void apiFetch<StoreSettings>('/settings/store').then((d) => {
      setForm(d)
    })
  }, [canRead])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSave) return
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
          customerDisplay: form.customerDisplay,
          loyaltyProgram: form.loyaltyProgram,
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

  const cd = defaultCustomerDisplay(form.customerDisplay)
  const lp: LoyaltyProgramConfig = form.loyaltyProgram ?? {
    enabled: false,
    pointsPerRand: 1,
    redeemValuePerPoint: 0.1,
    minRedeemPoints: 100,
    maxRedeemPercent: 50,
  }

  return (
    <BoShell>
      <h1 className="bo-settings-title">Store &amp; lay-by settings</h1>
      <div className="store-settings-page">
        <p className="muted store-settings-lead">
          Store details appear on POS receipts and lay-by documents. Customer display content is shown on the
          second monitor when the till is logged out.
        </p>

        {!canRead && <p className="error">Permission required: view store settings.</p>}

        {canRead && (
          <form className="store-settings-form" onSubmit={(e) => void onSubmit(e)}>
            {error ? <p className="error form-grid__full">{error}</p> : null}
            {saved ? <p className="success form-grid__full">Saved.</p> : null}

            <section className="bo-settings-section" aria-labelledby="store-details-heading">
              <h2 id="store-details-heading" className="bo-settings-section-title">
                Store &amp; receipts
              </h2>
              <p className="muted bo-settings-section-lead">
                Trading name, contact details, and lay-by defaults (VAT-inclusive pricing, 14% SA default).
              </p>

              <div className="form-grid form-grid--2">
                <label className="stack">
                  Store name
                  <input
                    value={form.storeName ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, storeName: e.target.value }))}
                    disabled={!canSave}
                    autoComplete="organization"
                  />
                </label>
                <label className="stack">
                  Phone
                  <input
                    value={form.storePhone ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, storePhone: e.target.value }))}
                    disabled={!canSave}
                    autoComplete="tel"
                  />
                </label>
                <label className="stack form-grid__full">
                  VAT registration number
                  <input
                    value={form.storeVatNumber ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, storeVatNumber: e.target.value }))}
                    disabled={!canSave}
                  />
                </label>
                <label className="stack form-grid__full">
                  Address (one line per row)
                  <textarea
                    rows={3}
                    value={(form.storeAddressLines ?? []).join('\n')}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        storeAddressLines: e.target.value.split('\n').map((s) => s.trim()),
                      }))
                    }
                    disabled={!canSave}
                  />
                </label>
                <label className="stack form-grid__full">
                  Lay-by terms (printed on receipts)
                  <textarea
                    rows={5}
                    value={form.layByTerms ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, layByTerms: e.target.value }))}
                    disabled={!canSave}
                  />
                </label>
              </div>

              <h3 className="store-settings-subheading">Lay-by defaults</h3>
              <div className="form-grid form-grid--3">
                <label className="stack">
                  Default deposit %
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={form.defaultDepositPercent ?? 30}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, defaultDepositPercent: Number(e.target.value) }))
                    }
                    disabled={!canSave}
                  />
                </label>
                <label className="stack">
                  Expiry (months)
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={form.defaultExpiryMonths ?? 3}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, defaultExpiryMonths: Number(e.target.value) }))
                    }
                    disabled={!canSave}
                  />
                </label>
                <label className="stack">
                  VAT rate (decimal)
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    max={0.5}
                    value={form.vatRate ?? 0.14}
                    onChange={(e) => setForm((f) => ({ ...f, vatRate: Number(e.target.value) }))}
                    disabled={!canSave}
                  />
                  <span className="field-hint muted">e.g. 0.14 for 14%</span>
                </label>
              </div>
            </section>

            <section className="bo-settings-section" aria-labelledby="loyalty-heading">
              <h2 id="loyalty-heading" className="bo-settings-section-title">
                Loyalty program
              </h2>
              <p className="muted bo-settings-section-lead">
                Phone-based loyalty at the till. Members are created on first use. Manage members on the{' '}
                <Link to="/loyalty">Loyalty</Link> page.
              </p>
              <label className="form-checkbox-row form-grid__full">
                <input
                  type="checkbox"
                  checked={lp.enabled === true}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      loyaltyProgram: { ...lp, enabled: e.target.checked },
                    }))
                  }
                  disabled={!canSave}
                />
                <span>Enable loyalty program</span>
              </label>
              <div className="form-grid form-grid--3">
                <label className="stack">
                  Points per R1 spent
                  <input
                    type="number"
                    min={0}
                    step="0.1"
                    value={lp.pointsPerRand}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        loyaltyProgram: { ...lp, pointsPerRand: Number(e.target.value) },
                      }))
                    }
                    disabled={!canSave || !lp.enabled}
                  />
                </label>
                <label className="stack">
                  R value per point
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={lp.redeemValuePerPoint}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        loyaltyProgram: { ...lp, redeemValuePerPoint: Number(e.target.value) },
                      }))
                    }
                    disabled={!canSave || !lp.enabled}
                  />
                  <span className="field-hint muted">e.g. 0.1 → 100 pts = R10</span>
                </label>
                <label className="stack">
                  Min redeem (points)
                  <input
                    type="number"
                    min={0}
                    value={lp.minRedeemPoints}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        loyaltyProgram: { ...lp, minRedeemPoints: Number(e.target.value) },
                      }))
                    }
                    disabled={!canSave || !lp.enabled}
                  />
                </label>
                <label className="stack">
                  Max redeem (% of sale)
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={lp.maxRedeemPercent}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        loyaltyProgram: { ...lp, maxRedeemPercent: Number(e.target.value) },
                      }))
                    }
                    disabled={!canSave || !lp.enabled}
                  />
                </label>
              </div>
            </section>

            <section className="bo-settings-section" aria-labelledby="customer-display-heading">
              <h2 id="customer-display-heading" className="bo-settings-section-title">
                Customer display
              </h2>
              <p className="muted bo-settings-section-lead">
                Idle screen on the customer monitor. Cart and thank-you views are sent automatically from the
                till during sales.
              </p>

              <label className="form-checkbox-row form-grid__full">
                <input
                  type="checkbox"
                  checked={cd.enabled !== false}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      customerDisplay: patchCustomerDisplay(f, { enabled: e.target.checked }),
                    }))
                  }
                  disabled={!canSave}
                />
                <span>Enable customer display content</span>
              </label>

              <div className="form-grid form-grid--2">
                <label className="stack form-grid__full">
                  Idle headline (logged out)
                  <input
                    value={cd.idle?.headline ?? 'Welcome'}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        customerDisplay: patchCustomerDisplay(f, {
                          idle: { headline: e.target.value },
                        }),
                      }))
                    }
                    disabled={!canSave}
                  />
                </label>
                <label className="stack form-grid__full">
                  Idle subtext
                  <textarea
                    rows={2}
                    value={cd.idle?.subtext ?? ''}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        customerDisplay: patchCustomerDisplay(f, {
                          idle: { subtext: e.target.value },
                        }),
                      }))
                    }
                    disabled={!canSave}
                  />
                </label>
                <label className="stack form-grid__full">
                  Idle image URL (optional)
                  <input
                    value={cd.idle?.imageUrl ?? ''}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        customerDisplay: patchCustomerDisplay(f, {
                          idle: { imageUrl: e.target.value },
                        }),
                      }))
                    }
                    disabled={!canSave}
                    placeholder="https://example.com/banner.jpg"
                  />
                </label>
                <label className="stack">
                  Background colour
                  <input
                    type="color"
                    className="color-input"
                    value={cd.theme?.backgroundColor ?? '#0f1419'}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        customerDisplay: patchCustomerDisplay(f, {
                          theme: { backgroundColor: e.target.value },
                        }),
                      }))
                    }
                    disabled={!canSave}
                  />
                </label>
                <label className="stack">
                  Accent colour
                  <input
                    type="color"
                    className="color-input"
                    value={cd.theme?.accentColor ?? '#3b82f6'}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        customerDisplay: patchCustomerDisplay(f, {
                          theme: { accentColor: e.target.value },
                        }),
                      }))
                    }
                    disabled={!canSave}
                  />
                </label>
                <label className="stack form-grid__full">
                  Footer on cart / thank-you
                  <input
                    value={cd.footerText ?? 'All prices include VAT'}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        customerDisplay: patchCustomerDisplay(f, {
                          footerText: e.target.value,
                        }),
                      }))
                    }
                    disabled={!canSave}
                  />
                </label>
              </div>
            </section>

            <div className="store-settings-actions form-grid__full">
              {canSave ? (
                <button type="submit" className="btn primary" disabled={busy}>
                  {busy ? 'Saving…' : 'Save changes'}
                </button>
              ) : (
                <p className="muted">View only — you do not have permission to change these settings.</p>
              )}
            </div>
          </form>
        )}
      </div>
    </BoShell>
  )
}
