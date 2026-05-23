import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const onWslWindowsMount = process.platform === 'linux' && projectRoot.startsWith('/mnt/');

export default defineConfig({
  root: projectRoot,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': projectRoot,
    },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  },
  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
    watch:
      process.env.DISABLE_HMR === 'true'
        ? null
        : onWslWindowsMount
          ? { usePolling: true }
          : {},
    fs: onWslWindowsMount ? { strict: false } : undefined,
  },
});
