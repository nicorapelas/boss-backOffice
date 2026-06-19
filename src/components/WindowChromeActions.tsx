import { useEffect, useState } from 'react'
import { IconCloseWindow, IconMaximize, IconMinimize, IconRestore } from '../icons/windowChrome'

type WindowChromeActionsProps = {
  className: string
}

export function WindowChromeActions({ className }: WindowChromeActionsProps) {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    if (!window.electronApp) return

    void window.electronApp.isMaximized().then(setMaximized)

    const ipc = window.ipcRenderer
    if (!ipc) return

    const onMaximizedChanged = (_event: unknown, value: boolean) => {
      setMaximized(value)
    }
    ipc.on('app:maximized-changed', onMaximizedChanged)
    return () => {
      ipc.off('app:maximized-changed', onMaximizedChanged)
    }
  }, [])

  if (!window.electronApp) return null

  return (
    <div className={className} role="toolbar" aria-label="Window">
      <button
        type="button"
        className="btn ghost window-chrome-action"
        aria-label="Minimize window"
        title="Minimize"
        onClick={() => void window.electronApp?.minimize()}
      >
        <IconMinimize className="window-chrome-action-icon" />
      </button>
      <button
        type="button"
        className="btn ghost window-chrome-action"
        aria-label={maximized ? 'Restore window' : 'Maximize window'}
        title={maximized ? 'Restore' : 'Expand'}
        onClick={() => void window.electronApp?.toggleMaximize().then(setMaximized)}
      >
        {maximized ? (
          <IconRestore className="window-chrome-action-icon" />
        ) : (
          <IconMaximize className="window-chrome-action-icon" />
        )}
      </button>
      <button
        type="button"
        className="btn ghost window-chrome-action"
        aria-label="Exit application"
        title="Exit app"
        onClick={() => void window.electronApp?.quit()}
      >
        <IconCloseWindow className="window-chrome-action-icon" />
      </button>
    </div>
  )
}
