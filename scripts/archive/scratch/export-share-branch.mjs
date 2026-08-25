import { execSync } from 'child_process';

const repo = process.cwd();
const ref = 'origin/add_share_button';
const files = [
  'src/components/PropertyShareActions.tsx',
  'src/utils/propertyShare.ts',
  'src/ListingsPage.tsx'
];

for (const file of files) {
  try {
    const content = execSync(`git -C "${repo}" show ${ref}:${file}`, { encoding: 'utf8' });
    console.log('===', file, content.split('\n').length, 'lines ===');
    if (file.includes('PropertyShareActions') || file.includes('propertyShare')) {
      console.log(content);
    } else {
      const idx = content.indexOf('hasGoogleMap');
      console.log('hasGoogleMap at', idx);
      if (idx >= 0) console.log(content.slice(idx - 50, idx + 600));
    }
  } catch (e) {
    console.log(file, 'missing');
  }
}
