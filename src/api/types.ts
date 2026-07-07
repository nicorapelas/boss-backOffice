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
  /** Credit logged-in cashier on each sale line (user profile sold-by report). */
  trackSoldBy?: boolean
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

// ---- Invoice intake (supplier-invoice → catalog matching + apply) ----

export type InvoiceMatchConfidence = 'exact' | 'likely' | 'uncertain' | 'new'

export type InvoiceLineInput = {
  code?: string | null
  description: string
  qty?: number | null
  unitCost?: number | null
}

export type InvoiceMatchCandidate = {
  productId: string
  sku: string
  name: string
  longName?: string | null
  category?: string | null
  price?: number
  stock?: number
  score: number
  ratio: number
}

export type InvoiceMatchedLine = {
  input: InvoiceLineInput
  confidence: InvoiceMatchConfidence
  matchedBy: 'supplier-code' | 'fuzzy' | 'none'
  candidates: InvoiceMatchCandidate[]
}

export type InvoiceMatchResult = {
  supplier: string
  lines: InvoiceMatchedLine[]
  stats: { exact: number; likely: number; uncertain: number; neu: number }
}

export type ReceiveNewProduct = {
  name: string
  sku: string
  category?: string | null
  subCategory?: string | null
  barcode?: string | null
  keywords?: string[]
  trackInventory?: boolean
}

export type ReceiveLineInput = {
  action: 'update' | 'create' | 'skip'
  productId?: string
  newProduct?: ReceiveNewProduct
  qty?: number | null
  unitCost?: number | null
  supplierCode?: string | null
  supplierDescription?: string | null
  updatePrice?: boolean
  priceOverride?: number | null
}

export type ReceiveResultLine = {
  action: ReceiveLineInput['action']
  ok: boolean
  message?: string
  productId?: string
  sku?: string
  name?: string
  category?: string | null
  barcode?: string | null
  previousStock?: number
  newStock?: number
  unitCost?: number | null
  previousPrice?: number
  newPrice?: number
  priceChanged?: boolean
  supplierRefWritten?: boolean
  created?: boolean
}

export type ReceiveInvoiceResult = {
  supplier: string
  stockMode: 'add' | 'set'
  applied: number
  failed: number
  skipped: number
  lines: ReceiveResultLine[]
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
  cashierSignInMethod?: 'badge' | 'face' | 'password' | 'offline_badge' | 'offline_password'
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
  cashRoundingAdjustment?: number
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

export type UserPaymentTerms = 'weekly' | 'biweekly' | 'monthly' | 'custom'

export type UserStaffDocumentMeta = {
  originalName: string
  mimeType?: string
  uploadedAt: string
}

export type UserStaffLoan = {
  _id?: string
  startDate?: string | null
  amount?: number | null
  terms?: string | null
  notes?: string | null
}

export type UserPerformanceAttendanceSession = {
  id: string
  status: 'open' | 'closed'
  clockInAt: string
  clockOutAt: string | null
  clockInMethod: string
  clockOutMethod: string | null
  tillCode: string | null
  durationMinutes: number
}

export type UserPerformanceSummary = {
  period: { days: number; from: string; to: string }
  sales: {
    count: number
    turnover: number
    cashTotal: number
    cardTotal: number
    netTurnover: number
  }
  refunds: { count: number; total: number }
  attendance: {
    currentlyClockedIn: boolean
    openSince: string | null
    sessionCount: number
    totalHours: number
    recentSessions: UserPerformanceAttendanceSession[]
  }
}

export type UserSoldByLineRow = {
  saleId: string
  saleShortId?: string
  occurredAt: string
  sku?: string
  productName: string
  quantity: number
  unitPrice: number
  lineTotal: number
  kind: 'sale' | 'refund'
}

export type UserSoldBySalesReport = {
  userId: string
  days: number
  from: string
  to: string
  lines: UserSoldByLineRow[]
  totals: { quantity: number; lineTotal: number }
}

export type StaffShiftPerformanceRow = {
  userId: string
  displayName: string
  roleName: string | null
  sessionId: string
  clockInAt: string
  clockInMethod: string
  tillCode: string | null
  shiftMinutes: number
  salesCount: number
  turnover: number
  cashTotal: number
  cardTotal: number
  refundCount: number
  refundTotal: number
  netTurnover: number
}

export type StaffShiftPerformanceResponse = {
  attendanceEnabled: boolean
  generatedAt: string
  staff: StaffShiftPerformanceRow[]
}

export type OpenAttendanceSessionRow = {
  sessionId: string
  userId: string
  displayName: string
  tillCode: string | null
  clockInAt: string
  clockInMethod: string
  elapsedMinutes: number
}

export type OpenAttendanceSessionsResponse = {
  attendanceEnabled: boolean
  sessions: OpenAttendanceSessionRow[]
}

export type ClockOutAllAttendanceResponse = {
  clockedOut: number
  sessions: OpenAttendanceSessionRow[]
}

export type UserHrProfile = {
  phone?: string | null
  startDate?: string | null
  paymentTerms?: UserPaymentTerms | null
  paymentAmount?: number | null
  notes?: string | null
  scoreCard?: string | null
  contractDocument?: UserStaffDocumentMeta | null
  idDocument?: UserStaffDocumentMeta | null
  loans?: UserStaffLoan[]
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
  hasFaceEnrollment?: boolean
  faceEnrollmentConsentAt?: string | null
  hrProfile?: UserHrProfile | null
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

export interface MongoCloudBackupResult {
  ok: true
  trigger: 'manual' | 'scheduled'
  startedAt: string
  finishedAt: string
  archiveBytes: number
  databaseName: string
}

export interface MongoCloudBackupStatus {
  enabled: boolean
  configured: boolean
  schedule: string
  databaseName: string
  running: boolean
  lastRun: MongoCloudBackupResult | null
  lastError: { at: string; message: string; trigger: 'manual' | 'scheduled' } | null
}

export interface MongoCloudBackupResponse {
  message: string
  result: MongoCloudBackupResult
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
    idleImageRevision?: number
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

export interface StaffAttendanceSettings {
  enabled: boolean
  logoutClockOutPromptEnabled: boolean
  /** Prompt on till sign-out only after this many minutes clocked in; 0 = always when clocked in. */
  logoutPromptAfterMinutes: number
  /** First sale after this time auto-closes an open attendance session at sale time. */
  autoClockOutEnabled: boolean
  /** Local store time HH:mm (24h), e.g. 18:00 */
  autoClockOutTime: string
}

export interface CashRoundingSettings {
  enabled: boolean
  incrementCents: 10 | 20 | 50
  mode: 'nearest' | 'down' | 'up'
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
  /** Stock-receiving markup rules (default % + per-category overrides). */
  receiving?: { defaultMarkupPct: number; markupByCategory: Record<string, number> }
  customerDisplay?: CustomerDisplaySettings
  loyaltyProgram?: LoyaltyProgramConfig
  /** POS staff login at till: badge scan or face recognition. */
  posLoginMethod?: 'badge' | 'face'
  /** Store operator acceptance before face login is enabled. */
  posFaceLoginConsent?: {
    version: string
    acceptedAt: string
    acceptedBy?: string
  } | null
  staffAttendance?: StaffAttendanceSettings
  cashRounding?: CashRoundingSettings
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

export interface PosTerminalRow {
  tillCode: string
  displayName?: string
  lastSeenAt: string
  lastIp?: string
  appVersion?: string
  platform?: string
  hostname?: string
  cashierUserId?: string
  cashierDisplayName?: string
  catalogRevision?: number
  online: boolean
  openShiftId?: string
  openShiftOpenedAt?: string
  createdAt?: string
  updatedAt?: string
}

export interface ShopAssistDeviceRow {
  deviceId: string
  storeEndpoint: string
  label?: string
  platform?: string
  appVersion?: string
  enrolledAt: string
  lastSeenAt: string
  enrolledByEmail?: string
  revokedAt?: string | null
}

export interface HouseAccountRow {
  _id: string
  accountNumber: string
  name: string
  phone: string
  contactPerson?: string
  email?: string
  vatNumber?: string
  companyRegistrationNumber?: string
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

/** GET /house-accounts/:id/statement */
export interface HouseAccountStatementLineItem {
  name: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

export interface HouseAccountStatementChargeDetail {
  saleId?: string
  tillCode?: string
  purchaseOrderNumber?: string
  onAccountAmount: number
  saleTotal: number
  cashAmount?: number
  cardAmount?: number
  items: HouseAccountStatementLineItem[]
  summaryOnly?: boolean
}

export interface HouseAccountStatementRow {
  id: string
  date: string
  kind: 'charge' | 'payment'
  debit: number
  credit: number
  balanceAfter: number
  note?: string
  cashAmount?: number
  cardAmount?: number
  charge?: HouseAccountStatementChargeDetail
}

export interface HouseAccountStatement {
  generatedAt: string
  periodMode: 'since_last_zero' | 'custom'
  periodFrom: string
  periodTo: string
  lastZeroAt: string | null
  store: {
    name: string
    addressLines: string[]
    phone: string
    vatNumber: string
  }
  account: {
    _id: string
    accountNumber: string
    name: string
    phone: string
    contactPerson: string
    email: string
    vatNumber: string
    companyRegistrationNumber: string
    addressLines: string[]
    paymentTerms: string
    balance: number
    creditLimit: number | null
    status: string
  }
  openingBalance: number
  closingBalance: number
  rows: HouseAccountStatementRow[]
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
