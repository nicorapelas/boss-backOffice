import { useCallback, useEffect, useRef, useState } from 'react'

export type FaceCameraStatus = 'off' | 'requesting' | 'live' | 'error'

export function useFaceCamera(enabled: boolean) {
  const streamRef = useRef<MediaStream | null>(null)
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null)
  const [status, setStatus] = useState<FaceCameraStatus>('off')
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [streamTick, setStreamTick] = useState(0)

  const setVideoRef = useCallback((node: HTMLVideoElement | null) => {
    setVideoEl(node)
  }, [])

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoEl) videoEl.srcObject = null
    setReady(false)
    setStatus('off')
  }, [videoEl])

  const startCamera = useCallback(async () => {
    if (!enabled) return
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera API is not available in this window')
      setStatus('error')
      return
    }
    setError(null)
    setReady(false)
    setStatus('requesting')
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      })
      streamRef.current = stream
      setStreamTick((n) => n + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not access camera')
      setStatus('error')
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      stop()
      setError(null)
      return
    }
    void startCamera()
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      if (videoEl) videoEl.srcObject = null
      setReady(false)
      setStatus('off')
    }
  }, [enabled, startCamera, stop, videoEl])

  useEffect(() => {
    const stream = streamRef.current
    if (!enabled || !videoEl || !stream) return

    let cancelled = false
    setStatus('requesting')
    videoEl.srcObject = stream
    void videoEl
      .play()
      .then(() => {
        if (!cancelled) {
          setReady(true)
          setStatus('live')
          setError(null)
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not start video preview')
          setStatus('error')
          setReady(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [enabled, videoEl, streamTick])

  return { setVideoRef, videoEl, ready, error, status, retry: startCamera, stop }
}
