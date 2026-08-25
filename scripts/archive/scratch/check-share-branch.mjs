import { execSync } from 'child_process';

const repo = process.cwd();
const content = execSync(`git -C "${repo}" show origin/add_share_button:src/ListingsPage.tsx`, { encoding: 'utf8' });
const mojibake = (content.match(/Ã|Æ°|BÄ|CÄ/g) || []).length;
console.log('lines', content.split('\n').length, 'mojibake', mojibake);
console.log('DEFAULT_SEO', content.includes('DEFAULT_SEO'));
console.log('getPropertySeoTitle', content.includes('getPropertySeoTitle'));
console.log('track-view', content.includes('track-view'));
