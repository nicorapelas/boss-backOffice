/** Must match server `POS_FACE_LOGIN_CONSENT_VERSION`. */
export const POS_FACE_LOGIN_CONSENT_VERSION = 'pos-face-login-v1'

/** Must match server `STAFF_FACE_ENROLLMENT_CONSENT_VERSION`. */
export const STAFF_FACE_ENROLLMENT_CONSENT_VERSION = 'staff-face-enroll-v1'

export const POS_FACE_LOGIN_LIMITATIONS = [
  'Requires a working webcam on each till and good lighting; poor conditions cause failed sign-ins.',
  'Face login needs the till online — badge scan remains the offline fallback.',
  'Each staff member must be enrolled individually under Users before they can sign in with face.',
  'Biometric templates are stored on your server; you are responsible for lawful use under POPIA and internal policy.',
  'Similar-looking people or photos may occasionally match — use badge login when in doubt.',
  'Changing staff appearance (beard, glasses, etc.) may require re-enrollment.',
] as const

export const STAFF_FACE_ENROLLMENT_POINTS = [
  'A mathematical face template (not a photo) is stored on your server for POS sign-in.',
  'Only enroll staff who have been told what this is for and agree to biometric capture for work login.',
  'They can still use badge login if face sign-in fails or the till is offline.',
  'Enrollment can be removed at any time from this user card.',
] as const
