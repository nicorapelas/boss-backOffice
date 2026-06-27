import { app, BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs/promises'
import { registerAuthIpc } from './auth-storage'
import { registerLabelIpc } from './label-storage'
import {
  buildGapCalibrateTspl,
  buildLabelFontTestPrintPackage,
  buildProductLabelPrintPackage,
  buildStaffBadgeTspl,
  executeLabelPrint,
  sendRawToPrinter,
  type LabelPrintPresetId,
  type LabelPrinterTransport,
  type ProductLabelLayout,
  type ProductLabelPayload,
  type ProductLabelTemplate,
} from './bo-label-printer'

const LABEL_PRINT_PRESET_IDS: readonly LabelPrintPresetId[] = [
  'compactRetail',
  'compact40x16',
  'priceFocus',
  'priceFocusSku',
  'barcodeFocus',
  'minimal',
]

function parsePresetId(raw: unknown): LabelPrintPresetId | undefined {
  if (typeof raw !== 'string') return undefined
  return LABEL_PRINT_PRESET_IDS.includes(raw as LabelPrintPresetId) ? (raw as LabelPrintPresetId) : undefined
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

registerAuthIpc()
registerLabelIpc()

ipcMain.handle('app:quit', () => {
  app.quit()
})

ipcMain.handle('app:minimize', (event) => {
  const w = BrowserWindow.fromWebContents(event.sender)
  if (w && !w.isDestroyed()) w.minimize()
})

ipcMain.handle('app:toggle-maximize', (event) => {
  const w = BrowserWindow.fromWebContents(event.sender)
  if (!w || w.isDestroyed()) return false
  if (w.isMaximized()) {
    w.unmaximize()
    return false
  }
  w.maximize()
  return true
})

ipcMain.handle('app:is-maximized', (event) => {
  const w = BrowserWindow.fromWebContents(event.sender)
  if (!w || w.isDestroyed()) return false
  return w.isMaximized()
})

async function detectUsbTransport(excludePaths: string[] = []): Promise<{
  transport?: LabelPrinterTransport
  candidates: string[]
  error?: string
}> {
  if (process.platform !== 'linux') {
    return { candidates: [], error: 'USB auto-detect is currently supported on Linux only.' }
  }
  const excluded = new Set(excludePaths.map((p) => p.trim()).filter(Boolean))
  const roots = ['/dev/usb', '/dev']
  const found = new Set<string>()
  for (const root of roots) {
    try {
      const names = await fs.readdir(root)
      for (const name of names) {
        if (name.startsWith('lp')) {
          found.add(path.join(root, name))
        }
      }
    } catch {
      // ignore missing/unreadable root
    }
  }
  const candidates = [...found].sort((a, b) => a.localeCompare(b))
  for (const p of candidates) {
    if (excluded.has(p)) continue
    try {
      const st = await fs.stat(p)
      if (!st.isCharacterDevice()) continue
      await fs.access(p, fs.constants.W_OK)
      return { transport: { kind: 'usb', path: p }, candidates }
    } catch {
      // try next candidate
    }
  }
  return {
    candidates,
    error: candidates.length
      ? `Found USB printer devices, but none are writable. On Linux, add your user to the lp group (sudo usermod -aG lp $USER), then sign out and back in. Candidates: ${candidates.join(', ')}`
      : 'No USB printer device found under /dev/usb/lp* or /dev/lp*.',
  }
}

function parseTransport(raw: unknown): LabelPrinterTransport | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (r.kind === 'usb' && typeof r.path === 'string' && r.path.length > 0) return { kind: 'usb', path: r.path }
  if (
    r.kind === 'lan' &&
    typeof r.host === 'string' &&
    r.host.length > 0 &&
    typeof r.port === 'number' &&
    Number.isFinite(r.port) &&
    r.port > 0
  ) {
    return { kind: 'lan', host: r.host, port: r.port }
  }
  return null
}

function parseLabel(raw: unknown): ProductLabelPayload | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (
    typeof r.name !== 'string' ||
    typeof r.sku !== 'string' ||
    typeof r.barcodeValue !== 'string' ||
    typeof r.price !== 'number'
  ) {
    return null
  }
  return {
    name: r.name,
    sku: r.sku,
    barcodeValue: r.barcodeValue,
    price: r.price,
  }
}

function parseLayout(raw: unknown): ProductLabelLayout | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const widthMm = typeof r.widthMm === 'number' && Number.isFinite(r.widthMm) ? r.widthMm : undefined
  const heightMm = typeof r.heightMm === 'number' && Number.isFinite(r.heightMm) ? r.heightMm : undefined
  const gapMm = typeof r.gapMm === 'number' && Number.isFinite(r.gapMm) ? r.gapMm : undefined
  if (widthMm == null || heightMm == null || gapMm == null) return undefined
  if (widthMm <= 0 || heightMm <= 0 || gapMm < 0) return undefined
  const layout: ProductLabelLayout = { widthMm, heightMm, gapMm }
  if (typeof r.gapOffsetMm === 'number' && Number.isFinite(r.gapOffsetMm)) {
    layout.gapOffsetMm = r.gapOffsetMm
  }
  if (typeof r.feedOffsetDots === 'number' && Number.isFinite(r.feedOffsetDots)) {
    layout.feedOffsetDots = Math.round(r.feedOffsetDots)
  }
  if (typeof r.minimizePostPrintFeed === 'boolean') {
    layout.minimizePostPrintFeed = r.minimizePostPrintFeed
  }
  if (typeof r.gapDetectEachJob === 'boolean') {
    layout.gapDetectEachJob = r.gapDetectEachJob
  }
  if (typeof r.advanceHeightMm === 'number' && Number.isFinite(r.advanceHeightMm) && r.advanceHeightMm > 0) {
    layout.advanceHeightMm = r.advanceHeightMm
  }
  if (r.smallLabelFontMode === 'bitmap' || r.smallLabelFontMode === 'builtin' || r.smallLabelFontMode === 'dejavu') {
    layout.smallLabelFontMode = r.smallLabelFontMode
  }
  return layout
}

function parseTemplate(raw: unknown): ProductLabelTemplate | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const num = (k: string): number | undefined => {
    const v = r[k]
    if (typeof v !== 'number' || !Number.isFinite(v)) return undefined
    if (v < 0) return undefined
    return Math.floor(v)
  }
  const nameX = num('nameX')
  const nameY = num('nameY')
  const skuX = num('skuX')
  const skuY = num('skuY')
  const priceX = num('priceX')
  const priceY = num('priceY')
  const barcodeX = num('barcodeX')
  const barcodeY = num('barcodeY')
  const barcodeHeight = num('barcodeHeight')
  const barcodeTextX = num('barcodeTextX')
  const barcodeTextY = num('barcodeTextY')
  if (
    nameX == null ||
    nameY == null ||
    skuX == null ||
    skuY == null ||
    priceX == null ||
    priceY == null ||
    barcodeX == null ||
    barcodeY == null ||
    barcodeHeight == null ||
    barcodeTextX == null ||
    barcodeTextY == null
  ) {
    return undefined
  }
  return {
    nameX,
    nameY,
    skuX,
    skuY,
    priceX,
    priceY,
    barcodeX,
    barcodeY,
    barcodeHeight,
    barcodeTextX,
    barcodeTextY,
  }
}

ipcMain.handle(
  'bo:label:print',
  async (
    _evt,
    args:
      | {
          transport: unknown
          label: unknown
          copies?: unknown
          layout?: unknown
          template?: unknown
          presetId?: unknown
        }
      | undefined,
  ) => {
    try {
      const transport = parseTransport(args?.transport)
      if (!transport) return { ok: false, error: 'Invalid label printer transport' }
      const label = parseLabel(args?.label)
      if (!label) return { ok: false, error: 'Invalid label payload' }
      const copies = typeof args?.copies === 'number' && Number.isFinite(args.copies) ? args.copies : 1
      const layout = parseLayout(args?.layout)
      const template = parseTemplate(args?.template)
      const presetId = parsePresetId(args?.presetId)
      const pkg = await buildProductLabelPrintPackage(
        label,
        { copies, layout, template, presetId },
        transport,
      )
      await executeLabelPrint(transport, pkg)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Label print failed' }
    }
  },
)

function parseStaffBadge(raw: unknown): { displayName: string; badgeCode: string; roleName?: string } | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.badgeCode !== 'string' || !r.badgeCode.trim()) return null
  const displayName = typeof r.displayName === 'string' ? r.displayName.trim() : ''
  const roleName = typeof r.roleName === 'string' && r.roleName.trim() ? r.roleName.trim() : undefined
  return {
    badgeCode: r.badgeCode.trim(),
    displayName: displayName || 'Staff',
    roleName,
  }
}

ipcMain.handle(
  'bo:label:print-staff-badge',
  async (
    _evt,
    args:
      | {
          transport: unknown
          badge: unknown
          copies?: unknown
          layout?: unknown
        }
      | undefined,
  ) => {
    try {
      const transport = parseTransport(args?.transport)
      if (!transport) return { ok: false, error: 'Invalid label printer transport' }
      const badge = parseStaffBadge(args?.badge)
      if (!badge) return { ok: false, error: 'Invalid staff badge payload' }
      const copies = typeof args?.copies === 'number' && Number.isFinite(args.copies) ? args.copies : 1
      const layout = parseLayout(args?.layout)
      const bytes = buildStaffBadgeTspl(badge, { copies, layout })
      await sendRawToPrinter(transport, bytes)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Staff badge print failed' }
    }
  },
)

ipcMain.handle(
  'bo:label:print-font-test',
  async (
    _evt,
    args:
      | {
          transport: unknown
          copies?: unknown
          layout?: unknown
        }
      | undefined,
  ) => {
    try {
      const transport = parseTransport(args?.transport)
      if (!transport) return { ok: false, error: 'Invalid label printer transport' }
      const copies = typeof args?.copies === 'number' && Number.isFinite(args.copies) ? args.copies : 1
      const layout = parseLayout(args?.layout)
      const pkg = await buildLabelFontTestPrintPackage({ copies, layout }, transport)
      await executeLabelPrint(transport, pkg)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Font test label failed' }
    }
  },
)

ipcMain.handle(
  'bo:label:calibrate-gap',
  async (_evt, args?: { transport: unknown; layout?: unknown } | undefined) => {
    try {
      const transport = parseTransport(args?.transport)
      if (!transport) return { ok: false, error: 'Invalid label printer transport' }
      const layout = parseLayout(args?.layout)
      if (!layout) return { ok: false, error: 'Invalid label layout' }
      const bytes = buildGapCalibrateTspl(layout)
      await sendRawToPrinter(transport, bytes)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Gap calibration failed' }
    }
  },
)

ipcMain.handle('bo:label:detect-transport', async (_evt, args?: { excludePaths?: unknown }) => {
  try {
    const excludePaths = Array.isArray(args?.excludePaths)
      ? args.excludePaths.filter((p): p is string => typeof p === 'string')
      : []
    const detected = await detectUsbTransport(excludePaths)
    return { ok: true, ...detected }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Transport detection failed', candidates: [] as string[] }
  }
})

let win: BrowserWindow | null

/** Native title bar hidden; keep standard controls where Electron supports them. */
function browserShellWindowOptions(): Partial<Electron.BrowserWindowConstructorOptions> {
  const opts: Partial<Electron.BrowserWindowConstructorOptions> = {
    frame: false,
  }
  if (process.platform === 'darwin') {
    opts.titleBarStyle = 'hidden'
    opts.trafficLightPosition = { x: 14, y: 14 }
  } else if (process.platform === 'win32') {
    opts.titleBarOverlay = {
      color: '#161616',
      symbolColor: '#ececec',
      height: 40,
    }
  }
  return opts
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 560,
    icon: path.join(process.env.APP_ROOT, 'src/assets/logo-text_bottom1-dark.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
    ...browserShellWindowOptions(),
  })

  const mainWin = win
  mainWin.on('maximize', () => {
    if (!mainWin.isDestroyed()) mainWin.webContents.send('app:maximized-changed', true)
  })
  mainWin.on('unmaximize', () => {
    if (!mainWin.isDestroyed()) mainWin.webContents.send('app:maximized-changed', false)
  })

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(createWindow)
