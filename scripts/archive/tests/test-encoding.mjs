import fs from 'fs';

const line = fs.readFileSync('src/ListingsPage.tsx', 'utf8').split('\n')[59];
const match = line.match(/label: '([^']+)'/);
const s = match?.[1] || '';

function fixLatin1(value) {
  return Buffer.from(value, 'latin1').toString('utf8');
}

function fixEscape(value) {
  try {
    return decodeURIComponent(escape(value));
  } catch {
    return value;
  }
}

function fixBytes(value) {
  const bytes = [...value].map(ch => {
    const cp = ch.charCodeAt(0);
    return cp <= 255 ? cp : 0x3f;
  });
  return Buffer.from(bytes).toString('utf8');
}

console.log('original:', s);
console.log('latin1:', fixLatin1(s));
console.log('escape:', fixEscape(s));
console.log('bytes:', fixBytes(s));

for (const ch of s) {
  console.log(JSON.stringify(ch), ch.charCodeAt(0).toString(16));
}
