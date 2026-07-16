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
  lookupInvoiceDraftDuplicates,
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
  ReceiveResultLine,
  StoreSettings,
  Supplier,
} from '../api/types'
import { BusyModal, waitForModalPaint } from '../components/BusyModal'
import { ProductSkuLookupModal } from '../components/ProductSkuLookupModal'
import {
  formatProfileSummary,
  getLabelProfileById,
  profileToPrintSettings,
  readLabelPrinterConfig,
  resolveInitialPrintProfileId,
  writeLastUsedLabelProfileId,
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

type LabelBatchRow = {
  key: string
  name: string
  sku: string
  barcode: string | null
  price: number
  copies: number
  profileId: string
  included: boolean
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

function defaultLabelCopiesForLine(line: ReceiveResultLine): number {
  if (line.previousStock != null && line.newStock != null) {
    const delta = Math.round(line.newStock - line.previousStock)
    if (delta > 0) return Math.min(100, delta)
  }
  if (line.newStock != null && line.newStock > 0) return Math.min(100, Math.round(line.newStock))
  return 1
}

function formatLabelPrintError(raw: string, profileName: string, transportHint?: string): string {
  const msg = raw.trim()
  const pathMatch = msg.match(/open ['"]([^'"]+)['"]/i)
  const devicePath = pathMatch?.[1] ?? (transportHint?.startsWith('/dev/') ? transportHint : null)
  if (/ENOENT|no such file or directory/i.test(msg) && devicePath) {
    return (
      `${profileName}: printer device not found (${devicePath}). ` +
      `Plug the label printer in (or pick the other size), then open Label settings → Detect USB device.`
    )
  }
  if (/EBUSY|EAGAIN|EPERM|busy/i.test(msg)) {
    return `${profileName}: printer busy${devicePath ? ` (${devicePath})` : ''}. Wait a moment and try again.`
  }
  return `${profileName}: ${msg}`
}

function buildLabelBatchRows(lines: ReceiveResultLine[]): LabelBatchRow[] {
  const defaultProfileId = resolveInitialPrintProfileId()
  return lines
    .filter((l) => l.ok && l.sku && l.action !== 'skip')
    .map((l, i) => ({
      key: `${l.productId ?? l.sku ?? 'line'}-${i}`,
      name: l.name ?? l.sku ?? 'Item',
      sku: l.sku!,
      barcode: (l.barcode ?? '').trim() || null,
      price: typeof l.newPrice === 'number' ? l.newPrice : 0,
      copies: defaultLabelCopiesForLine(l),
      profileId: defaultProfileId,
      included: true,
    }))
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
  exact: '#22c55e',
  likely: '#84cc16',
  uncertain: '#eab308',
  new: '#f87171',
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
  const [applySuccess, setApplySuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [lookupRowIdx, setLookupRowIdx] = useState<number | null>(null)
  const [catalogSkus, setCatalogSkus] = useState<string[]>([])
  const [draftId, setDraftId] = useState<string | null>(null)
  const [draftParseMeta, setDraftParseMeta] = useState<{
    layoutSupplierName?: string | null
    layoutProfileVersion?: number | null
    unitCostVatMode?: 'ex_vat' | 'inc_vat'
    vatRatePct?: number
    unitCostsConvertedFromIncVat?: boolean
  } | null>(null)
  const [draftInvoiceNumber, setDraftInvoiceNumber] = useState<string | null>(null)
  const [draftDuplicates, setDraftDuplicates] = useState<
    Array<{ draftId: string; status: string; deepLink: string; appliedAt?: string | null }>
  >([])
  const [allowDuplicateApply, setAllowDuplicateApply] = useState(false)
  const [intakeBusy, setIntakeBusy] = useState(false)
  const [intakeBusyKind, setIntakeBusyKind] = useState<'upload' | 'draft' | null>(null)
  const [labelBatchOpen, setLabelBatchOpen] = useState(false)
  const [labelBatchRows, setLabelBatchRows] = useState<LabelBatchRow[]>([])
  const [labelBatchBusy, setLabelBatchBusy] = useState(false)
  const [labelBatchError, setLabelBatchError] = useState<string | null>(null)
  const resultSectionRef = useRef<HTMLElement | null>(null)
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
      setApplySuccess(false)
      setIntakeBusyKind('draft')
      setIntakeBusy(true)
      await waitForModalPaint()
      try {
        const draft = await fetchInvoiceDraft(id)
        setDraftId(draft.draftId)
        setSupplier(draft.supplier)
        setDraftInvoiceNumber(draft.extracted.invoiceNumber ?? null)
        setDraftParseMeta({
          layoutSupplierName: draft.extracted.parseMeta.layoutSupplierName,
          layoutProfileVersion: draft.extracted.parseMeta.layoutProfileVersion,
          unitCostVatMode: draft.extracted.parseMeta.unitCostVatMode,
          vatRatePct: draft.extracted.parseMeta.vatRatePct,
          unitCostsConvertedFromIncVat: draft.extracted.parseMeta.unitCostsConvertedFromIncVat,
        })
        setDraftDuplicates([])
        setAllowDuplicateApply(false)
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
        const inv = draft.extracted.invoiceNumber ? ` Invoice #${draft.extracted.invoiceNumber}.` : ''
        setNotice(
          `Loaded AI draft (${draft.extracted.lines.length} lines, supplier from ${draft.supplierResolvedFrom}).${inv}${warnText}`,
        )
        if (draft.extracted.invoiceNumber) {
          try {
            const lookup = await lookupInvoiceDraftDuplicates(draft.supplier, draft.extracted.invoiceNumber)
            setDraftDuplicates(
              lookup.matches
                .filter((m) => m.draftId !== draft.draftId)
                .map((d) => ({
                  draftId: d.draftId,
                  status: d.status,
                  deepLink: d.deepLink,
                  appliedAt: d.appliedAt,
                })),
            )
          } catch {
            /* non-fatal */
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load draft')
      } finally {
        setIntakeBusy(false)
        setIntakeBusyKind(null)
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
    setApplySuccess(false)
    setError(null)
    setNotice(`Loaded ${parsed.length} line${parsed.length === 1 ? '' : 's'}.`)
  }

  const labelPrinterProfiles = useMemo(
    () => (labelBatchOpen ? readLabelPrinterConfig().profiles : []),
    [labelBatchOpen],
  )

  const cleanLines = useMemo(
    () => lines.filter((l) => l.description.trim().length > 0),
    [lines],
  )

  async function runMatch() {
    setError(null)
    setNotice(null)
    setResult(null)
    setApplySuccess(false)
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
    const appliedDupes = draftDuplicates.filter((d) => d.status === 'applied')
    if (appliedDupes.length && !allowDuplicateApply) {
      setError(
        `Invoice ${draftInvoiceNumber ?? ''} was already applied. Tick “Apply anyway” below to continue, or open the prior draft.`,
      )
      return
    }
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
      setApplySuccess(true)
      setNotice(
        `Applied ${res.applied}, skipped ${res.skipped}${res.failed ? `, failed ${res.failed}` : ''}. Invoice saved — mark paid on Supplier invoices when settled.`,
      )
      if (draftId) void markInvoiceDraftApplied(draftId)
      window.setTimeout(() => {
        resultSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 50)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Apply failed')
      setApplySuccess(false)
    } finally {
      setApplying(false)
    }
  }

  function openLabelBatchModal() {
    if (!result) return
    const rows = buildLabelBatchRows(result.lines)
    if (!rows.length) {
      setError('No applied items with SKUs to print.')
      return
    }
    setError(null)
    setLabelBatchError(null)
    setLabelBatchRows(rows)
    setLabelBatchOpen(true)
  }

  function updateLabelBatchRow(key: string, patch: Partial<LabelBatchRow>) {
    setLabelBatchRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  async function printLabelBatch() {
    if (!window.electronBo?.printProductLabel) {
      setLabelBatchError('Label printing is available in the CogniPOS desktop app only (not the browser).')
      return
    }
    const selected = labelBatchRows.filter((r) => r.included && r.copies > 0)
    if (!selected.length) {
      setLabelBatchError('Select at least one item with quantity ≥ 1.')
      return
    }
    const config = readLabelPrinterConfig()
    setLabelBatchBusy(true)
    setLabelBatchError(null)
    let ok = 0
    let fail = 0
    let lastProfileName = ''
    try {
      for (const row of selected) {
        const profile =
          getLabelProfileById(row.profileId, config) ??
          config.profiles.find((p) => p.isDefault) ??
          config.profiles[0]
        if (!profile) {
          fail += 1
          continue
        }
        lastProfileName = profile.name
        const s = profileToPrintSettings(profile)
        const transportPath = s.transport.kind === 'usb' ? s.transport.path : `${s.transport.host}:${s.transport.port}`
        try {
          const r = await window.electronBo.printProductLabel(
            s.transport,
            {
              name: row.name,
              sku: row.sku,
              barcodeValue: (row.barcode ?? '').trim() || row.sku,
              price: row.price,
            },
            {
              copies: Math.max(1, Math.min(100, Math.floor(row.copies))),
              layout: s.layout,
              template: s.template,
              presetId: s.templateRef.kind === 'preset' ? s.templateRef.presetId : undefined,
            },
          )
          if (r.ok) {
            ok += 1
            writeLastUsedLabelProfileId(profile.id)
          } else {
            fail += 1
            const friendly = formatLabelPrintError(r.error ?? 'Label print failed', profile.name, transportPath)
            setLabelBatchError(friendly)
            if (/not found|ENOENT|no such file/i.test(friendly)) break
          }
        } catch (e) {
          fail += 1
          const raw = e instanceof Error ? e.message : 'Print failed'
          const friendly = formatLabelPrintError(raw, profile.name, transportPath)
          setLabelBatchError(friendly)
          if (/not found|ENOENT|no such file/i.test(friendly)) break
        }
      }
      if (ok > 0) {
        setNotice(
          `Printed labels for ${ok} item${ok === 1 ? '' : 's'}${fail ? ` (${fail} failed)` : ''}${
            lastProfileName ? ` — last printer: ${lastProfileName}` : ''
          }.`,
        )
      }
      if (fail === 0) setLabelBatchOpen(false)
    } finally {
      setLabelBatchBusy(false)
    }
  }

  function resetAll() {
    setLines([emptyLine()])
    setPasteText('')
    setMatchResult(null)
    setDecisions([])
    setResult(null)
    setApplySuccess(false)
    setError(null)
    setNotice(null)
    setLookupRowIdx(null)
    setDraftId(null)
    setDraftParseMeta(null)
    setDraftInvoiceNumber(null)
    setDraftDuplicates([])
    setAllowDuplicateApply(false)
    setLabelBatchOpen(false)
    setLabelBatchRows([])
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
    setApplySuccess(false)
    setIntakeBusyKind('upload')
    setIntakeBusy(true)
    await waitForModalPaint()
    try {
      const res = await uploadInvoiceFiles(files)
      loadedDraftRef.current = res.draftId
      setSearchParams({ draft: res.draftId }, { replace: true })
      setDraftDuplicates(
        (res.duplicates ?? []).map((d) => ({
          draftId: d.draftId,
          status: d.status,
          deepLink: d.deepLink,
          appliedAt: d.appliedAt,
        })),
      )
      setAllowDuplicateApply(false)
      // Keep modal open through draft load (loadDraft owns busy teardown).
      setIntakeBusyKind('draft')
      await loadDraft(res.draftId)
      if (res.warnings?.length) {
        setNotice((prev) => `${prev ?? ''} ${res.warnings!.join(' ')}`.trim())
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invoice photo intake failed')
      setIntakeBusy(false)
      setIntakeBusyKind(null)
    } finally {
      if (photoInputRef.current) photoInputRef.current.value = ''
    }
  }

  useEffect(() => {
    if (!intakeBusy) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.body.style.overflow = prevOverflow
    }
  }, [intakeBusy])

  const intakeBusyCopy =
    intakeBusyKind === 'draft'
      ? {
          title: 'Loading invoice draft…',
          message: 'Fetching extracted lines and catalog matches. Stay on this page until it finishes.',
        }
      : {
          title: 'Processing invoice…',
          message:
            'Running OCR and structuring line items. This can take a minute for PDFs — please stay on this page.',
        }

  return (
    <BoShell>
      <BusyModal open={intakeBusy} title={intakeBusyCopy.title} message={intakeBusyCopy.message} />
      <h1>Receive stock</h1>
      <p className="muted">
        Enter a supplier invoice, match each line to your catalog, then apply to update stock, cost and price.
        Confirmed matches teach the system this supplier&apos;s codes for next time.
      </p>

      {!canWrite && <p className="error">Permission required: catalog write.</p>}

          {canWrite && (
        <>
          {error && <p className="error">{error}</p>}
          {notice && !applySuccess && <p className="success">{notice}</p>}

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

          <section className="panel receive-stock-lines">
            <h2>1 · Invoice lines</h2>
            {intakeEnabled && (
              <div className="receive-stock-upload">
                <strong className="receive-stock-upload-title">Invoice photo / PDF</strong>
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
                {draftId && <p className="muted">Draft: {draftId}</p>}
                {draftId && (draftInvoiceNumber || draftParseMeta) ? (
                  <div className="receive-stock-layout-meta" style={{ marginTop: '0.5rem' }}>
                    {draftInvoiceNumber ? (
                      <p className="muted" style={{ margin: '0.25rem 0' }}>
                        Invoice / doc #: <strong>{draftInvoiceNumber}</strong>
                      </p>
                    ) : null}
                    {draftParseMeta?.unitCostsConvertedFromIncVat || draftParseMeta?.unitCostVatMode === 'inc_vat' ? (
                      <p className="muted" style={{ margin: '0.25rem 0' }}>
                        Unit costs treated as VAT-inclusive (
                        {draftParseMeta.vatRatePct ?? 15}%)
                        {draftParseMeta.unitCostsConvertedFromIncVat ? ' — converted to ex VAT for stock.' : '.'}
                      </p>
                    ) : null}
                    {draftParseMeta?.layoutSupplierName ? (
                      <p className="muted" style={{ margin: '0.25rem 0' }}>
                        Parsed using layout{' '}
                        <strong>
                          {draftParseMeta.layoutSupplierName} v{draftParseMeta.layoutProfileVersion ?? '?'}
                        </strong>
                      </p>
                    ) : (
                      <p className="muted" style={{ margin: '0.25rem 0' }}>
                        No taught layout — generic OCR + AI.
                      </p>
                    )}
                    {supplier ? (
                      <Link
                        to={`/invoice-layouts?fromDraft=${encodeURIComponent(draftId)}&supplier=${encodeURIComponent(supplier)}`}
                      >
                        {draftParseMeta?.layoutProfileVersion
                          ? 'Re-teach layout from this invoice'
                          : 'Teach layout from this invoice'}
                      </Link>
                    ) : null}
                  </div>
                ) : null}
                {draftDuplicates.length > 0 ? (
                  <div className="receive-stock-dupe-warn">
                    <strong>Possible duplicate invoice</strong>
                    <ul className="small-print" style={{ margin: '0.35rem 0 0.5rem' }}>
                      {draftDuplicates.map((d) => (
                        <li key={d.draftId}>
                          {d.status === 'applied' ? 'Already applied' : 'Pending'} draft{' '}
                          <Link to={d.deepLink}>{d.draftId.slice(0, 8)}…</Link>
                          {d.appliedAt ? ` (${new Date(d.appliedAt).toLocaleDateString()})` : ''}
                        </li>
                      ))}
                    </ul>
                    {draftDuplicates.some((d) => d.status === 'applied') ? (
                      <label className="small-print">
                        <input
                          type="checkbox"
                          checked={allowDuplicateApply}
                          onChange={(e) => setAllowDuplicateApply(e.target.checked)}
                        />{' '}
                        Apply anyway (I understand this may double-receive stock)
                      </label>
                    ) : null}
                  </div>
                ) : null}
                <p className="muted" style={{ marginTop: '0.5rem' }}>
                  New supplier format?{' '}
                  <Link to="/invoice-layouts">Teach invoice layout</Link>
                </p>
              </div>
            )}
            <div className="receive-stock-paste">
              <p className="muted">
                Paste from a spreadsheet (tab or <code>|</code> separated: code, description, qty, unit cost) or edit
                the rows directly.
              </p>
              <textarea
                className="receive-stock-paste-input"
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={4}
                placeholder={'78000016\tAXIL FRONT SKEWER 5/16\t10\t14.00'}
              />
              <div className="receive-stock-paste-actions">
                <button type="button" className="btn small" onClick={applyPaste} disabled={!pasteText.trim()}>
                  Load pasted lines
                </button>
              </div>
            </div>

            <div className="receive-stock-rows">
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
            <div className="receive-stock-row-actions">
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
            </div>
          </section>

          {matchResult && (
            <section className="panel receive-stock-matches">
              <h2>2 · Review matches</h2>
              <p className="muted">
                {matchResult.stats.exact} exact · {matchResult.stats.likely} likely · {matchResult.stats.uncertain}{' '}
                to check · {matchResult.stats.neu} new. Wrong guess? Use <strong>SKU lookup</strong> on any line.
              </p>
              <div className="receive-stock-matches-wrap">
              <table className="table receive-stock-matches-table">
                <thead>
                  <tr>
                    <th className="receive-stock-col-line">Invoice line</th>
                    <th className="receive-stock-col-conf">Confidence</th>
                    <th className="receive-stock-col-action">Action</th>
                    <th className="receive-stock-col-match">Match / new item</th>
                    <th className="receive-stock-col-price">New price</th>
                  </tr>
                </thead>
                <tbody>
                  {matchResult.lines.map((ml, idx) => {
                    const dec = decisions[idx]
                    if (!dec) return null
                    const preview = previewNewPriceForRow(idx)
                    return (
                      <tr key={idx} className="receive-stock-match-row">
                        <td data-label="Invoice line">
                          <div className="receive-stock-match-desc">{ml.input.description}</div>
                          <div className="receive-stock-match-meta">
                            {ml.input.code ? `${ml.input.code} · ` : ''}
                            qty {ml.input.qty ?? '—'} · cost {ml.input.unitCost ?? '—'}
                          </div>
                        </td>
                        <td data-label="Confidence">
                          <span
                            className="receive-stock-confidence"
                            style={{ background: CONFIDENCE_COLOR[ml.confidence] }}
                          >
                            {CONFIDENCE_LABEL[ml.confidence]}
                          </span>
                        </td>
                        <td data-label="Action">
                          <select
                            value={dec.action}
                            onChange={(e) => setDecision(idx, { action: e.target.value as RowDecision['action'] })}
                          >
                            <option value="update">Update existing</option>
                            <option value="create">Create new</option>
                            <option value="skip">Skip</option>
                          </select>
                        </td>
                        <td data-label="Match / new item">
                          {dec.action === 'update' && (
                            <div className="receive-stock-match-controls">
                              <div className="receive-stock-match-pick">
                                <select
                                  value={dec.productId ?? ''}
                                  onChange={(e) => setDecision(idx, { productId: e.target.value || null })}
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
                                <span className="muted receive-stock-match-selected">
                                  Selected: {productForRow(idx)?.sku} · {productForRow(idx)?.name}
                                </span>
                              ) : null}
                            </div>
                          )}
                          {dec.action === 'create' && (
                            <div className="receive-stock-match-controls">
                              <input
                                value={dec.newName}
                                placeholder="Name"
                                onChange={(e) => setDecision(idx, { newName: e.target.value })}
                              />
                              <div className="receive-stock-match-pick">
                                <input
                                  value={dec.newSku}
                                  placeholder="SKU"
                                  onChange={(e) => setDecision(idx, { newSku: e.target.value })}
                                  className="receive-stock-new-sku"
                                />
                                <input
                                  value={dec.newCategory}
                                  placeholder="Category (optional)"
                                  onChange={(e) => setDecision(idx, { newCategory: e.target.value })}
                                />
                              </div>
                              {countVariantSiblings(matchResult.lines, idx) > 0 ? (
                                <span className="muted receive-stock-match-selected">
                                  Colour variant — shares one SKU with matching lines on this invoice.
                                </span>
                              ) : null}
                              {!dec.newSku.trim() && catalogSkus.length === 0 ? (
                                <span className="muted receive-stock-match-selected">
                                  Loading next SKU…
                                </span>
                              ) : null}
                            </div>
                          )}
                          {dec.action === 'skip' && (
                            <div className="receive-stock-match-pick">
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
                        <td data-label="New price">
                          {dec.action === 'skip' ? (
                            <span className="muted">—</span>
                          ) : (
                            <input
                              value={dec.priceInput}
                              placeholder={preview != null ? String(preview) : 'price'}
                              inputMode="decimal"
                              onChange={(e) => setDecision(idx, { priceInput: e.target.value })}
                              className="receive-stock-price-input"
                            />
                          )}
                          {dec.action === 'update' && (
                            <label className="muted receive-stock-update-price">
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
              </div>
              <div className="receive-stock-match-actions">
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
            <section className="panel receive-stock-result" ref={resultSectionRef}>
              <h2>3 · Result</h2>
              {applySuccess ? (
                <div className="layout-teach-banner layout-teach-banner--success" role="status">
                  <p>
                    <strong>Stock updated</strong>
                    {` — applied ${result.applied}, skipped ${result.skipped}`}
                    {result.failed ? `, failed ${result.failed}` : ''}.
                  </p>
                  <p className="small-print">
                    Invoice saved — mark paid on{' '}
                    <Link to="/supplier-invoices">Supplier invoices</Link> when settled. Print labels below if needed.
                  </p>
                </div>
              ) : notice ? (
                <p className="success">{notice}</p>
              ) : null}
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
              <div className="receive-stock-row-actions">
                <button type="button" className="btn primary" onClick={openLabelBatchModal}>
                  Print labels for applied items
                </button>
                <button type="button" className="btn ghost" onClick={resetAll}>
                  New invoice
                </button>
              </div>
            </section>
          )}

          {labelBatchOpen ? (
            <div
              className="modal-backdrop"
              role="presentation"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget && !labelBatchBusy) setLabelBatchOpen(false)
              }}
            >
              <div
                className="modal-dialog panel receive-stock-label-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="receive-label-title"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <h2 id="receive-label-title">Print labels</h2>
                <p className="muted modal-subtitle">
                  Adjust quantities and pick a label size / printer per item, then print.
                </p>
                {labelBatchError ? (
                  <div className="receive-stock-label-error" role="alert">
                    <p className="error">{labelBatchError}</p>
                    <p className="small-print">
                      Check <Link to="/label-settings">Label settings</Link> — Detect USB for each size, or switch
                      this row to the other printer.
                    </p>
                  </div>
                ) : null}
                <div className="receive-stock-label-table-wrap">
                  <table className="table receive-stock-label-table">
                    <thead>
                      <tr>
                        <th style={{ width: '2.5rem' }} />
                        <th>Item</th>
                        <th style={{ width: '5.5rem' }}>Qty</th>
                        <th style={{ minWidth: '11rem' }}>Label size</th>
                      </tr>
                    </thead>
                    <tbody>
                      {labelBatchRows.map((row) => (
                        <tr key={row.key}>
                          <td>
                            <input
                              type="checkbox"
                              checked={row.included}
                              disabled={labelBatchBusy}
                              onChange={(e) => updateLabelBatchRow(row.key, { included: e.target.checked })}
                              aria-label={`Include ${row.name}`}
                            />
                          </td>
                          <td>
                            <div>{row.name}</div>
                            <div className="muted" style={{ fontSize: '0.8rem' }}>
                              {row.sku}
                            </div>
                          </td>
                          <td>
                            <input
                              type="number"
                              className="receive-stock-label-qty"
                              min={1}
                              max={100}
                              value={row.copies}
                              disabled={labelBatchBusy || !row.included}
                              onChange={(e) =>
                                updateLabelBatchRow(row.key, {
                                  copies: Math.max(1, Math.min(100, Math.floor(Number(e.target.value) || 1))),
                                })
                              }
                            />
                          </td>
                          <td>
                            <select
                              value={row.profileId}
                              disabled={labelBatchBusy || !row.included}
                              onChange={(e) => updateLabelBatchRow(row.key, { profileId: e.target.value })}
                            >
                              {labelPrinterProfiles.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {formatProfileSummary(p)}
                                  {p.isDefault ? ' · default' : ''}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="form-actions">
                  <button
                    type="button"
                    className="btn primary"
                    disabled={labelBatchBusy || !labelBatchRows.some((r) => r.included)}
                    onClick={() => void printLabelBatch()}
                  >
                    {labelBatchBusy ? 'Printing…' : 'Print selected'}
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={labelBatchBusy}
                    onClick={() => setLabelBatchOpen(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}
    </BoShell>
  )
}
