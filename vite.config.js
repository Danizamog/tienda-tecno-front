import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:9000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    // Evita que Vite re-empaquete el glue WASM de MediaPipe: el
    // pre-bundling de esbuild puede dejarlo en un estado inconsistente
    // y provocar errores como "Cannot read properties of undefined
    // (reading 'A')" recién al llamar a detect().
    exclude: ['@mediapipe/tasks-vision'],
  },
})