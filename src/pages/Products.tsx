import {
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  startTransition,
  type FormEvent,
} from 'react'
import { Link } from 'react-router-dom'
import {
  apiFetch,
  deleteProductPhoto,
  fetchProductPhotoObjectUrl,
  getCatalogSyncStatus,
  pushCatalogToTills,
  uploadProductPhoto,
} from '../api/client'
import type { Product, ProductPresetsState, StockAdjustmentRow, Supplier, SupplierOffer } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { hasPermission } from '../auth/permissions'
import { BoShell } from '../layouts/BoShell'
import { ProductsVirtualTable } from '../components/ProductsVirtualTable'
import {
  assignPresetEntry,
  PRESET_ENTRY_MAX,
  removePresetAt as removePresetFromState,
} from '../utils/productPresets'
import {
  formatProfileSummary,
  getLabelProfileById,
  profileToPrintSettings,
  readLabelPrinterConfig,
  resolveInitialPrintProfileId,
  writeLastUsedLabelProfileId,
  type LabelPrinterProfile,
} from '../labels/labelSettings'
import { useCatalogRevisionSync } from '../hooks/useCatalogRevisionSync'

type VolumeTierDraft = { id: string; minQty: string; maxTo: string; unitPrice: string }

function newTierDraftRow(): VolumeTierDraft {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, minQty: '', maxTo: '', unitPrice: '' }
}

function productToTierDrafts(p: Product | null): VolumeTierDraft[] {
  if (!p?.volumeTiers?.length) {
    return [newTierDraftRow()]
  }
  return p.volumeTiers.map((t) => ({
    id: `${t.minQty}-${t.maxQty ?? 'up'}-${Math.random().toString(36).slice(2, 6)}`,
    minQty: String(t.minQty),
    maxTo: t.maxQty == null ? '' : String(t.maxQty),
    unitPrice: String(t.unitPrice),
  }))
}

function draftsToVolumePayload(rows: VolumeTierDraft[]) {
  return rows
    .filter((r) => r.minQty.trim() !== '' && r.unitPrice.trim() !== '')
    .map((r) => ({
      minQty: Math.floor(Number(r.minQty)),
      maxQty: r.maxTo.trim() === '' ? null : Math.floor(Number(r.maxTo)),
      unitPrice: Number(r.unitPrice),
    }))
}

function mergeCatalogSubCategories(
  products: Product[],
  presets: ProductPresetsState | null,
  cat: string,
): string[] {
  const c = cat.trim()
  const fromProd = new Set<string>()
  for (const p of products) {
    if ((p.category?.trim() ?? '') !== c) continue
    const s = p.subCategory?.trim()
    if (s) fromProd.add(s)
  }
  const fromMap = presets?.subCategoriesByCategory[c] ?? []
  const fromEntries =
    presets?.entries.filter((e) => e.category === c).map((e) => e.subCategory) ?? []
  return [...new Set([...fromProd, ...fromMap, ...fromEntries].filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  )
}

function rankSubcategorySuggestions(merged: string[], input: string): string[] {
  const q = input.trim().toLowerCase()
  if (!q) return merged.slice(0, 12)
  const starts = merged.filter((name) => name.toLowerCase().startsWith(q))
  const contains = merged.filter(
    (name) => !name.toLowerCase().startsWith(q) && name.toLowerCase().includes(q),
  )
  return [...starts, ...contains].slice(0, 12)
}

function offerSupplierId(offer: SupplierOffer): string {
  const s = offer.supplier
  if (typeof s === 'object' && s !== null && '_id' in s) {
    return String((s as { _id: string })._id)
  }
  if (typeof s === 'string') return s
  return ''
}

function stockAdjustmentSourceLabel(sourceApp: string): string {
  switch (sourceApp) {
    case 'shop-assist':
      return 'ShopAssist'
    case 'back-office':
      return 'Back Office'
    case 'pos':
      return 'POS'
    case 'scan':
      return 'Scan'
    default:
      return 'Unknown'
  }
}

function stockAdjustmentUserLabel(row: StockAdjustmentRow): string {
  return row.changedByDisplayName?.trim() || row.changedByEmail
}

type LabelPrintTarget = {
  key: string
  name: string
  sku: string
  barcode?: string | null
  price: number
}

function labelPrintTargetFromProduct(product: Product): LabelPrintTarget {
  return {
    key: product._id,
    name: product.name,
    sku: product.sku,
    barcode: product.barcode,
    price: product.price,
  }
}

export function Products() {
  const { session } = useAuth()
  const canRead = hasPermission(session?.user, 'catalog.read')
  const canWrite = hasPermission(session?.user, 'catalog.write')
  const canSuppliersRead = hasPermission(session?.user, 'suppliers.read')
  const canSuppliersWrite = hasPermission(session?.user, 'suppliers.write')
  const canPresets = hasPermission(session?.user, 'presets.write')
  const canPresetsRead =
    hasPermission(session?.user, 'presets.read') || hasPermission(session?.user, 'presets.write')
  const [products, setProducts] = useState<Product[]>([])
  const [productsLoading, setProductsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [catalogPushBusy, setCatalogPushBusy] = useState(false)
  const [catalogPushNotice, setCatalogPushNotice] = useState<string | null>(null)
  const [catalogPushedAt, setCatalogPushedAt] = useState<string | null>(null)
  const [catalogRevision, setCatalogRevision] = useState<number | null>(null)

  const [createName, setCreateName] = useState('')
  const [createSku, setCreateSku] = useState('')
  const [createBarcode, setCreateBarcode] = useState('')
  const [createCategory, setCreateCategory] = useState('')
  const [createSubCategory, setCreateSubCategory] = useState('')
  const [createSkuManuallyEdited, setCreateSkuManuallyEdited] = useState(false)
  const [createPrice, setCreatePrice] = useState('')
  const [createStock, setCreateStock] = useState('0')
  const [createTrackInventory, setCreateTrackInventory] = useState(true)
  const [createTrackSoldBy, setCreateTrackSoldBy] = useState(false)
  const [createVolumeTiering, setCreateVolumeTiering] = useState(false)
  const [createTierRows, setCreateTierRows] = useState<VolumeTierDraft[]>(() => [newTierDraftRow()])
  const [createSupplierId, setCreateSupplierId] = useState('')
  const [createJobCardLabour, setCreateJobCardLabour] = useState('')
  const [createPhotoFile, setCreatePhotoFile] = useState<File | null>(null)
  const createPhotoInputRef = useRef<HTMLInputElement | null>(null)

  const [editing, setEditing] = useState<Product | null>(null)
  const [editName, setEditName] = useState('')
  const [editSku, setEditSku] = useState('')
  const [editBarcode, setEditBarcode] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editSubCategory, setEditSubCategory] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [editStock, setEditStock] = useState('0')
  const [editTrackInventory, setEditTrackInventory] = useState(true)
  const [editTrackSoldBy, setEditTrackSoldBy] = useState(false)
  const [editVolumeTiering, setEditVolumeTiering] = useState(false)
  const [editTierRows, setEditTierRows] = useState<VolumeTierDraft[]>(() => [newTierDraftRow()])
  const [editSupplierId, setEditSupplierId] = useState('')
  const [editJobCardLabour, setEditJobCardLabour] = useState('')
  const [editPhotoPreviewUrl, setEditPhotoPreviewUrl] = useState<string | undefined>(undefined)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [stockHistory, setStockHistory] = useState<StockAdjustmentRow[]>([])
  const [stockHistoryBusy, setStockHistoryBusy] = useState(false)

  const [suppliers, setSuppliers] = useState<Supplier[]>([])

  const [sharedPresets, setSharedPresets] = useState<ProductPresetsState | null>(null)
  const [presetLoading, setPresetLoading] = useState(false)
  const [presetError, setPresetError] = useState<string | null>(null)
  const [presetBusy, setPresetBusy] = useState(false)
  const [addPresetCat, setAddPresetCat] = useState('')
  const [addPresetSub, setAddPresetSub] = useState('')
  const [presetReplaceIndex, setPresetReplaceIndex] = useState(-1)

  const [productSearch, setProductSearch] = useState('')
  const deferredProductSearch = useDeferredValue(productSearch)
  const isSearchFiltering = productSearch !== deferredProductSearch
  const [categoryFilter, setCategoryFilter] = useState('__all__')
  const [labelBusyProductId, setLabelBusyProductId] = useState<string | null>(null)
  const [labelNotice, setLabelNotice] = useState<string | null>(null)
  const [printLabelTarget, setPrintLabelTarget] = useState<LabelPrintTarget | null>(null)
  const [printLabelCopies, setPrintLabelCopies] = useState('1')
  const [printLabelProfileId, setPrintLabelProfileId] = useState(() => resolveInitialPrintProfileId())

  const presetCatDatalistId = useId()
  const presetSubDatalistId = useId()
  const productCategoryDatalistId = useId()
  const productCreateSubCategoryDatalistId = useId()
  const productEditSubCategoryDatalistId = useId()

  useEffect(() => {
    if (!editing || !canRead) {
      setStockHistory([])
      return
    }
    let cancelled = false
    setStockHistoryBusy(true)
    void apiFetch<StockAdjustmentRow[]>(
      `/products/${encodeURIComponent(editing._id)}/stock-adjustments?limit=20`,
    )
      .then((rows) => {
        if (!cancelled) setStockHistory(rows)
      })
      .catch(() => {
        if (!cancelled) setStockHistory([])
      })
      .finally(() => {
        if (!cancelled) setStockHistoryBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [editing?._id, canRead])

  const presetCategoryOptions = useMemo(() => {
    if (!sharedPresets) return []
    const fromTax = sharedPresets.categories ?? []
    const fromEntries = sharedPresets.entries.map((e) => e.category)
    return [...new Set([...fromTax, ...fromEntries].filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' }),
    )
  }, [sharedPresets])

  const presetSubCategoryOptions = useMemo(() => {
    if (!sharedPresets) return []
    const cat = addPresetCat.trim()
    if (!cat) return []
    const fromMap = sharedPresets.subCategoriesByCategory[cat] ?? []
    const fromEntries = sharedPresets.entries
      .filter((e) => e.category === cat)
      .map((e) => e.subCategory)
    return [...new Set([...fromMap, ...fromEntries].filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' }),
    )
  }, [sharedPresets, addPresetCat])

  const load = useCallback(async () => {
    setError(null)
    setProductsLoading(true)
    try {
      const list = await apiFetch<Product[]>('/products')
      startTransition(() => {
        setProducts(list)
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setProductsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!canRead) return
    void load()
  }, [load, canRead])

  const refreshCatalogFromServer = useCallback(() => {
    void load()
    void getCatalogSyncStatus()
      .then((s) => {
        setCatalogRevision(s.catalogRevision)
        setCatalogPushedAt(s.catalogPushedAt)
      })
      .catch(() => undefined)
  }, [load])

  useCatalogRevisionSync(canRead, refreshCatalogFromServer)

  useEffect(() => {
    if (!canRead) return
    void getCatalogSyncStatus()
      .then((s) => {
        setCatalogRevision(s.catalogRevision)
        setCatalogPushedAt(s.catalogPushedAt)
      })
      .catch(() => undefined)
  }, [canRead])

  async function onPushCatalogToTills() {
    setCatalogPushNotice(null)
    setCatalogPushBusy(true)
    try {
      const result = await pushCatalogToTills()
      setCatalogRevision(result.catalogRevision)
      setCatalogPushedAt(result.catalogPushedAt)
      setCatalogPushNotice(
        `Push sent (revision ${result.catalogRevision}). Signed-in tills should refresh their catalog within about a minute.`,
      )
    } catch (e) {
      setCatalogPushNotice(e instanceof Error ? e.message : 'Could not push catalog to tills')
    } finally {
      setCatalogPushBusy(false)
    }
  }

  const loadSuppliers = useCallback(async () => {
    if (!canSuppliersRead) {
      setSuppliers([])
      return
    }
    try {
      const list = await apiFetch<Supplier[]>('/suppliers')
      setSuppliers(list.filter((s) => s.active !== false))
    } catch {
      setSuppliers([])
    }
  }, [canSuppliersRead])

  useEffect(() => {
    void loadSuppliers()
  }, [loadSuppliers])

  const closeEditModal = useCallback(() => {
    setEditPhotoPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return undefined
    })
    setEditing(null)
    setEditName('')
    setEditSku('')
    setEditBarcode('')
    setEditCategory('')
    setEditSubCategory('')
    setEditPrice('')
    setEditStock('0')
    setEditTrackInventory(true)
    setEditVolumeTiering(false)
    setEditTierRows([newTierDraftRow()])
    setEditSupplierId('')
    setEditJobCardLabour('')
    setPresetError(null)
    setPresetBusy(false)
    setAddPresetCat('')
    setAddPresetSub('')
    setPresetReplaceIndex(-1)
  }, [])

  useEffect(() => {
    if (!editing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeEditModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing, closeEditModal])

  const editingPhotoId = editing?._id
  const editingPhotoRev = editing?.photoRevision ?? 0
  useEffect(() => {
    if (!editingPhotoId || editingPhotoRev < 1) {
      setEditPhotoPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return undefined
      })
      return
    }
    let cancelled = false
    void fetchProductPhotoObjectUrl(editingPhotoId, editingPhotoRev)
      .then((u) => {
        if (cancelled) {
          URL.revokeObjectURL(u)
          return
        }
        setEditPhotoPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev)
          return u
        })
      })
      .catch(() => {
        /* preview optional */
      })
    return () => {
      cancelled = true
    }
  }, [editingPhotoId, editingPhotoRev])

  useEffect(() => {
    if (!canRead || !canPresetsRead) {
      setSharedPresets(null)
      setPresetLoading(false)
      setPresetError(null)
      return
    }
    setPresetLoading(true)
    setPresetError(null)
    void apiFetch<ProductPresetsState>('/settings/product-presets')
      .then((d) => setSharedPresets(d))
      .catch((e) => {
        setPresetError(e instanceof Error ? e.message : 'Failed to load presets')
        setSharedPresets(null)
      })
      .finally(() => setPresetLoading(false))
  }, [canRead, canPresetsRead])

  const categories = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of products) {
      const key = p.category?.trim() || 'Uncategorized'
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  }, [products])

  const categorySuggestions = useMemo(() => {
    const allCategories = categories
      .map((c) => c.name)
      .filter((name) => name.toLowerCase() !== 'uncategorized')

    const seen = new Set<string>()
    const merged: string[] = []
    for (const name of allCategories) {
      const key = name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(name)
    }

    function rankFor(input: string) {
      const q = input.trim().toLowerCase()
      if (!q) return merged
      const starts = merged.filter((name) => name.toLowerCase().startsWith(q))
      const contains = merged.filter(
        (name) => !name.toLowerCase().startsWith(q) && name.toLowerCase().includes(q),
      )
      return [...starts, ...contains]
    }

    return rankFor(createCategory || editCategory).slice(0, 12)
  }, [categories, createCategory, editCategory])

  const createSubCategorySuggestions = useMemo(
    () =>
      rankSubcategorySuggestions(
        mergeCatalogSubCategories(products, sharedPresets, createCategory),
        createSubCategory,
      ),
    [products, sharedPresets, createCategory, createSubCategory],
  )

  const editSubCategorySuggestions = useMemo(
    () =>
      rankSubcategorySuggestions(
        mergeCatalogSubCategories(products, sharedPresets, editCategory),
        editSubCategory,
      ),
    [products, sharedPresets, editCategory, editSubCategory],
  )

  const filteredProducts = useMemo(() => {
    const q = deferredProductSearch.trim().toLowerCase()
    return products.filter((p) => {
      const category = p.category?.trim() || 'Uncategorized'
      const categoryOk = categoryFilter === '__all__' || category === categoryFilter
      if (!categoryOk) return false
      if (!q) return true
      const sub = (p.subCategory?.trim() ?? '').toLowerCase()
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.barcode?.trim() ?? '').toLowerCase().includes(q) ||
        category.toLowerCase().includes(q) ||
        sub.includes(q)
      )
    })
  }, [products, deferredProductSearch, categoryFilter])

  const nextSequentialSku = useMemo(() => {
    let maxSku = 0
    for (const p of products) {
      const trimmed = p.sku.trim()
      if (!/^\d+$/.test(trimmed)) continue
      const value = Number(trimmed)
      if (Number.isFinite(value) && value > maxSku) maxSku = value
    }
    return String(maxSku + 1)
  }, [products])

  useEffect(() => {
    if (!canWrite) return
    if (createSkuManuallyEdited) return
    setCreateSku(nextSequentialSku)
  }, [canWrite, createSkuManuallyEdited, nextSequentialSku])

  const handleEditProduct = useCallback(
    (p: Product) => {
      setEditing(p)
      setEditName(p.name)
      setEditSku(p.sku)
      setEditBarcode(p.barcode?.trim() ?? '')
      setEditCategory(p.category ?? '')
      setEditSubCategory(p.subCategory ?? '')
      setEditPrice(String(p.price))
      setEditStock(String(p.stock))
      setEditTrackInventory(p.trackInventory !== false)
      setEditTrackSoldBy(p.trackSoldBy === true)
      setEditVolumeTiering(Boolean(p.volumeTieringEnabled && p.volumeTiers?.length))
      setEditTierRows(productToTierDrafts(p))
      setEditSupplierId('')
      const jl = p.jobCardLabourPerUnit
      setEditJobCardLabour(jl != null && jl > 0.0001 ? String(jl) : '')
      if (canSuppliersRead) {
        void apiFetch<SupplierOffer[]>(`/suppliers/offers/by-product?${new URLSearchParams({ productId: p._id })}`)
          .then((rows) => {
            const preferred = rows.find((o) => o.preferred)
            setEditSupplierId(preferred ? offerSupplierId(preferred) : '')
          })
          .catch(() => setEditSupplierId(''))
      }
    },
    [canSuppliersRead],
  )

  const handleDeleteProduct = useCallback(
    async (id: string) => {
      if (!canWrite) return
      if (!confirm('Delete this product?')) return
      setError(null)
      try {
        await apiFetch(`/products/${id}`, { method: 'DELETE' })
        await load()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Delete failed')
      }
    },
    [canWrite, load],
  )

  async function handleRemoveEditPhoto() {
    if (!editing) return
    setError(null)
    setPhotoBusy(true)
    try {
      await deleteProductPhoto(editing._id)
      setEditing({ ...editing, photoRevision: 0, hasPhoto: false })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove photo')
    } finally {
      setPhotoBusy(false)
    }
  }

  async function handleReplaceEditPhoto(file: File | null) {
    if (!file || !editing) return
    setError(null)
    setPhotoBusy(true)
    try {
      const r = await uploadProductPhoto(editing._id, file)
      setEditing({ ...editing, photoRevision: r.photoRevision, hasPhoto: r.hasPhoto })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not upload photo')
    } finally {
      setPhotoBusy(false)
    }
  }

  function resetCreateForm() {
    setCreateName('')
    setCreateSku('')
    setCreateBarcode('')
    setCreateCategory('')
    setCreateSubCategory('')
    setCreateSkuManuallyEdited(false)
    setCreatePrice('')
    setCreateStock('0')
    setCreateTrackInventory(true)
    setCreateVolumeTiering(false)
    setCreateTierRows([newTierDraftRow()])
    setCreateSupplierId('')
    setCreateJobCardLabour('')
    setCreatePhotoFile(null)
    if (createPhotoInputRef.current) createPhotoInputRef.current.value = ''
  }

  async function syncPreferredSupplier(productId: string, supplierId: string) {
    if (!canSuppliersRead || !canSuppliersWrite) return
    const rows = await apiFetch<SupplierOffer[]>(`/suppliers/offers/by-product?${new URLSearchParams({ productId })}`)
    const preferred = rows.find((o) => o.preferred)
    const selected = supplierId.trim()
    if (!selected) {
      if (preferred) {
        await apiFetch(`/supplier-offers/${preferred._id}`, {
          method: 'PATCH',
          body: JSON.stringify({ preferred: false }),
        })
      }
      return
    }
    const sameSupplier = rows.find((o) => offerSupplierId(o) === selected)
    if (sameSupplier) {
      await apiFetch(`/supplier-offers/${sameSupplier._id}`, {
        method: 'PATCH',
        body: JSON.stringify({ preferred: true }),
      })
      return
    }
    await apiFetch(`/suppliers/${selected}/offers`, {
      method: 'POST',
      body: JSON.stringify({
        productId,
        unitCost: 0,
        unitsPerPack: 1,
        minOrderQty: 1,
        preferred: true,
      }),
    })
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    if (!canWrite) return
    setError(null)
    try {
      const catCreate = createCategory.trim() || null
      const created = await apiFetch<Product>('/products', {
        method: 'POST',
        body: JSON.stringify({
          name: createName,
          sku: createSku,
          barcode: createBarcode.trim() || null,
          category: catCreate,
          subCategory: catCreate ? createSubCategory.trim() || null : null,
          price: Number(createPrice),
          stock: Number(createStock) || 0,
          trackInventory: createTrackInventory,
          trackSoldBy: createTrackSoldBy,
          volumeTieringEnabled: createVolumeTiering,
          volumeTiers: createVolumeTiering ? draftsToVolumePayload(createTierRows) : [],
          ...(createJobCardLabour.trim() !== ''
            ? { jobCardLabourPerUnit: Number(createJobCardLabour) }
            : {}),
        }),
      })
      if (canSuppliersRead && canSuppliersWrite) {
        try {
          await syncPreferredSupplier(created._id, createSupplierId)
        } catch (supplierErr) {
          setError(
            supplierErr instanceof Error
              ? `Product created, but supplier link failed: ${supplierErr.message}`
              : 'Product created, but supplier link failed',
          )
        }
      }
      if (createPhotoFile) {
        try {
          await uploadProductPhoto(created._id, createPhotoFile)
        } catch (photoErr) {
          setError(
            photoErr instanceof Error
              ? `Product created, but photo upload failed: ${photoErr.message}`
              : 'Product created, but photo upload failed',
          )
        }
      }
      resetCreateForm()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    }
  }

  async function onUpdate(e: FormEvent) {
    e.preventDefault()
    if (!editing || !canWrite) return
    setError(null)
    try {
      const catEdit = editCategory.trim() || null
      await apiFetch(`/products/${editing._id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editName,
          sku: editSku,
          barcode: editBarcode.trim() || null,
          category: catEdit,
          subCategory: catEdit ? editSubCategory.trim() || null : null,
          price: Number(editPrice),
          stock: Number(editStock),
          trackInventory: editTrackInventory,
          trackSoldBy: editTrackSoldBy,
          volumeTieringEnabled: editVolumeTiering,
          volumeTiers: editVolumeTiering ? draftsToVolumePayload(editTierRows) : [],
          jobCardLabourPerUnit: editJobCardLabour.trim() === '' ? 0 : Number(editJobCardLabour),
        }),
      })
      if (canSuppliersRead && canSuppliersWrite) {
        try {
          await syncPreferredSupplier(editing._id, editSupplierId)
        } catch (supplierErr) {
          setError(
            supplierErr instanceof Error
              ? `Product updated, but supplier link failed: ${supplierErr.message}`
              : 'Product updated, but supplier link failed',
          )
        }
      }
      closeEditModal()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    }
  }

  async function printLabelWithCopies(
    target: LabelPrintTarget,
    copies: number,
    profile: LabelPrinterProfile,
  ): Promise<boolean> {
    setLabelNotice(null)
    setError(null)
    if (!window.electronBo) {
      setError('Label printing is available in the desktop app only.')
      return false
    }
    const labelSettings = profileToPrintSettings(profile)
    setLabelBusyProductId(target.key)
    try {
      const barcodeValue = (target.barcode ?? '').trim() || target.sku
      const result = await window.electronBo.printProductLabel(
        labelSettings.transport,
        {
          name: target.name,
          sku: target.sku,
          barcodeValue,
          price: target.price,
        },
        {
          copies,
          layout: labelSettings.layout,
          template: labelSettings.template,
          presetId:
            labelSettings.templateRef.kind === 'preset' ? labelSettings.templateRef.presetId : undefined,
        },
      )
      if (!result.ok) {
        setError(result.error ?? 'Label print failed')
        return false
      }
      writeLastUsedLabelProfileId(profile.id)
      setLabelNotice(
        copies > 1
          ? `Sent ${copies} labels (${profile.name}): ${target.name}`
          : `Label sent (${profile.name}): ${target.name}`,
      )
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Label print failed')
      return false
    } finally {
      setLabelBusyProductId(null)
    }
  }

  function openPrintLabelModal(target: LabelPrintTarget) {
    const config = readLabelPrinterConfig()
    const profile = getLabelProfileById(printLabelProfileId, config) ?? config.profiles.find((p) => p.isDefault) ?? config.profiles[0]
    setPrintLabelProfileId(profile.id)
    setPrintLabelTarget(target)
    setPrintLabelCopies(String(Math.max(1, Math.min(100, Math.floor(profile.copies || 1)))))
  }

  const handlePrintLabel = useCallback(
    (product: Product) => {
      openPrintLabelModal(labelPrintTargetFromProduct(product))
    },
    [printLabelProfileId],
  )

  function closePrintLabelModal() {
    setPrintLabelTarget(null)
    setPrintLabelCopies('1')
  }

  function labelPrintTargetFromCreateDraft(): LabelPrintTarget | null {
    const name = createName.trim()
    const sku = createSku.trim()
    const price = Number(createPrice)
    if (!name || !sku || !Number.isFinite(price) || price < 0) return null
    return {
      key: '__create__',
      name,
      sku,
      barcode: createBarcode.trim() || null,
      price,
    }
  }

  function openPrintCreateLabel() {
    const target = labelPrintTargetFromCreateDraft()
    if (!target) {
      setError('Enter name, SKU, and a valid price before printing labels.')
      return
    }
    setError(null)
    openPrintLabelModal(target)
  }

  async function submitPrintLabelCopies(e: FormEvent) {
    e.preventDefault()
    if (!printLabelTarget) return
    const copies = Math.max(1, Math.min(100, Math.floor(Number(printLabelCopies) || 1)))
    setPrintLabelCopies(String(copies))
    const config = readLabelPrinterConfig()
    const profile =
      getLabelProfileById(printLabelProfileId, config) ??
      config.profiles.find((p) => p.isDefault) ??
      config.profiles[0]
    const ok = await printLabelWithCopies(printLabelTarget, copies, profile)
    if (ok) closePrintLabelModal()
  }

  const labelPrinterProfiles = readLabelPrinterConfig().profiles

  async function persistSharedPresets(next: ProductPresetsState) {
    const saved = await apiFetch<ProductPresetsState>('/settings/product-presets', {
      method: 'PUT',
      body: JSON.stringify(next),
    })
    setSharedPresets(saved)
  }

  async function removeSharedPresetSlot(globalIndex: number) {
    if (!canPresets || !sharedPresets) return
    setPresetBusy(true)
    setPresetError(null)
    try {
      const next = removePresetFromState(sharedPresets, globalIndex)
      await persistSharedPresets(next)
    } catch (e) {
      setPresetError(e instanceof Error ? e.message : 'Could not update presets')
    } finally {
      setPresetBusy(false)
    }
  }

  async function addSharedPresetSlot() {
    if (!canPresets || !editing || !sharedPresets) return
    const full = sharedPresets.entries.length >= PRESET_ENTRY_MAX
    if (full) {
      if (presetReplaceIndex < 0 || presetReplaceIndex >= sharedPresets.entries.length) {
        setPresetError(`All ${PRESET_ENTRY_MAX} preset slots are used — choose one to replace.`)
        return
      }
    }
    const replaceAt = full ? presetReplaceIndex : null
    setPresetBusy(true)
    setPresetError(null)
    try {
      const catPreset = editCategory.trim() || null
      const product: Product = {
        ...editing,
        name: editName,
        sku: editSku,
        barcode: editBarcode.trim() || null,
        category: catPreset,
        subCategory: catPreset ? editSubCategory.trim() || null : null,
        price: Number(editPrice),
        stock: Number(editStock),
        trackInventory: editTrackInventory,
      }
      const next = assignPresetEntry(sharedPresets, product, addPresetCat, addPresetSub, replaceAt)
      if (next === sharedPresets) {
        setPresetError('Enter category and sub-category.')
        return
      }
      await persistSharedPresets(next)
      setAddPresetCat('')
      setAddPresetSub('')
      setPresetReplaceIndex(-1)
    } catch (e) {
      setPresetError(e instanceof Error ? e.message : 'Could not update presets')
    } finally {
      setPresetBusy(false)
    }
  }

  return (
    <BoShell>
      <h1>Products</h1>
      <p className="muted">Manage catalog and stock.</p>

      {canWrite ? (
        <section className="panel catalog-push-panel" aria-labelledby="catalog-push-heading">
          <h2 id="catalog-push-heading" className="catalog-push-title">
            POS tills
          </h2>
          <p className="muted catalog-push-lead">
            After bulk edits or price changes, push so signed-in registers download the latest catalog from the
            server. Each till checks about every 30 seconds.
          </p>
          {catalogRevision != null ? (
            <p className="muted catalog-push-meta">
              Catalog revision <strong>{catalogRevision}</strong>
              {catalogPushedAt ? (
                <>
                  {' '}
                  · last push {new Date(catalogPushedAt).toLocaleString()}
                </>
              ) : null}
            </p>
          ) : null}
          <div className="catalog-push-actions">
            <button
              type="button"
              className="btn primary"
              disabled={catalogPushBusy}
              onClick={() => void onPushCatalogToTills()}
            >
              {catalogPushBusy ? 'Pushing…' : 'Push catalog to tills'}
            </button>
          </div>
          {catalogPushNotice ? (
            <p className={catalogPushNotice.startsWith('Push sent') ? 'success catalog-push-notice' : 'error catalog-push-notice'}>
              {catalogPushNotice}
            </p>
          ) : null}
        </section>
      ) : null}

      {!canRead && <p className="error">Permission required: view products.</p>}

      {canWrite && (
        <form className="panel product-form" onSubmit={onCreate}>
          <h2>New product</h2>
          <div
            className={`product-fields-grid${canSuppliersRead ? '' : ' product-fields-grid--no-supplier'}`}
          >
            <label className="product-field product-field--name">
              Name
              <input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                required
              />
            </label>
            <label className="product-field product-field--sku">
              SKU
              <input
                value={createSku}
                onChange={(e) => {
                  setCreateSku(e.target.value)
                  setCreateSkuManuallyEdited(true)
                }}
                required
              />
            </label>
            <label className="product-field product-field--barcode">
              Barcode
              <input
                value={createBarcode}
                onChange={(e) => setCreateBarcode(e.target.value)}
                placeholder="EAN / UPC (optional)"
                autoComplete="off"
                inputMode="numeric"
              />
              <span className="muted help-note">
                Manufacturer scan code when different from SKU. Leave blank to print SKU on labels.
              </span>
            </label>
            <label className="product-field product-field--half">
              Category
              <input
                value={createCategory}
                onChange={(e) => setCreateCategory(e.target.value)}
                placeholder="e.g. Drinks"
                autoComplete="off"
                list={categorySuggestions.length > 0 ? productCategoryDatalistId : undefined}
              />
            </label>
            <label className="product-field product-field--half">
              Sub-category
              <input
                value={createSubCategory}
                onChange={(e) => setCreateSubCategory(e.target.value)}
                placeholder="e.g. Cold"
                autoComplete="off"
                disabled={!createCategory.trim()}
                title={!createCategory.trim() ? 'Set a category first' : undefined}
                list={
                  createCategory.trim() && createSubCategorySuggestions.length > 0
                    ? productCreateSubCategoryDatalistId
                    : undefined
                }
              />
            </label>
            <label className="product-field product-field--price">
              Price
              <input
                type="number"
                step="0.01"
                min={0}
                value={createPrice}
                onChange={(e) => setCreatePrice(e.target.value)}
                required
              />
            </label>
            {canSuppliersRead ? (
              <label className="product-field product-field--supplier">
                Primary supplier
                <select
                  value={createSupplierId}
                  onChange={(e) => setCreateSupplierId(e.target.value)}
                  disabled={!canSuppliersWrite}
                  title={!canSuppliersWrite ? 'Suppliers write permission required to save' : undefined}
                >
                  <option value="">None</option>
                  {suppliers.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label
              className={`product-field product-field--stock${createTrackInventory ? '' : ' muted'}`}
            >
              Stock
              <input
                type="number"
                min={0}
                value={createStock}
                onChange={(e) => setCreateStock(e.target.value)}
                required
                disabled={!createTrackInventory}
              />
            </label>
            <label className="product-field product-field--full">
              Job card labour (per unit)
              <input
                type="number"
                step="0.01"
                min={0}
                value={createJobCardLabour}
                onChange={(e) => setCreateJobCardLabour(e.target.value)}
                placeholder="0"
              />
              <span className="muted help-note">
                VAT-inclusive labour per catalog unit when the item is sold on a POS job card only.
              </span>
            </label>
          </div>
          <div className="product-photo-row">
            <label>
              Product photo (optional)
              <input
                ref={createPhotoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(e) => setCreatePhotoFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {createPhotoFile ? (
              <p className="muted products-search-meta">
                Selected: <strong>{createPhotoFile.name}</strong> — uploads after you create the product (1024×1024 WebP on
                server).
              </p>
            ) : (
              <p className="muted help-note">
                JPEG, PNG, WebP or GIF (max 12 MB). Stored as letterboxed 1024×1024 WebP for catalog consistency.
              </p>
            )}
          </div>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={createTrackInventory}
              onChange={(e) => setCreateTrackInventory(e.target.checked)}
            />
            <span>
              Track inventory
              <span className="muted help-note">
                Off for services or labour — stock is not checked or reduced on sale.
              </span>
            </span>
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={createTrackSoldBy}
              onChange={(e) => setCreateTrackSoldBy(e.target.checked)}
            />
            <span>
              Sold by
              <span className="muted help-note">
                Credits the logged-in cashier on each sale line; shown on their user profile (refunds reduce counts).
              </span>
            </span>
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={createVolumeTiering}
              onChange={(e) => {
                const on = e.target.checked
                setCreateVolumeTiering(on)
                if (on && createTierRows.length === 0) {
                  setCreateTierRows([newTierDraftRow()])
                }
              }}
            />
            <span>
              Enable volume price tiering
              <span className="muted help-note">
                The <strong>total line quantity</strong> picks one tier; that unit price applies to <strong>every</strong>{' '}
                unit on the line. Add rows: from / to / each; leave “To” empty on the last row for “and up”. Quantities
                below the first tier’s “From” use the base shelf price.
              </span>
            </span>
          </label>
          {createVolumeTiering ? (
            <div className="panel volume-tier-panel">
              <h3>Volume tiers</h3>
              <p className="muted help-note">
                Example: “10–99 @ 11.00” means a line of 10+ units in that range is priced at 11.00 each for the whole
                quantity (not 9 at list + 1 at 11).
              </p>
              {createTierRows.map((row, idx) => (
                <div className="inline-form volume-tier-row" key={row.id}>
                  <label>
                    From (unit #)
                    <input
                      type="number"
                      min={1}
                      value={row.minQty}
                      onChange={(e) => {
                        const v = e.target.value
                        setCreateTierRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, minQty: v } : r)))
                      }}
                    />
                  </label>
                  <label>
                    To (unit #)
                    <input
                      type="number"
                      min={1}
                      placeholder={idx === createTierRows.length - 1 ? 'empty = and up' : ''}
                      value={row.maxTo}
                      onChange={(e) => {
                        const v = e.target.value
                        setCreateTierRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, maxTo: v } : r)))
                      }}
                    />
                  </label>
                  <label>
                    Each
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={row.unitPrice}
                      onChange={(e) => {
                        const v = e.target.value
                        setCreateTierRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, unitPrice: v } : r)))
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn small ghost"
                    onClick={() => setCreateTierRows((rs) => rs.filter((r) => r.id !== row.id))}
                    disabled={createTierRows.length <= 1}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn small"
                onClick={() => setCreateTierRows((rs) => [...rs, newTierDraftRow()])}
              >
                + Add tier
              </button>
            </div>
          ) : null}
          <div className="form-actions">
            <button
              type="button"
              className="btn"
              onClick={() => openPrintCreateLabel()}
              disabled={labelBusyProductId === '__create__'}
            >
              {labelBusyProductId === '__create__' ? 'Printing…' : 'Print labels'}
            </button>
            <button type="submit" className="btn primary">
              Create
            </button>
          </div>
        </form>
      )}

      {canRead && !canWrite && (
        <p className="muted">View only — you do not have permission to change the catalog.</p>
      )}

      {error && <p className="error">{error}</p>}

      {canRead ? (
      <div className="panel">
        {categorySuggestions.length > 0 ? (
          <datalist id={productCategoryDatalistId}>
            {categorySuggestions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        ) : null}
        {createSubCategorySuggestions.length > 0 ? (
          <datalist id={productCreateSubCategoryDatalistId}>
            {createSubCategorySuggestions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        ) : null}
        {editSubCategorySuggestions.length > 0 ? (
          <datalist id={productEditSubCategoryDatalistId}>
            {editSubCategorySuggestions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        ) : null}
        <div className="products-toolbar">
          <label className="products-search-field">
            Search products
            <input
              type="search"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="Filter by name, SKU, barcode, category, or sub-category…"
              autoComplete="off"
              enterKeyHint="search"
            />
          </label>
          <label className="products-search-field">
            Category
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="__all__">All categories</option>
              {categories.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.count})
                </option>
              ))}
            </select>
          </label>
          {productsLoading ? (
            <p className="muted products-search-meta">Loading catalog…</p>
          ) : products.length > 0 && (productSearch.trim() || isSearchFiltering) ? (
            <p className="muted products-search-meta">
              {isSearchFiltering ? 'Filtering… · ' : ''}
              {filteredProducts.length.toLocaleString()} of {products.length.toLocaleString()} shown
            </p>
          ) : products.length > 0 ? (
            <p className="muted products-search-meta">
              {filteredProducts.length.toLocaleString()} products
              {categoryFilter !== '__all__' ? ' in category' : ''}
            </p>
          ) : null}
          <p className="muted products-search-meta">
            Label printers are configured in{' '}
            <Link to="/label-settings">Label settings</Link> (up to two printers).
          </p>
          {labelNotice ? <p className="success">{labelNotice}</p> : null}
        </div>
        {categories.length > 0 ? (
          <section className="panel">
            <h3>Categories</h3>
            <p className="muted products-search-meta">
              {categories.length} categories across {products.length} products.
            </p>
            <div className="inline-form">
              {categories.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  className={categoryFilter === c.name ? 'btn primary small' : 'btn ghost small'}
                  onClick={() => setCategoryFilter(c.name)}
                >
                  {c.name} ({c.count})
                </button>
              ))}
              <button
                type="button"
                className={categoryFilter === '__all__' ? 'btn primary small' : 'btn ghost small'}
                onClick={() => setCategoryFilter('__all__')}
              >
                Show all
              </button>
            </div>
          </section>
        ) : null}
        {productsLoading ? (
          <p className="muted products-table-loading">Loading products…</p>
        ) : filteredProducts.length > 0 ? (
          <ProductsVirtualTable
            products={filteredProducts}
            filterKey={`${deferredProductSearch}\0${categoryFilter}`}
            canWrite={canWrite}
            labelBusyProductId={labelBusyProductId}
            onEdit={handleEditProduct}
            onPrintLabel={handlePrintLabel}
            onDelete={(id) => void handleDeleteProduct(id)}
          />
        ) : null}
        {!productsLoading && products.length === 0 && <p className="muted">No products yet.</p>}
        {!productsLoading && products.length > 0 && filteredProducts.length === 0 && (
          <p className="muted">No products match your search.</p>
        )}
      </div>
      ) : null}

      {canWrite && printLabelTarget && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closePrintLabelModal()
          }}
        >
          <div
            className="modal-dialog panel product-form"
            role="dialog"
            aria-modal="true"
            aria-labelledby="print-label-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <form onSubmit={submitPrintLabelCopies}>
              <h2 id="print-label-title">Print label</h2>
              <p className="muted modal-subtitle">
                {printLabelTarget.name} <span className="muted">({printLabelTarget.sku})</span>
              </p>
              <div className="inline-form">
                <label>
                  Number of labels
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={printLabelCopies}
                    onChange={(e) => setPrintLabelCopies(e.target.value)}
                    required
                    autoFocus
                  />
                </label>
              </div>
              {labelPrinterProfiles.length > 1 ? (
                <fieldset className="label-print-profile-picker" style={{ margin: '0.75rem 0', border: 'none', padding: 0 }}>
                  <legend className="muted" style={{ marginBottom: '0.35rem' }}>
                    Printer
                  </legend>
                  {labelPrinterProfiles.map((profile) => (
                    <label key={profile.id} className="pos-settings-check" style={{ display: 'flex', marginBottom: '0.35rem' }}>
                      <input
                        type="radio"
                        name="print-label-profile"
                        value={profile.id}
                        checked={printLabelProfileId === profile.id}
                        onChange={() => setPrintLabelProfileId(profile.id)}
                      />
                      {formatProfileSummary(profile)}
                      {profile.isDefault ? ' · default' : ''}
                    </label>
                  ))}
                </fieldset>
              ) : null}
              <div className="form-actions">
                <button type="submit" className="btn primary">
                  Print
                </button>
                <button type="button" className="btn ghost" onClick={closePrintLabelModal}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {canWrite && editing && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeEditModal()
          }}
        >
          <div
            className="modal-dialog panel product-form"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-product-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <form onSubmit={onUpdate}>
              <h2 id="edit-product-title">Edit product</h2>
              <p className="muted modal-subtitle">
                {editing.name} <span className="muted">({editing.sku})</span>
              </p>
              <div
                className={`product-fields-grid${canSuppliersRead ? '' : ' product-fields-grid--no-supplier'}`}
              >
                <label className="product-field product-field--name">
                  Name
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                  />
                </label>
                <label className="product-field product-field--sku">
                  SKU
                  <input
                    value={editSku}
                    onChange={(e) => setEditSku(e.target.value)}
                    required
                  />
                </label>
                <label className="product-field product-field--barcode">
                  Barcode
                  <input
                    value={editBarcode}
                    onChange={(e) => setEditBarcode(e.target.value)}
                    placeholder="EAN / UPC (optional)"
                    autoComplete="off"
                    inputMode="numeric"
                  />
                  <span className="muted help-note">
                    Manufacturer scan code when different from SKU. Clear to use SKU on labels only.
                  </span>
                </label>
                <label className="product-field product-field--half">
                  Category
                  <input
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    placeholder="e.g. Drinks"
                    autoComplete="off"
                    list={categorySuggestions.length > 0 ? productCategoryDatalistId : undefined}
                  />
                </label>
                <label className="product-field product-field--half">
                  Sub-category
                  <input
                    value={editSubCategory}
                    onChange={(e) => setEditSubCategory(e.target.value)}
                    placeholder="e.g. Cold"
                    autoComplete="off"
                    disabled={!editCategory.trim()}
                    title={!editCategory.trim() ? 'Set a category first' : undefined}
                    list={
                      editCategory.trim() && editSubCategorySuggestions.length > 0
                        ? productEditSubCategoryDatalistId
                        : undefined
                    }
                  />
                </label>
                <label className="product-field product-field--price">
                  Price
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                    required
                  />
                </label>
                {canSuppliersRead ? (
                  <label className="product-field product-field--supplier">
                    Primary supplier
                    <select
                      value={editSupplierId}
                      onChange={(e) => setEditSupplierId(e.target.value)}
                      disabled={!canSuppliersWrite}
                      title={!canSuppliersWrite ? 'Suppliers write permission required to save' : undefined}
                    >
                      <option value="">None</option>
                      {suppliers.map((s) => (
                        <option key={s._id} value={s._id}>
                          {s.name} ({s.code})
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label
                  className={`product-field product-field--stock${editTrackInventory ? '' : ' muted'}`}
                >
                  Stock
                  <input
                    type="number"
                    min={0}
                    value={editStock}
                    onChange={(e) => setEditStock(e.target.value)}
                    required
                    disabled={!editTrackInventory}
                  />
                </label>
                {editTrackInventory ? (
                  <div className="product-field product-field--full">
                    <span className="product-field-label">Stock adjustment history</span>
                    {stockHistoryBusy ? (
                      <p className="muted help-note">Loading history…</p>
                    ) : stockHistory.length === 0 ? (
                      <p className="muted help-note">No recorded stock changes yet.</p>
                    ) : (
                      <ul className="stock-adjustment-history">
                        {stockHistory.map((row) => (
                          <li key={row._id}>
                            <span>
                              {new Date(row.createdAt).toLocaleString()} · {stockAdjustmentUserLabel(row)} ·{' '}
                              {stockAdjustmentSourceLabel(row.sourceApp)}
                            </span>
                            <span className="stock-adjustment-history-delta">
                              {row.fromStock} → {row.toStock} ({row.delta >= 0 ? '+' : ''}
                              {row.delta})
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
                <label className="product-field product-field--full">
                  Job card labour (per unit)
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={editJobCardLabour}
                    onChange={(e) => setEditJobCardLabour(e.target.value)}
                    placeholder="0"
                  />
                  <span className="muted help-note">
                    VAT-inclusive labour per catalog unit on POS job cards only. Clear to remove.
                  </span>
                </label>
              </div>
              <div className="product-photo-row">
                <h3 className="product-photo-row-title">Catalog photo</h3>
                {(editing.photoRevision ?? 0) > 0 && editPhotoPreviewUrl ? (
                  <img
                    src={editPhotoPreviewUrl}
                    alt=""
                    className="product-photo-preview"
                  />
                ) : (
                  <p className="muted help-note">No photo on file.</p>
                )}
                <div className="product-photo-row-actions">
                  <label className="product-photo-file-label">
                    Replace image
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      disabled={photoBusy}
                      onChange={(e) => void handleReplaceEditPhoto(e.target.files?.[0] ?? null)}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn ghost small"
                    disabled={photoBusy || (editing.photoRevision ?? 0) < 1}
                    onClick={() => void handleRemoveEditPhoto()}
                  >
                    Remove photo
                  </button>
                </div>
                <p className="muted help-note">
                  JPEG, PNG, WebP or GIF (max 12 MB). Replaced images are stored as letterboxed 1024×1024 WebP.
                </p>
              </div>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={editTrackInventory}
                  onChange={(e) => setEditTrackInventory(e.target.checked)}
                />
                <span>
                  Track inventory
                  <span className="muted help-note">
                    Off for services or labour — stock is not checked or reduced on sale.
                  </span>
                </span>
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={editTrackSoldBy}
                  onChange={(e) => setEditTrackSoldBy(e.target.checked)}
                />
                <span>
                  Sold by
                  <span className="muted help-note">
                    Credits the logged-in cashier on each sale line; shown on their user profile (refunds reduce counts).
                  </span>
                </span>
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={editVolumeTiering}
                  onChange={(e) => {
                    const on = e.target.checked
                    setEditVolumeTiering(on)
                    if (on && editTierRows.length === 0) {
                      setEditTierRows([newTierDraftRow()])
                    }
                  }}
                />
                <span>
                  Enable volume price tiering
                  <span className="muted help-note">
                    Total line quantity picks one bucket; that price applies to all units. Last row: leave “To” empty
                    for “and up”.
                  </span>
                </span>
              </label>
              {editVolumeTiering ? (
                <div className="volume-tier-panel">
                  <h3 className="product-edit-presets-title">Volume tiers</h3>
                  <p className="muted help-note product-edit-preset-datalist-hint">
                    Same rules as new product: flat bucket by line quantity, not per-unit progressive pricing.
                  </p>
                  {editTierRows.map((row, idx) => (
                    <div className="inline-form volume-tier-row" key={row.id}>
                      <label>
                        From
                        <input
                          type="number"
                          min={1}
                          value={row.minQty}
                          onChange={(e) => {
                            const v = e.target.value
                            setEditTierRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, minQty: v } : r)))
                          }}
                        />
                      </label>
                      <label>
                        To
                        <input
                          type="number"
                          min={1}
                          placeholder={idx === editTierRows.length - 1 ? 'empty = and up' : ''}
                          value={row.maxTo}
                          onChange={(e) => {
                            const v = e.target.value
                            setEditTierRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, maxTo: v } : r)))
                          }}
                        />
                      </label>
                      <label>
                        Each
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          value={row.unitPrice}
                          onChange={(e) => {
                            const v = e.target.value
                            setEditTierRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, unitPrice: v } : r)))
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        className="btn small ghost"
                        onClick={() => setEditTierRows((rs) => rs.filter((r) => r.id !== row.id))}
                        disabled={editTierRows.length <= 1}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button type="button" className="btn small" onClick={() => setEditTierRows((rs) => [...rs, newTierDraftRow()])}>
                    + Add tier
                  </button>
                </div>
              ) : null}

              {canPresetsRead ? (
              <div className="product-edit-presets">
                <h3 className="product-edit-presets-title">Preset buttons</h3>
                <p className="muted help-note">
                  Shared by all tills. On the POS, open the Presets panel, then category → sub-category → item.
                </p>
                {!canPresets && (
                  <p className="muted">View only — you cannot change preset layout.</p>
                )}
                {presetLoading && <p className="muted">Loading preset layout…</p>}
                {presetError && <p className="error">{presetError}</p>}
                {sharedPresets && !presetLoading && (
                  <>
                    <ul className="product-edit-preset-list">
                      {sharedPresets.entries
                        .map((e, i) => ({ e, i }))
                        .filter(({ e }) => e.productId === editing._id)
                        .map(({ e, i }) => (
                          <li key={i} className="product-edit-preset-row">
                            <span>
                              <strong>{e.category}</strong> › {e.subCategory}
                              <span className="muted"> · {e.label}</span>
                            </span>
                            {canPresets ? (
                              <button
                                type="button"
                                className="btn ghost small"
                                disabled={presetBusy}
                                onClick={() => void removeSharedPresetSlot(i)}
                              >
                                Remove
                              </button>
                            ) : null}
                          </li>
                        ))}
                    </ul>
                    {sharedPresets.entries.every((e) => e.productId !== editing._id) ? (
                      <p className="muted">This product is not on any preset slot yet.</p>
                    ) : null}
                    {canPresets ? (
                    <div className="product-edit-preset-add">
                      <p className="muted help-note product-edit-preset-datalist-hint">
                        Suggestions come from existing presets; you can still type a new category or sub-category.
                      </p>
                      <div className="inline-form">
                        <label>
                          Category
                          <input
                            value={addPresetCat}
                            onChange={(e) => setAddPresetCat(e.target.value)}
                            placeholder="e.g. Drinks"
                            list={presetCategoryOptions.length > 0 ? presetCatDatalistId : undefined}
                            autoComplete="off"
                          />
                        </label>
                        {presetCategoryOptions.length > 0 ? (
                          <datalist id={presetCatDatalistId}>
                            {presetCategoryOptions.map((c) => (
                              <option key={c} value={c} />
                            ))}
                          </datalist>
                        ) : null}
                        <label>
                          Sub-category
                          <input
                            value={addPresetSub}
                            onChange={(e) => setAddPresetSub(e.target.value)}
                            placeholder="e.g. Cold"
                            list={presetSubCategoryOptions.length > 0 ? presetSubDatalistId : undefined}
                            autoComplete="off"
                          />
                        </label>
                        {presetSubCategoryOptions.length > 0 ? (
                          <datalist id={presetSubDatalistId}>
                            {presetSubCategoryOptions.map((s) => (
                              <option key={s} value={s} />
                            ))}
                          </datalist>
                        ) : null}
                        {sharedPresets.entries.length >= PRESET_ENTRY_MAX ? (
                          <label>
                            Replace slot
                            <select
                              value={presetReplaceIndex}
                              onChange={(e) => setPresetReplaceIndex(Number(e.target.value))}
                            >
                              <option value={-1}>Choose…</option>
                              {sharedPresets.entries.map((e, idx) => (
                                <option key={idx} value={idx}>
                                  #{idx + 1}: {e.category} › {e.subCategory} ({e.label})
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}
                      </div>
                      <div className="form-actions">
                        <button
                          type="button"
                          className="btn small"
                          disabled={presetBusy}
                          onClick={() => void addSharedPresetSlot()}
                        >
                          Add to presets
                        </button>
                      </div>
                    </div>
                    ) : null}
                  </>
                )}
              </div>
              ) : null}

              <div className="form-actions">
                <button type="submit" className="btn primary">
                  Save
                </button>
                <button type="button" className="btn ghost" onClick={closeEditModal}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </BoShell>
  )
}
