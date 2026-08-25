import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const repo = process.cwd();
const ref = 'origin/add_share_button';

const files = {
  'src/ListingsPage.tsx': `${repo}/src/ListingsPage.tsx`,
  'src/components/PropertyShareActions.tsx': `${repo}/src/components/PropertyShareActions.tsx`,
  'src/utils/propertyShare.ts': `${repo}/src/utils/propertyShare.ts`
};

for (const [gitPath, outPath] of Object.entries(files)) {
  const content = execSync(`git -C "${repo}" show ${ref}:${gitPath}`, { encoding: 'utf8' });
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, content, 'utf8');
  console.log('wrote', outPath);
}
