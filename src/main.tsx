import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { applyBoThemeToDocument, readStoredBoTheme } from './theme/boTheme'
import './theme/bo-theme-ubuntu.css'
import './theme/bo-theme-elon.css'
import './theme/bo-theme-lego.css'
import './theme/bo-theme-jacobs.css'

applyBoThemeToDocument(readStoredBoTheme())

if (window.ipcRenderer) {
  document.documentElement.classList.add('electron-shell')
  if (window.electronPlatform === 'darwin') {
    document.documentElement.classList.add('electron-shell-mac')
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

window.ipcRenderer?.on('main-process-message', (_event, message) => {
  console.log(message)
})
