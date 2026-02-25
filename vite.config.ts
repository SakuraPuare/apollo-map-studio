import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import accessGuard from 'access-guard/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    accessGuard({
      blocklist: [],
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    include: ['protobufjs'],
  },
})
