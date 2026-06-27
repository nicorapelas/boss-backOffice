import { useEffect, useRef, useState, type DragEvent } from 'react'
import {
  deleteStoreIdleImage,
  fetchStoreIdleImageObjectUrl,
  uploadStoreIdleImage,
} from '../api/client'

const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif'

type IdleImageUploadProps = {
  idleImageRevision: number
  externalImageUrl: string
  disabled?: boolean
  onUploaded: (idleImageRevision: number) => void
  onRemoved: () => void
  onExternalUrlChange: (url: string) => void
}

export function IdleImageUpload({
  idleImageRevision,
  externalImageUrl,
  disabled = false,
  onUploaded,
  onRemoved,
  onExternalUrlChange,
}: IdleImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const localPreviewRef = useRef<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null)
  const [uploadedPreviewUrl, setUploadedPreviewUrl] = useState<string | null>(null)

  const hasUpload = idleImageRevision > 0
  const previewUrl =
    localPreviewUrl ?? uploadedPreviewUrl ?? (hasUpload ? null : externalImageUrl.trim() || null)

  useEffect(() => {
    if (idleImageRevision < 1) {
      setUploadedPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
      return
    }
    let cancelled = false
    void fetchStoreIdleImageObjectUrl(idleImageRevision)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url)
          return
        }
        setUploadedPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev)
          return url
        })
        if (localPreviewRef.current) {
          URL.revokeObjectURL(localPreviewRef.current)
          localPreviewRef.current = null
        }
        setLocalPreviewUrl(null)
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not load preview')
        }
      })
    return () => {
      cancelled = true
    }
  }, [idleImageRevision])

  useEffect(() => {
    return () => {
      if (localPreviewRef.current) {
        URL.revokeObjectURL(localPreviewRef.current)
        localPreviewRef.current = null
      }
      setUploadedPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
    }
  }, [])

  function setLocalPreview(file: File) {
    if (localPreviewRef.current) {
      URL.revokeObjectURL(localPreviewRef.current)
    }
    const url = URL.createObjectURL(file)
    localPreviewRef.current = url
    setLocalPreviewUrl(url)
  }

  async function handleFile(file: File | null | undefined) {
    if (!file || disabled || busy) return
    setError(null)
    setLocalPreview(file)
    setBusy(true)
    try {
      const result = await uploadStoreIdleImage(file)
      onUploaded(result.idleImageRevision)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
      if (localPreviewRef.current) {
        URL.revokeObjectURL(localPreviewRef.current)
        localPreviewRef.current = null
      }
      setLocalPreviewUrl(null)
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault()
    if (!disabled && !busy) setDragOver(true)
  }

  function onDragLeave(e: DragEvent) {
    e.preventDefault()
    setDragOver(false)
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    if (disabled || busy) return
    const file = e.dataTransfer.files?.[0]
    void handleFile(file)
  }

  async function onRemoveUpload() {
    if (!hasUpload || disabled || busy) return
    setError(null)
    setBusy(true)
    try {
      await deleteStoreIdleImage()
      if (localPreviewRef.current) {
        URL.revokeObjectURL(localPreviewRef.current)
        localPreviewRef.current = null
      }
      setLocalPreviewUrl(null)
      setUploadedPreviewUrl(null)
      onRemoved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove image')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="idle-image-upload stack form-grid__full">
      <span className="idle-image-upload-label">Idle image (optional)</span>
      <div
        className={`idle-image-dropzone${dragOver ? ' idle-image-dropzone--over' : ''}${disabled ? ' idle-image-dropzone--disabled' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => {
          if (!disabled && !busy) inputRef.current?.click()
        }}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            if (!disabled && !busy) inputRef.current?.click()
          }
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="idle-image-dropzone-input"
          disabled={disabled || busy}
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
        {previewUrl ? (
          <img src={previewUrl} alt="" className="idle-image-dropzone-preview" />
        ) : hasUpload && !error ? (
          <p className="muted">Loading preview…</p>
        ) : (
          <div className="idle-image-dropzone-placeholder">
            <strong>Drop image here</strong>
            <span className="muted">or click to browse</span>
            <span className="muted small">JPEG, PNG, WebP or GIF · max 12 MB</span>
          </div>
        )}
        {busy ? <p className="idle-image-dropzone-busy muted">Uploading…</p> : null}
      </div>

      {hasUpload ? (
        <div className="idle-image-upload-actions">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={disabled || busy}
            onClick={(e) => {
              e.stopPropagation()
              void onRemoveUpload()
            }}
          >
            Remove uploaded image
          </button>
          <p className="muted small">Shown on the POS customer display when logged out.</p>
        </div>
      ) : (
        <label className="stack">
          Or paste external image URL
          <input
            value={externalImageUrl}
            onChange={(e) => onExternalUrlChange(e.target.value)}
            disabled={disabled}
            placeholder="https://example.com/banner.jpg"
          />
        </label>
      )}

      {error ? <p className="error">{error}</p> : null}
    </div>
  )
}
