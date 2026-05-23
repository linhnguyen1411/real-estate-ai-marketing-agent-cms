import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

if (process.platform === 'linux') {
  try {
    await import('@tailwindcss/oxide-linux-x64-gnu');
  } catch {
    console.log('[postinstall] Adding Tailwind Linux native module...');
    execSync('npm install @tailwindcss/oxide-linux-x64-gnu --no-save', {
      cwd: root,
      stdio: 'inherit',
    });
  }
}
