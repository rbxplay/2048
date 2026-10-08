import { defineConfig } from 'vitest/config'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  // A2 #9: bundle chỉ dùng đường dẫn tương đối.
  base: './',
  // Cổng 8080 khớp sample chính thức của Google, để SDK Test Suite trỏ vào được.
  server: { port: 8080, strictPort: true },
  build: {
    target: 'es2022',
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    reportCompressedSize: true,
  },
  plugins: [viteSingleFile()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
})
