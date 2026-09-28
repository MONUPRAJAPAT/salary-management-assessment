import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The API is same-origin in production (the server serves this bundle),
    // so the dev proxy keeps the client code free of environment branching.
    proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: true } },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        /**
         * Three vendor chunks rather than one. The charting library is the single
         * largest dependency and changes on its own schedule; splitting it means an
         * application deploy does not invalidate it in everyone's browser cache.
         */
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts', '@mantine/charts'],
          mantine: ['@mantine/core', '@mantine/hooks', '@mantine/dates', '@mantine/notifications'],
        },
      },
    },
  },
});
