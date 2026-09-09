import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/local-admin/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/recharts|d3-/.test(id)) return 'charts';
          if (id.includes('lucide-react')) return 'icons';
          if (/node_modules[\\/](react|react-dom)[\\/]/.test(id)) return 'react-vendor';
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5174,
    proxy: {
      '/v1': { target: 'http://127.0.0.1:8790', changeOrigin: true },
    },
  },
});
