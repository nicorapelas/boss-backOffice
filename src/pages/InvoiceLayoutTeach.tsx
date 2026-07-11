import { useCallback, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { Link } from 'react-router-dom'
import { BoShell } from '../layouts/BoShell'
import { useAuth } from '../auth/AuthContext'
import { hasPermission } from '../auth/permissions'
import {
  apiFetch,
  getInvoiceLayout,
  isInvoiceIntakeConfigured,
  layoutOcr,
  listInvoiceLayouts,
  listSuppliers,
  saveInvoiceLayout,
  testInvoiceLayout,
} from '../api/client'
import { BusyModal, waitForModalPaint } from '../components/BusyModal'
import type {
  InvoiceLayoutProfile,
  LayoutColumnField,
  LayoutNormRect,
  LayoutOcrBlock,
  LayoutOcrPageResult,
  LayoutTestResponse,
  Supplier,
} from '../api/types'

type WizardStep =
  | 'supplier'
  | 'upload'
  | 'supplierZone'
  | 'lineZone'
  | 'columns'
  | 'shape'
  | 'test'

type BusyKind = 'ocr' | 'save' | 'supplier' | null

type ColumnKey = LayoutColumnField['key']

const NEW_SUPPLIER_VALUE = '__new__'

const COLUMN_LABELS: Record<ColumnKey, string> = {
  code: 'Supplier / part code',
  description: 'Description',
  qty: 'Quantity',
  unitCost: 'Unit cost / price',
  lineTotal: 'Line total',
}

const DEFAULT_FOOTER_PATTERNS = [
  'pty\\s*ltd',
  'po box',
  'account number',
  'bank name',
  'vat reg',
]

const BUSY_COPY: Record<Exclude<BusyKind, null>, { title: string; message: string }> = {
  ocr: {
    title: 'Reading invoice…',
    message: 'Running OCR on your sample. PDFs usually give sharper results than phone photos.',
  },
  save: {
    title: 'Saving layout…',
    message: 'Storing your layout and testing extraction on the sample.',
  },
  supplier: {
    title: 'Creating supplier…',
    message: 'Adding the new supplier to your catalog.',
  },
}

function unionRect(blocks: LayoutOcrBlock[], indices: number[]): LayoutNormRect | null {
  const selected = indices.map((i) => blocks[i]).filter((b) => b?.bbox)
  if (!selected.length) return null
  return {
    x0: Math.min(...selected.map((b) => b.bbox!.x0)),
    y0: Math.min(...selected.map((b) => b.bbox!.y0)),
    x1: Math.max(...selected.map((b) => b.bbox!.x1)),
    y1: Math.max(...selected.map((b) => b.bbox!.y1)),
  }
}

function columnCenter(block: LayoutOcrBlock): number | null {
  if (!block.bbox) return null
  return (block.bbox.x0 + block.bbox.x1) / 2
}

function slugSupplierCode(name: string): string {
  const parts = name.trim().toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean)
  if (!parts.length) return ''
  if (parts.length === 1) return parts[0].slice(0, 12)
  return parts.map((p) => p[0]).join('').slice(0, 8)
}

function OcrOverlay({
  ocr,
  selected,
  onToggle,
  highlight,
}: {
  ocr: LayoutOcrPageResult
  selected: Set<number>
  onToggle: (index: number) => void
  highlight?: LayoutNormRect | null
}) {
  const src = ocr.imageBase64 ? `data:image/png;base64,${ocr.imageBase64}` : null
  if (!src) return <p className="small-print">No preview image.</p>

  return (
    <div className="layout-teach-canvas">
      <img src={src} alt="Invoice sample" className="layout-teach-image" />
      {highlight ? (
        <div
          className="layout-teach-zone layout-teach-zone--highlight"
          style={{
            left: `${highlight.x0 * 100}%`,
            top: `${highlight.y0 * 100}%`,
            width: `${(highlight.x1 - highlight.x0) * 100}%`,
            height: `${(highlight.y1 - highlight.y0) * 100}%`,
          }}
        />
      ) : null}
      {ocr.blocks.map((block, index) => {
        if (!block.bbox) return null
        const active = selected.has(index)
        return (
          <button
            key={`${index}-${block.text}`}
            type="button"
            className={`layout-teach-box${active ? ' layout-teach-box--active' : ''}`}
            style={{
              left: `${block.bbox.x0 * 100}%`,
              top: `${block.bbox.y0 * 100}%`,
              width: `${Math.max(0.5, (block.bbox.x1 - block.bbox.x0) * 100)}%`,
              height: `${Math.max(0.4, (block.bbox.y1 - block.bbox.y0) * 100)}%`,
            }}
            title={block.text}
            onClick={() => onToggle(index)}
          />
        )
      })}
    </div>
  )
}

function LayoutTeachImageStep({
  title,
  hint,
  toolbar,
  backLabel,
  nextLabel,
  onBack,
  onNext,
  nextDisabled,
  navDisabled,
  children,
}: {
  title: string
  hint?: ReactNode
  toolbar?: ReactNode
  backLabel: string
  nextLabel: string
  onBack: () => void
  onNext: () => void
  nextDisabled?: boolean
  navDisabled?: boolean
  children: ReactNode
}) {
  return (
    <>
      <h2 className="bo-section-title">{title}</h2>
      {hint}
      {toolbar}
      <div className="layout-teach-step-nav">
        <button type="button" className="btn ghost" disabled={navDisabled} onClick={onBack}>
          {backLabel}
        </button>
        <button type="button" className="btn" disabled={navDisabled || nextDisabled} onClick={onNext}>
          {nextLabel}
        </button>
      </div>
      <div className="layout-teach-canvas-scroll">{children}</div>
    </>
  )
}

export function InvoiceLayoutTeachPage() {
  const { session } = useAuth()
  const canWrite = hasPermission(session?.user, 'catalog.write')
  const intakeOk = isInvoiceIntakeConfigured()

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [layouts, setLayouts] = useState<Awaited<ReturnType<typeof listInvoiceLayouts>>>([])
  const [supplierPick, setSupplierPick] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [newSupplierName, setNewSupplierName] = useState('')
  const [newSupplierCode, setNewSupplierCode] = useState('')
  const [step, setStep] = useState<WizardStep>('supplier')
  const [ocr, setOcr] = useState<LayoutOcrPageResult | null>(null)
  const [sampleFile, setSampleFile] = useState<File | null>(null)
  const [pdfPage, setPdfPage] = useState(1)
  const [supplierBlocks, setSupplierBlocks] = useState<Set<number>>(new Set())
  const [lineBlocks, setLineBlocks] = useState<Set<number>>(new Set())
  const [columnKey, setColumnKey] = useState<ColumnKey>('code')
  const [columnMap, setColumnMap] = useState<Partial<Record<ColumnKey, number>>>({})
  const [lineShape, setLineShape] = useState<'table' | 'stacked'>('table')
  const [testResult, setTestResult] = useState<LayoutTestResponse | null>(null)
  const [busyKind, setBusyKind] = useState<BusyKind>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedVersion, setSavedVersion] = useState<number | null>(null)

  const isNewSupplier = supplierPick === NEW_SUPPLIER_VALUE
  const busy = busyKind !== null
  const supplier = useMemo(
    () => suppliers.find((s) => s._id === supplierId) ?? null,
    [suppliers, supplierId],
  )

  useEffect(() => {
    if (!canWrite) return
    void listSuppliers().then(setSuppliers).catch(() => setSuppliers([]))
    if (intakeOk) {
      void listInvoiceLayouts().then(setLayouts).catch(() => setLayouts([]))
    }
  }, [canWrite, intakeOk])

  useEffect(() => {
    if (!isNewSupplier || newSupplierCode.trim()) return
    const suggested = slugSupplierCode(newSupplierName)
    if (suggested) setNewSupplierCode(suggested)
  }, [isNewSupplier, newSupplierName, newSupplierCode])

  const toggleBlock = useCallback((setter: Dispatch<SetStateAction<Set<number>>>, index: number) => {
    setter((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }, [])

  const buildProfile = useCallback((): InvoiceLayoutProfile | null => {
    if (!supplier || !ocr) return null
    const columns: LayoutColumnField[] = (['code', 'description', 'qty', 'unitCost'] as ColumnKey[])
      .map((key) => {
        const idx = columnMap[key]
        if (idx === undefined || !ocr.blocks[idx]) return null
        const block = ocr.blocks[idx]
        const field: LayoutColumnField = {
          key,
          headerPatterns: [block.text.trim().toLowerCase()],
          columnX: columnCenter(block),
        }
        if (key === 'qty' && lineShape === 'table') {
          field.valuePattern = String.raw`^\d+$`
        } else if (key === 'qty') {
          field.valuePattern = String.raw`\d+\s*PCS`
        }
        return field
      })
      .filter(Boolean) as LayoutColumnField[]

    return {
      version: 1,
      supplierId: supplier._id,
      supplierName: supplier.name,
      profileVersion: 1,
      lineShape,
      zones: {
        supplierHeader: unionRect(ocr.blocks, [...supplierBlocks]),
        lineItems: unionRect(ocr.blocks, [...lineBlocks]),
        ignore: [],
      },
      columns,
      footerStopPatterns: DEFAULT_FOOTER_PATTERNS,
      multipage: { sameColumnsOnContinuation: true },
    }
  }, [supplier, ocr, columnMap, lineShape, supplierBlocks, lineBlocks])

  const runLayoutOcr = useCallback(
    async (file: File, page = 1, resetMarks = true) => {
      if (!supplierId) {
        setError('Select a supplier first.')
        return
      }
      setBusyKind('ocr')
      setError(null)
      setTestResult(null)
      await waitForModalPaint()
      try {
        const result = await layoutOcr(file, supplierId, page)
        setOcr(result)
        setSampleFile(file)
        setPdfPage(result.pageNumber ?? page)
        if (resetMarks) {
          setSupplierBlocks(new Set())
          setLineBlocks(new Set())
          setColumnMap({})
        }
        setStep('supplierZone')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'OCR failed')
      } finally {
        setBusyKind(null)
      }
    },
    [supplierId],
  )

  const handleUpload = async (file: File) => {
    await runLayoutOcr(file, 1, true)
  }

  const handlePdfPageChange = async (page: number) => {
    if (!sampleFile) return
    await runLayoutOcr(sampleFile, page, true)
  }

  const handleColumnClick = (index: number) => {
    setColumnMap((prev) => ({ ...prev, [columnKey]: index }))
  }

  const handleSupplierNext = async () => {
    setError(null)
    if (!supplierPick) {
      setError('Select a supplier or choose New supplier.')
      return
    }
    if (isNewSupplier) {
      const name = newSupplierName.trim()
      const code = newSupplierCode.trim().toUpperCase()
      if (!name || !code) {
        setError('New supplier name and code are required.')
        return
      }
      setBusyKind('supplier')
      await waitForModalPaint()
      try {
        const row = await apiFetch<Supplier>('/suppliers', {
          method: 'POST',
          body: JSON.stringify({ name, code }),
        })
        setSuppliers((prev) => [...prev, row].sort((a, b) => a.name.localeCompare(b.name)))
        setSupplierId(row._id)
        setSupplierPick(row._id)
        setStep('upload')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not create supplier')
      } finally {
        setBusyKind(null)
      }
      return
    }
    setSupplierId(supplierPick)
    setStep('upload')
  }

  const handleTest = async () => {
    const profile = buildProfile()
    if (!profile || !sampleFile) return
    setBusyKind('save')
    setError(null)
    await waitForModalPaint()
    try {
      await saveInvoiceLayout(supplierId, profile)
      const result = await testInvoiceLayout(supplierId, sampleFile)
      setTestResult(result)
      setSavedVersion(result.layoutVersion ?? profile.profileVersion)
      void listInvoiceLayouts().then(setLayouts)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Test failed')
    } finally {
      setBusyKind(null)
    }
  }

  const handleLoadExisting = async () => {
    const id = isNewSupplier ? supplierId : supplierPick
    if (!id || id === NEW_SUPPLIER_VALUE) return
    setError(null)
    try {
      const profile = await getInvoiceLayout(id)
      setLineShape(profile.lineShape)
      setSavedVersion(profile.profileVersion)
      setSupplierId(id)
    } catch {
      setSavedVersion(null)
      setError('No saved layout for this supplier yet.')
    }
  }

  if (!canWrite) {
    return (
      <BoShell>
        <h1>Invoice layouts</h1>
        <p>You need catalog.write permission.</p>
      </BoShell>
    )
  }

  if (!intakeOk) {
    return (
      <BoShell>
        <h1>Invoice layouts</h1>
        <p>
          Configure <code>VITE_INVOICE_INTAKE_URL</code> in BackOffice <code>.env</code> (Steve invoice-intake
          service).
        </p>
      </BoShell>
    )
  }

  const supplierZonePreview = ocr ? unionRect(ocr.blocks, [...supplierBlocks]) : null
  const lineZonePreview = ocr ? unionRect(ocr.blocks, [...lineBlocks]) : null
  const pdfPageCount = ocr?.pageCount ?? 1
  const showPdfPager = pdfPageCount > 1

  const pdfPagePicker = showPdfPager ? (
    <div className="layout-teach-pdf-page">
      <label>
        PDF page for teaching
        <select
          value={pdfPage}
          disabled={busy || !sampleFile}
          onChange={(e) => void handlePdfPageChange(Number(e.target.value))}
        >
          {Array.from({ length: pdfPageCount }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              Page {n} of {pdfPageCount}
            </option>
          ))}
        </select>
      </label>
      <p className="small-print">
        Teach column zones from the page that has the line-item table. Test &amp; save still runs the full PDF.
      </p>
    </div>
  ) : null

  const busyModal = busyKind ? (
    <BusyModal open title={BUSY_COPY[busyKind].title} message={BUSY_COPY[busyKind].message} />
  ) : null

  return (
    <BoShell>
      {busyModal}
      <h1>Teach invoice layout</h1>
      <p className="small-print">
        Mark zones and column headers on a sample invoice. Saved layouts are used automatically on{' '}
        <Link to="/receive-stock">Receive stock</Link> uploads for that supplier. Prefer PDF samples when possible —
        OCR is much sharper than phone photos.
      </p>

      {layouts.length > 0 ? (
        <p className="small-print">
          Active layouts: {layouts.map((l) => `${l.supplierName} v${l.profileVersion}`).join(' · ')}
        </p>
      ) : null}

      {error ? <p className="error-text">{error}</p> : null}

      <div className={`panel layout-teach-panel${busy ? ' layout-teach-panel--locked' : ''}`}>
        {step === 'supplier' ? (
          <>
            <h2 className="bo-section-title">1. Supplier</h2>
            <label>
              Supplier
              <select
                value={supplierPick}
                disabled={busy}
                onChange={(e) => {
                  setSupplierPick(e.target.value)
                  setError(null)
                  if (e.target.value !== NEW_SUPPLIER_VALUE) {
                    setSupplierId(e.target.value)
                  }
                }}
              >
                <option value="">— select —</option>
                <option value={NEW_SUPPLIER_VALUE}>+ New supplier…</option>
                {suppliers.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            {isNewSupplier ? (
              <div className="layout-teach-new-supplier">
                <label>
                  Supplier name
                  <input
                    type="text"
                    value={newSupplierName}
                    disabled={busy}
                    placeholder="e.g. LiteOptec"
                    onChange={(e) => setNewSupplierName(e.target.value)}
                  />
                </label>
                <label>
                  Supplier code
                  <input
                    type="text"
                    value={newSupplierCode}
                    disabled={busy}
                    placeholder="e.g. LITEOPTEC"
                    onChange={(e) => setNewSupplierCode(e.target.value.toUpperCase())}
                  />
                </label>
              </div>
            ) : null}
            <div className="layout-teach-actions">
              <button
                type="button"
                className="btn"
                disabled={!supplierPick || busy || (isNewSupplier && (!newSupplierName.trim() || !newSupplierCode.trim()))}
                onClick={() => void handleSupplierNext()}
              >
                {isNewSupplier ? 'Create supplier & continue' : 'Next: upload sample'}
              </button>
              <button
                type="button"
                className="btn ghost"
                disabled={!supplierPick || supplierPick === NEW_SUPPLIER_VALUE || busy}
                onClick={() => void handleLoadExisting()}
              >
                Check existing layout
              </button>
              {savedVersion ? <span className="small-print">Active: v{savedVersion}</span> : null}
            </div>
          </>
        ) : null}

        {step === 'upload' ? (
          <>
            <h2 className="bo-section-title">2. Sample invoice</h2>
            <p className="small-print">
              Upload a <strong>PDF</strong> when you can — OCR is much better than photos. For multipage PDFs, pick the
              teaching page in the next step.
            </p>
            <input
              type="file"
              accept="image/*,application/pdf,.pdf"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void handleUpload(f)
              }}
            />
            <div className="layout-teach-actions">
              <button type="button" className="btn ghost" disabled={busy} onClick={() => setStep('supplier')}>
                Back
              </button>
            </div>
          </>
        ) : null}

        {ocr && step === 'supplierZone' ? (
          <LayoutTeachImageStep
            title="3. Supplier letterhead"
            hint={<p className="small-print">Click OCR boxes that contain the supplier name (e.g. WAHL).</p>}
            toolbar={pdfPagePicker}
            backLabel="Back"
            nextLabel="Next: line items area"
            nextDisabled={supplierBlocks.size === 0}
            navDisabled={busy}
            onBack={() => setStep('upload')}
            onNext={() => setStep('lineZone')}
          >
            <OcrOverlay
              ocr={ocr}
              selected={supplierBlocks}
              onToggle={(i) => toggleBlock(setSupplierBlocks, i)}
              highlight={supplierZonePreview}
            />
          </LayoutTeachImageStep>
        ) : null}

        {ocr && step === 'lineZone' ? (
          <LayoutTeachImageStep
            title="4. Line items area"
            hint={<p className="small-print">Click boxes covering the product table or item block (not the footer).</p>}
            backLabel="Back"
            nextLabel="Next: column headers"
            nextDisabled={lineBlocks.size === 0}
            navDisabled={busy}
            onBack={() => setStep('supplierZone')}
            onNext={() => setStep('columns')}
          >
            <OcrOverlay
              ocr={ocr}
              selected={lineBlocks}
              onToggle={(i) => toggleBlock(setLineBlocks, i)}
              highlight={lineZonePreview}
            />
          </LayoutTeachImageStep>
        ) : null}

        {ocr && step === 'columns' ? (
          <LayoutTeachImageStep
            title="5. Column headers"
            hint={
              <p className="small-print">
                Choose a field, then click the matching header on the invoice (Part-No, Description, Quantity, Price).
              </p>
            }
            toolbar={
              <div className="layout-teach-columns">
                {(Object.keys(COLUMN_LABELS) as ColumnKey[])
                  .filter((k) => k !== 'lineTotal')
                  .map((key) => (
                    <button
                      key={key}
                      type="button"
                      className={`btn${columnKey === key ? '' : ' ghost'}`}
                      disabled={busy}
                      onClick={() => setColumnKey(key)}
                    >
                      {COLUMN_LABELS[key]}
                      {columnMap[key] !== undefined ? ' ✓' : ''}
                    </button>
                  ))}
              </div>
            }
            backLabel="Back"
            nextLabel="Next: line shape"
            nextDisabled={columnMap.code === undefined && columnMap.description === undefined}
            navDisabled={busy}
            onBack={() => setStep('lineZone')}
            onNext={() => setStep('shape')}
          >
            <OcrOverlay
              ocr={ocr}
              selected={new Set(columnMap[columnKey] !== undefined ? [columnMap[columnKey]!] : [])}
              onToggle={handleColumnClick}
              highlight={lineZonePreview}
            />
          </LayoutTeachImageStep>
        ) : null}

        {ocr && step === 'shape' ? (
          <>
            <h2 className="bo-section-title">6. Line shape</h2>
            <label>
              <input
                type="radio"
                name="lineShape"
                checked={lineShape === 'table'}
                disabled={busy}
                onChange={() => setLineShape('table')}
              />{' '}
              Table with columns (Neetvlei, Cycle Warehouse, LiteOptec)
            </label>
            <label>
              <input
                type="radio"
                name="lineShape"
                checked={lineShape === 'stacked'}
                disabled={busy}
                onChange={() => setLineShape('stacked')}
              />{' '}
              Stacked block per item (Wahl Part-No / Qty / Price rows)
            </label>
            <div className="layout-teach-actions">
              <button type="button" className="btn ghost" disabled={busy} onClick={() => setStep('columns')}>
                Back
              </button>
              <button type="button" className="btn" disabled={busy} onClick={() => setStep('test')}>
                Test &amp; save
              </button>
            </div>
          </>
        ) : null}

        {ocr && step === 'test' ? (
          <>
            <h2 className="bo-section-title">7. Test on sample</h2>
            <p className="small-print">
              Saves layout for <strong>{supplier?.name}</strong> and re-runs extraction on the uploaded sample.
            </p>
            <div className="layout-teach-actions">
              <button type="button" className="btn ghost" disabled={busy} onClick={() => setStep('shape')}>
                Back
              </button>
              <button type="button" className="btn" disabled={busy} onClick={() => void handleTest()}>
                Save layout &amp; test
              </button>
            </div>
            {testResult ? (
              <div className="layout-teach-results">
                <p>
                  <strong>{testResult.lineCount}</strong> lines extracted
                  {savedVersion ? ` (layout v${savedVersion})` : ''}
                </p>
                {testResult.warnings?.length ? (
                  <ul className="small-print">
                    {testResult.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                ) : null}
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Description</th>
                      <th>Qty</th>
                      <th>Unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {testResult.lines.map((ln, i) => (
                      <tr key={i}>
                        <td>{ln.code ?? '—'}</td>
                        <td>{ln.description}</td>
                        <td>{ln.qty ?? '—'}</td>
                        <td>{ln.unitCost ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {testResult && testResult.lineCount > 0 ? (
              <p className="small-print" style={{ marginTop: '0.75rem' }}>
                Layout saved. Upload invoices for this supplier on{' '}
                <Link to="/receive-stock">Receive stock</Link>.
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </BoShell>
  )
}
