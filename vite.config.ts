/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/risolino/',
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        guide: 'guide/index.html',
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: [],
  },
})
