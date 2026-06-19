import fs from 'node:fs/promises'
import net from 'node:net'

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

/** When set, applies preset-specific TSPL (fonts / order). Omit for custom templates. */
export type LabelPrintPresetId =
  | 'compactRetail'
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
  const header = [
    `SIZE ${layout.widthMm} mm,${layout.heightMm} mm`,
    `GAP ${layout.gapMm} mm,0 mm`,
    'DIRECTION 1',
    'REFERENCE 0,0',
    'CLS',
  ]

  let body: string[]

  if (opts?.presetId === 'priceFocus' || opts?.presetId === 'priceFocusSku') {
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
    if (opts.presetId === 'priceFocusSku') {
      body = [
        `BLOCK 0,${safeNameY},${labelWidthDots},20,"2",0,1,1,0,2,"${nameTiny}"`,
        // BLOCK: x,y,width,height,font,rotation,xmul,ymul,space,align,"text" (align 2 = centered)
        `BLOCK 0,${tpl.priceY},${labelWidthDots},48,"3",0,2,2,0,2,"${priceText}"`,
        `BLOCK 1,${tpl.priceY},${labelWidthDots},48,"3",0,2,2,0,2,"${priceText}"`,
        // Keep SKU readable without glyph collision on narrow stock.
        `BLOCK 0,${tpl.skuY},${labelWidthDots},28,"2",0,1,1,0,2,"${skuTiny}"`,
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

  const header = [
    `SIZE ${layout.widthMm} mm,${layout.heightMm} mm`,
    `GAP ${layout.gapMm} mm,0 mm`,
    'DIRECTION 1',
    'REFERENCE 0,0',
    'CLS',
  ]

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
  const lines = [
    `SIZE ${layout.widthMm} mm,${layout.heightMm} mm`,
    `GAP ${layout.gapMm} mm,0 mm`,
    'DIRECTION 1',
    'REFERENCE 0,0',
    'CLS',
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

export async function sendRawToPrinter(transport: LabelPrinterTransport, data: Buffer): Promise<void> {
  if (transport.kind === 'usb') {
    const fh = await fs.open(transport.path, 'w')
    try {
      await fh.write(data)
    } finally {
      await fh.close()
    }
    return
  }

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
