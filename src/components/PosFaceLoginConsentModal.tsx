import { ConsentModal } from './ConsentModal'
import { POS_FACE_LOGIN_CONSENT_VERSION, POS_FACE_LOGIN_LIMITATIONS } from '../faceAuth/faceConsentCopy'

type PosFaceLoginConsentModalProps = {
  open: boolean
  busy?: boolean
  onAccept: () => void
  onCancel: () => void
}

export function PosFaceLoginConsentModal({ open, busy, onAccept, onCancel }: PosFaceLoginConsentModalProps) {
  return (
    <ConsentModal
      open={open}
      busy={busy}
      title="Enable face login at tills?"
      subtitle="Please read these limitations before enabling face recognition for POS staff sign-in."
      bullets={POS_FACE_LOGIN_LIMITATIONS}
      checkboxLabel="I understand these limitations and accept responsibility for enabling face login at this store."
      confirmLabel="Accept and enable face login"
      onConfirm={onAccept}
      onCancel={onCancel}
    />
  )
}

export { POS_FACE_LOGIN_CONSENT_VERSION }
