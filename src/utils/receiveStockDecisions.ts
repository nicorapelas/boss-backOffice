import type { InvoiceMatchResult } from '../api/types'
import { suggestCreateName } from './receiveStockSku'

export type ReceiveRowDecision = {
  action: 'update' | 'create' | 'skip'
  productId: string | null
  manualPick?: {
    productId: string
    sku: string
    name: string
    category?: string | null
    price?: number
    stock?: number
  } | null
  priceInput: string
  updatePrice: boolean
  newName: string
  newSku: string
  newCategory: string
  newSkuManuallyEdited?: boolean
}

/** Build review-row decisions from a match result (shared by manual match + draft load). */
export function buildDecisionsFromMatch(res: InvoiceMatchResult): ReceiveRowDecision[] {
  return res.lines.map((ml) => {
    const top = ml.candidates[0]
    const isNew = ml.confidence === 'new' || !top
    return {
      action: isNew ? 'create' : 'update',
      productId: top?.productId ?? null,
      manualPick: null,
      priceInput: '',
      updatePrice: true,
      newName: isNew ? suggestCreateName(ml.input.description) : ml.input.description,
      newSku: '',
      newCategory: '',
      newSkuManuallyEdited: false,
    }
  })
}
