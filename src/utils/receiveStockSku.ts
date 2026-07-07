/** Next numeric SKU (max + 1), matching Products page logic. */
export function nextSequentialSku(skus: Iterable<string>): string {
  let maxSku = 0
  for (const raw of skus) {
    const trimmed = raw.trim()
    if (!/^\d+$/.test(trimmed)) continue
    const value = Number(trimmed)
    if (Number.isFinite(value) && value > maxSku) maxSku = value
  }
  return String(maxSku + 1)
}

const COLOR_WORD =
  /\b(?:a-)?(?:black|white|green|yellow|orange|red|blue|pink|purple|silver|gold|grey|gray|m-orange|m-yellow|colour|colours|color|colors|assorted|ch)\b/gi

/** Group invoice lines that are the same model in different colours. */
export function variantGroupKey(description: string): string {
  return description
    .toUpperCase()
    .replace(/["'*]/g, ' ')
    .replace(COLOR_WORD, ' ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Shelf name without colour tokens — one SKU for all colours. */
export function suggestCreateName(description: string): string {
  return description
    .replace(/\bA\s+(BLACK|WHITE|GREEN|YELLOW|ORANGE|RED|BLUE)\b/gi, '')
    .replace(COLOR_WORD, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
