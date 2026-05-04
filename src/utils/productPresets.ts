import type { Product, ProductPresetsState } from '../api/types'

/** Mirrors POS `PRESET_ENTRY_MAX` — keep in sync with server. */
export const PRESET_ENTRY_MAX = 200

export type PresetEntry = ProductPresetsState['entries'][number]

export function autoPresetLabel(p: Pick<Product, 'name' | 'sku'>): string {
  const base = (p.name || '').trim() || p.sku.trim() || 'Item'
  const max = 26
  if (base.length <= max) return base
  return `${base.slice(0, max - 1)}…`
}

export function assignPresetEntry(
  state: ProductPresetsState,
  product: Product,
  category: string,
  subCategory: string,
  replaceAtIndex: number | null,
): ProductPresetsState {
  const cat = category.trim()
  const sub = subCategory.trim()
  if (!cat || !sub) return state
  const label = autoPresetLabel(product)
  const newEntry: PresetEntry = {
    productId: product._id,
    category: cat,
    subCategory: sub,
    label,
  }

  let nextEntries: PresetEntry[]
  if (state.entries.length < PRESET_ENTRY_MAX) {
    nextEntries = [...state.entries, newEntry]
  } else {
    if (
      replaceAtIndex == null ||
      replaceAtIndex < 0 ||
      replaceAtIndex >= state.entries.length
    ) {
      return state
    }
    nextEntries = [...state.entries]
    nextEntries[replaceAtIndex] = newEntry
  }

  const categories = new Set(state.categories)
  categories.add(cat)
  const subMap = { ...state.subCategoriesByCategory }
  const subs = new Set(subMap[cat] ?? [])
  subs.add(sub)
  subMap[cat] = [...subs].sort()

  return {
    entries: nextEntries,
    categories: [...categories].sort(),
    subCategoriesByCategory: subMap,
  }
}

export function removePresetAt(state: ProductPresetsState, entryIndex: number): ProductPresetsState {
  if (entryIndex < 0 || entryIndex >= state.entries.length) return state
  const nextEntries = state.entries.filter((_, i) => i !== entryIndex)
  return { ...state, entries: nextEntries }
}
