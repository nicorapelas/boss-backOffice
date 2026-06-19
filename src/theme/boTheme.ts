export type BoTheme = 'dark' | 'light' | 'ubuntu' | 'elon' | 'lego' | 'jacobs' | 'cosmic'

const STORAGE_KEY = 'electropos-backoffice-theme'

function migrateStoredTheme(v: string | null): BoTheme | null {
  if (v === 'usa' || v === 'trump') {
    try {
      localStorage.setItem(STORAGE_KEY, 'elon')
    } catch {
      /* ignore */
    }
    return 'elon'
  }
  if (v === 'colorful') {
    try {
      localStorage.setItem(STORAGE_KEY, 'ubuntu')
    } catch {
      /* ignore */
    }
    return 'ubuntu'
  }
  return null
}

export function readStoredBoTheme(): BoTheme {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    const migrated = migrateStoredTheme(v)
    if (migrated) return migrated
    if (
      v === 'light' ||
      v === 'dark' ||
      v === 'ubuntu' ||
      v === 'elon' ||
      v === 'lego' ||
      v === 'jacobs' ||
      v === 'cosmic'
    )
      return v
  } catch {
    /* ignore */
  }
  return 'dark'
}

export function writeStoredBoTheme(theme: BoTheme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    /* ignore */
  }
}

/** Sets `data-bo-theme` on `<html>` and `color-scheme` for controls / scrollbars. */
export function applyBoThemeToDocument(theme: BoTheme): void {
  document.documentElement.setAttribute('data-bo-theme', theme)
  if (theme === 'light') {
    document.documentElement.style.colorScheme = 'light'
  } else {
    document.documentElement.style.colorScheme = 'dark'
  }
}
