import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { LabelPrinterTransport } from './bo-label-printer'

export const LABEL_TTF_REGULAR = 'EPOSR.TTF'
export const LABEL_TTF_BOLD = 'EPOSB.TTF'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Printers that already received bundled TTF files this session. */
export const ttfInstalledPrinters = new Set<string>()

export function transportKey(transport: LabelPrinterTransport): string {
  return transport.kind === 'usb'
    ? `usb:${transport.path}`
    : `lan:${transport.host}:${transport.port}`
}

export async function resolveFontsDir(): Promise<string | null> {
  const resourcesPath =
    typeof process !== 'undefined' && 'resourcesPath' in process
      ? (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
      : undefined
  const candidates = [
    path.join(__dirname, 'assets/fonts'),
    path.join(__dirname, '../electron/assets/fonts'),
    ...(resourcesPath ? [path.join(resourcesPath, 'fonts')] : []),
  ]
  for (const dir of candidates) {
    try {
      await fs.access(path.join(dir, LABEL_TTF_REGULAR))
      return dir
    } catch {
      // try next
    }
  }
  return null
}

function buildDownloadChunk(filename: string, data: Buffer): Buffer {
  // DATA CONTENT must follow the comma immediately — no line break before binary.
  return Buffer.concat([Buffer.from(`DOWNLOAD "${filename}",${data.length},`, 'ascii'), data])
}

export { buildDownloadChunk }

export type SmallLabelFontMode = 'bitmap' | 'builtin' | 'dejavu'

export async function bundledLabelFontsAvailable(): Promise<boolean> {
  return (await resolveFontsDir()) != null
}

export function resolveSmallLabelFontMode(
  requested: SmallLabelFontMode | undefined,
  dejavuAvailable: boolean,
): SmallLabelFontMode {
  if (requested === 'bitmap' || requested === 'builtin') return requested
  // DejaVu upload is disabled until USB upload is reliable on this printer — use builtin.
  if (requested === 'dejavu') return dejavuAvailable ? 'builtin' : 'bitmap'
  return 'bitmap'
}

export function smallLabelTtfBlocks(opts: {
  labelWidthDots: number
  labelHeightDots: number
  name: string
  priceText: string
  sku: string
  fontMode: SmallLabelFontMode
}): string[] {
  const { labelWidthDots, labelHeightDots, name, priceText, sku, fontMode } = opts
  const w = labelWidthDots

  if (fontMode === 'bitmap') {
    // ~0.75 mm top bias — name was kissing the edge; bottom still has spare room on 16 mm stock.
    const top = 24
    const priceY = 46
    const skuY = Math.max(priceY + 40, labelHeightDots - 18)
    return [
      `BLOCK 0,${top},${w},12,"1",0,1,1,0,2,"${name}"`,
      `BLOCK 0,${priceY},${w},40,"3",0,2,2,0,2,"${priceText}"`,
      `BLOCK 1,${priceY},${w},40,"3",0,2,2,0,2,"${priceText}"`,
      `BLOCK 0,${skuY},${w},22,"2",0,1,1,0,2,"${sku}"`,
    ]
  }

  // Font 0 / TTF: xmul & ymul are point sizes — block height must exceed pt size or text clips.
  const regularFont = fontMode === 'dejavu' ? LABEL_TTF_REGULAR : '0'
  const boldFont = fontMode === 'dejavu' ? LABEL_TTF_BOLD : '0'
  const nameY = 4
  const priceY = 18
  const pricePt = 17
  const skuPt = 8
  const bottomSkuY = Math.max(priceY + 56, labelHeightDots - 30)

  return [
    `BLOCK 0,${nameY},${w},14,"${regularFont}",0,5,5,0,2,"${name}"`,
    `BLOCK 0,${priceY},${w},72,"${boldFont}",0,${pricePt},${pricePt},0,2,"${priceText}"`,
    `BLOCK 0,${bottomSkuY},${w},28,"${regularFont}",0,${skuPt},${skuPt},0,2,"${sku}"`,
  ]
}
