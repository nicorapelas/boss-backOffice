export type LabelTransport = { kind: 'usb'; path: string } | { kind: 'lan'; host: string; port: number }

export type LabelLayout = { widthMm: number; heightMm: number; gapMm: number }

export type LabelTemplate = {
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

export type LabelTemplateId =
  | 'compactRetail'
  | 'priceFocus'
  | 'priceFocusSku'
  | 'barcodeFocus'
  | 'minimal'

/** Built-in preset or a user-saved layout from local storage */
export type LabelTemplateRef =
  | { kind: 'preset'; presetId: LabelTemplateId }
  | { kind: 'custom'; customId: string }

export type CustomLabelTemplateEntry = {
  id: string
  name: string
  template: LabelTemplate
}

export type LabelPrinterSettings = {
  transport: LabelTransport
  layout: LabelLayout
  template: LabelTemplate
  templateRef: LabelTemplateRef
  customTemplates: CustomLabelTemplateEntry[]
  copies: number
}

export const LABEL_TEMPLATE_PRESETS: Record<LabelTemplateId, { name: string; template: LabelTemplate }> = {
  compactRetail: {
    name: 'Compact retail',
    template: {
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
    },
  },
  priceFocus: {
    name: 'Price focus - barcode',
    template: {
      nameX: 14,
      nameY: 16,
      skuX: 14,
      skuY: 74,
      priceX: 0,
      priceY: 34,
      barcodeX: 0,
      barcodeY: 88,
      barcodeHeight: 56,
      barcodeTextX: 0,
      barcodeTextY: 152,
    },
  },
  priceFocusSku: {
    name: 'Price focus - SKU',
    template: {
      nameX: 14,
      nameY: 16,
      skuX: 0,
      skuY: 124,
      priceX: 0,
      priceY: 34,
      barcodeX: 0,
      barcodeY: 88,
      barcodeHeight: 56,
      barcodeTextX: 0,
      barcodeTextY: 152,
    },
  },
  barcodeFocus: {
    name: 'Barcode focus',
    template: {
      nameX: 14,
      nameY: 24,
      skuX: 14,
      skuY: 50,
      priceX: 300,
      priceY: 24,
      barcodeX: 12,
      barcodeY: 76,
      barcodeHeight: 52,
      barcodeTextX: 12,
      barcodeTextY: 132,
    },
  },
  minimal: {
    name: 'Minimal',
    template: {
      nameX: 14,
      nameY: 36,
      skuX: 14,
      skuY: 62,
      priceX: 300,
      priceY: 36,
      barcodeX: 14,
      barcodeY: 94,
      barcodeHeight: 44,
      barcodeTextX: 14,
      barcodeTextY: 144,
    },
  },
}

export const LABEL_SETTINGS_KEY = 'electropos-bo-label-printer-settings'

export const MAX_CUSTOM_LABEL_TEMPLATES = 30

export const DEFAULT_LABEL_SETTINGS: LabelPrinterSettings = {
  transport: { kind: 'usb', path: '/dev/usb/lp0' },
  layout: { widthMm: 55, heightMm: 24, gapMm: 4 },
  template: {
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
  },
  templateRef: { kind: 'preset', presetId: 'compactRetail' },
  customTemplates: [],
  copies: 1,
}

export function cloneLabelTemplate(t: LabelTemplate): LabelTemplate {
  return { ...t }
}

function parseTemplatePartial(raw: unknown): Partial<LabelTemplate> | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const out: Partial<LabelTemplate> = {}
  const num = (k: keyof LabelTemplate) => {
    const v = o[k]
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.max(0, Math.floor(v))
  }
  num('nameX')
  num('nameY')
  num('skuX')
  num('skuY')
  num('priceX')
  num('priceY')
  num('barcodeX')
  num('barcodeY')
  num('barcodeHeight')
  num('barcodeTextX')
  num('barcodeTextY')
  return Object.keys(out).length ? out : null
}

function parseFullTemplate(raw: unknown, fallback: LabelTemplate): LabelTemplate {
  const p = parseTemplatePartial(raw)
  if (!p) return cloneLabelTemplate(fallback)
  return {
    ...fallback,
    ...p,
    barcodeHeight: Math.max(10, p.barcodeHeight ?? fallback.barcodeHeight),
  }
}

function parseCustomTemplates(raw: unknown): CustomLabelTemplateEntry[] {
  if (!Array.isArray(raw)) return []
  const out: CustomLabelTemplateEntry[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const id = typeof r.id === 'string' && r.id.trim() ? r.id.trim() : ''
    const name = typeof r.name === 'string' ? r.name.trim().slice(0, 80) : ''
    if (!id || !name) continue
    const base = DEFAULT_LABEL_SETTINGS.template
    const template = parseFullTemplate(r.template, base)
    out.push({ id, name, template })
    if (out.length >= MAX_CUSTOM_LABEL_TEMPLATES) break
  }
  return out
}

function normalizeTemplateRef(
  ref: unknown,
  fallbackPreset: LabelTemplateId,
  customIds: Set<string>,
): LabelTemplateRef {
  if (ref && typeof ref === 'object') {
    const o = ref as Record<string, unknown>
    if (o.kind === 'preset' && typeof o.presetId === 'string' && o.presetId in LABEL_TEMPLATE_PRESETS) {
      return { kind: 'preset', presetId: o.presetId as LabelTemplateId }
    }
    if (o.kind === 'custom' && typeof o.customId === 'string' && customIds.has(o.customId)) {
      return { kind: 'custom', customId: o.customId }
    }
  }
  return { kind: 'preset', presetId: fallbackPreset }
}

/** Migrate legacy `templateId` field */
function legacyTemplateIdToPreset(id: unknown): LabelTemplateId | null {
  if (typeof id === 'string' && id in LABEL_TEMPLATE_PRESETS) return id as LabelTemplateId
  return null
}

export function readLabelSettings(): LabelPrinterSettings {
  try {
    const raw = localStorage.getItem(LABEL_SETTINGS_KEY)
    if (!raw) return DEFAULT_LABEL_SETTINGS
    const parsed = JSON.parse(raw) as Partial<LabelPrinterSettings> & {
      templateId?: unknown
    }
    const customTemplates = parseCustomTemplates(parsed.customTemplates)
    const customIds = new Set(customTemplates.map((c) => c.id))

    let templateRef = normalizeTemplateRef(parsed.templateRef, 'compactRetail', customIds)
    const legacy = legacyTemplateIdToPreset(parsed.templateId)
    if (!parsed.templateRef && legacy) {
      templateRef = { kind: 'preset', presetId: legacy }
    }

    const next: LabelPrinterSettings = {
      ...DEFAULT_LABEL_SETTINGS,
      ...parsed,
      transport: DEFAULT_LABEL_SETTINGS.transport,
      layout: { ...DEFAULT_LABEL_SETTINGS.layout },
      template: { ...DEFAULT_LABEL_SETTINGS.template },
      templateRef,
      customTemplates,
      copies: DEFAULT_LABEL_SETTINGS.copies,
    }

    if (parsed.layout && typeof parsed.layout === 'object') {
      const l = parsed.layout as Partial<LabelLayout>
      if (typeof l.widthMm === 'number' && Number.isFinite(l.widthMm) && l.widthMm > 0) next.layout.widthMm = l.widthMm
      if (typeof l.heightMm === 'number' && Number.isFinite(l.heightMm) && l.heightMm > 0) next.layout.heightMm = l.heightMm
      if (typeof l.gapMm === 'number' && Number.isFinite(l.gapMm) && l.gapMm >= 0) next.layout.gapMm = l.gapMm
    }
    const hasParsedTemplate = parsed.template && typeof parsed.template === 'object'
    if (hasParsedTemplate) {
      // For custom layouts we persist exact coordinates.
      // Built-in presets intentionally reload from source-of-truth presets below.
      if (next.templateRef.kind === 'custom') {
        next.template = parseFullTemplate(parsed.template, next.template)
      }
    }
    if (parsed.transport && typeof parsed.transport === 'object') {
      const t = parsed.transport as Record<string, unknown>
      if (t.kind === 'usb' && typeof t.path === 'string' && t.path.trim()) {
        next.transport = { kind: 'usb', path: t.path.trim() }
      } else if (
        t.kind === 'lan' &&
        typeof t.host === 'string' &&
        t.host.trim() &&
        typeof t.port === 'number' &&
        Number.isFinite(t.port) &&
        t.port > 0
      ) {
        next.transport = { kind: 'lan', host: t.host.trim(), port: t.port }
      }
    }
    if (typeof parsed.copies === 'number' && Number.isFinite(parsed.copies) && parsed.copies >= 1 && parsed.copies <= 100) {
      next.copies = Math.floor(parsed.copies)
    }

    if (next.templateRef.kind === 'custom') {
      const cref = next.templateRef
      const found = next.customTemplates.find((c) => c.id === cref.customId)
      if (found) {
        next.template = cloneLabelTemplate(found.template)
      } else {
        next.templateRef = { kind: 'preset', presetId: 'compactRetail' }
        if (!parsed.template || typeof parsed.template !== 'object') {
          next.template = cloneLabelTemplate(LABEL_TEMPLATE_PRESETS.compactRetail.template)
        }
      }
    }
    if (next.templateRef.kind === 'preset') {
      next.template = cloneLabelTemplate(LABEL_TEMPLATE_PRESETS[next.templateRef.presetId].template)
    }

    if (next.template.barcodeHeight < 10) next.template.barcodeHeight = 10
    return next
  } catch {
    return DEFAULT_LABEL_SETTINGS
  }
}

export function writeLabelSettings(settings: LabelPrinterSettings): void {
  try {
    localStorage.setItem(LABEL_SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // ignore
  }
}

export function newCustomTemplateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `ct-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
