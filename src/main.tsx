import 'core-js/actual/array/at'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import 'streamdown/styles.css'
import 'katex/dist/katex.min.css'
import './index.css'
import { installMobileViewportGuards } from './lib/viewport'
import DesktopBootstrap from './components/DesktopBootstrap'
import { isDesktopRuntime } from './lib/runtime'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'

installMobileViewportGuards()

if (isDesktopRuntime) globalThis.fetch = tauriFetch as typeof globalThis.fetch

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isDesktopRuntime ? <DesktopBootstrap><App /></DesktopBootstrap> : <App />}
  </StrictMode>,
)
