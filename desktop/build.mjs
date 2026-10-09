import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function build() {
  console.log('[Build-Desktop] Starting esbuild bundling...');
  const distDir = path.join(__dirname, 'dist');

  // Ensure output directories exist
  fs.mkdirSync(path.join(distDir, 'main'), { recursive: true });
  fs.mkdirSync(path.join(distDir, 'preload'), { recursive: true });
  fs.mkdirSync(path.join(distDir, 'renderer'), { recursive: true });

  // 1. Bundle Main Process
  await esbuild.build({
    entryPoints: [path.join(__dirname, 'src/main/index.ts')],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    outfile: path.join(distDir, 'main/index.cjs'),
    external: ['electron'],
    sourcemap: true,
  });
  console.log('[Build-Desktop] Main process built -> desktop/dist/main/index.cjs');

  // 2. Bundle Preload Scripts
  const preloads = ['appPreload', 'facebookPreload', 'zaloPreload'];
  for (const name of preloads) {
    await esbuild.build({
      entryPoints: [path.join(__dirname, `src/preload/${name}.ts`)],
      bundle: true,
      platform: 'node',
      target: 'node20',
      format: 'cjs',
      outfile: path.join(distDir, `preload/${name}.cjs`),
      external: ['electron'],
      sourcemap: true,
    });
    console.log(`[Build-Desktop] Preload ${name} built -> desktop/dist/preload/${name}.cjs`);
  }

  // 3. Bundle Renderer Script
  await esbuild.build({
    entryPoints: [path.join(__dirname, 'src/renderer/renderer.ts')],
    bundle: true,
    platform: 'browser',
    target: 'chrome120',
    format: 'iife',
    outfile: path.join(distDir, 'renderer/renderer.js'),
    sourcemap: true,
  });
  console.log('[Build-Desktop] Renderer script built -> desktop/dist/renderer/renderer.js');

  // 4. Copy HTML file
  fs.copyFileSync(
    path.join(__dirname, 'src/renderer/index.html'),
    path.join(distDir, 'renderer/index.html')
  );
  console.log('[Build-Desktop] Copied index.html -> desktop/dist/renderer/index.html');

  console.log('[Build-Desktop] Build completed successfully.');
}

build().catch((err) => {
  console.error('[Build-Desktop] Build failed:', err);
  process.exit(1);
});
