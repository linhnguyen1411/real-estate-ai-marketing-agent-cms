import fs from 'fs';
import path from 'path';

// Quick sanity check for SSR meta injection output
const indexHtml = fs.readFileSync(path.resolve('dist/index.html'), 'utf8');
const meta = {
  title: 'BĐS Sun Group Đà Nẵng | Căn Đẹp Giá Gốc 2026',
  description: 'Test description',
  image: 'https://example.com/image.jpg',
  url: 'https://bdsdanang.site/',
  keywords: 'bất động sản đà nẵng'
};

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeHtml(value) {
  return escapeXml(value);
}

function renderIndexWithMeta(html, meta) {
  const tags = [
    `<title>${escapeHtml(meta.title)}</title>`,
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    `<meta name="keywords" content="${escapeHtml(meta.keywords)}" />`,
    `<link rel="canonical" href="${escapeHtml(meta.url)}" />`
  ].join('\n');
  return html.replace('</head>', `    ${tags}\n  </head>`);
}

const rendered = renderIndexWithMeta(indexHtml, meta);
console.log('has title', rendered.includes('<title>BĐS Sun Group'));
console.log('has canonical', rendered.includes('rel="canonical"'));
console.log('utf8 ok', rendered.includes('Đà Nẵng'));
