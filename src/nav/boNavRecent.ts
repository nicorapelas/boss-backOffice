import { findNavEntryByPath } from './boNavRegistry'

const STORAGE_KEY = 'bo-nav-recent'
const MAX_RECENT = 5

export function readRecentNavPaths(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string')
  } catch {
    return []
  }
}

export function recordRecentNavPath(path: string): void {
  if (!findNavEntryByPath(path)) return
  const prev = readRecentNavPaths().filter((p) => p !== path)
  const next = [path, ...prev].slice(0, MAX_RECENT)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // ignore quota / private mode
  }
}
