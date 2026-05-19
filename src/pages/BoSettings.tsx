import { ScanPairingPanel } from '../components/ScanPairingPanel'
import { BoShell } from '../layouts/BoShell'
import { useBoTheme } from '../theme/BoThemeContext'
import type { BoTheme } from '../theme/boTheme'

const THEMES: { id: BoTheme; label: string; hint: string }[] = [
  { id: 'dark', label: 'Dark', hint: 'Default back office look' },
  { id: 'light', label: 'Light', hint: 'Softer, brighter colours' },
  { id: 'ubuntu', label: 'Ubuntu', hint: 'Violet, teal, and coral accents' },
  { id: 'elon', label: 'Elon', hint: 'Old Glory blue & red — bold, minimal white' },
  { id: 'lego', label: 'Bricks', hint: 'Classic toy-brick reds, yellows & blues on a deep base' },
  { id: 'jacobs', label: 'Jacobs', hint: 'Bold yellow, blue & red on black and white' },
]

export function BoSettingsPage() {
  const { theme, setTheme } = useBoTheme()

  return (
    <BoShell>
      <h1 className="bo-settings-title">Settings</h1>
      <div className="bo-settings-page">
        <p className="muted">Personal options for this device. Store-wide configuration stays under Store settings.</p>

        <ScanPairingPanel />

        <section className="bo-settings-section" aria-labelledby="bo-appearance-heading">
          <h2 id="bo-appearance-heading" className="bo-settings-section-title">
            Appearance
          </h2>
          <p className="muted bo-settings-section-lead">Theme applies to this device only — same choices as the POS register.</p>
          <div className="bo-theme-selector" role="radiogroup" aria-label="Back office theme">
            {THEMES.map((t) => {
              const selected = theme === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`bo-theme-option${selected ? ' bo-theme-option--selected' : ''}`}
                  onClick={() => setTheme(t.id)}
                >
                  <span className="bo-theme-option-label">{t.label}</span>
                  <span className="bo-theme-option-hint muted">{t.hint}</span>
                </button>
              )
            })}
          </div>
        </section>
      </div>
    </BoShell>
  )
}
