import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: './',
  build: {
    outDir: 'docs',
  },
  server: {
    proxy: {
      '/uploads': {
        target: 'http://172.16.224.21:3003',
        changeOrigin: true,
      },
    },
  },
})