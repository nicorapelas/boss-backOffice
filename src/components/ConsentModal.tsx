import { useEffect, useId, useState } from 'react'

type ConsentModalProps = {
  open: boolean
  title: string
  subtitle?: string
  bullets: readonly string[]
  checkboxLabel: string
  confirmLabel?: string
  cancelLabel?: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConsentModal({
  open,
  title,
  subtitle,
  bullets,
  checkboxLabel,
  confirmLabel = 'I accept',
  cancelLabel = 'Cancel',
  busy = false,
  onConfirm,
  onCancel,
}: ConsentModalProps) {
  const titleId = useId()
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (!open) setChecked(false)
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div
        className="modal-dialog panel consent-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id={titleId}>{title}</h2>
        {subtitle ? <p className="muted modal-subtitle">{subtitle}</p> : null}
        <ul className="consent-modal-list">
          {bullets.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <label className="form-checkbox-row consent-modal-checkbox">
          <input
            type="checkbox"
            checked={checked}
            disabled={busy}
            onChange={(e) => setChecked(e.target.checked)}
          />
          <span>{checkboxLabel}</span>
        </label>
        <div className="consent-modal-actions">
          <button type="button" className="btn ghost" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={busy || !checked}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export function ConsentRecordedNote({
  label,
  recordedAt,
}: {
  label: string
  recordedAt?: string | null
}) {
  if (!recordedAt) return null
  const when = new Date(recordedAt)
  const text = Number.isNaN(when.getTime()) ? recordedAt : when.toLocaleString()
  return (
    <p className="muted small consent-recorded-note">
      {label}: {text}
    </p>
  )
}
