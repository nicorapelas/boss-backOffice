import { useEffect, useState } from 'react'
import { BoShell } from '../layouts/BoShell'
import { useAuth } from '../auth/AuthContext'
import { hasPermission } from '../auth/permissions'
import {
  DEFAULT_LABEL_SETTINGS,
  DEFAULT_SMALL_LABEL_SETTINGS,
  LABEL_TEMPLATE_PRESETS,
  MAX_CUSTOM_LABEL_TEMPLATES,
  MAX_LABEL_PRINTER_PROFILES,
  addSecondLabelProfile,
  cloneLabelTemplate,
  isSmallLabelLayout,
  newCustomTemplateId,
  readLabelPrinterConfig,
  removeLabelProfile,
  setDefaultLabelProfile,
  updateLabelProfile,
  usbPathsUsedByOtherProfiles,
  writeLabelPrinterConfig,
  type LabelTemplateId,
  type LabelPrinterProfile,
  type LabelTemplate,
  type LabelTemplateRef,
} from '../labels/labelSettings'

const SEL_PRESET = 'preset:'
const SEL_CUSTOM = 'custom:'

function templateRefToSelectValue(ref: LabelTemplateRef): string {
  if (ref.kind === 'preset') return `${SEL_PRESET}${ref.presetId}`
  return `${SEL_CUSTOM}${ref.customId}`
}

function parseSelectValue(v: string): LabelTemplateRef | null {
  if (v.startsWith(SEL_PRESET)) {
    const id = v.slice(SEL_PRESET.length) as LabelTemplateId
    if (id in LABEL_TEMPLATE_PRESETS) return { kind: 'preset', presetId: id }
    return null
  }
  if (v.startsWith(SEL_CUSTOM)) {
    return { kind: 'custom', customId: v.slice(SEL_CUSTOM.length) }
  }
  return null
}

function DotInput({
  label,
  value,
  min = 0,
  onChange,
  span = 'half',
}: {
  label: string
  value: number
  min?: number
  onChange: (next: number) => void
  span?: 'half' | 'third'
}) {
  const clamp = (n: number) => Math.max(min, Math.floor(n))
  const spanClass = span === 'third' ? 'label-field--third' : 'label-field--half'
  return (
    <label className={`label-field ${spanClass} label-field--dot`}>
      {label}
      <input type="number" min={min} value={value} onChange={(e) => onChange(clamp(Number(e.target.value) || 0))} />
      <div className="form-actions label-field-nudge">
        <button type="button" className="btn small" onClick={() => onChange(clamp(value - 8))}>
          -8
        </button>
        <button type="button" className="btn small" onClick={() => onChange(clamp(value - 1))}>
          -1
        </button>
        <button type="button" className="btn small" onClick={() => onChange(clamp(value + 1))}>
          +1
        </button>
        <button type="button" className="btn small" onClick={() => onChange(clamp(value + 8))}>
          +8
        </button>
      </div>
    </label>
  )
}

function TestLabelButton({
  settings,
  setError,
  setNotice,
}: {
  settings: LabelPrinterProfile
  setError: (v: string | null) => void
  setNotice: (v: string | null) => void
}) {
  const [busy, setBusy] = useState(false)
  async function printTestLabel() {
    setError(null)
    setNotice(null)
    if (!window.electronBo) {
      setError('Label printing is available in the desktop app only.')
      return
    }
    setBusy(true)
    try {
      const result = await window.electronBo.printProductLabel(
        settings.transport,
        {
          name: 'TEST LABEL',
          sku: 'CAL-123456',
          barcodeValue: '2000068010001',
          price: 99.99,
        },
        {
          copies: 1,
          layout: settings.layout,
          template: settings.template,
          presetId: settings.templateRef.kind === 'preset' ? settings.templateRef.presetId : undefined,
        },
      )
      if (!result.ok) {
        setError(result.error ?? 'Test label failed')
        return
      }
      setNotice('Test label sent')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Test label failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button type="button" className="btn primary" onClick={() => void printTestLabel()} disabled={busy}>
      {busy ? 'Printing test…' : 'Print test label'}
    </button>
  )
}

function FontTestLabelButton({
  settings,
  setError,
  setNotice,
}: {
  settings: LabelPrinterProfile
  setError: (v: string | null) => void
  setNotice: (v: string | null) => void
}) {
  const [busy, setBusy] = useState(false)
  async function printFontTestLabel() {
    setError(null)
    setNotice(null)
    if (!window.electronBo) {
      setError('Label printing is available in the desktop app only.')
      return
    }
    setBusy(true)
    try {
      const result = await window.electronBo.printLabelFontTest(settings.transport, {
        copies: 1,
        layout: settings.layout,
      })
      if (!result.ok) {
        setError(result.error ?? 'Font test label failed')
        return
      }
      setNotice(
        isSmallLabelLayout(settings.layout)
          ? 'Font test strip sent (7 labels — spaced for 40×16 stock)'
          : 'Font test label sent',
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Font test label failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button type="button" className="btn" onClick={() => void printFontTestLabel()} disabled={busy}>
      {busy ? 'Printing fonts…' : 'Print font test'}
    </button>
  )
}

function CalibrateGapButton({
  settings,
  setError,
  setNotice,
}: {
  settings: LabelPrinterProfile
  setError: (v: string | null) => void
  setNotice: (v: string | null) => void
}) {
  const [busy, setBusy] = useState(false)
  async function calibrate() {
    setError(null)
    setNotice(null)
    if (!window.electronBo?.calibrateLabelGap) {
      setError('Gap calibration is available in the desktop app only.')
      return
    }
    setBusy(true)
    try {
      const result = await window.electronBo.calibrateLabelGap(settings.transport, {
        layout: settings.layout,
      })
      if (!result.ok) {
        setError(result.error ?? 'Gap calibration failed')
        return
      }
      setNotice('Gap calibration sent — printer should feed one label. Then print a test strip.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gap calibration failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button type="button" className="btn" onClick={() => void calibrate()} disabled={busy}>
      {busy ? 'Calibrating…' : 'Calibrate gap (once)'}
    </button>
  )
}

export function LabelSettingsPage() {
  const { session } = useAuth()
  const canRead = hasPermission(session?.user, 'catalog.read')
  const [config, setConfig] = useState(() => readLabelPrinterConfig())
  const activeProfile =
    config.profiles.find((p) => p.id === config.activeProfileId) ?? config.profiles[0]
  const settings = activeProfile
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saveAsName, setSaveAsName] = useState('')
  const [detectBusy, setDetectBusy] = useState(false)

  function patchActiveProfile(updater: (profile: LabelPrinterProfile) => LabelPrinterProfile) {
    setConfig((c) => updateLabelProfile(c, c.activeProfileId, updater))
  }

  function setSettings(updater: (profile: LabelPrinterProfile) => LabelPrinterProfile) {
    patchActiveProfile(updater)
  }

  useEffect(() => {
    writeLabelPrinterConfig(config)
  }, [config])

  function applySelection(ref: LabelTemplateRef) {
    setSettings((s) => {
      if (ref.kind === 'preset') {
        const preset = LABEL_TEMPLATE_PRESETS[ref.presetId]
        return {
          ...s,
          templateRef: ref,
          template: cloneLabelTemplate(preset.template),
        }
      }
      const entry = s.customTemplates.find((c) => c.id === ref.customId)
      if (!entry) return s
      return {
        ...s,
        templateRef: ref,
        template: cloneLabelTemplate(entry.template),
      }
    })
    if (ref.kind === 'preset') {
      setNotice(`Applied: ${LABEL_TEMPLATE_PRESETS[ref.presetId].name}`)
    } else {
      const name = settings.customTemplates.find((c) => c.id === ref.customId)?.name
      setNotice(name ? `Selected: ${name}` : 'Custom template')
    }
    setError(null)
  }

  function reapplyCurrentTemplate() {
    const { templateRef } = settings
    if (templateRef.kind === 'preset') {
      const preset = LABEL_TEMPLATE_PRESETS[templateRef.presetId]
      setSettings((s) => ({ ...s, template: cloneLabelTemplate(preset.template) }))
      setNotice(`Re-applied: ${preset.name}`)
    } else {
      const entry = settings.customTemplates.find((c) => c.id === templateRef.customId)
      if (entry) {
        setSettings((s) => ({ ...s, template: cloneLabelTemplate(entry.template) }))
        setNotice(`Re-applied: ${entry.name}`)
      }
    }
    setError(null)
  }

  function patchTemplate(update: Partial<LabelTemplate>) {
    setSettings((s) => {
      const nextTemplate = { ...s.template, ...update }
      if (s.templateRef.kind === 'custom') {
        const cref = s.templateRef
        const idx = s.customTemplates.findIndex((c) => c.id === cref.customId)
        if (idx >= 0) {
          const nextCustom = [...s.customTemplates]
          nextCustom[idx] = { ...nextCustom[idx], template: cloneLabelTemplate(nextTemplate) }
          return { ...s, template: nextTemplate, customTemplates: nextCustom }
        }
      }
      return { ...s, template: nextTemplate }
    })
  }

  function saveCurrentAsCustom() {
    setError(null)
    setNotice(null)
    const name = saveAsName.trim().slice(0, 80)
    if (!name) {
      setError('Enter a name for the custom template.')
      return
    }
    if (settings.customTemplates.length >= MAX_CUSTOM_LABEL_TEMPLATES) {
      setError(`You can save at most ${MAX_CUSTOM_LABEL_TEMPLATES} custom templates. Delete one to add another.`)
      return
    }
    const id = newCustomTemplateId()
    const entry = { id, name, template: cloneLabelTemplate(settings.template) }
    setSettings((s) => ({
      ...s,
      customTemplates: [...s.customTemplates, entry],
      templateRef: { kind: 'custom', customId: id },
    }))
    setSaveAsName('')
    setNotice(`Saved custom template: ${name}`)
  }

  function duplicateCurrent() {
    setError(null)
    setNotice(null)
    if (settings.customTemplates.length >= MAX_CUSTOM_LABEL_TEMPLATES) {
      setError(`You can save at most ${MAX_CUSTOM_LABEL_TEMPLATES} custom templates. Delete one to add another.`)
      return
    }
    const tr = settings.templateRef
    const displayName =
      tr.kind === 'custom'
        ? settings.customTemplates.find((c) => c.id === tr.customId)?.name ?? 'Layout'
        : LABEL_TEMPLATE_PRESETS[tr.presetId].name
    const id = newCustomTemplateId()
    const name = `Copy of ${displayName}`.slice(0, 80)
    setSettings((s) => ({
      ...s,
      customTemplates: [...s.customTemplates, { id, name, template: cloneLabelTemplate(s.template) }],
      templateRef: { kind: 'custom', customId: id },
    }))
    setNotice(`Duplicated as: ${name}`)
  }

  function deleteSelectedCustom() {
    if (settings.templateRef.kind !== 'custom') return
    const id = settings.templateRef.customId
    setError(null)
    setNotice(null)
    setSettings((s) => {
      const rest = s.customTemplates.filter((c) => c.id !== id)
      const preset = LABEL_TEMPLATE_PRESETS.compactRetail
      return {
        ...s,
        customTemplates: rest,
        templateRef: { kind: 'preset', presetId: 'compactRetail' },
        template: cloneLabelTemplate(preset.template),
      }
    })
    setNotice('Custom template deleted. Reverted layout to Compact retail.')
  }

  async function detectTransport() {
    setError(null)
    setNotice(null)
    if (!window.electronBo) {
      setError('Transport detection is available in the desktop app only.')
      return
    }
    setDetectBusy(true)
    try {
      const result = await window.electronBo.detectLabelTransport({
        excludePaths: usbPathsUsedByOtherProfiles(config, config.activeProfileId),
      })
      if (!result.ok) {
        setError(result.error ?? 'Transport detection failed')
        return
      }
      const detected = result.transport
      if (!detected || detected.kind !== 'usb') {
        const suffix = result.candidates.length ? ` Candidates: ${result.candidates.join(', ')}` : ''
        setError((result.error ?? 'No USB label printer detected') + suffix)
        return
      }
      setSettings((s) => ({ ...s, transport: detected }))
      const alt = result.candidates.filter((p) => p !== detected.path)
      setNotice(
        alt.length
          ? `Detected USB printer: ${detected.path} (other candidates: ${alt.join(', ')})`
          : `Detected USB printer: ${detected.path}`,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transport detection failed')
    } finally {
      setDetectBusy(false)
    }
  }

  const selectValue = templateRefToSelectValue(settings.templateRef)
  const trSel = settings.templateRef
  const selectOptionsValid =
    trSel.kind === 'preset' || (trSel.kind === 'custom' && settings.customTemplates.some((c) => c.id === trSel.customId))

  return (
    <BoShell>
      <h1 className="bo-settings-title">Label settings</h1>
      <div className="label-settings-page">
        <p className="muted label-settings-lead">
          Up to two label printers — each with its own connection, stock size, and layout. Saved on this
          device only.
        </p>
        {!canRead && <p className="error">Permission required: view products.</p>}
        {canRead && (
          <>
            {error ? <p className="error">{error}</p> : null}
            {notice ? <p className="success">{notice}</p> : null}
            <section className="panel label-settings-section">
              <h2>Printer profiles</h2>
              <div className="form-actions" style={{ flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                {config.profiles.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={p.id === config.activeProfileId ? 'btn primary small' : 'btn ghost small'}
                    onClick={() => setConfig((c) => ({ ...c, activeProfileId: p.id }))}
                  >
                    {p.name}
                    {p.isDefault ? ' · default' : ''}
                  </button>
                ))}
                {config.profiles.length < MAX_LABEL_PRINTER_PROFILES ? (
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => {
                      const next = addSecondLabelProfile(config)
                      if (next) {
                        setConfig(next)
                        setNotice('Added small-label printer profile — set USB path and test print.')
                        setError(null)
                      }
                    }}
                  >
                    Add printer
                  </button>
                ) : null}
              </div>
              <div className="label-fields-grid">
                <label className="label-field label-field--half">
                  Profile name
                  <input
                    value={settings.name}
                    maxLength={80}
                    onChange={(e) =>
                      patchActiveProfile((p) => ({ ...p, name: e.target.value.trim().slice(0, 80) || p.name }))
                    }
                  />
                </label>
                <label className="label-field label-field--quarter pos-settings-check" style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={settings.isDefault}
                    onChange={() => setConfig((c) => setDefaultLabelProfile(c, settings.id))}
                  />
                  Default printer
                </label>
                {config.profiles.length > 1 ? (
                  <label className="label-field label-field--quarter label-field--action">
                    Remove
                    <button
                      type="button"
                      className="btn small danger"
                      onClick={() => {
                        setConfig((c) => removeLabelProfile(c, settings.id))
                        setNotice('Printer profile removed.')
                        setError(null)
                      }}
                    >
                      Delete profile
                    </button>
                  </label>
                ) : null}
              </div>
            </section>
            <section className="panel label-settings-section">
              <h2>Transport &amp; stock</h2>
              <p className="muted label-settings-section-lead">
                USB device path or LAN host for <strong>{settings.name}</strong>.
              </p>
              <div className="label-fields-grid">
                <label className="label-field label-field--quarter">
                  Transport
                <select
                  value={settings.transport.kind}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      transport:
                        e.target.value === 'lan'
                          ? { kind: 'lan', host: '192.168.1.50', port: 9100 }
                          : { kind: 'usb', path: '/dev/usb/lp0' },
                    }))
                  }
                >
                  <option value="usb">USB device</option>
                  <option value="lan">LAN (IP + port)</option>
                </select>
              </label>
              <label className="label-field label-field--quarter label-field--action">
                Detect
                <button type="button" className="btn small" onClick={() => void detectTransport()} disabled={detectBusy}>
                  {detectBusy ? 'Detecting…' : 'Detect USB printer'}
                </button>
              </label>
              {settings.transport.kind === 'usb' ? (
                <label className="label-field label-field--half">
                  USB path
                  <input
                    value={settings.transport.path}
                    onChange={(e) => setSettings((s) => ({ ...s, transport: { kind: 'usb', path: e.target.value } }))}
                    placeholder="/dev/usb/lp0"
                  />
                </label>
              ) : (
                <>
                  <label className="label-field label-field--third">
                    Host
                    <input
                      value={settings.transport.host}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          transport: { kind: 'lan', host: e.target.value, port: settings.transport.kind === 'lan' ? settings.transport.port : 9100 },
                        }))
                      }
                    />
                  </label>
                  <label className="label-field label-field--narrow">
                    Port
                    <input
                      type="number"
                      min={1}
                      value={settings.transport.kind === 'lan' ? settings.transport.port : 9100}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          transport: { kind: 'lan', host: settings.transport.kind === 'lan' ? settings.transport.host : '192.168.1.50', port: Number(e.target.value) || 9100 },
                        }))
                      }
                    />
                  </label>
                </>
              )}
              <label className="label-field label-field--third">
                Width (mm)
                <input
                  type="number"
                  min={10}
                  value={settings.layout.widthMm}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, layout: { ...s.layout, widthMm: Number(e.target.value) || s.layout.widthMm } }))
                  }
                />
              </label>
              <label className="label-field label-field--third">
                Height (mm)
                <input
                  type="number"
                  min={10}
                  value={settings.layout.heightMm}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, layout: { ...s.layout, heightMm: Number(e.target.value) || s.layout.heightMm } }))
                  }
                />
                <span className="field-hint muted">
                  Printable height (layout). Keep at 16 — tune feed with Advance height instead.
                </span>
              </label>
              <label className="label-field label-field--third">
                Advance height (mm)
                <input
                  type="number"
                  min={10}
                  step={0.1}
                  placeholder={String(settings.layout.heightMm)}
                  value={settings.layout.advanceHeightMm ?? ''}
                  onChange={(e) => {
                    const raw = e.target.value.trim()
                    setSettings((s) => ({
                      ...s,
                      layout: {
                        ...s.layout,
                        advanceHeightMm: raw === '' ? undefined : Number(raw) || s.layout.heightMm,
                      },
                    }))
                  }}
                />
                <span className="field-hint muted">
                  Feed pitch only. 7/10 copies ≈ try 16.5; if last copies still blank try 16.7.
                </span>
              </label>
              <label className="label-field label-field--third">
                Gap (mm)
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={settings.layout.gapMm}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, layout: { ...s.layout, gapMm: Number(e.target.value) || 0 } }))
                  }
                />
                <span className="field-hint muted">
                  Physical gap between labels. If text prints across gaps, try 1.5 mm or Gap offset −0.5.
                </span>
              </label>
              <label className="label-field label-field--third">
                Gap offset (mm)
                <input
                  type="number"
                  step={0.5}
                  value={settings.layout.gapOffsetMm ?? 0}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      layout: { ...s.layout, gapOffsetMm: Number(e.target.value) || 0 },
                    }))
                  }
                />
                <span className="field-hint muted">Try −0.5 if labels drift upward on batches.</span>
              </label>
              <label className="label-field label-field--third">
                Feed offset (dots)
                <input
                  type="number"
                  step={1}
                  value={settings.layout.feedOffsetDots ?? 0}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      layout: { ...s.layout, feedOffsetDots: Math.round(Number(e.target.value) || 0) },
                    }))
                  }
                />
                <span className="field-hint muted">8 dots ≈ 1 mm. Try −8 to −16 if labels feed too far.</span>
              </label>
              <label className="label-field label-field--third">
                Font (small labels)
                <select
                  value={settings.layout.smallLabelFontMode ?? 'bitmap'}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      layout: {
                        ...s.layout,
                        smallLabelFontMode: e.target.value as 'dejavu' | 'builtin' | 'bitmap',
                      },
                    }))
                  }
                >
                  <option value="bitmap">Legacy bitmap (fonts 1–8)</option>
                  <option value="builtin">TSC built-in (font 0)</option>
                  <option value="dejavu">DejaVu TTF (uses font 0 until upload fixed)</option>
                </select>
                <span className="field-hint muted">
                  Use Legacy bitmap for reliability. Turn off gap re-sync if labels feed blank.
                </span>
              </label>
              <label className="label-field label-field--wide label-field--checkbox">
                <span>Minimize feed after print</span>
                <input
                  type="checkbox"
                  checked={settings.layout.minimizePostPrintFeed ?? false}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      layout: { ...s.layout, minimizePostPrintFeed: e.target.checked },
                    }))
                  }
                />
                <span className="field-hint muted">
                  Leave off — you need tear feed or you must press the feed button manually.
                </span>
              </label>
            </div>
          </section>

          <section className="panel label-settings-section">
            <h2>Layout template</h2>
            <p className="muted label-settings-section-lead">
              Built-in presets or custom layouts saved in this browser.
            </p>
            <div className="label-fields-grid">
              <label className="label-field label-field--wide">
                Template
                <select
                  value={selectOptionsValid ? selectValue : `${SEL_PRESET}compactRetail`}
                  onChange={(e) => {
                    const ref = parseSelectValue(e.target.value)
                    if (ref) applySelection(ref)
                  }}
                >
                  <optgroup label="Built-in">
                    {(Object.keys(LABEL_TEMPLATE_PRESETS) as LabelTemplateId[]).map((id) => (
                      <option key={id} value={`${SEL_PRESET}${id}`}>
                        {LABEL_TEMPLATE_PRESETS[id].name}
                      </option>
                    ))}
                  </optgroup>
                  {settings.customTemplates.length > 0 ? (
                    <optgroup label="Custom">
                      {settings.customTemplates.map((c) => (
                        <option key={c.id} value={`${SEL_CUSTOM}${c.id}`}>
                          {c.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
              </label>
              <label className="label-field label-field--quarter label-field--action">
                Preset
                <button type="button" className="btn small" onClick={() => void reapplyCurrentTemplate()}>
                  Re-apply current
                </button>
              </label>
              <label className="label-field label-field--half">
                Save current as custom
                <input
                  value={saveAsName}
                  onChange={(e) => setSaveAsName(e.target.value)}
                  placeholder="New template name"
                  maxLength={80}
                />
              </label>
              <label className="label-field label-field--quarter label-field--action">
                Save
                <button type="button" className="btn small primary" onClick={() => void saveCurrentAsCustom()}>
                  Save as custom
                </button>
              </label>
              <label className="label-field label-field--quarter label-field--action">
                Custom templates
                <div className="form-actions label-field-actions">
                  <button type="button" className="btn small" onClick={() => void duplicateCurrent()}>
                    Duplicate
                  </button>
                  <button
                    type="button"
                    className="btn small danger"
                    onClick={() => void deleteSelectedCustom()}
                    disabled={settings.templateRef.kind !== 'custom'}
                    title={settings.templateRef.kind !== 'custom' ? 'Select a custom template first' : undefined}
                  >
                    Delete
                  </button>
                </div>
              </label>
            </div>
            <p className="muted label-settings-footnote">
              Custom templates store dot positions in this browser. Duplicate copies the current layout into a new named
              template.
            </p>
          </section>

          <section className="panel label-settings-section">
            <h2>Content positioning (dots)</h2>
            <p className="muted label-settings-section-lead">
              203&nbsp;dpi reference: ~8 dots = 1&nbsp;mm. Editing a custom template updates it automatically.
            </p>
            <div className="label-fields-grid label-fields-grid--dots">
              <DotInput label="Name X" value={settings.template.nameX} onChange={(v) => patchTemplate({ nameX: v })} />
              <DotInput label="Name Y" value={settings.template.nameY} onChange={(v) => patchTemplate({ nameY: v })} />
              <DotInput label="SKU X" value={settings.template.skuX} onChange={(v) => patchTemplate({ skuX: v })} />
              <DotInput label="SKU Y" value={settings.template.skuY} onChange={(v) => patchTemplate({ skuY: v })} />
              <DotInput label="Price X" value={settings.template.priceX} onChange={(v) => patchTemplate({ priceX: v })} />
              <DotInput label="Price Y" value={settings.template.priceY} onChange={(v) => patchTemplate({ priceY: v })} />
              <DotInput label="Barcode X" value={settings.template.barcodeX} onChange={(v) => patchTemplate({ barcodeX: v })} />
              <DotInput label="Barcode Y" value={settings.template.barcodeY} onChange={(v) => patchTemplate({ barcodeY: v })} />
              <DotInput
                label="Barcode height"
                min={10}
                span="third"
                value={settings.template.barcodeHeight}
                onChange={(v) => patchTemplate({ barcodeHeight: v })}
              />
              <DotInput
                label="Barcode text X"
                span="third"
                value={settings.template.barcodeTextX}
                onChange={(v) => patchTemplate({ barcodeTextX: v })}
              />
              <DotInput
                label="Barcode text Y"
                span="third"
                value={settings.template.barcodeTextY}
                onChange={(v) => patchTemplate({ barcodeTextY: v })}
              />
            </div>
          </section>

          <section className="panel label-settings-section">
            <h2>Actions</h2>
            <div className="form-actions label-settings-actions">
              <TestLabelButton settings={settings} setError={setError} setNotice={setNotice} />
              <FontTestLabelButton settings={settings} setError={setError} setNotice={setNotice} />
              <CalibrateGapButton settings={settings} setError={setError} setNotice={setNotice} />
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  const defaults =
                    settings.layout.widthMm <= 42 ? DEFAULT_SMALL_LABEL_SETTINGS : DEFAULT_LABEL_SETTINGS
                  patchActiveProfile((p) => ({
                    ...p,
                    transport: { ...defaults.transport },
                    layout: { ...defaults.layout },
                    template: cloneLabelTemplate(defaults.template),
                    templateRef: defaults.templateRef,
                    copies: defaults.copies,
                  }))
                  setNotice('Transport, stock, copies, and layout preset reset for this profile. Custom templates kept.')
                  setError(null)
                }}
              >
                Reset defaults
              </button>
            </div>
          </section>
        </>
        )}
      </div>
    </BoShell>
  )
}
