import fs from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import net from 'node:net'
import {
  bundledLabelFontsAvailable,
  resolveSmallLabelFontMode,
  smallLabelTtfBlocks,
  transportKey,
  ttfInstalledPrinters,
  type SmallLabelFontMode,
} from './bo-label-ttf'

export type LabelPrinterTransport =
  | { kind: 'usb'; path: string }
  | { kind: 'lan'; host: string; port: number }

export type ProductLabelPayload = {
  name: string
  sku: string
  barcodeValue: string
  price: number
}

export type ProductLabelLayout = {
  widthMm: number
  heightMm: number
  gapMm: number
  /** Second parameter to GAP — fine-tunes gap-sensor position (mm). */
  gapOffsetMm?: number
  /** TSC OFFSET in dots (8 dots/mm @ 203dpi). Negative = less paper after print. */
  feedOffsetDots?: number
  /** Send SET TEAR OFF / SET PEEL OFF to reduce post-print feed. */
  minimizePostPrintFeed?: boolean
  /** Run GAPDETECT before each job so the sensor re-finds the label edge (fixes drift). */
  gapDetectEachJob?: boolean
  /** SIZE feed pitch override (mm). Lower slightly if 2nd+ labels drift upward. */
  advanceHeightMm?: number
  /** Small-label text rendering: dejavu (smooth TTF), builtin (TSC font 0), or bitmap (fonts 1–8). */
  smallLabelFontMode?: SmallLabelFontMode
}

export type ProductLabelTemplate = {
  nameX: number
  nameY: number
  skuX: number
  skuY: number
  priceX: number
  priceY: number
  barcodeX: number
  barcodeY: number
  barcodeHeight: number
  barcodeTextX: number
  barcodeTextY: number
}

function sanitizeText(input: string): string {
  return input.replace(/"/g, "'").replace(/\r?\n/g, ' ').trim()
}

function clip(input: string, max: number): string {
  if (input.length <= max) return input
  return `${input.slice(0, Math.max(1, max - 1))}…`
}

function isSmallLabelStock(layout: ProductLabelLayout): boolean {
  return layout.heightMm <= 18 || (layout.widthMm <= 42 && layout.heightMm <= 20)
}

function effectiveAdvanceHeightMm(layout: ProductLabelLayout): number {
  const h = layout.advanceHeightMm ?? layout.heightMm
  return h > 0 ? h : layout.heightMm
}

function tsplJobHeader(layout: ProductLabelLayout): string[] {
  const gapOff = layout.gapOffsetMm ?? 0
  const sizeH = effectiveAdvanceHeightMm(layout)
  const lines = [
    `SIZE ${layout.widthMm} mm,${sizeH} mm`,
    `GAP ${layout.gapMm} mm,${gapOff} mm`,
    'DIRECTION 1',
    'REFERENCE 0,0',
  ]
  if (layout.minimizePostPrintFeed) {
    lines.push('SET TEAR OFF', 'SET PEEL OFF')
  } else {
    lines.push('SET TEAR ON')
  }
  const feedOff = layout.feedOffsetDots ?? 0
  if (feedOff !== 0) {
    lines.push(`OFFSET ${Math.round(feedOff)}`)
  }
  lines.push('CLS')
  return lines
}

/** One-shot gap learn — use Calibrate button, not every print (causes drift on batches). */
export function buildGapCalibrateTspl(layout: ProductLabelLayout): Buffer {
  const sizeH = effectiveAdvanceHeightMm(layout)
  const gapOff = layout.gapOffsetMm ?? 0
  const lines = [
    `SIZE ${layout.widthMm} mm,${sizeH} mm`,
    `GAP ${layout.gapMm} mm,${gapOff} mm`,
    'GAPDETECT',
    '',
  ]
  return Buffer.from(lines.join('\n'), 'utf8')
}

/** When set, applies preset-specific TSPL (fonts / order). Omit for custom templates. */
export type LabelPrintPresetId =
  | 'compactRetail'
  | 'compact40x16'
  | 'priceFocus'
  | 'priceFocusSku'
  | 'barcodeFocus'
  | 'minimal'

export function buildProductLabelTspl(
  payload: ProductLabelPayload,
  opts?: {
    layout?: ProductLabelLayout
    template?: ProductLabelTemplate
    copies?: number
    presetId?: LabelPrintPresetId
    smallLabelFontMode?: SmallLabelFontMode
  },
): Buffer {
  const layout = opts?.layout ?? { widthMm: 55, heightMm: 24, gapMm: 4 }
  const tpl = opts?.template ?? {
    nameX: 14,
    nameY: 36,
    skuX: 14,
    skuY: 66,
    priceX: 300,
    priceY: 36,
    barcodeX: 14,
    barcodeY: 96,
    barcodeHeight: 42,
    barcodeTextX: 14,
    barcodeTextY: 142,
  }
  const copies = Math.max(1, Math.min(100, Math.floor(opts?.copies ?? 1)))

  const name = clip(sanitizeText(payload.name || ''), 22) || 'Item'
  const sku = clip(sanitizeText(payload.sku || ''), 24) || 'SKU-NA'
  const barcode = clip(sanitizeText(payload.barcodeValue || payload.sku || ''), 40) || sku
  const price = Number.isFinite(payload.price) ? payload.price.toFixed(2) : '0.00'
  const priceText = `R${price}`
  const labelWidthDots = Math.max(1, Math.floor(layout.widthMm * 8))
  const labelHeightDots = Math.max(1, Math.floor(layout.heightMm * 8))

  /** 40×16 mm and similar — too short for 55×24 preset coordinates. */
  const smallStock = isSmallLabelStock(layout)

  function estimateCode128WidthDots(data: string, moduleWidthDots: number): number {
    // Centering estimate for CODE128:
    // Numeric payloads are usually encoded with subset C (2 digits per symbol),
    // which is much narrower than 1-char-per-symbol text encoding.
    const digitsOnly = /^[0-9]+$/.test(data)
    const dataSymbols = digitsOnly ? Math.ceil(data.length / 2) : data.length
    // data symbols + start + checksum + stop
    const symbols = Math.max(1, dataSymbols + 3)
    // Code128 uses ~11 modules per regular symbol, plus a wider stop pattern.
    const modules = symbols * 11 + 13
    const quiet = 20
    return modules * moduleWidthDots + quiet
  }

  function centerX(estimatedWidth: number): number {
    return Math.max(0, Math.floor((labelWidthDots - estimatedWidth) / 2))
  }

  // Tuned for 203dpi TSC 55x24mm stock.
  // Use larger built-in fonts (3/2) since font "0" renders too tiny on this model.
  const header = tsplJobHeader(layout)

  let body: string[]

  if (opts?.presetId === 'priceFocus' || opts?.presetId === 'priceFocusSku' || opts?.presetId === 'compact40x16') {
    // Price focus (requested):
    // - Line 1: product name (very small) centered
    // - Line 2: price (large + bold) centered
    // - Line 3: barcode centered (bars + digits)
    const barcodeModuleWidth = 2
    const barcodeWidthEstimate = estimateCode128WidthDots(barcode, barcodeModuleWidth)
    // Allow preset/template fine-tune while keeping centered as baseline.
    const barcodeX = Math.max(0, centerX(barcodeWidthEstimate) + tpl.barcodeX)
    const nameTiny = clip(name, 30)
    const skuTiny = clip(sanitizeText(sku || ''), 28) || 'SKU-NA'
    // Keep name clearly above price even if saved coordinates overlap.
    const safeNameY = Math.max(0, Math.min(tpl.nameY, tpl.priceY - 22))
    if (opts.presetId === 'priceFocusSku' && smallStock) {
      const nameTiny = clip(name, 18)
      const skuTiny = clip(sku, 16)
      const fontMode = resolveSmallLabelFontMode(
        opts.smallLabelFontMode ?? layout.smallLabelFontMode,
        true,
      )
      body = smallLabelTtfBlocks({
        labelWidthDots,
        labelHeightDots,
        name: nameTiny,
        priceText,
        sku: skuTiny,
        fontMode,
      })
    } else if (opts.presetId === 'priceFocusSku') {
      body = [
        `BLOCK 0,${safeNameY},${labelWidthDots},20,"2",0,1,1,0,2,"${nameTiny}"`,
        `BLOCK 0,${tpl.priceY},${labelWidthDots},48,"3",0,2,2,0,2,"${priceText}"`,
        `BLOCK 1,${tpl.priceY},${labelWidthDots},48,"3",0,2,2,0,2,"${priceText}"`,
        `BLOCK 0,${tpl.skuY},${labelWidthDots},28,"2",0,1,1,0,2,"${skuTiny}"`,
      ]
    } else if (opts.presetId === 'compact40x16') {
      const barcodeModuleWidth = 1
      const barcodeWidthEstimate = estimateCode128WidthDots(barcode, barcodeModuleWidth)
      const barcodeX = Math.max(0, centerX(barcodeWidthEstimate) + tpl.barcodeX)
      const nameTiny = clip(name, 18)
      body = [
        `BLOCK 0,${tpl.nameY},${labelWidthDots},16,"1",0,1,1,0,2,"${nameTiny}"`,
        `BLOCK 0,${tpl.priceY},${labelWidthDots},32,"2",0,1,1,0,2,"${priceText}"`,
        `BARCODE ${barcodeX},${tpl.barcodeY},"128",${tpl.barcodeHeight},0,0,${barcodeModuleWidth},${barcodeModuleWidth},"${barcode}"`,
        `BLOCK 0,${tpl.barcodeTextY},${labelWidthDots},20,"1",0,1,1,0,2,"${clip(barcode, 16)}"`,
      ]
    } else {
      body = [
        `BLOCK 0,${safeNameY},${labelWidthDots},20,"2",0,1,1,0,2,"${nameTiny}"`,
        // BLOCK: x,y,width,height,font,rotation,xmul,ymul,space,align,"text" (align 2 = centered)
        `BLOCK 0,${tpl.priceY},${labelWidthDots},48,"3",0,2,2,0,2,"${priceText}"`,
        `BLOCK 1,${tpl.priceY},${labelWidthDots},48,"3",0,2,2,0,2,"${priceText}"`,
        // human-readable text disabled here (0) because we render centered text line below.
        `BARCODE ${barcodeX},${tpl.barcodeY},"128",${tpl.barcodeHeight},0,0,${barcodeModuleWidth},${barcodeModuleWidth},"${barcode}"`,
        `BLOCK 0,${tpl.barcodeTextY},${labelWidthDots},28,"2",0,1,1,0,2,"${barcode}"`,
      ]
    }
  } else {
    body = [
      `TEXT ${tpl.nameX},${tpl.nameY},"3",0,1,1,"${name}"`,
      `TEXT ${tpl.skuX},${tpl.skuY},"2",0,1,1,"SKU: ${sku}"`,
      `TEXT ${tpl.priceX},${tpl.priceY},"3",0,1,1,"${priceText}"`,
      `BARCODE ${tpl.barcodeX},${tpl.barcodeY},"128",${tpl.barcodeHeight},1,0,2,2,"${barcode}"`,
      `TEXT ${tpl.barcodeTextX},${tpl.barcodeTextY},"2",0,1,1,"${barcode}"`,
    ]
  }

  const lines = [...header, ...body, `PRINT 1,${copies}`, '']

  return Buffer.from(lines.join('\n'), 'utf8')
}

function isPrinterBusyError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false
  const code = (e as NodeJS.ErrnoException).code
  return code === 'EBUSY' || code === 'EAGAIN' || code === 'EPERM'
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function printerBusyMessage(devicePath: string): string {
  return (
    `Printer busy (${devicePath}). Wait a few seconds and try again. ` +
    'If this keeps happening, stop CUPS/other apps from using the same USB printer device.'
  )
}

/** Serialize USB writes per device — Linux /dev/usb/lp* rejects concurrent opens (EBUSY). */
const usbWriteQueues = new Map<string, Promise<void>>()

function chainUsbWrite<T>(devicePath: string, job: () => Promise<T>): Promise<T> {
  const previous = usbWriteQueues.get(devicePath) ?? Promise.resolve()
  const run = previous.catch(() => undefined).then(job)
  usbWriteQueues.set(
    devicePath,
    run.then(
      () => undefined,
      () => undefined,
    ),
  )
  return run
}

async function writeUsbDevice(devicePath: string, data: Buffer): Promise<void> {
  const settleMs = data.length > 200_000 ? 600 : 80
  const maxAttempts = 5

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await withTimeout(
        (async () => {
          const fh = await fs.open(devicePath, fsConstants.O_WRONLY)
          try {
            await fh.write(data)
          } finally {
            await fh.close()
          }
        })(),
        30_000,
        `Printer write timed out (${devicePath})`,
      )
      await sleep(settleMs)
      return
    } catch (e) {
      if (isPrinterBusyError(e) && attempt < maxAttempts) {
        await sleep(250 * attempt)
        continue
      }
      if (isPrinterBusyError(e)) {
        throw new Error(printerBusyMessage(devicePath))
      }
      throw e instanceof Error ? e : new Error(String(e))
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    promise.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      },
    )
  })
}

export type LabelPrintPackage = {
  label: Buffer
  fontUpload?: Buffer
}

export async function buildProductLabelPrintPackage(
  payload: ProductLabelPayload,
  opts: {
    layout?: ProductLabelLayout
    template?: ProductLabelTemplate
    copies?: number
    presetId?: LabelPrintPresetId
  },
  _transport: LabelPrinterTransport,
): Promise<LabelPrintPackage> {
  const layout = opts.layout ?? { widthMm: 55, heightMm: 24, gapMm: 4 }
  const dejavu = await bundledLabelFontsAvailable()
  const fontMode = resolveSmallLabelFontMode(layout.smallLabelFontMode, dejavu)
  const label = buildProductLabelTspl(payload, { ...opts, layout, smallLabelFontMode: fontMode })
  return { label }
}

/** @deprecated Use buildProductLabelPrintPackage + executeLabelPrint */
export async function buildProductLabelPrintBuffer(
  payload: ProductLabelPayload,
  opts: {
    layout?: ProductLabelLayout
    template?: ProductLabelTemplate
    copies?: number
    presetId?: LabelPrintPresetId
  },
  transport: LabelPrinterTransport,
): Promise<Buffer> {
  const pkg = await buildProductLabelPrintPackage(payload, opts, transport) // transport kept for API compat
  return pkg.fontUpload ? Buffer.concat([pkg.fontUpload, pkg.label]) : pkg.label
}

export async function buildLabelFontTestPrintPackage(
  opts: { layout?: ProductLabelLayout; copies?: number } | undefined,
  _transport: LabelPrinterTransport,
): Promise<LabelPrintPackage> {
  const label = buildLabelFontTestTspl(opts)
  return { label }
}

/** @deprecated Use buildLabelFontTestPrintPackage + executeLabelPrint */
export async function buildLabelFontTestPrintBuffer(
  opts: { layout?: ProductLabelLayout; copies?: number } | undefined,
  transport: LabelPrinterTransport,
): Promise<Buffer> {
  const pkg = await buildLabelFontTestPrintPackage(opts, transport)
  return pkg.fontUpload ? Buffer.concat([pkg.fontUpload, pkg.label]) : pkg.label
}

export async function executeLabelPrint(
  transport: LabelPrinterTransport,
  pkg: LabelPrintPackage,
): Promise<void> {
  const text = pkg.label.toString('utf8')
  if (!text.includes('PRINT')) {
    throw new Error('Label data is empty — nothing sent to printer')
  }

  try {
    if (transport.kind === 'usb') {
      await chainUsbWrite(transport.path, async () => {
        if (pkg.fontUpload) {
          await writeUsbDevice(transport.path, pkg.fontUpload)
          ttfInstalledPrinters.add(transportKey(transport))
        }
        await writeUsbDevice(transport.path, pkg.label)
      })
      return
    }

    const data = pkg.fontUpload ? Buffer.concat([pkg.fontUpload, pkg.label]) : pkg.label
    await sendRawToLanPrinter(transport, data)
  } catch (e) {
    if (pkg.fontUpload) {
      ttfInstalledPrinters.delete(transportKey(transport))
    }
    throw e
  }
}

export type StaffBadgePayload = {
  displayName: string
  badgeCode: string
  roleName?: string
}

/** Code 128 module count (start + data + checksum + stop) for subset B-ish payloads. */
function staffBadgeBarcodeModuleCount(data: string): number {
  return 11 * data.length + 35
}

/** Practical Code128 width on TSC 203dpi for module-width picking. */
function staffBadgeBarcodeWidthDots(data: string, moduleWidthDots: number): number {
  return staffBadgeBarcodeModuleCount(data) * moduleWidthDots
}

function staffBadgeBarcodeFits(data: string, moduleWidthDots: number, labelWidthDots: number): boolean {
  const sideMargin = 10
  return staffBadgeBarcodeWidthDots(data, moduleWidthDots) + sideMargin * 2 <= labelWidthDots
}

function pickStaffBadgeBarcodeModule(data: string, labelWidthDots: number): number {
  for (let moduleWidth = 3; moduleWidth >= 1; moduleWidth--) {
    if (staffBadgeBarcodeFits(data, moduleWidth, labelWidthDots)) return moduleWidth
  }
  return 1
}

export function buildStaffBadgeTspl(
  payload: StaffBadgePayload,
  opts?: {
    layout?: ProductLabelLayout
    copies?: number
  },
): Buffer {
  const layout = opts?.layout ?? { widthMm: 55, heightMm: 24, gapMm: 4 }
  const copies = Math.max(1, Math.min(10, Math.floor(opts?.copies ?? 1)))
  const labelWidthDots = Math.max(1, Math.floor(layout.widthMm * 8))
  const labelHeightDots = Math.max(1, Math.floor(layout.heightMm * 8))

  const name = clip(sanitizeText(payload.displayName || 'Staff'), 28)
  const role = clip(sanitizeText(payload.roleName || ''), 24)
  const badge = sanitizeText(payload.badgeCode || '')
  if (!badge) throw new Error('Badge code is required')

  const barcodeModuleWidth = pickStaffBadgeBarcodeModule(badge, labelWidthDots)
  const nameLineH = 20
  const roleLineH = 16
  const textGap = 4
  const barcodeGap = 6
  const barcodeHeight = 48
  const contentHeight =
    nameLineH + (role ? textGap + roleLineH + barcodeGap : barcodeGap) + barcodeHeight
  const topY = Math.max(4, Math.floor((labelHeightDots - contentHeight) / 2))
  const nameY = topY
  const roleY = topY + nameLineH + textGap
  const barcodeY = role ? roleY + roleLineH + barcodeGap : topY + nameLineH + barcodeGap
  // TSC alignment 2 = center barcode on X anchor (printer computes true width).
  const barcodeCenterX = Math.floor(labelWidthDots / 2)

  const header = tsplJobHeader(layout)

  const body = [
    `BLOCK 0,${nameY},${labelWidthDots},${nameLineH},"2",0,1,1,0,2,"${name}"`,
    ...(role ? [`BLOCK 0,${roleY},${labelWidthDots},${roleLineH},"1",0,1,1,0,2,"${role}"`] : []),
    `BARCODE ${barcodeCenterX},${barcodeY},"128",${barcodeHeight},0,0,${barcodeModuleWidth},${barcodeModuleWidth},2,"${badge}"`,
  ]

  const lines = [...header, ...body, `PRINT 1,${copies}`, '']
  return Buffer.from(lines.join('\n'), 'utf8')
}

export function buildLabelFontTestTspl(opts?: {
  layout?: ProductLabelLayout
  copies?: number
}): Buffer {
  const layout = opts?.layout ?? { widthMm: 55, heightMm: 24, gapMm: 4 }
  const copies = Math.max(1, Math.min(100, Math.floor(opts?.copies ?? 1)))

  if (isSmallLabelStock(layout)) {
    return buildSmallLabelFontTestTspl(layout, copies)
  }

  const lines = [
    ...tsplJobHeader(layout),
    'TEXT 10,10,"1",0,1,1,"F1 x1: ABC123"',
    'TEXT 10,30,"2",0,1,1,"F2 x1: ABC123"',
    'TEXT 10,52,"3",0,1,1,"F3 x1: ABC123"',
    'TEXT 10,82,"1",0,2,2,"F1 x2"',
    'TEXT 10,114,"2",0,2,2,"F2 x2"',
    'TEXT 10,150,"3",0,2,2,"F3 x2"',
    `PRINT 1,${copies}`,
    '',
  ]
  return Buffer.from(lines.join('\n'), 'utf8')
}

/** Five-label strip on 40×16 mm stock — fonts 0–8 at common scales. */
function buildSmallLabelFontTestTspl(layout: ProductLabelLayout, copies: number): Buffer {
  const chunks: string[] = []
  const labelH = Math.max(1, Math.floor(layout.heightMm * 8))

  /** Approximate glyph height @ 1×1 on TSC 203 dpi (dots). */
  const fontH1x: Record<string, number> = {
    '0': 14,
    '1': 12,
    '2': 20,
    '3': 24,
    '4': 32,
    '5': 32,
    '6': 36,
    '7': 48,
    '8': 48,
  }

  function lineH(font: string, yMul: number): number {
    return Math.ceil((fontH1x[font] ?? 16) * yMul) + 6
  }

  function text(font: string, x: number, y: number, xMul: number, yMul: number, label: string): string {
    return `TEXT ${x},${y},"${font}",0,${xMul},${yMul},"${label}"`
  }

  function addLabel(body: string[]) {
    chunks.push(...tsplJobHeader(layout), ...body, `PRINT 1,${copies}`, '')
  }

  // 1 — 2× reference (matched your clearest label on the strip)
  addLabel([
    text('1', 4, 4, 1, 1, '@2x fonts'),
    text('1', 4, 28, 2, 2, 'F1 3220'),
    text('2', 4, 58, 2, 2, 'F2 3220'),
    text('3', 4, 96, 2, 2, 'F3 3220'),
  ])

  // 2 — SKU scale candidates (spaced for 2×2 / mixed scale rows)
  addLabel([
    text('1', 4, 4, 1, 1, 'SKU scales'),
    text('1', 4, 22, 2, 2, '3220'),
    text('2', 4, 58, 1, 2, '3220'),
    text('1', 4, 88, 1, 2, '3220'),
  ])

  // 3 — compact 1× fonts (F1–F3); step Y by each font’s real height
  {
    const lines: string[] = [text('1', 4, 4, 1, 1, 'F1-F3 @1x')]
    let y = 20
    for (const [font, sample] of [
      ['1', 'F1: 3220'],
      ['2', 'F2: 3220'],
      ['3', 'F3: 3220'],
    ] as const) {
      lines.push(text(font, 4, y, 1, 1, sample))
      y += lineH(font, 1)
    }
    addLabel(lines)
  }

  // 4 — larger 1× fonts (F4–F6); only three fit on 16 mm
  {
    const lines: string[] = [text('1', 4, 4, 1, 1, 'F4-F6 @1x')]
    let y = 20
    for (const [font, sample] of [
      ['4', 'F4: SKU'],
      ['5', 'F5: SKU'],
      ['6', 'F6: SKU'],
    ] as const) {
      lines.push(text(font, 4, y, 1, 1, sample))
      y += lineH(font, 1)
      if (y > labelH - 8) break
    }
    addLabel(lines)
  }

  // 5 — tallest built-ins (one line each — F7/F8 are ~48 dots tall @1x)
  addLabel([text('1', 4, 4, 1, 1, 'F7 @1x'), text('7', 4, 22, 1, 1, 'SKU 3220')])
  addLabel([text('1', 4, 4, 1, 1, 'F8 @1x'), text('8', 4, 22, 1, 1, 'SKU 3220')])

  // 6 — production mock (DejaVu TTF when enabled, else TSC font 0)
  const w = Math.max(1, Math.floor(layout.widthMm * 8))
  const h = Math.max(1, Math.floor(layout.heightMm * 8))
  const fontMode = resolveSmallLabelFontMode(layout.smallLabelFontMode, true)
  addLabel(
    smallLabelTtfBlocks({
      labelWidthDots: w,
      labelHeightDots: h,
      name: 'Sample item',
      priceText: 'R3220',
      sku: '3220',
      fontMode,
    }),
  )

  return Buffer.from(chunks.join('\n'), 'utf8')
}

export async function sendRawToPrinter(transport: LabelPrinterTransport, data: Buffer): Promise<void> {
  if (transport.kind === 'usb') {
    await chainUsbWrite(transport.path, () => writeUsbDevice(transport.path, data))
    return
  }

  await sendRawToLanPrinter(transport, data)
}

async function sendRawToLanPrinter(
  transport: Extract<LabelPrinterTransport, { kind: 'lan' }>,
  data: Buffer,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = new net.Socket()
    const onErr = (e: unknown) => {
      try {
        socket.destroy()
      } catch {
        // ignore
      }
      reject(e instanceof Error ? e : new Error('Printer socket error'))
    }
    socket.once('error', onErr)
    socket.connect(transport.port, transport.host, () => {
      socket.write(data, (err) => {
        if (err) return onErr(err)
        socket.end()
      })
    })
    socket.once('close', () => resolve())
  })
}
