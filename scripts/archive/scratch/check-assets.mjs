import fs from 'node:fs';
import path from 'node:path';

const distAssets = path.join(process.cwd(), 'dist', 'assets');
const publicDir = path.join(process.cwd(), 'public');
const warnings = [];
const errors = [];

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

if (!fs.existsSync(distAssets)) {
  console.error('check:assets — dist/assets missing. Run npm run build first.');
  process.exit(1);
}

const jsFiles = fs.readdirSync(distAssets).filter(name => name.endsWith('.js'));
const cssFiles = fs.readdirSync(distAssets).filter(name => name.endsWith('.css'));

let indexBundle = null;
let adminBundle = null;

for (const file of jsFiles) {
  const size = fs.statSync(path.join(distAssets, file)).size;
  if (file.startsWith('index-')) indexBundle = { file, size };
  if (file.startsWith('admin-app-')) adminBundle = { file, size };
  if (size > 500 * 1024) {
    warnings.push(`Large chunk: ${file} (${formatKb(size)})`);
  }
}

if (!indexBundle) {
  errors.push('Main index JS bundle not found in dist/assets');
} else if (indexBundle.size > 450 * 1024) {
  warnings.push(`Homepage bundle still heavy: ${indexBundle.file} (${formatKb(indexBundle.size)})`);
}

if (!adminBundle) {
  warnings.push('admin-app chunk not found — admin may still be in homepage bundle');
}

const heroPath = path.join(publicDir, 'hero-da-nang.jpg');
if (!fs.existsSync(heroPath)) {
  errors.push('Missing public/hero-da-nang.jpg');
} else {
  const heroSize = fs.statSync(heroPath).size;
  if (heroSize > 400 * 1024) {
    warnings.push(`Hero image large: ${formatKb(heroSize)} (target < 400 KB)`);
  }
}

console.log('Asset check summary');
console.log('-------------------');
console.log(`JS chunks: ${jsFiles.length}`);
console.log(`CSS files: ${cssFiles.length}`);
if (indexBundle) console.log(`Homepage bundle: ${indexBundle.file} — ${formatKb(indexBundle.size)}`);
if (adminBundle) console.log(`Admin bundle: ${adminBundle.file} — ${formatKb(adminBundle.size)}`);

if (warnings.length) {
  console.log('\nWarnings:');
  warnings.forEach(item => console.log(`- ${item}`));
}

if (errors.length) {
  console.log('\nErrors:');
  errors.forEach(item => console.log(`- ${item}`));
  process.exit(1);
}

console.log('\ncheck:assets passed');
