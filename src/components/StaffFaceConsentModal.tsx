import { ConsentModal } from './ConsentModal'
import {
  STAFF_FACE_ENROLLMENT_CONSENT_VERSION,
  STAFF_FACE_ENROLLMENT_POINTS,
} from '../faceAuth/faceConsentCopy'

type StaffFaceConsentModalProps = {
  open: boolean
  staffName: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function StaffFaceConsentModal({
  open,
  staffName,
  busy,
  onConfirm,
  onCancel,
}: StaffFaceConsentModalProps) {
  return (
    <ConsentModal
      open={open}
      busy={busy}
      title="Staff consent for face enrollment"
      subtitle={`Before capturing ${staffName}’s face, confirm they have been informed and agree.`}
      bullets={STAFF_FACE_ENROLLMENT_POINTS}
      checkboxLabel={`I confirm that ${staffName} has been informed and consents to face capture for POS login at this store.`}
      confirmLabel="Record consent and continue"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}

export { STAFF_FACE_ENROLLMENT_CONSENT_VERSION }
