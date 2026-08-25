import { execSync } from 'child_process';
import fs from 'fs';

const repo = process.cwd();
for (const ref of ['HEAD', 'origin/master', 'origin/update_seo']) {
  try {
    const content = execSync(`git -C "${repo}" show ${ref}:src/ListingsPage.tsx`, { encoding: 'utf8' });
    const mojibake = (content.match(/Ã|Æ°|á»›|BÄ|CÄ/g) || []).length;
    console.log(ref, 'lines', content.split('\n').length, 'mojibake', mojibake);
    console.log(content.split('\n').slice(47, 65).join('\n'));
    console.log('---');
  } catch (error) {
    console.log(ref, 'error', error.message.split('\n')[0]);
  }
}
