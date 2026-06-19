import { useEffect, useRef, useState } from 'react'
import type { BackOfficeUser } from '../api/types'
import { deleteUserDocument, openUserDocument, uploadUserDocument } from '../api/client'
import {
  hrProfileDraftFromUser,
  hrProfilePayloadFromDraft,
  PAYMENT_TERM_OPTIONS,
  type HrProfileDraft,
} from '../users/hrProfile'

type UserHrProfilePanelProps = {
  user: BackOfficeUser
  busy: boolean
  onSave: (payload: ReturnType<typeof hrProfilePayloadFromDraft>) => Promise<void>
  onReload: () => Promise<void>
  onError: (message: string) => void
  onNotice: (message: string) => void
}

function newLoanKey() {
  return `loan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function DocumentUploadRow({
  label,
  kind,
  userId,
  document,
  busy,
  onUploaded,
  onRemoved,
  onError,
}: {
  label: string
  kind: 'contract' | 'id'
  userId: string
  document?: { originalName: string; uploadedAt: string } | null
  busy: boolean
  onUploaded: () => Promise<void>
  onRemoved: () => Promise<void>
  onError: (message: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function onFileChange(file: File | undefined) {
    if (!file) return
    setUploading(true)
    try {
      await uploadUserDocument(userId, kind, file)
      await onUploaded()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function removeDocument() {
    if (!window.confirm(`Remove ${label.toLowerCase()} file for this user?`)) return
    setUploading(true)
    try {
      await deleteUserDocument(userId, kind)
      await onRemoved()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Remove failed')
    } finally {
      setUploading(false)
    }
  }

  const docBusy = busy || uploading

  return (
    <div className="user-hr-document">
      <span className="user-hr-document-label">{label}</span>
      <input
        ref={inputRef}
        type="file"
        className="user-hr-file-input"
        accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
        disabled={docBusy}
        onChange={(e) => void onFileChange(e.target.files?.[0])}
      />
      <div className="user-hr-document-actions">
        <button
          type="button"
          className="btn small"
          disabled={docBusy}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? 'Uploading…' : document ? 'Replace' : 'Upload'}
        </button>
        {document ? (
          <>
            <button
              type="button"
              className="btn ghost small"
              disabled={docBusy}
              onClick={() => void openUserDocument(userId, kind).catch((e) => onError(e instanceof Error ? e.message : 'Could not open file'))}
            >
              View
            </button>
            <button type="button" className="btn ghost small" disabled={docBusy} onClick={() => void removeDocument()}>
              Remove
            </button>
          </>
        ) : null}
      </div>
      {document ? (
        <p className="muted user-hr-document-meta">
          {document.originalName} · {new Date(document.uploadedAt).toLocaleString()}
        </p>
      ) : (
        <p className="muted user-hr-document-meta">PDF, JPG, PNG, or WebP · max 12 MB</p>
      )}
    </div>
  )
}

export function UserHrProfilePanel({
  user,
  busy,
  onSave,
  onReload,
  onError,
  onNotice,
}: UserHrProfilePanelProps) {
  const [draft, setDraft] = useState<HrProfileDraft>(() => hrProfileDraftFromUser(user))
  const [saving, setSaving] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    setDraft(hrProfileDraftFromUser(user))
    setLocalError(null)
  }, [user._id, user.hrProfile])

  function updateDraft(patch: Partial<HrProfileDraft>) {
    setDraft((d) => ({ ...d, ...patch }))
  }

  function addLoan() {
    setDraft((d) => ({
      ...d,
      loans: [...d.loans, { key: newLoanKey(), startDate: '', amount: '', terms: '', notes: '' }],
    }))
  }

  function updateLoan(key: string, patch: Partial<HrProfileDraft['loans'][number]>) {
    setDraft((d) => ({
      ...d,
      loans: d.loans.map((loan) => (loan.key === key ? { ...loan, ...patch } : loan)),
    }))
  }

  function removeLoan(key: string) {
    setDraft((d) => ({ ...d, loans: d.loans.filter((loan) => loan.key !== key) }))
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setLocalError(null)
    onError('')
    try {
      await onSave(hrProfilePayloadFromDraft(draft))
      onNotice('Staff profile saved')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save staff profile'
      setLocalError(msg)
      onError(msg)
    } finally {
      setSaving(false)
    }
  }

  const formBusy = busy || saving

  return (
    <section className="user-card-block user-card-block--wide">
      <h4>Staff profile</h4>
      <form className="user-hr-form" onSubmit={(e) => void saveProfile(e)}>
        <div className="user-hr-grid">
          <label className="user-field">
            Phone number
            <input
              type="tel"
              value={draft.phone}
              disabled={formBusy}
              onChange={(e) => updateDraft({ phone: e.target.value })}
              autoComplete="tel"
            />
          </label>
          <label className="user-field">
            Start date
            <input
              type="date"
              value={draft.startDate}
              disabled={formBusy}
              onChange={(e) => updateDraft({ startDate: e.target.value })}
            />
          </label>
          <label className="user-field">
            Payment terms
            <select
              value={draft.paymentTerms}
              disabled={formBusy}
              onChange={(e) =>
                updateDraft({ paymentTerms: e.target.value as HrProfileDraft['paymentTerms'] })
              }
            >
              <option value="">—</option>
              {PAYMENT_TERM_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="user-field">
            Payment amount
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={draft.paymentAmount}
              disabled={formBusy}
              onChange={(e) => updateDraft({ paymentAmount: e.target.value })}
            />
          </label>
        </div>

        <div className="user-hr-documents">
          <DocumentUploadRow
            label="Contract"
            kind="contract"
            userId={user._id}
            document={user.hrProfile?.contractDocument}
            busy={formBusy}
            onError={(msg) => {
              if (msg) {
                setLocalError(msg)
                onError(msg)
              }
            }}
            onUploaded={onReload}
            onRemoved={onReload}
          />
          <DocumentUploadRow
            label="ID document"
            kind="id"
            userId={user._id}
            document={user.hrProfile?.idDocument}
            busy={formBusy}
            onError={(msg) => {
              if (msg) {
                setLocalError(msg)
                onError(msg)
              }
            }}
            onUploaded={onReload}
            onRemoved={onReload}
          />
        </div>

        <div className="user-hr-loans">
          <div className="user-hr-loans-header">
            <h5>Loans</h5>
            <button type="button" className="btn ghost small" disabled={formBusy} onClick={addLoan}>
              Add loan
            </button>
          </div>
          {draft.loans.length === 0 ? (
            <p className="muted user-hr-loans-empty">No loans recorded.</p>
          ) : (
            <div className="user-hr-loans-list">
              {draft.loans.map((loan) => (
                <div key={loan.key} className="user-hr-loan-card">
                  <div className="user-hr-loan-grid">
                    <label className="user-field">
                      Start date
                      <input
                        type="date"
                        value={loan.startDate}
                        disabled={formBusy}
                        onChange={(e) => updateLoan(loan.key, { startDate: e.target.value })}
                      />
                    </label>
                    <label className="user-field">
                      Amount
                      <input
                        type="text"
                        inputMode="decimal"
                        value={loan.amount}
                        disabled={formBusy}
                        onChange={(e) => updateLoan(loan.key, { amount: e.target.value })}
                      />
                    </label>
                    <label className="user-field user-field--wide">
                      Terms
                      <input
                        type="text"
                        placeholder="e.g. 6 months · R500/month"
                        value={loan.terms}
                        disabled={formBusy}
                        onChange={(e) => updateLoan(loan.key, { terms: e.target.value })}
                      />
                    </label>
                    <label className="user-field user-field--full">
                      Loan notes
                      <input
                        type="text"
                        value={loan.notes}
                        disabled={formBusy}
                        onChange={(e) => updateLoan(loan.key, { notes: e.target.value })}
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    className="btn ghost small user-hr-loan-remove"
                    disabled={formBusy}
                    onClick={() => removeLoan(loan.key)}
                  >
                    Remove loan
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <label className="user-field user-field--full">
          Notes
          <textarea
            rows={3}
            value={draft.notes}
            disabled={formBusy}
            onChange={(e) => updateDraft({ notes: e.target.value })}
            placeholder="General staff notes"
          />
        </label>

        {localError ? <p className="error">{localError}</p> : null}

        <div className="user-hr-form-actions">
          <button type="submit" className="btn primary small" disabled={formBusy}>
            {saving ? 'Saving…' : 'Save staff profile'}
          </button>
          <button
            type="button"
            className="btn ghost small"
            disabled={formBusy}
            onClick={() => setDraft(hrProfileDraftFromUser(user))}
          >
            Reset
          </button>
        </div>
      </form>
    </section>
  )
}
