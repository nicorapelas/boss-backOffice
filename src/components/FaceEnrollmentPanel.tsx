import { useCallback, useEffect, useState } from 'react'
import { collectFaceSamples, ensureFaceModels } from '../faceAuth/faceEngine'
import { useFaceCamera } from '../faceAuth/useFaceCamera'
import { ConsentRecordedNote } from './ConsentModal'
import { StaffFaceConsentModal } from './StaffFaceConsentModal'

type FaceEnrollmentPanelProps = {
  userLabel: string
  hasEnrollment: boolean
  consentRecordedAt?: string | null
  busy: boolean
  onEnroll: (samples: number[][]) => Promise<void>
  onRemove: () => Promise<void>
}

export function FaceEnrollmentPanel({
  userLabel,
  hasEnrollment,
  consentRecordedAt,
  busy,
  onEnroll,
  onRemove,
}: FaceEnrollmentPanelProps) {
  const [consentModalOpen, setConsentModalOpen] = useState(false)
  const [sessionConsent, setSessionConsent] = useState(false)
  const [open, setOpen] = useState(false)
  const { setVideoRef, videoEl, ready, error: cameraError, retry } = useFaceCamera(open)
  const [modelsReady, setModelsReady] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [localBusy, setLocalBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void ensureFaceModels()
      .then(() => {
        if (!cancelled) setModelsReady(true)
      })
      .catch((e) => {
        if (!cancelled) setStatus(e instanceof Error ? e.message : 'Failed to load face models')
      })
    return () => {
      cancelled = true
      setModelsReady(false)
    }
  }, [open])

  const closeCamera = useCallback(() => {
    setOpen(false)
    setSessionConsent(false)
    setStatus(null)
  }, [])

  const requestEnroll = useCallback(() => {
    setConsentModalOpen(true)
  }, [])

  const onConsentConfirmed = useCallback(() => {
    setConsentModalOpen(false)
    setSessionConsent(true)
    setOpen(true)
    setStatus(null)
  }, [])

  const runEnroll = useCallback(async () => {
    const video = videoEl
    if (!video || !ready || !modelsReady || !sessionConsent) return
    setLocalBusy(true)
    setStatus('Hold still — capturing…')
    try {
      const samples = await collectFaceSamples(video, 3, 200)
      if (samples.length < 2) {
        setStatus('Need a clear face — capture at least 2 samples. Try again.')
        return
      }
      await onEnroll(samples)
      setStatus('Face enrolled.')
      closeCamera()
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Enrollment failed')
    } finally {
      setLocalBusy(false)
    }
  }, [videoEl, ready, modelsReady, sessionConsent, onEnroll, closeCamera])

  const disabled = busy || localBusy

  return (
    <div className="face-enrollment-panel">
      <StaffFaceConsentModal
        open={consentModalOpen}
        staffName={userLabel}
        busy={disabled}
        onConfirm={onConsentConfirmed}
        onCancel={() => setConsentModalOpen(false)}
      />
      <p className="muted small">
        {userLabel}
        {hasEnrollment ? (
          <>
            {' '}
            · <strong>Face enrolled</strong>
          </>
        ) : (
          ' · No face on file'
        )}
      </p>
      <ConsentRecordedNote label="Consent recorded" recordedAt={consentRecordedAt} />
      <div className="face-enrollment-actions">
        <button
          type="button"
          className="btn ghost small"
          disabled={disabled}
          onClick={() => {
            if (open) closeCamera()
            else requestEnroll()
          }}
        >
          {open ? 'Close camera' : hasEnrollment ? 'Re-enroll face' : 'Enroll face'}
        </button>
        {hasEnrollment ? (
          <button
            type="button"
            className="btn ghost small"
            disabled={disabled}
            onClick={() => void onRemove().then(() => setStatus('Face enrollment removed'))}
          >
            Remove face
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="face-enrollment-camera">
          <video
            ref={setVideoRef}
            className="face-login-video"
            playsInline
            muted
            autoPlay
            aria-label="Webcam for enrollment"
          />
          {cameraError ? (
            <>
              <p className="error">{cameraError}</p>
              <button type="button" className="btn ghost small" disabled={disabled} onClick={() => void retry()}>
                Retry camera
              </button>
            </>
          ) : null}
          {sessionConsent ? (
            <p className="muted small">Staff consent recorded for this session.</p>
          ) : null}
          {status ? <p className="muted small">{status}</p> : null}
          <button
            type="button"
            className="btn primary small"
            disabled={disabled || !ready || !modelsReady || !sessionConsent}
            onClick={() => void runEnroll()}
          >
            {localBusy ? 'Capturing…' : 'Save face enrollment'}
          </button>
        </div>
      ) : null}
    </div>
  )
}
