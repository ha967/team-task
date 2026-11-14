import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // 开发环境走代理，浏览器看到的是同源请求，不需要后端开 CORS
    proxy: {
      '/api': {
        // 需要和根目录 .env 里的 PORT 保持一致
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
