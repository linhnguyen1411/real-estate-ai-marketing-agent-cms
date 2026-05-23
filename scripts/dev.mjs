/**
 * Dev launcher: bundle server.ts with esbuild, run with node (no tsx).
 * Fixes WSL /mnt/c/ ERR_INVALID_URL_SCHEME from tsx path alias resolution.
 */
import * as esbuild from 'esbuild';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outfile = path.join(root, '.dev', 'server.mjs');

if (process.platform === 'linux' && root.startsWith('/mnt/')) {
  try {
    await import('@tailwindcss/oxide-linux-x64-gnu');
  } catch {
    console.log('[dev] Installing Linux Tailwind bindings...');
    const { execSync } = await import('child_process');
    execSync('npm install @tailwindcss/oxide-linux-x64-gnu --no-save', {
      cwd: root,
      stdio: 'inherit',
    });
  }
}

await esbuild.build({
  entryPoints: [path.join(root, 'server.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  outfile,
  sourcemap: true,
  logLevel: 'info',
});

console.log('[dev] Starting server (no tsx)...');

const child = spawn(process.execPath, [outfile], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code) => process.exit(code ?? 0));
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
