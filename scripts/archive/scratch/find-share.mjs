import { execSync } from 'child_process';

const repo = process.cwd();
for (const ref of ['origin/add_share_button', 'origin/update_seo']) {
  try {
    const content = execSync(`git -C "${repo}" show ${ref}:src/ListingsPage.tsx`, { encoding: 'utf8' });
    let idx = content.indexOf('function PropertyShareActions');
    if (idx === -1) {
      idx = content.indexOf('PropertyShareActions');
    }
    console.log(ref, 'PropertyShareActions at', idx);
    if (idx >= 0) console.log(content.slice(Math.max(0, idx - 100), idx + 1200));
  } catch (e) {
    console.log(ref, e.message.split('\n')[0]);
  }
}
