import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const useMock = process.env.VITE_USE_MOCK !== 'false';

export default defineConfig({
  plugins: [react()],
  envPrefix: ['VITE_', 'SUPABASE_'],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      ...(useMock ? { 'socket.io-client': path.resolve(__dirname, './src/mock-socket.js') } : {}),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/download': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
      },
    },
  },
})
