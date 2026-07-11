import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { BoShell } from '../layouts/BoShell'
import { useAuth } from '../auth/AuthContext'
import { hasPermission } from '../auth/permissions'
import {
  apiFetch,
  fetchInvoiceDraft,
  isInvoiceIntakeConfigured,
  listSuppliers,
  markInvoiceDraftApplied,
  matchInvoiceLines,
  receiveInvoice,
  uploadInvoiceFiles,
} from '../api/client'
import type {
  InvoiceLineInput,
  InvoiceMatchResult,
  InvoiceMatchConfidence,
  Product,
  ReceiveInvoiceResult,
  ReceiveLineInput,
  StoreSettings,
  Supplier,
} from '../api/types'
import { ProductSkuLookupModal } from '../components/ProductSkuLookupModal'
import {
  getDefaultLabelProfile,
  profileToPrintSettings,
  readLabelPrinterConfig,
} from '../labels/labelSettings'
import { nextSequentialSku, suggestCreateName, variantGroupKey } from '../utils/receiveStockSku'
import { buildDecisionsFromMatch } from '../utils/receiveStockDecisions'

type EditLine = {
  id: string
  code: string
  description: string
  qty: string
  unitCost: string
}

type ManualPick = {
  productId: string
  sku: string
  name: string
  category?: string | null
  price?: number
  stock?: number
}

type RowDecision = {
  action: 'update' | 'create' | 'skip'
  productId: string | null
  manualPick?: ManualPick | null
  priceInput: string
  updatePrice: boolean
  newName: string
  newSku: string
  newCategory: string
  /** When true, auto-SKU will not overwrite this row. */
  newSkuManuallyEdited?: boolean
}

type ReceivingConfig = { defaultMarkupPct: number; markupByCategory: Record<string, number> }

const DEFAULT_RECEIVING: ReceivingConfig = { defaultMarkupPct: 100, markupByCategory: {} }

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `l-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function emptyLine(): EditLine {
  return { id: newId(), code: '', description: '', qty: '', unitCost: '' }
}

const CONFIDENCE_LABEL: Record<InvoiceMatchConfidence, string> = {
  exact: 'Exact',
  likely: 'Likely',
  uncertain: 'Check',
  new: 'New',
}

function applyAutoCreateSkus(
  decisions: RowDecision[],
  lines: InvoiceMatchResult['lines'],
  catalogSkus: string[],
): RowDecision[] {
  if (!lines.length || !catalogSkus.length) return decisions
  const used = new Set(catalogSkus.map((s) => s.trim()))
  const groupSku = new Map<string, string>()
  let allocator = nextSequentialSku(catalogSkus)

  const reserveNext = (): string => {
    while (used.has(allocator) || [...groupSku.values()].includes(allocator)) {
      allocator = String(Number(allocator) + 1)
    }
    const out = allocator
    allocator = String(Number(allocator) + 1)
    return out
  }

  return decisions.map((d, idx) => {
    if (d.action !== 'create') return d
    const line = lines[idx]
    if (!line) return d
    const key = variantGroupKey(line.input.description)
    const name = d.newName.trim() || suggestCreateName(line.input.description)

    if (d.newSkuManuallyEdited && d.newSku.trim()) {
      groupSku.set(key, d.newSku.trim())
      return { ...d, newName: name }
    }

    let sku = groupSku.get(key)
    if (!sku) {
      sku = reserveNext()
      groupSku.set(key, sku)
    }
    return { ...d, newName: name, newSku: sku, newSkuManuallyEdited: false }
  })
}

function countVariantSiblings(lines: InvoiceMatchResult['lines'], idx: number): number {
  const key = variantGroupKey(lines[idx]?.input.description ?? '')
  if (!key) return 0
  return lines.filter((l, i) => i !== idx && variantGroupKey(l.input.description) === key).length
}

const CONFIDENCE_COLOR: Record<InvoiceMatchConfidence, string> = {
  exact: '#166534',
  likely: '#3f6212',
  uncertain: '#854d0e',
  new: '#7f1d1d',
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Split a pasted invoice block into rows. Columns: tab or pipe separated. */
function parsePastedLines(raw: string): EditLine[] {
  const out: EditLine[] = []
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    const cols = line.includes('\t') ? line.split('\t') : line.split('|')
    const parts = cols.map((c) => c.trim())
    let code = ''
    let description = ''
    let qty = ''
    let unitCost = ''
    if (parts.length >= 4) {
      code = parts[0]
      description = parts[1]
      qty = parts[2]
      unitCost = parts[3]
    } else if (parts.length === 3) {
      description = parts[0]
      qty = parts[1]
      unitCost = parts[2]
    } else if (parts.length === 2) {
      description = parts[0]
      qty = parts[1]
    } else {
      description = parts[0]
    }
    if (!description) continue
    out.push({ id: newId(), code, description, qty, unitCost })
  }
  return out
}

export function ReceiveStockPage() {
  const { session } = useAuth()
  const canWrite = hasPermission(session?.user, 'catalog.write')
  const [searchParams, setSearchParams] = useSearchParams()
  const intakeEnabled = isInvoiceIntakeConfigured()

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [supplier, setSupplier] = useState('')
  const [stockMode, setStockMode] = useState<'add' | 'set'>('add')
  const [receiving, setReceiving] = useState<ReceivingConfig>(DEFAULT_RECEIVING)

  const [lines, setLines] = useState<EditLine[]>([emptyLine()])
  const [pasteText, setPasteText] = useState('')

  const [matchResult, setMatchResult] = useState<InvoiceMatchResult | null>(null)
  const [decisions, setDecisions] = useState<RowDecision[]>([])
  const [matching, setMatching] = useState(false)

  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState<ReceiveInvoiceResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [lookupRowIdx, setLookupRowIdx] = useState<number | null>(null)
  const [catalogSkus, setCatalogSkus] = useState<string[]>([])
  const [draftId, setDraftId] = useState<string | null>(null)
  const [intakeBusy, setIntakeBusy] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const loadedDraftRef = useRef<string | null>(null)

  useEffect(() => {
    if (!canWrite) return
    void listSuppliers()
      .then(setSuppliers)
      .catch(() => setSuppliers([]))
    void apiFetch<StoreSettings>('/settings/store')
      .then((s) => {
        const r = s.receiving
        if (r && typeof r.defaultMarkupPct === 'number') {
          setReceiving({ defaultMarkupPct: r.defaultMarkupPct, markupByCategory: r.markupByCategory ?? {} })
        }
      })
      .catch(() => {})
  }, [canWrite])

  const markupPctForCategory = useCallback(
    (category: string | null | undefined): number => {
      const key = (category || '').trim()
      if (key && receiving.markupByCategory[key] !== undefined) return receiving.markupByCategory[key]
      return receiving.defaultMarkupPct
    },
    [receiving],
  )

  const hydrateCatalogSkusForMatch = useCallback((res: InvoiceMatchResult, initial: RowDecision[]) => {
    setDecisions(initial)
    void apiFetch<Product[]>('/products')
      .then((list) => {
        const skus = list.map((p) => p.sku)
        setCatalogSkus(skus)
        setDecisions((prev) => applyAutoCreateSkus(prev, res.lines, skus))
      })
      .catch(() => setCatalogSkus([]))
  }, [])

  const loadDraft = useCallback(
    async (id: string) => {
      setError(null)
      setNotice(null)
      setResult(null)
      setIntakeBusy(true)
      try {
        const draft = await fetchInvoiceDraft(id)
        setDraftId(draft.draftId)
        setSupplier(draft.supplier)
        setLines(
          draft.extracted.lines.map((l) => ({
            id: newId(),
            code: l.code ?? '',
            description: l.description,
            qty: l.qty != null ? String(l.qty) : '',
            unitCost: l.unitCost != null ? String(l.unitCost) : '',
          })),
        )
        const initial = buildDecisionsFromMatch(draft.match)
        setMatchResult(draft.match)
        hydrateCatalogSkusForMatch(draft.match, initial)
        const warns = draft.extracted.parseMeta.warnings
        const warnText = warns.length ? ` Warnings: ${warns.join('; ')}` : ''
        setNotice(
          `Loaded AI draft (${draft.extracted.lines.length} lines, supplier from ${draft.supplierResolvedFrom}).${warnText}`,
        )
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load draft')
      } finally {
        setIntakeBusy(false)
      }
    },
    [hydrateCatalogSkusForMatch],
  )

  useEffect(() => {
    const id = searchParams.get('draft')
    if (!id || !canWrite || !intakeEnabled) return
    if (loadedDraftRef.current === id) return
    loadedDraftRef.current = id
    void loadDraft(id)
  }, [searchParams, canWrite, intakeEnabled, loadDraft])

  const computePreviewPrice = useCallback(
    (unitCost: number, category: string | null | undefined): number => {
      return round2(unitCost * (1 + markupPctForCategory(category) / 100))
    },
    [markupPctForCategory],
  )

  function updateLine(id: string, patch: Partial<EditLine>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  function removeLine(id: string) {
    setLines((prev) => (prev.length <= 1 ? [emptyLine()] : prev.filter((l) => l.id !== id)))
  }

  function applyPaste() {
    const parsed = parsePastedLines(pasteText)
    if (parsed.length === 0) {
      setError('Nothing to parse — paste one item per line.')
      return
    }
    setLines(parsed)
    setPasteText('')
    setMatchResult(null)
    setResult(null)
    setError(null)
    setNotice(`Loaded ${parsed.length} line${parsed.length === 1 ? '' : 's'}.`)
  }

  const cleanLines = useMemo(
    () => lines.filter((l) => l.description.trim().length > 0),
    [lines],
  )

  async function runMatch() {
    setError(null)
    setNotice(null)
    setResult(null)
    if (!supplier.trim()) {
      setError('Choose or enter a supplier.')
      return
    }
    if (cleanLines.length === 0) {
      setError('Add at least one line with a description.')
      return
    }
    const payload: InvoiceLineInput[] = cleanLines.map((l) => ({
      code: l.code.trim() || null,
      description: l.description.trim(),
      qty: l.qty.trim() ? Number(l.qty) : null,
      unitCost: l.unitCost.trim() ? Number(l.unitCost) : null,
    }))
    setMatching(true)
    try {
      const res = await matchInvoiceLines(supplier.trim(), payload)
      const initial = buildDecisionsFromMatch(res)
      setMatchResult(res)
      setDraftId(null)
      loadedDraftRef.current = null
      if (searchParams.get('draft')) {
        const next = new URLSearchParams(searchParams)
        next.delete('draft')
        setSearchParams(next, { replace: true })
      }
      hydrateCatalogSkusForMatch(res, initial)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Match failed')
    } finally {
      setMatching(false)
    }
  }

  function setDecision(idx: number, patch: Partial<RowDecision>) {
    setDecisions((prev) => {
      let next = prev.map((d, i) => {
        if (i !== idx) return d
        const merged = { ...d, ...patch }
        if (patch.action === 'create' && matchResult) {
          merged.newName =
            merged.newName.trim() || suggestCreateName(matchResult.lines[idx].input.description)
          merged.newSkuManuallyEdited = false
        }
        if (patch.newSku !== undefined) merged.newSkuManuallyEdited = true
        return merged
      })

      if (patch.productId !== undefined && patch.manualPick === undefined) {
        const line = matchResult?.lines[idx]
        const inCandidates = line?.candidates.some((c) => c.productId === patch.productId)
        if (inCandidates) {
          next = next.map((d, i) => (i === idx ? { ...d, manualPick: null } : d))
        }
      }

      if (
        matchResult &&
        catalogSkus.length > 0 &&
        (patch.action === 'create' ||
          patch.newName !== undefined ||
          (patch.newSku !== undefined && next[idx]?.action === 'create'))
      ) {
        const editedSku = patch.newSku?.trim()
        next = applyAutoCreateSkus(next, matchResult.lines, catalogSkus)
        if (editedSku && next[idx]?.action === 'create') {
          const key = variantGroupKey(matchResult.lines[idx].input.description)
          next = next.map((d, i) => {
            if (d.action !== 'create') return d
            if (variantGroupKey(matchResult.lines[i].input.description) !== key) return d
            return { ...d, newSku: editedSku, newSkuManuallyEdited: i === idx }
          })
        }
      }

      return next
    })
  }

  function applyManualPick(idx: number, product: Product) {
    setDecision(idx, {
      action: 'update',
      productId: product._id,
      manualPick: {
        productId: product._id,
        sku: product.sku,
        name: product.name,
        category: product.category ?? null,
        price: product.price,
        stock: product.stock,
      },
    })
    setLookupRowIdx(null)
  }

  function productForRow(idx: number): ManualPick | null {
    const dec = decisions[idx]
    if (!dec?.productId) return null
    if (dec.manualPick?.productId === dec.productId) return dec.manualPick
    const line = matchResult?.lines[idx]
    const cand = line?.candidates.find((c) => c.productId === dec.productId)
    if (!cand) return null
    return {
      productId: cand.productId,
      sku: cand.sku,
      name: cand.name,
      category: cand.category ?? null,
      price: cand.price,
      stock: cand.stock,
    }
  }

  function candidateForRow(idx: number) {
    const pick = productForRow(idx)
    if (!pick) return null
    return {
      productId: pick.productId,
      sku: pick.sku,
      name: pick.name,
      category: pick.category,
      price: pick.price,
      stock: pick.stock,
      score: 0,
      ratio: 0,
    }
  }

  function matchOptionsForRow(idx: number) {
    const line = matchResult?.lines[idx]
    const dec = decisions[idx]
    if (!line) return []
    const opts = [...line.candidates]
    const manual = dec?.manualPick
    if (manual && !opts.some((c) => c.productId === manual.productId)) {
      opts.unshift({
        productId: manual.productId,
        sku: manual.sku,
        name: manual.name,
        category: manual.category,
        price: manual.price,
        stock: manual.stock,
        score: 0,
        ratio: 0,
      })
    }
    return opts
  }

  function previewNewPriceForRow(idx: number): number | null {
    const line = matchResult?.lines[idx]
    const dec = decisions[idx]
    if (!line || !dec) return null
    if (dec.priceInput.trim()) {
      const n = Number(dec.priceInput)
      return Number.isFinite(n) ? round2(n) : null
    }
    const cost = line.input.unitCost
    if (cost == null) return null
    if (dec.action === 'update') {
      if (!dec.updatePrice) return null
      const cand = candidateForRow(idx)
      return computePreviewPrice(cost, cand?.category)
    }
    if (dec.action === 'create') return computePreviewPrice(cost, dec.newCategory || null)
    return null
  }

  async function applyReceive() {
    if (!matchResult) return
    setError(null)
    setNotice(null)
    const payload: ReceiveLineInput[] = []
    for (let i = 0; i < matchResult.lines.length; i++) {
      const line = matchResult.lines[i]
      const dec = decisions[i]
      if (!dec || dec.action === 'skip') {
        payload.push({ action: 'skip' })
        continue
      }
      const qty = line.input.qty ?? 0
      const unitCost = line.input.unitCost ?? null
      const priceOverride = dec.priceInput.trim() ? Number(dec.priceInput) : null
      if (dec.action === 'update') {
        if (!dec.productId) {
          setError(`Line ${i + 1}: pick a product or choose Skip/Create.`)
          return
        }
        payload.push({
          action: 'update',
          productId: dec.productId,
          qty,
          unitCost,
          supplierCode: line.input.code ?? null,
          supplierDescription: line.input.description,
          updatePrice: dec.updatePrice,
          priceOverride,
        })
      } else {
        if (!dec.newName.trim() || !dec.newSku.trim()) {
          setError(`Line ${i + 1}: new item needs a name and SKU.`)
          return
        }
        payload.push({
          action: 'create',
          qty,
          unitCost,
          supplierCode: line.input.code ?? null,
          supplierDescription: line.input.description,
          priceOverride,
          newProduct: {
            name: dec.newName.trim(),
            sku: dec.newSku.trim(),
            category: dec.newCategory.trim() || null,
          },
        })
      }
    }
    setApplying(true)
    try {
      const res = await receiveInvoice({ supplier: supplier.trim(), stockMode, lines: payload })
      setResult(res)
      setNotice(`Applied ${res.applied}, skipped ${res.skipped}${res.failed ? `, failed ${res.failed}` : ''}.`)
      if (draftId) void markInvoiceDraftApplied(draftId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Apply failed')
    } finally {
      setApplying(false)
    }
  }

  async function printLabelsForResult() {
    if (!result || !window.electronBo) {
      setError('Label printing is available in the desktop app only.')
      return
    }
    const profile = getDefaultLabelProfile(readLabelPrinterConfig())
    const s = profileToPrintSettings(profile)
    const toPrint = result.lines.filter((l) => l.ok && l.sku)
    if (toPrint.length === 0) {
      setError('No applied lines to print.')
      return
    }
    setError(null)
    let ok = 0
    for (const l of toPrint) {
      try {
        const r = await window.electronBo.printProductLabel(
          s.transport,
          {
            name: l.name ?? '',
            sku: l.sku ?? '',
            barcodeValue: (l.barcode ?? '').trim() || (l.sku ?? ''),
            price: l.newPrice ?? 0,
          },
          {
            copies: 1,
            layout: s.layout,
            template: s.template,
            presetId: s.templateRef.kind === 'preset' ? s.templateRef.presetId : undefined,
          },
        )
        if (r.ok) ok += 1
      } catch {
        // continue printing the rest
      }
    }
    setNotice(`Printed ${ok}/${toPrint.length} labels (${profile.name}).`)
  }

  function resetAll() {
    setLines([emptyLine()])
    setPasteText('')
    setMatchResult(null)
    setDecisions([])
    setResult(null)
    setError(null)
    setNotice(null)
    setLookupRowIdx(null)
    setDraftId(null)
    loadedDraftRef.current = null
    if (searchParams.get('draft')) {
      const next = new URLSearchParams(searchParams)
      next.delete('draft')
      setSearchParams(next, { replace: true })
    }
  }

  async function handlePhotoUpload(fileList: FileList | File[]) {
    const files = Array.from(fileList)
    if (!files.length) return
    setError(null)
    setNotice(null)
    setResult(null)
    setIntakeBusy(true)
    try {
      const res = await uploadInvoiceFiles(files)
      loadedDraftRef.current = res.draftId
      setSearchParams({ draft: res.draftId }, { replace: true })
      await loadDraft(res.draftId)
      if (res.warnings?.length) {
        setNotice((prev) => `${prev ?? ''} ${res.warnings!.join(' ')}`.trim())
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invoice photo intake failed')
    } finally {
      setIntakeBusy(false)
      if (photoInputRef.current) photoInputRef.current.value = ''
    }
  }

  return (
    <BoShell>
      <h1>Receive stock</h1>
      <p className="muted">
        Enter a supplier invoice, match each line to your catalog, then apply to update stock, cost and price.
        Confirmed matches teach the system this supplier&apos;s codes for next time.
      </p>

      {!canWrite && <p className="error">Permission required: catalog write.</p>}

      {canWrite && (
        <>
          {error && <p className="error">{error}</p>}
          {notice && <p className="success">{notice}</p>}

          <section className="panel">
            <div className="inline-form" style={{ flexWrap: 'wrap', gap: '1rem' }}>
              <label>
                Supplier
                <input
                  list="receive-supplier-list"
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  placeholder="e.g. Neetvlei"
                />
                <datalist id="receive-supplier-list">
                  {suppliers.map((s) => (
                    <option key={s._id} value={s.name} />
                  ))}
                </datalist>
              </label>
              <label>
                Quantity mode
                <select value={stockMode} onChange={(e) => setStockMode(e.target.value as 'add' | 'set')}>
                  <option value="add">Add to stock (receiving)</option>
                  <option value="set">Set stock (stock-take)</option>
                </select>
              </label>
              <span className="muted" style={{ alignSelf: 'end' }}>
                Default markup {receiving.defaultMarkupPct}% on cost
              </span>
            </div>
          </section>

          <section className="panel">
            <h2>1 · Invoice lines</h2>
            {intakeEnabled && (
              <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--panel-alt, #f4f4f5)', borderRadius: '6px' }}>
                <strong>Invoice photo / PDF</strong>
                <p className="muted" style={{ margin: '0.35rem 0' }}>
                  Upload a PDF or one/more page photos (select several images for multipage). OCR + local AI on Steve
                  merges pages into one draft. Or drop files in <code>~/cognipos-inbox/inbox/</code>.
                </p>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*,application/pdf,.pdf"
                  multiple
                  disabled={intakeBusy}
                  onChange={(e) => {
                    const list = e.target.files
                    if (list?.length) void handlePhotoUpload(list)
                  }}
                />
                {intakeBusy && <p className="muted">Processing invoice…</p>}
                {draftId && <p className="muted">Draft: {draftId}</p>}
                <p className="muted" style={{ marginTop: '0.5rem' }}>
                  New supplier format?{' '}
                  <Link to="/invoice-layouts">Teach invoice layout</Link>
                </p>
              </div>
            )}
            <p className="muted">
              Paste from a spreadsheet (tab or <code>|</code> separated: code, description, qty, unit cost) or edit
              the rows directly.
            </p>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={4}
              placeholder={'78000016\tAXIL FRONT SKEWER 5/16\t10\t14.00'}
              style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.85rem' }}
            />
            <div style={{ margin: '0.5rem 0' }}>
              <button type="button" className="btn small" onClick={applyPaste} disabled={!pasteText.trim()}>
                Load pasted lines
              </button>
            </div>

            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: '9rem' }}>Supplier code</th>
                  <th>Description</th>
                  <th style={{ width: '5rem' }}>Qty</th>
                  <th style={{ width: '6rem' }}>Unit cost</th>
                  <th style={{ width: '3rem' }} />
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <input value={l.code} onChange={(e) => updateLine(l.id, { code: e.target.value })} />
                    </td>
                    <td>
                      <input
                        value={l.description}
                        onChange={(e) => updateLine(l.id, { description: e.target.value })}
                        style={{ width: '100%' }}
                      />
                    </td>
                    <td>
                      <input
                        value={l.qty}
                        inputMode="decimal"
                        onChange={(e) => updateLine(l.id, { qty: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        value={l.unitCost}
                        inputMode="decimal"
                        onChange={(e) => updateLine(l.id, { unitCost: e.target.value })}
                      />
                    </td>
                    <td className="actions-cell">
                      <button type="button" className="btn small ghost" onClick={() => removeLine(l.id)}>
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button type="button" className="btn small" onClick={() => setLines((p) => [...p, emptyLine()])}>
                + Add row
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() => void runMatch()}
                disabled={matching || cleanLines.length === 0}
              >
                {matching ? 'Matching…' : 'Find matches'}
              </button>
            </div>
          </section>

          {matchResult && (
            <section className="panel">
              <h2>2 · Review matches</h2>
              <p className="muted">
                {matchResult.stats.exact} exact · {matchResult.stats.likely} likely · {matchResult.stats.uncertain}{' '}
                to check · {matchResult.stats.neu} new. Wrong guess? Use <strong>SKU lookup</strong> on any line.
              </p>
              <table className="table">
                <thead>
                  <tr>
                    <th>Invoice line</th>
                    <th style={{ width: '7rem' }}>Confidence</th>
                    <th style={{ width: '9rem' }}>Action</th>
                    <th>Match / new item</th>
                    <th style={{ width: '8rem' }}>New price</th>
                  </tr>
                </thead>
                <tbody>
                  {matchResult.lines.map((ml, idx) => {
                    const dec = decisions[idx]
                    if (!dec) return null
                    const preview = previewNewPriceForRow(idx)
                    return (
                      <tr key={idx}>
                        <td>
                          <div>{ml.input.description}</div>
                          <div className="muted" style={{ fontSize: '0.8rem' }}>
                            {ml.input.code ? `${ml.input.code} · ` : ''}
                            qty {ml.input.qty ?? '—'} · cost {ml.input.unitCost ?? '—'}
                          </div>
                        </td>
                        <td>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '0.1rem 0.5rem',
                              borderRadius: 6,
                              color: '#fff',
                              fontSize: '0.78rem',
                              background: CONFIDENCE_COLOR[ml.confidence],
                            }}
                          >
                            {CONFIDENCE_LABEL[ml.confidence]}
                          </span>
                        </td>
                        <td>
                          <select
                            value={dec.action}
                            onChange={(e) => setDecision(idx, { action: e.target.value as RowDecision['action'] })}
                          >
                            <option value="update">Update existing</option>
                            <option value="create">Create new</option>
                            <option value="skip">Skip</option>
                          </select>
                        </td>
                        <td>
                          {dec.action === 'update' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                              <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                                <select
                                  value={dec.productId ?? ''}
                                  onChange={(e) => setDecision(idx, { productId: e.target.value || null })}
                                  style={{ flex: 1, minWidth: 0 }}
                                >
                                  <option value="">— pick product —</option>
                                  {matchOptionsForRow(idx).map((c) => (
                                    <option key={c.productId} value={c.productId}>
                                      {c.sku} · {c.name} (R{c.price} · stk {c.stock})
                                      {dec.manualPick?.productId === c.productId ? ' · picked' : ''}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  className="btn small"
                                  onClick={() => setLookupRowIdx(idx)}
                                >
                                  SKU lookup
                                </button>
                              </div>
                              {productForRow(idx) ? (
                                <span className="muted" style={{ fontSize: '0.78rem' }}>
                                  Selected: {productForRow(idx)?.sku} · {productForRow(idx)?.name}
                                </span>
                              ) : null}
                            </div>
                          )}
                          {dec.action === 'create' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                              <input
                                value={dec.newName}
                                placeholder="Name"
                                onChange={(e) => setDecision(idx, { newName: e.target.value })}
                              />
                              <div style={{ display: 'flex', gap: '0.25rem' }}>
                                <input
                                  value={dec.newSku}
                                  placeholder="SKU"
                                  onChange={(e) => setDecision(idx, { newSku: e.target.value })}
                                  style={{ width: '6rem' }}
                                />
                                <input
                                  value={dec.newCategory}
                                  placeholder="Category (optional)"
                                  onChange={(e) => setDecision(idx, { newCategory: e.target.value })}
                                  style={{ flex: 1 }}
                                />
                              </div>
                              {countVariantSiblings(matchResult.lines, idx) > 0 ? (
                                <span className="muted" style={{ fontSize: '0.78rem' }}>
                                  Colour variant — shares one SKU with matching lines on this invoice.
                                </span>
                              ) : null}
                              {!dec.newSku.trim() && catalogSkus.length === 0 ? (
                                <span className="muted" style={{ fontSize: '0.78rem' }}>
                                  Loading next SKU…
                                </span>
                              ) : null}
                            </div>
                          )}
                          {dec.action === 'skip' && (
                            <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                              <span className="muted">Skipped</span>
                              <button
                                type="button"
                                className="btn small"
                                onClick={() => setLookupRowIdx(idx)}
                              >
                                SKU lookup
                              </button>
                            </div>
                          )}
                        </td>
                        <td>
                          {dec.action === 'skip' ? (
                            <span className="muted">—</span>
                          ) : (
                            <input
                              value={dec.priceInput}
                              placeholder={preview != null ? String(preview) : 'price'}
                              inputMode="decimal"
                              onChange={(e) => setDecision(idx, { priceInput: e.target.value })}
                              style={{ width: '6rem' }}
                            />
                          )}
                          {dec.action === 'update' && (
                            <label style={{ display: 'block', fontSize: '0.75rem' }} className="muted">
                              <input
                                type="checkbox"
                                checked={dec.updatePrice}
                                onChange={(e) => setDecision(idx, { updatePrice: e.target.checked })}
                              />{' '}
                              update price
                            </label>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => void applyReceive()}
                  disabled={applying}
                >
                  {applying ? 'Applying…' : `Apply to catalog (${stockMode === 'add' ? 'add stock' : 'set stock'})`}
                </button>
                <button type="button" className="btn ghost" onClick={resetAll}>
                  Reset
                </button>
              </div>
            </section>
          )}

          <ProductSkuLookupModal
            open={lookupRowIdx != null}
            invoiceLine={
              lookupRowIdx != null ? matchResult?.lines[lookupRowIdx]?.input.description ?? null : null
            }
            onSelect={(product) => {
              if (lookupRowIdx != null) applyManualPick(lookupRowIdx, product)
            }}
            onClose={() => setLookupRowIdx(null)}
          />

          {result && (
            <section className="panel">
              <h2>3 · Result</h2>
              <table className="table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>SKU</th>
                    <th>Stock</th>
                    <th>Price</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {result.lines.map((l, i) => (
                    <tr key={i}>
                      <td>{l.name ?? (l.action === 'skip' ? '(skipped)' : '—')}</td>
                      <td>{l.sku ?? '—'}</td>
                      <td>
                        {l.previousStock != null && l.newStock != null
                          ? `${l.previousStock} → ${l.newStock}`
                          : '—'}
                      </td>
                      <td>
                        {l.priceChanged && l.previousPrice != null && l.newPrice != null
                          ? `${l.previousPrice} → ${l.newPrice}`
                          : l.newPrice != null
                            ? l.newPrice
                            : '—'}
                      </td>
                      <td>
                        {l.ok ? (
                          <span className="success">
                            {l.created ? 'created' : l.action === 'skip' ? 'skipped' : 'updated'}
                            {l.supplierRefWritten ? ' · learned' : ''}
                          </span>
                        ) : (
                          <span className="error">{l.message ?? 'failed'}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                <button type="button" className="btn" onClick={() => void printLabelsForResult()}>
                  Print labels for applied items
                </button>
                <button type="button" className="btn ghost" onClick={resetAll}>
                  New invoice
                </button>
              </div>
            </section>
          )}
        </>
      )}
    </BoShell>
  )
}
