import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AuthUser } from '../auth/types'
import { getAccessibleNavEntries, type BoNavEntry } from '../nav/boNavRegistry'
import { readRecentNavPaths, recordRecentNavPath } from '../nav/boNavRecent'
import { matchNavEntries } from '../nav/matchNavSearch'
import { IconSearch } from '../icons/windowChrome'

type CommandPaletteProps = {
  open: boolean
  onClose: () => void
  user: AuthUser | null | undefined
}

function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform)
}

function orderWithRecent(entries: BoNavEntry[], recentPaths: string[], query: string): BoNavEntry[] {
  if (query.trim()) return entries.map((entry) => entry)

  const byPath = new Map(entries.map((entry) => [entry.path, entry]))
  const recent = recentPaths.map((path) => byPath.get(path)).filter((entry): entry is BoNavEntry => !!entry)
  const recentSet = new Set(recent.map((entry) => entry.path))
  const rest = entries.filter((entry) => !recentSet.has(entry.path))
  return [...recent, ...rest]
}

export function CommandPalette({ open, onClose, user }: CommandPaletteProps) {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  const accessibleEntries = useMemo(() => getAccessibleNavEntries(user), [user])
  const recentPaths = useMemo(() => (open ? readRecentNavPaths() : []), [open])

  const results = useMemo(() => {
    const matched = matchNavEntries(accessibleEntries, query).map((r) => r.entry)
    return orderWithRecent(matched, recentPaths, query)
  }, [accessibleEntries, query, recentPaths])

  const selectEntry = useCallback(
    (entry: BoNavEntry) => {
      recordRecentNavPath(entry.path)
      navigate(entry.path)
      onClose()
    },
    [navigate, onClose],
  )

  useEffect(() => {
    if (!open) {
      setQuery('')
      setActiveIndex(0)
      return
    }
    const t = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [open])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => (results.length ? (i + 1) % results.length : 0))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => (results.length ? (i - 1 + results.length) % results.length : 0))
        return
      }
      if (e.key === 'Enter' && results[activeIndex]) {
        e.preventDefault()
        selectEntry(results[activeIndex])
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose, results, activeIndex, selectEntry])

  useEffect(() => {
    const list = listRef.current
    if (!list || !open) return
    const active = list.querySelector<HTMLElement>('[data-active="true"]')
    active?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, open])

  if (!open) return null

  const shortcutLabel = isMacPlatform() ? '⌘K' : 'Ctrl K'
  const showRecentHint = !query.trim() && recentPaths.length > 0

  return (
    <div
      className="modal-backdrop command-palette-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Search Back Office sections"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="command-palette-input-row">
          <IconSearch className="command-palette-input-icon" aria-hidden />
          <input
            ref={inputRef}
            type="search"
            className="command-palette-input"
            placeholder="Search sections…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-autocomplete="list"
            aria-controls="command-palette-list"
            aria-activedescendant={results[activeIndex] ? `command-palette-option-${results[activeIndex].id}` : undefined}
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="command-palette-kbd">{shortcutLabel}</kbd>
        </div>

        <div ref={listRef} id="command-palette-list" className="command-palette-results" role="listbox">
          {results.length === 0 ? (
            <p className="command-palette-empty">No matching sections. Try products, backup, or users.</p>
          ) : (
            results.map((entry, index) => {
              const isActive = index === activeIndex
              const isRecent =
                !query.trim() && recentPaths.includes(entry.path) && index < recentPaths.length
              return (
                <button
                  key={entry.id}
                  id={`command-palette-option-${entry.id}`}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  data-active={isActive ? 'true' : 'false'}
                  className={`command-palette-option${isActive ? ' command-palette-option--active' : ''}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectEntry(entry)}
                >
                  <span className="command-palette-option-main">
                    <span className="command-palette-option-title">{entry.title}</span>
                    {isRecent ? <span className="command-palette-option-tag">Recent</span> : null}
                  </span>
                  <span className="command-palette-option-meta">{entry.category}</span>
                </button>
              )
            })
          )}
        </div>

        {showRecentHint ? <p className="command-palette-footnote muted">Recent destinations appear first when search is empty.</p> : null}
      </div>
    </div>
  )
}

export function useCommandPaletteShortcut(onOpen: () => void): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = isMacPlatform() ? e.metaKey : e.ctrlKey
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        onOpen()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onOpen])
}

export function commandPaletteShortcutLabel(): string {
  return isMacPlatform() ? '⌘K' : 'Ctrl+K'
}
