export interface Product {
  _id: string
  name: string
  sku: string
  barcode?: string | null
  price: number
  stock: number
  /** When false, service/labour — no stock enforcement at sale. */
  trackInventory?: boolean
}

export interface SaleLine {
  product: string
  name: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

export interface Sale {
  _id: string
  cashier: string
  items: SaleLine[]
  total: number
  paymentMethod?: string
  createdAt?: string
}

export interface BackOfficeUser {
  _id: string
  email: string
  badgeCode?: string | null
  displayName?: string
  role: 'admin' | 'cashier'
  active?: boolean
  legacy?: {
    source?: 'vector'
    userNo?: number
    level?: number
    canLogin?: boolean
  }
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
      role: 'admin' | 'cashier'
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
}

/** GET /house-accounts */
export interface HouseAccountRow {
  _id: string
  accountNumber: string
  name: string
  phone: string
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
