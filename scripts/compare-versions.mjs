import { execSync } from 'child_process';
import fs from 'fs';

const repo = 'c:/Users/linhn/workspace/real-estate-ai-marketing-agent-cms';
const master = execSync(`git -C "${repo}" show origin/master:src/ListingsPage.tsx`, { encoding: 'utf8' });
const seo = execSync(`git -C "${repo}" show origin/update_seo:src/ListingsPage.tsx`, { encoding: 'utf8' });

const masterLines = new Set(master.split('\n').map(l => l.trim()).filter(Boolean));
const seoOnly = seo.split('\n').filter(l => {
  const t = l.trim();
  if (!t) return false;
  if (masterLines.has(t)) return false;
  return true;
});

console.log('master lines', master.split('\n').length);
console.log('seo lines', seo.split('\n').length);
console.log('seo-only sample (first 40):');
console.log(seoOnly.slice(0, 40).join('\n'));

const seoFeatures = ['Helmet', 'structuredData', 'DEFAULT_SEO', 'FAQPage', 'PropertyShareActions', 'hasGoogleMap', 'getPropertySeoTitle', 'limitSeoTitle'];
for (const f of seoFeatures) {
  console.log(f, 'master:', master.includes(f), 'seo:', seo.includes(f));
}
