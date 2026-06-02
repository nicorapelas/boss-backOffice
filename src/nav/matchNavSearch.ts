import type { BoNavEntry } from './boNavRegistry'

export type NavSearchResult = {
  entry: BoNavEntry
  score: number
}

function normalize(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, ' ')
}

function fuzzySubsequence(query: string, text: string): boolean {
  let qi = 0
  for (let i = 0; i < text.length && qi < query.length; i++) {
    if (text[i] === query[qi]) qi++
  }
  return qi === query.length
}

function scoreText(query: string, text: string): number {
  const t = normalize(text)
  if (!query) return 1
  if (t === query) return 100
  if (t.startsWith(query)) return 90
  if (t.includes(query)) return 80
  const words = t.split(/\s+/)
  if (words.some((w) => w.startsWith(query))) return 70
  if (fuzzySubsequence(query, t)) return 40
  return 0
}

function scoreEntry(query: string, entry: BoNavEntry): number {
  const q = normalize(query)
  if (!q) return 1

  let best = scoreText(q, entry.title)
  for (const keyword of entry.keywords) {
    best = Math.max(best, scoreText(q, keyword))
  }
  best = Math.max(best, scoreText(q, entry.category))
  return best
}

export function matchNavEntries(entries: BoNavEntry[], query: string): NavSearchResult[] {
  const trimmed = query.trim()
  if (!trimmed) {
    return entries.map((entry) => ({ entry, score: 1 }))
  }

  return entries
    .map((entry) => ({ entry, score: scoreEntry(trimmed, entry) }))
    .filter((result) => result.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return a.entry.title.localeCompare(b.entry.title)
    })
}
