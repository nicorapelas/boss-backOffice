import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/** Smoothly scrolls the document to the top on route change (instant if reduced motion is preferred). */
export function ScrollToTopOnNavigate() {
  const { pathname } = useLocation()

  useEffect(() => {
    const instant =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const behavior = instant ? 'auto' : 'smooth'
    window.scrollTo({ top: 0, left: 0, behavior })
    const mainScroll = document.querySelector<HTMLElement>('.shell-main-scroll')
    if (mainScroll) mainScroll.scrollTo({ top: 0, left: 0, behavior })
  }, [pathname])

  return null
}
