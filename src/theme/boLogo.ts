import logoLight from '../assets/logo-text_bottom-light.png'
import logoDark from '../assets/logo-text_bottom1-dark.png'
import type { BoTheme } from './boTheme'

/** Light theme uses the light mark; dark, ubuntu, and elon use the dark mark. */
export function resolveBoLogoSrc(theme: BoTheme): string {
  return theme === 'light' ? logoLight : logoDark
}
