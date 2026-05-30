import { useEffect, useRef } from 'react'
import { getCatalogSyncStatus, subscribeServerEvents } from '../api/client'

const POLL_MS = 30_000

/** Reload catalog when revision increases (ShopAssist saves, Push to tills, etc.). */
export function useCatalogRevisionSync(active: boolean, onRevisionBump: () => void) {
  const revisionRef = useRef<number | null>(null)
  const baselineSetRef = useRef(false)

  useEffect(() => {
    if (!active) {
      revisionRef.current = null
      baselineSetRef.current = false
      return
    }

    let cancelled = false
    const unsubscribe = subscribeServerEvents((ev) => {
      if (cancelled) return
      if (ev.type !== 'catalog.revision') return
      if (!baselineSetRef.current) {
        revisionRef.current = ev.catalogRevision
        baselineSetRef.current = true
        return
      }
      if (revisionRef.current != null && ev.catalogRevision > revisionRef.current) {
        revisionRef.current = ev.catalogRevision
        onRevisionBump()
      }
    })

    const check = async () => {
      try {
        const sync = await getCatalogSyncStatus()
        if (cancelled) return
        const rev = typeof sync.catalogRevision === 'number' ? sync.catalogRevision : 0

        if (!baselineSetRef.current) {
          revisionRef.current = rev
          baselineSetRef.current = true
          return
        }

        if (revisionRef.current != null && rev > revisionRef.current) {
          revisionRef.current = rev
          onRevisionBump()
        }
      } catch {
        /* non-blocking */
      }
    }

    void check()
    const timer = window.setInterval(() => {
      void check()
    }, POLL_MS)

    return () => {
      cancelled = true
      unsubscribe()
      window.clearInterval(timer)
    }
  }, [active, onRevisionBump])
}
