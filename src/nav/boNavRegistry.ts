import type { AuthUser } from '../auth/types'
import { hasPermission } from '../auth/permissions'

export type BoNavCategory = 'Overview' | 'Catalog' | 'Sales' | 'Admin' | 'Migration' | 'Store'

export type NavPermission =
  | string
  | { any: string[] }
  | { all: string[] }

export type BoNavEntry = {
  id: string
  title: string
  path: string
  category: BoNavCategory
  keywords: string[]
  permission?: NavPermission
  /** Dashboard uses `end` on NavLink so "/" is not active on every route. */
  end?: boolean
}

export const BO_NAV_ENTRIES: BoNavEntry[] = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    path: '/',
    category: 'Overview',
    keywords: ['home', 'overview', 'today', 'summary'],
    end: true,
  },
  {
    id: 'products',
    title: 'Products',
    path: '/products',
    category: 'Catalog',
    keywords: ['catalog', 'inventory', 'stock', 'sku', 'items', 'barcode'],
    permission: 'catalog.read',
  },
  {
    id: 'receive-stock',
    title: 'Receive stock',
    path: '/receive-stock',
    category: 'Catalog',
    keywords: ['invoice', 'intake', 'receive', 'purchase', 'stock in', 'supplier invoice', 'restock', 'goods received'],
    permission: 'catalog.write',
  },
  {
    id: 'invoice-layouts',
    title: 'Invoice layouts',
    path: '/invoice-layouts',
    category: 'Catalog',
    keywords: ['invoice', 'layout', 'ocr', 'teach', 'supplier template', 'intake'],
    permission: 'catalog.write',
  },
  {
    id: 'label-settings',
    title: 'Label settings',
    path: '/label-settings',
    category: 'Catalog',
    keywords: ['labels', 'barcode', 'print', 'sticker', 'price tag'],
    permission: 'catalog.read',
  },
  {
    id: 'suppliers',
    title: 'Suppliers',
    path: '/suppliers',
    category: 'Catalog',
    keywords: ['vendor', 'wholesale', 'offers', 'purchase'],
    permission: 'suppliers.read',
  },
  {
    id: 'users',
    title: 'Users',
    path: '/users',
    category: 'Admin',
    keywords: ['staff', 'cashiers', 'employees', 'accounts', 'team'],
    permission: 'users.manage',
  },
  {
    id: 'roles',
    title: 'Roles',
    path: '/roles',
    category: 'Admin',
    keywords: ['permissions', 'access', 'security', 'admin'],
    permission: 'users.manage',
  },
  {
    id: 'financials',
    title: 'Financials',
    path: '/financials',
    category: 'Sales',
    keywords: ['finance', 'revenue', 'reports', 'money', 'totals'],
    permission: 'financials.read',
  },
  {
    id: 'sales',
    title: 'Sales / receipts',
    path: '/sales',
    category: 'Sales',
    keywords: ['sales', 'receipts', 'transactions', 'history', 'till'],
    permission: 'sales.read',
  },
  {
    id: 'offline-conflicts',
    title: 'Offline conflicts',
    path: '/offline-conflicts',
    category: 'Sales',
    keywords: ['sync', 'offline', 'conflict', 'pos', 'reconcile'],
    permission: 'sales.read',
  },
  {
    id: 'shifts',
    title: 'Shifts / Z reports',
    path: '/shifts',
    category: 'Sales',
    keywords: ['shift', 'z report', 'end of day', 'eod', 'cash up', 'close'],
    permission: 'shifts.read',
  },
  {
    id: 'migration-audit',
    title: 'Migration Audit',
    path: '/audit',
    category: 'Migration',
    keywords: ['migration', 'import', 'audit', 'vector', 'legacy'],
    permission: 'migration.access',
  },
  {
    id: 'data-cleanup',
    title: 'Data Cleanup',
    path: '/cleanup',
    category: 'Migration',
    keywords: ['cleanup', 'delete', 'purge', 'maintenance'],
    permission: 'migration.access',
  },
  {
    id: 'store-backup',
    title: 'Store backup',
    path: '/store-backup',
    category: 'Migration',
    keywords: ['backup', 'restore', 'export', 'import', 'zip', 'archive'],
    permission: 'migration.access',
  },
  {
    id: 'catalog-migration',
    title: 'Catalog migration',
    path: '/catalog-migration',
    category: 'Migration',
    keywords: ['catalog', 'migrate', 'import', 'vector', 'products'],
    permission: 'migration.access',
  },
  {
    id: 'store-settings',
    title: 'Store settings',
    path: '/store-settings',
    category: 'Store',
    keywords: ['store', 'business', 'receipt', 'till', 'company', 'tax', 'customer display'],
    permission: { any: ['settings.read', 'settings.write'] },
  },
  {
    id: 'pos-terminals',
    title: 'POS terminals',
    path: '/pos-terminals',
    category: 'Admin',
    keywords: ['pos', 'terminal', 'till', 'register', 'ip', 'online', 'connected', 'device'],
    permission: 'settings.read',
  },
  {
    id: 'lay-bys',
    title: 'Lay-bys',
    path: '/lay-bys',
    category: 'Store',
    keywords: ['layby', 'lay-by', 'deposit', 'hold', 'payment plan'],
    permission: 'laybys.admin',
  },
  {
    id: 'store-voucher',
    title: 'Store vouchers',
    path: '/store-voucher',
    category: 'Store',
    keywords: ['voucher', 'gift card', 'store credit', 'credit note'],
    permission: 'store_credit.access',
  },
  {
    id: 'loyalty',
    title: 'Loyalty',
    path: '/loyalty',
    category: 'Store',
    keywords: ['loyalty', 'points', 'rewards', 'phone', 'customer'],
    permission: 'loyalty.access',
  },
  {
    id: 'house-accounts',
    title: 'House accounts',
    path: '/house-accounts',
    category: 'Store',
    keywords: ['account', 'tab', 'on account', 'credit customer'],
    permission: 'house_accounts.access',
  },
  {
    id: 'settings',
    title: 'Settings',
    path: '/settings',
    category: 'Overview',
    keywords: ['theme', 'appearance', 'back office', 'preferences', 'dark', 'light'],
  },
]

export function canAccessNavEntry(user: AuthUser | null | undefined, entry: BoNavEntry): boolean {
  if (!entry.permission) return true
  if (typeof entry.permission === 'string') return hasPermission(user, entry.permission)
  if ('any' in entry.permission) return entry.permission.any.some((p) => hasPermission(user, p))
  return entry.permission.all.every((p) => hasPermission(user, p))
}

export function getAccessibleNavEntries(user: AuthUser | null | undefined): BoNavEntry[] {
  return BO_NAV_ENTRIES.filter((entry) => canAccessNavEntry(user, entry))
}

export function findNavEntryByPath(path: string): BoNavEntry | undefined {
  return BO_NAV_ENTRIES.find((entry) => entry.path === path)
}
