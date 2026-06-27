export type LabelTransport = { kind: 'usb'; path: string } | { kind: 'lan'; host: string; port: number }

export type LabelLayout = {
  widthMm: number
  heightMm: number
  gapMm: number
  gapOffsetMm?: number
  feedOffsetDots?: number
  minimizePostPrintFeed?: boolean
  gapDetectEachJob?: boolean
  advanceHeightMm?: number
  /** Small labels only: dejavu (smooth TTF), builtin (TSC font 0), or bitmap (legacy). */
  smallLabelFontMode?: 'bitmap' | 'builtin' | 'dejavu'
}

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
  | 'compact40x16'
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

/** Printable settings for one printer (legacy shape; one profile). */
export type LabelPrinterSettings = {
  transport: LabelTransport
  layout: LabelLayout
  template: LabelTemplate
  templateRef: LabelTemplateRef
  customTemplates: CustomLabelTemplateEntry[]
  copies: number
}

export type LabelPrinterProfile = LabelPrinterSettings & {
  id: string
  name: string
  isDefault: boolean
}

export type LabelPrinterConfig = {
  version: 2
  profiles: LabelPrinterProfile[]
  activeProfileId: string
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
  compact40x16: {
    name: 'Compact 40×16',
    template: {
      nameX: 0,
      nameY: 4,
      skuX: 0,
      skuY: 100,
      priceX: 0,
      priceY: 20,
      barcodeX: 0,
      barcodeY: 44,
      barcodeHeight: 28,
      barcodeTextX: 0,
      barcodeTextY: 76,
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
export const LABEL_SETTINGS_V2_KEY = 'electropos-bo-label-printer-settings-v2'
export const LABEL_LAST_PROFILE_SESSION_KEY = 'electropos-bo-last-label-profile'

export const MAX_CUSTOM_LABEL_TEMPLATES = 30
export const MAX_LABEL_PRINTER_PROFILES = 2

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

export const DEFAULT_SMALL_LABEL_SETTINGS: LabelPrinterSettings = {
  transport: { kind: 'usb', path: '/dev/usb/lp1' },
  layout: {
    widthMm: 40,
    heightMm: 16,
    gapMm: 2,
    gapOffsetMm: -0.5,
    advanceHeightMm: 16.5,
    minimizePostPrintFeed: false,
    gapDetectEachJob: false,
    smallLabelFontMode: 'bitmap',
  },
  template: cloneLabelTemplate(LABEL_TEMPLATE_PRESETS.priceFocusSku.template),
  templateRef: { kind: 'preset', presetId: 'priceFocusSku' },
  customTemplates: [],
  copies: 1,
}

export function cloneLabelTemplate(t: LabelTemplate): LabelTemplate {
  return { ...t }
}

export function isSmallLabelLayout(layout: LabelLayout): boolean {
  return layout.heightMm <= 18 || (layout.widthMm <= 42 && layout.heightMm <= 20)
}

/** Disable per-print gap detect — it causes batch drift on small rolls. */
export function stabilizeSmallLabelLayout(layout: LabelLayout): LabelLayout {
  if (!isSmallLabelLayout(layout)) return layout
  return {
    ...layout,
    gapDetectEachJob: false,
    minimizePostPrintFeed: false,
    gapOffsetMm: layout.gapOffsetMm !== undefined ? layout.gapOffsetMm : -0.5,
    advanceHeightMm:
      layout.advanceHeightMm !== undefined && layout.advanceHeightMm >= 16.4
        ? layout.advanceHeightMm
        : 16.5,
  }
}

export function newLabelProfileId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `lp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function newCustomTemplateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `ct-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function profileToPrintSettings(profile: LabelPrinterProfile): LabelPrinterSettings {
  return {
    transport: profile.transport,
    layout: { ...profile.layout },
    template: cloneLabelTemplate(profile.template),
    templateRef: profile.templateRef,
    customTemplates: profile.customTemplates.map((c) => ({
      ...c,
      template: cloneLabelTemplate(c.template),
    })),
    copies: profile.copies,
  }
}

export function formatProfileSummary(profile: LabelPrinterProfile): string {
  return `${profile.name} (${profile.layout.widthMm}×${profile.layout.heightMm} mm)`
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

function legacyTemplateIdToPreset(id: unknown): LabelTemplateId | null {
  if (typeof id === 'string' && id in LABEL_TEMPLATE_PRESETS) return id as LabelTemplateId
  return null
}

function parseTransport(raw: unknown, fallback: LabelTransport): LabelTransport {
  if (!raw || typeof raw !== 'object') return fallback
  const t = raw as Record<string, unknown>
  if (t.kind === 'usb' && typeof t.path === 'string' && t.path.trim()) {
    return { kind: 'usb', path: t.path.trim() }
  }
  if (
    t.kind === 'lan' &&
    typeof t.host === 'string' &&
    t.host.trim() &&
    typeof t.port === 'number' &&
    Number.isFinite(t.port) &&
    t.port > 0
  ) {
    return { kind: 'lan', host: t.host.trim(), port: t.port }
  }
  return fallback
}

function parseLayout(raw: unknown, fallback: LabelLayout): LabelLayout {
  const next = { ...fallback }
  if (!raw || typeof raw !== 'object') return next
  const l = raw as Partial<LabelLayout>
  if (typeof l.widthMm === 'number' && Number.isFinite(l.widthMm) && l.widthMm > 0) next.widthMm = l.widthMm
  if (typeof l.heightMm === 'number' && Number.isFinite(l.heightMm) && l.heightMm > 0) next.heightMm = l.heightMm
  if (typeof l.gapMm === 'number' && Number.isFinite(l.gapMm) && l.gapMm >= 0) next.gapMm = l.gapMm
  if (typeof l.gapOffsetMm === 'number' && Number.isFinite(l.gapOffsetMm)) next.gapOffsetMm = l.gapOffsetMm
  if (typeof l.feedOffsetDots === 'number' && Number.isFinite(l.feedOffsetDots)) {
    next.feedOffsetDots = Math.round(l.feedOffsetDots)
  }
  if (typeof l.minimizePostPrintFeed === 'boolean') next.minimizePostPrintFeed = l.minimizePostPrintFeed
  if (typeof l.gapDetectEachJob === 'boolean') next.gapDetectEachJob = l.gapDetectEachJob
  if (typeof l.advanceHeightMm === 'number' && Number.isFinite(l.advanceHeightMm) && l.advanceHeightMm > 0) {
    next.advanceHeightMm = l.advanceHeightMm
  }
  if (l.smallLabelFontMode === 'bitmap' || l.smallLabelFontMode === 'builtin' || l.smallLabelFontMode === 'dejavu') {
    next.smallLabelFontMode = l.smallLabelFontMode
  }
  return next
}

function resolveTemplateForRef(
  templateRef: LabelTemplateRef,
  customTemplates: CustomLabelTemplateEntry[],
  parsedTemplate: unknown,
): LabelTemplate {
  if (templateRef.kind === 'custom') {
    const found = customTemplates.find((c) => c.id === templateRef.customId)
    if (found) {
      if (parsedTemplate && typeof parsedTemplate === 'object') {
        return parseFullTemplate(parsedTemplate, found.template)
      }
      return cloneLabelTemplate(found.template)
    }
    return cloneLabelTemplate(LABEL_TEMPLATE_PRESETS.compactRetail.template)
  }
  return cloneLabelTemplate(LABEL_TEMPLATE_PRESETS[templateRef.presetId].template)
}

export function parseLabelPrinterSettings(raw: unknown): LabelPrinterSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_LABEL_SETTINGS, template: cloneLabelTemplate(DEFAULT_LABEL_SETTINGS.template) }
  const parsed = raw as Partial<LabelPrinterSettings> & { templateId?: unknown }
  const customTemplates = parseCustomTemplates(parsed.customTemplates)
  const customIds = new Set(customTemplates.map((c) => c.id))

  let templateRef = normalizeTemplateRef(parsed.templateRef, 'compactRetail', customIds)
  const legacy = legacyTemplateIdToPreset(parsed.templateId)
  if (!parsed.templateRef && legacy) {
    templateRef = { kind: 'preset', presetId: legacy }
  }

  const layout = parseLayout(parsed.layout, DEFAULT_LABEL_SETTINGS.layout)
  const transport = parseTransport(parsed.transport, DEFAULT_LABEL_SETTINGS.transport)
  let copies = DEFAULT_LABEL_SETTINGS.copies
  if (typeof parsed.copies === 'number' && Number.isFinite(parsed.copies) && parsed.copies >= 1 && parsed.copies <= 100) {
    copies = Math.floor(parsed.copies)
  }

  let template = resolveTemplateForRef(templateRef, customTemplates, parsed.template)
  if (templateRef.kind === 'preset') {
    template = cloneLabelTemplate(LABEL_TEMPLATE_PRESETS[templateRef.presetId].template)
    if (parsed.template && typeof parsed.template === 'object' && templateRef.presetId === 'compact40x16') {
      // allow saved tweaks on small-stock preset
      template = parseFullTemplate(parsed.template, template)
    }
  }
  if (template.barcodeHeight < 10) template.barcodeHeight = 10

  return {
    transport,
    layout,
    template,
    templateRef,
    customTemplates,
    copies,
  }
}

function createProfileFromSettings(
  settings: LabelPrinterSettings,
  opts: { id?: string; name: string; isDefault: boolean },
): LabelPrinterProfile {
  return {
    id: opts.id ?? newLabelProfileId(),
    name: opts.name,
    isDefault: opts.isDefault,
    ...settings,
    layout: { ...settings.layout },
    template: cloneLabelTemplate(settings.template),
    customTemplates: settings.customTemplates.map((c) => ({
      ...c,
      template: cloneLabelTemplate(c.template),
    })),
  }
}

export function createDefaultLabelPrinterConfig(): LabelPrinterConfig {
  const large = createProfileFromSettings(DEFAULT_LABEL_SETTINGS, {
    name: 'Large labels',
    isDefault: true,
  })
  return { version: 2, profiles: [large], activeProfileId: large.id }
}

function migrateV1SettingsToConfig(v1: LabelPrinterSettings): LabelPrinterConfig {
  const large = createProfileFromSettings(v1, { name: 'Large labels', isDefault: true })
  return { version: 2, profiles: [large], activeProfileId: large.id }
}

function normalizeConfig(raw: unknown): LabelPrinterConfig {
  if (!raw || typeof raw !== 'object') return createDefaultLabelPrinterConfig()
  const o = raw as Partial<LabelPrinterConfig>
  if (!Array.isArray(o.profiles) || o.profiles.length === 0) return createDefaultLabelPrinterConfig()

  const profiles: LabelPrinterProfile[] = []
  for (const row of o.profiles.slice(0, MAX_LABEL_PRINTER_PROFILES)) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const id = typeof r.id === 'string' && r.id.trim() ? r.id.trim() : newLabelProfileId()
    const name = typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 80) : 'Label printer'
    const settings = parseLabelPrinterSettings(row)
    profiles.push({
      id,
      name,
      isDefault: Boolean(r.isDefault),
      ...settings,
      layout: stabilizeSmallLabelLayout(settings.layout),
    })
  }
  if (profiles.length === 0) return createDefaultLabelPrinterConfig()

  if (!profiles.some((p) => p.isDefault)) {
    profiles[0].isDefault = true
  } else {
    let seenDefault = false
    for (const p of profiles) {
      if (p.isDefault) {
        if (seenDefault) p.isDefault = false
        seenDefault = true
      }
    }
  }

  const activeProfileId =
    typeof o.activeProfileId === 'string' && profiles.some((p) => p.id === o.activeProfileId)
      ? o.activeProfileId
      : profiles.find((p) => p.isDefault)?.id ?? profiles[0].id

  return { version: 2, profiles, activeProfileId }
}

export function readLabelPrinterConfig(): LabelPrinterConfig {
  try {
    const fileRaw = window.electronLabel?.getConfigSync?.()
    if (fileRaw) {
      return normalizeConfig(JSON.parse(fileRaw))
    }
    const v2raw = localStorage.getItem(LABEL_SETTINGS_V2_KEY)
    if (v2raw) {
      return normalizeConfig(JSON.parse(v2raw))
    }
    const v1raw = localStorage.getItem(LABEL_SETTINGS_KEY)
    if (v1raw) {
      const migrated = migrateV1SettingsToConfig(parseLabelPrinterSettings(JSON.parse(v1raw)))
      writeLabelPrinterConfig(migrated)
      return migrated
    }
  } catch {
    // fall through
  }
  return createDefaultLabelPrinterConfig()
}

export function writeLabelPrinterConfig(config: LabelPrinterConfig): void {
  const normalized = normalizeConfig(config)
  const json = JSON.stringify(normalized)
  try {
    localStorage.setItem(LABEL_SETTINGS_V2_KEY, json)
  } catch {
    // ignore
  }
  void window.electronLabel?.setConfig?.(json)
}

export function getDefaultLabelProfile(config: LabelPrinterConfig = readLabelPrinterConfig()): LabelPrinterProfile {
  return config.profiles.find((p) => p.isDefault) ?? config.profiles[0]
}

export function getLabelProfileById(
  id: string,
  config: LabelPrinterConfig = readLabelPrinterConfig(),
): LabelPrinterProfile | null {
  return config.profiles.find((p) => p.id === id) ?? null
}

export function usbPathsUsedByOtherProfiles(
  config: LabelPrinterConfig,
  profileId: string,
): string[] {
  return config.profiles
    .filter((p) => p.id !== profileId && p.transport.kind === 'usb')
    .map((p) => (p.transport as { kind: 'usb'; path: string }).path)
}

export function addSecondLabelProfile(config: LabelPrinterConfig): LabelPrinterConfig | null {
  if (config.profiles.length >= MAX_LABEL_PRINTER_PROFILES) return null
  const usedUsb = config.profiles
    .filter((p) => p.transport.kind === 'usb')
    .map((p) => (p.transport as { kind: 'usb'; path: string }).path)
  const smallTransport =
    DEFAULT_SMALL_LABEL_SETTINGS.transport.kind === 'usb' &&
    !usedUsb.includes(DEFAULT_SMALL_LABEL_SETTINGS.transport.path)
      ? DEFAULT_SMALL_LABEL_SETTINGS.transport
      : { kind: 'usb' as const, path: '/dev/usb/lp1' }

  const small = createProfileFromSettings(
    { ...DEFAULT_SMALL_LABEL_SETTINGS, transport: smallTransport },
    { name: 'Small labels', isDefault: false },
  )
  return normalizeConfig({
    ...config,
    profiles: [...config.profiles, small],
    activeProfileId: small.id,
  })
}

export function removeLabelProfile(config: LabelPrinterConfig, profileId: string): LabelPrinterConfig {
  if (config.profiles.length <= 1) return config
  const profiles = config.profiles.filter((p) => p.id !== profileId)
  if (profiles.length === config.profiles.length) return config
  if (!profiles.some((p) => p.isDefault)) {
    profiles[0].isDefault = true
  }
  const activeProfileId = profiles.some((p) => p.id === config.activeProfileId)
    ? config.activeProfileId
    : profiles.find((p) => p.isDefault)?.id ?? profiles[0].id
  return normalizeConfig({ version: 2, profiles, activeProfileId })
}

export function setDefaultLabelProfile(config: LabelPrinterConfig, profileId: string): LabelPrinterConfig {
  return normalizeConfig({
    ...config,
    profiles: config.profiles.map((p) => ({ ...p, isDefault: p.id === profileId })),
  })
}

export function updateLabelProfile(
  config: LabelPrinterConfig,
  profileId: string,
  updater: (profile: LabelPrinterProfile) => LabelPrinterProfile,
): LabelPrinterConfig {
  return normalizeConfig({
    ...config,
    profiles: config.profiles.map((p) => (p.id === profileId ? updater(p) : p)),
  })
}

/** @deprecated Use readLabelPrinterConfig + getDefaultLabelProfile */
export function readLabelSettings(): LabelPrinterSettings {
  return profileToPrintSettings(getDefaultLabelProfile())
}

/** @deprecated Use writeLabelPrinterConfig */
export function writeLabelSettings(settings: LabelPrinterSettings): void {
  const config = readLabelPrinterConfig()
  const def = getDefaultLabelProfile(config)
  const next = updateLabelProfile(config, def.id, (p) => ({
    ...p,
    ...settings,
    layout: { ...settings.layout },
    template: cloneLabelTemplate(settings.template),
    customTemplates: settings.customTemplates,
  }))
  writeLabelPrinterConfig(next)
}

export function readLastUsedLabelProfileId(): string | null {
  try {
    const id = sessionStorage.getItem(LABEL_LAST_PROFILE_SESSION_KEY)
    if (!id) return null
    return getLabelProfileById(id) ? id : null
  } catch {
    return null
  }
}

export function writeLastUsedLabelProfileId(id: string): void {
  try {
    sessionStorage.setItem(LABEL_LAST_PROFILE_SESSION_KEY, id)
  } catch {
    // ignore
  }
}

export function resolveInitialPrintProfileId(config: LabelPrinterConfig = readLabelPrinterConfig()): string {
  return readLastUsedLabelProfileId() ?? getDefaultLabelProfile(config).id
}
