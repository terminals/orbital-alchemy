import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 4445,
    proxy: {
      '/api/orbital': {
        target: 'http://localhost:4444',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:4444',
        ws: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          ui: ['@radix-ui/react-dialog', '@radix-ui/react-scroll-area', '@radix-ui/react-tabs', '@radix-ui/react-tooltip'],
        },
      },
    },
  },
});
