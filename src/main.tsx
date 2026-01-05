import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Diagnostic logging
console.log('[RENDERER] main.tsx: Script executing')
console.log('[RENDERER] main.tsx: document.readyState:', document.readyState)
console.log('[RENDERER] main.tsx: document.getElementById("root"):', document.getElementById('root'))

// Check if Electron API is available on startup
if (typeof window !== 'undefined') {
  console.log('🔵 main.tsx: Checking Electron API availability...')
  console.log('🔵 main.tsx: window.electronAPI exists:', !!window.electronAPI)
  if (window.electronAPI) {
    console.log('🔵 main.tsx: Electron API methods:', Object.keys(window.electronAPI))
  } else {
    console.error('🔴🔴🔴 main.tsx: CRITICAL - Electron API not available! Preload script may not have loaded.')
    console.error('🔴 main.tsx: This will cause file operations to fail.')
  }
}

const rootElement = document.getElementById('root')
if (!rootElement) {
  console.error('[RENDERER] ❌ CRITICAL: root element not found!')
  console.error('[RENDERER] document.body:', document.body)
  console.error('[RENDERER] document.documentElement:', document.documentElement)
} else {
  console.log('[RENDERER] ✅ Root element found, creating React root...')
  try {
    const root = ReactDOM.createRoot(rootElement)
    console.log('[RENDERER] ✅ React root created, rendering App...')
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    )
    console.log('[RENDERER] ✅ App render called')
  } catch (error) {
    console.error('[RENDERER] ❌ Error rendering app:', error)
  }
}






