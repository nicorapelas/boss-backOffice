import { memo, useEffect, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { Product } from '../api/types'

const ROW_HEIGHT_PX = 44
const TABLE_COLS = 9

export type ProductsVirtualTableProps = {
  products: Product[]
  /** Changes when search/category filter changes — resets scroll position. */
  filterKey?: string
  canWrite: boolean
  labelBusyProductId: string | null
  onEdit: (product: Product) => void
  onPrintLabel: (product: Product) => void
  onDelete: (id: string) => void
}

type ProductRowProps = {
  product: Product
  canWrite: boolean
  labelBusy: boolean
  onEdit: (product: Product) => void
  onPrintLabel: (product: Product) => void
  onDelete: (id: string) => void
}

const ProductRow = memo(function ProductRow({
  product: p,
  canWrite,
  labelBusy,
  onEdit,
  onPrintLabel,
  onDelete,
}: ProductRowProps) {
  return (
    <tr>
      <td>{p.name}</td>
      <td>{p.sku}</td>
      <td>{p.barcode?.trim() || '—'}</td>
      <td>{p.category?.trim() || 'Uncategorized'}</td>
      <td>{p.subCategory?.trim() || '—'}</td>
      <td>{p.price.toFixed(2)}</td>
      <td>{p.trackInventory === false ? '—' : p.stock}</td>
      <td>{p.trackInventory === false ? 'No' : 'Yes'}</td>
      {canWrite ? (
        <td className="actions-cell">
          <button type="button" className="btn small" onClick={() => onEdit(p)}>
            Edit
          </button>
          <button
            type="button"
            className="btn small"
            onClick={() => onPrintLabel(p)}
            disabled={labelBusy}
          >
            {labelBusy ? 'Printing…' : 'Print label'}
          </button>
          <button type="button" className="btn small" onClick={() => onDelete(p._id)}>
            Delete
          </button>
        </td>
      ) : null}
    </tr>
  )
})

export function ProductsVirtualTable({
  products,
  filterKey = '',
  canWrite,
  labelBusyProductId,
  onEdit,
  onPrintLabel,
  onDelete,
}: ProductsVirtualTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const colSpan = canWrite ? TABLE_COLS : TABLE_COLS - 1

  const rowVirtualizer = useVirtualizer({
    count: products.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: 12,
  })

  useEffect(() => {
    rowVirtualizer.scrollToOffset(0)
    rowVirtualizer.measure()
  }, [filterKey, products.length, rowVirtualizer])

  const virtualItems = rowVirtualizer.getVirtualItems()
  const totalSize = rowVirtualizer.getTotalSize()
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0
  const paddingBottom =
    virtualItems.length > 0 ? totalSize - virtualItems[virtualItems.length - 1].end : 0

  return (
    <div ref={scrollRef} className="products-table-scroll bo-table-responsive">
      <table className="table products-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>SKU</th>
            <th>Barcode</th>
            <th>Category</th>
            <th>Sub-category</th>
            <th>Price</th>
            <th>Stock</th>
            <th>Inv.</th>
            {canWrite ? <th /> : null}
          </tr>
        </thead>
        <tbody>
          {paddingTop > 0 ? (
            <tr aria-hidden="true" className="products-table-spacer">
              <td colSpan={colSpan} style={{ height: paddingTop }} />
            </tr>
          ) : null}
          {virtualItems.map((virtualRow) => {
            const p = products[virtualRow.index]
            if (!p) return null
            return (
              <ProductRow
                key={p._id}
                product={p}
                canWrite={canWrite}
                labelBusy={labelBusyProductId === p._id}
                onEdit={onEdit}
                onPrintLabel={onPrintLabel}
                onDelete={onDelete}
              />
            )
          })}
          {paddingBottom > 0 ? (
            <tr aria-hidden="true" className="products-table-spacer">
              <td colSpan={colSpan} style={{ height: paddingBottom }} />
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  )
}
