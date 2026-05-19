import logoLight from '../assets/logo-text_bottom-light.png'
import logoDark from '../assets/logo-text_bottom1-dark.png'
import type { BoTheme } from './boTheme'

/** `light` = white/light panel; `dark` = coloured or dark chrome (e.g. blue sidebar). */
export type BoLogoSurface = 'light' | 'dark'

/**
 * Logo mark for UI chrome.
 * Light theme and Jacobs on white panels use the dark-coloured mark (`logo-text_bottom-light.png`).
 */
export function resolveBoLogoSrc(theme: BoTheme, surface: BoLogoSurface = 'dark'): string {
  if (theme === 'light') return logoLight
  if (theme === 'jacobs' && surface === 'light') return logoLight
  return logoDark
}
