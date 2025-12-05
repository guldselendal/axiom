import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  base: './', // Important for Electron
  server: {
    port: 5173,
    strictPort: false, // Allow fallback to next port if 5173 is busy
  },
})


