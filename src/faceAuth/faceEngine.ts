import * as faceapi from '@vladmandic/face-api'

let modelsLoaded = false
let modelsLoading: Promise<void> | null = null
let tfBackendReady: Promise<void> | null = null

const DETECTOR = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })
const DETECT_MAX_WIDTH = 320

function resolveModelBase(): string {
  const base = import.meta.env.BASE_URL || '/'
  const rel = `${base.endsWith('/') ? base : `${base}/`}models/face-api`
  if (typeof window !== 'undefined' && window.location?.href) {
    try {
      return new URL(rel, window.location.href).href.replace(/\/?$/, '')
    } catch {
      /* fall through */
    }
  }
  return rel.replace(/\/?$/, '')
}

type TfRuntime = {
  setBackend: (name: string) => Promise<boolean>
  ready: () => Promise<void>
}

async function ensureTfBackend(): Promise<void> {
  if (tfBackendReady) return tfBackendReady
  const tf = faceapi.tf as unknown as TfRuntime
  const backends = ['webgl', 'wasm', 'cpu']
  tfBackendReady = (async () => {
    let lastErr: unknown
    for (const name of backends) {
      try {
        const ok = await tf.setBackend(name)
        if (!ok) continue
        await tf.ready()
        return
      } catch (e) {
        lastErr = e
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('TensorFlow.js backend failed to start')
  })()
  return tfBackendReady
}

function videoFrameCanvas(video: HTMLVideoElement): HTMLCanvasElement {
  const vw = video.videoWidth || 640
  const vh = video.videoHeight || 480
  const scale = Math.min(1, DETECT_MAX_WIDTH / vw)
  const w = Math.max(1, Math.round(vw * scale))
  const h = Math.max(1, Math.round(vh * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas not available')
  ctx.drawImage(video, 0, 0, w, h)
  return canvas
}

export async function ensureFaceModels(): Promise<void> {
  if (modelsLoaded) return
  if (!modelsLoading) {
    const modelBase = resolveModelBase()
    modelsLoading = (async () => {
      await ensureTfBackend()
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(modelBase),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri(modelBase),
        faceapi.nets.faceRecognitionNet.loadFromUri(modelBase),
      ])
      modelsLoaded = true
    })().catch((e) => {
      modelsLoading = null
      tfBackendReady = null
      throw e
    })
  }
  await modelsLoading
}

async function embeddingFromVideoFrame(video: HTMLVideoElement): Promise<number[] | null> {
  await ensureFaceModels()
  const frame = videoFrameCanvas(video)
  const det = await faceapi
    .detectSingleFace(frame, DETECTOR)
    .withFaceLandmarks(true)
    .withFaceDescriptor()
  if (!det?.descriptor) return null
  return Array.from(det.descriptor)
}

export async function embeddingFromVideo(video: HTMLVideoElement): Promise<number[] | null> {
  return embeddingFromVideoFrame(video)
}

export async function collectFaceSamples(
  video: HTMLVideoElement,
  count: number,
  intervalMs: number,
): Promise<number[][]> {
  const samples: number[][] = []
  for (let i = 0; i < count; i++) {
    const emb = await embeddingFromVideoFrame(video)
    if (emb) samples.push(emb)
    if (i < count - 1 && intervalMs > 0) {
      await new Promise((r) => window.setTimeout(r, intervalMs))
    }
  }
  return samples
}
