import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
    include: ['src/**/*.test.{js,jsx}'],
    coverage: {
      // Floors set ~2-3 points below measured coverage (2026-06-12: 85.6/78.6/79.5/89.4)
      // to lock in the level without making every small change a threshold fight.
      thresholds: {
        statements: 83,
        branches: 76,
        functions: 77,
        lines: 87,
      },
    },
  },
})
