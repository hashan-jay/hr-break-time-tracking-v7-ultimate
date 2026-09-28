import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const frontendRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      recharts: path.resolve(frontendRoot, 'node_modules/recharts/es6/index.js'),
    },
  },
  optimizeDeps: {
    include: ['recharts', '@microsoft/signalr'],
  },
  server: {
    port: 5180,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5086',
        changeOrigin: true,
      },
      '/hubs': {
        target: 'http://localhost:5086',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
