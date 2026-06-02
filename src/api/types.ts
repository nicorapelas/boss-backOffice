export interface RoleRow {
  _id: string
  slug: string
  name: string
  permissions: string[]
  isSystem: boolean
}

export type BoRole = {
  _id: string
  slug: string
  name: string
  permissions: string[]
  isSystem: boolean
}

export interface StockAdjustmentRow {
  _id: string
  productId: string
  productSku: string
  fromStock: number
  toStock: number
  delta: number
  changedByEmail: string
  changedByDisplayName?: string | null
  sourceApp: string
  createdAt: string
}

export interface Product {
  _id: string
  name: string
  sku: string
  category?: string | null
  subCategory?: string | null
  barcode?: string | null
  price: number
  stock: number
  /** When false, service/labour — no stock enforcement at sale. */
  trackInventory?: boolean
  /** Progressive volume pricing (ordinal 1 = first of this line’s quantity). */
  volumeTieringEnabled?: boolean
  volumeTiers?: Array<{ minQty: number; maxQty: number | null; unitPrice: number }>
  /** VAT-inclusive labour per catalog unit on job-card sales (POS). */
  jobCardLabourPerUnit?: number
  /** 0 = no catalog photo; increments when photo replaced (POS cache-bust). */
  photoRevision?: number
  /** Derived on list API when `photoRevision > 0`. */
  hasPhoto?: boolean
}

export interface Supplier {
  _id: string
  name: string
  code: string
  active: boolean
  contactName?: string | null
  email?: string | null
  phone?: string | null
  accountNumber?: string | null
  notes?: string | null
}

export type SupplierOfferProductRef = { _id: string; name: string; sku: string }

export type SupplierOfferSupplierRef = { _id: string; name: string; code: string; active?: boolean }

export interface SupplierOffer {
  _id: string
  product: SupplierOfferProductRef | string
  supplier?: SupplierOfferSupplierRef | string
  supplierSku?: string | null
  unitCost: number
  unitsPerPack: number
  minOrderQty: number
  leadTimeDays?: number | null
  preferred: boolean
  priceEffectiveDate?: string | null
}

export interface SaleLine {
  product?: string
  name: string
  quantity: number
  unitPrice: number
  lineTotal: number
  stockOverrideApproved?: boolean
  stockOverrideScope?: 'offline' | 'online'
  stockOverrideAvailableQty?: number
}

/** Populated cashier from GET /sales (Back Office / API). */
export type SaleCashierInfo = {
  email?: string
  displayName?: string
  role?: string
}

export interface Sale {
  _id: string
  /** 10 hex characters — set on new sales; use for receipts and refunds */
  saleId?: string
  /** Register / till code snapshot when the sale was recorded. */
  tillCode?: string
  cashier: SaleCashierInfo | string
  items: SaleLine[]
  total: number
  paymentMethod?: string
  payment?: {
    cashAmount?: number
    cardAmount?: number
    tenderedCash?: number
    changeDue?: number
  }
  createdAt?: string
  refundStatus?: 'partial' | 'refunded'
  refundedAt?: string
  refundNote?: string
  refundPayoutMethod?: 'cash' | 'card' | 'store_credit'
  refundPayoutAmount?: number
  storeCreditAmount?: number
  loyaltyPhone?: string
  loyaltyPhoneMasked?: string
  loyaltyPointsRedeemed?: number
  loyaltyPointsEarned?: number
  loyaltyDiscountAmount?: number
  onAccountAmount?: number
  houseAccountNumber?: string
  houseAccountName?: string
  purchaseOrderNumber?: string
  quoteId?: string
  layById?: string | null
  legacy?: { source?: string; receiptNo?: number; terminal?: number }
}

export interface SaleListResponse {
  total: number
  sales: Sale[]
}

export interface OfflineSyncConflictLine {
  productId: string
  name: string
  qty: number
}

export interface OfflineSyncConflict {
  _id: string
  clientLocalId: string
  tillCode?: string
  scope: 'offline' | 'online'
  errorMessage: string
  status: 'open' | 'resolved'
  firstSeenAt: string
  lastSeenAt: string
  resolvedAt?: string | null
  resolvedBy?: { email?: string; displayName?: string } | null
  resolutionAction?: 'stock_adjusted' | 'sale_retried' | 'waived' | 'other' | null
  resolutionNote?: string | null
  retryRequestedAt?: string | null
  retryRequestedBy?: { email?: string; displayName?: string } | null
  lines: OfflineSyncConflictLine[]
  attemptCount: number
}

export interface OfflineSyncConflictListResponse {
  total: number
  conflicts: OfflineSyncConflict[]
}

export interface ShiftCashDifference {
  kind: 'over' | 'under'
  amount: number
  note?: string
  source: 'pos' | 'backoffice'
  createdAt: string
}

export interface ShiftSummary {
  turnover: number
  cashSales: number
  cardSales: number
  voucherTotal: number
  onAccountTotal: number
  refundTotal: number
  refundCashTotal: number
  refundCardTotal: number
  refundCount: number
  refundCashierNames?: string[]
  refundDetails?: Array<{
    saleId?: string
    cashierId?: string
    cashierName?: string
    method?: 'cash' | 'card' | 'store_credit'
    refundTotal: number
    refundCash: number
    refundCard: number
  }>
  layByCompletions: number
  layByPaymentCount?: number
  layByPaymentCashTotal?: number
  layByPaymentCardTotal?: number
  layByPaymentStoreCreditTotal?: number
  layByPaymentTotal?: number
  quoteConversions: number
  tabClosures: number
  cashierSales: Array<{ cashierId: string; cashierName?: string; salesCount: number; total: number }>
  priceOverrides?: Array<{
    saleId?: string
    cashierId?: string
    cashierName?: string
    itemName: string
    quantity: number
    listUnitPrice: number
    overriddenUnitPrice: number
    lineDiscount: number
  }>
}

export interface ShiftRow {
  _id: string
  tillCode: string
  status: 'open' | 'closed'
  openedAt: string
  closedAt?: string | null
  zNumber?: number | null
  summary?: ShiftSummary
  cashDifferences: ShiftCashDifference[]
}

export interface BackOfficeUser {
  _id: string
  email: string
  badgeCode?: string | null
  displayName?: string
  roleId: string
  role: string
  roleName?: string
  rolePermissions?: string[]
  roleIsSystem?: boolean
  active?: boolean
  allowOfflineLogin?: boolean
  allowShopAssistCatalogAdjustment?: boolean
  legacy?: {
    source?: 'vector'
    userNo?: number
    level?: number
    canLogin?: boolean
  }
}

export interface StoreBackupManifest {
  formatVersion: number
  mode: 'full'
  exportedAt: string
  includesPhotos: boolean
  counts: Record<string, number>
}

export interface StoreRestoreResponse {
  message: string
  manifest: StoreBackupManifest
  inserted: Record<string, number>
  roleRepair?: { fixed: number; unresolved: number }
}

export interface VectorImportStats {
  pluRowsTotal: number
  considered: number
  migrated: number
  skipped: number
  dryRun: boolean
}

export interface VectorSkuNormalizeStats {
  productsTotal: number
  candidates: number
  updated: number
  conflicts: number
  conflictSamples: Array<{ currentSku: string; targetSku: string; reason: string }>
  dryRun: boolean
}

export interface CatalogDeleteStats {
  productsDeleted: number
  supplierOffersDeleted: number
  photosRemoved: number
  presetEntriesCleared: number
}

export interface VectorImportPreviewResponse {
  import: VectorImportStats
}

export interface VectorImportRunResponse {
  message: string
  catalogDelete?: CatalogDeleteStats
  import: VectorImportStats
  skuNormalize?: VectorSkuNormalizeStats
}

export interface CatalogDeleteResponse extends CatalogDeleteStats {
  message: string
}

export interface MigrationAudit {
  generatedAt: string
  summary: {
    productsTotal: number
    productsVector: number
    usersTotal: number
    usersVector: number
    salesTotal: number
    salesVector: number
  }
  issues: {
    productsNegativeStock: number
    productsNoBarcode: number
    productsNoLegacyMapping: number
    usersVectorLocked: number
    salesVectorNoCashier: number
    salesAnyNoCashier: number
    salesLineOrphans: number
  }
  samples: {
    negativeStockProducts: Array<{
      _id: string
      name: string
      sku: string
      barcode?: string | null
      stock: number
    }>
    missingBarcodeProducts: Array<{
      _id: string
      name: string
      sku: string
      barcode?: string | null
      stock: number
    }>
    lockedVectorUsers: Array<{
      _id: string
      email: string
      displayName?: string
      role?: string
      roleId?: { slug?: string; name?: string }
      legacy?: {
        userNo?: number
        canLogin?: boolean
      }
    }>
    orphanCashierSales: Array<{
      _id: string
      total: number
      paymentMethod?: string
      createdAt?: string
      legacy?: {
        receiptNo?: number
        terminal?: number
      }
    }>
  }
}

export interface FinancialsSummary {
  range: { from: string; to: string }
  totals: { saleCount: number; grossTotal: number }
  layByPayments: {
    paymentCount: number
    amountTotal: number
    cashTotal: number
    cardTotal: number
    storeCreditTotal: number
  }
  byPaymentMethod: Array<{ paymentMethod: string; saleCount: number; grossTotal: number }>
  byDay: Array<{ day: string; saleCount: number; grossTotal: number }>
}

export type ProductPresetsState = {
  entries: Array<{
    productId: string
    category: string
    subCategory: string
    label: string
  }>
  categories: string[]
  subCategoriesByCategory: Record<string, string[]>
}

export interface CustomerDisplaySettings {
  enabled?: boolean
  idle?: {
    headline?: string
    subtext?: string
    imageUrl?: string
  }
  theme?: {
    backgroundColor?: string
    accentColor?: string
  }
  footerText?: string
}

export interface LoyaltyProgramConfig {
  enabled: boolean
  pointsPerRand: number
  redeemValuePerPoint: number
  minRedeemPoints: number
  maxRedeemPercent: number
}

export interface LoyaltyMemberRow {
  _id: string
  phoneMasked: string
  pointsBalance: number
  status: 'active' | 'blocked'
  optedInAt?: string
  createdAt?: string
  updatedAt?: string
}

export interface LoyaltyPurchaseRow {
  _id: string
  saleId?: string
  createdAt?: string
  tillCode?: string
  total: number
  paymentMethod?: string
  itemCount: number
  loyaltyDiscountAmount?: number
  loyaltyPointsEarned?: number
  loyaltyPointsRedeemed?: number
  refundStatus?: 'partial' | 'refunded'
}

export interface LoyaltyPurchaseListResponse {
  total: number
  purchases: LoyaltyPurchaseRow[]
}

export interface StoreSettings {
  _id: string
  storeName: string
  storeAddressLines: string[]
  storePhone: string
  storeVatNumber: string
  layByTerms: string
  defaultDepositPercent: number
  defaultExpiryMonths: number
  vatRate: number
  nextLayBySeq: number
  nextQuoteSeq: number
  nextHouseAccountSeq?: number
  /** Present on GET /settings/store; synced with POS preset buttons. */
  productPresets?: ProductPresetsState
  customerDisplay?: CustomerDisplaySettings
  loyaltyProgram?: LoyaltyProgramConfig
  catalogRevision?: number
  catalogPushedAt?: string | null
}

export interface CatalogSyncStatus {
  catalogRevision: number
  catalogPushedAt: string | null
}

export interface CatalogPushResponse {
  catalogRevision: number
  catalogPushedAt: string
}

/** GET /house-accounts */
export interface HouseAccountRow {
  _id: string
  accountNumber: string
  name: string
  phone: string
  contactPerson?: string
  email?: string
  vatNumber?: string
  addressLines?: string[]
  paymentTerms?: string
  notes?: string
  balance: number
  creditLimit: number | null
  status: string
  createdAt?: string
  updatedAt?: string
}

/** GET /house-accounts/:id/ledger */
export interface HouseAccountLedgerRow {
  _id: string
  houseAccountId: string
  accountNumber: string
  kind: 'charge' | 'payment'
  amount: number
  saleId?: string
  cashAmount?: number
  cardAmount?: number
  note?: string
  createdAt?: string
}

export interface LayByListItem {
  _id: string
  layByNumber: string
  customerName: string
  phone: string
  balance: number
  totalInclVat: number
  status: string
  expiresAt: string
}

/** GET /store-credit/accounts */
export interface StoreCreditAccountRow {
  _id: string
  phone: string
  name: string
  balance: number
  createdAt?: string
  updatedAt?: string
}

/** GET /store-credit/ledger */
export interface StoreCreditLedgerRow {
  _id: string
  accountId: string
  phone: string
  amount: number
  kind: 'issue' | 'redeem'
  refType: 'layby_cancel' | 'sale'
  refId: string
  note?: string
  createdAt?: string
}
