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
  base: './', // Important for Electron file:// protocol
  build: {
    outDir: 'dist/renderer', // Separated from Electron main process output to prevent collision
    rollupOptions: {
      output: {
        // Ensure consistent chunk naming for dynamic imports
        manualChunks: undefined,
      },
    },
    // Ensure assets are properly handled
    assetsDir: 'assets',
    // Increase chunk size warning limit since Excalidraw is large
    chunkSizeWarningLimit: 1000,
  },
  server: {
    port: 5173,
    strictPort: false, // Allow fallback to next port if 5173 is busy
  },
})


