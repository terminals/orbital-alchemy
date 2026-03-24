import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const serverPort = process.env.ORBITAL_SERVER_PORT || '4444';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    include: [
      'debug',
      'style-to-js',
      'loose-envify',
      'scheduler',
      'prop-types',
      'react-is',
      'ms',
    ],
  },
  server: {
    port: 4445,
    proxy: {
      '/api/orbital': {
        target: `http://localhost:${serverPort}`,
        changeOrigin: true,
      },
      '/socket.io': {
        target: `http://localhost:${serverPort}`,
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
