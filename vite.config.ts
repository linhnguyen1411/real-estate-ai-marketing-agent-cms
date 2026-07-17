import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  const analyze = process.env.ANALYZE === 'true';

  return {
    plugins: [
      react(),
      tailwindcss(),
      analyze &&
        visualizer({
          open: false,
          filename: 'dist/stats.html',
          gzipSize: true,
          brotliSize: true,
        }),
    ].filter(Boolean),
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) {
              if (id.includes('/src/App.tsx')) return 'admin-app';
              return undefined;
            }
            if (id.includes('lucide-react')) return 'vendor-icons';
            if (id.includes('react-dom') || id.includes('react-router')) return 'vendor-react';
            if (id.includes('react-markdown') || id.includes('remark-') || id.includes('/marked')) {
              return 'vendor-markdown';
            }
            if (id.includes('/motion')) return 'vendor-motion';
            if (id.includes('@google/genai')) return 'vendor-ai';
            return 'vendor';
          },
        },
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {
        // Chrome CDP / browser profiles write constantly — must not trigger Vite reloads
        ignored: [
          '**/db.json',
          '**/db.json.*.bak',
          '**/dev-server*.log',
          '**/prod-server*.log',
          '**/runtime/**',
          '**/node_modules/**',
        ],
      },
    },
  };
});
