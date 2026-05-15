import { createPortal } from 'react-dom'

export type BusyModalProps = {
  open: boolean
  title: string
  message?: string
}

export function BusyModal({ open, title, message }: BusyModalProps) {
  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className="modal-backdrop busy-modal-backdrop" role="presentation">
      <div
        className="modal-dialog panel busy-modal-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-busy="true"
        aria-labelledby="busy-modal-title"
        aria-describedby={message ? 'busy-modal-message' : undefined}
      >
        <div className="busy-modal-spinner" aria-hidden="true" />
        <h2 id="busy-modal-title">{title}</h2>
        {message ? (
          <p id="busy-modal-message" className="muted busy-modal-message">
            {message}
          </p>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}

/** Let the browser paint the modal before starting heavy async work. */
export function waitForModalPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })
}
