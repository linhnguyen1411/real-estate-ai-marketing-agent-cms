import { execSync } from 'child_process';
import fs from 'fs';

const repo = process.cwd();
const master = execSync(`git -C "${repo}" show origin/master:src/ListingsPage.tsx`, { encoding: 'utf8' });
fs.writeFileSync(`${repo}/src/ListingsPage.master.tsx`, master, 'utf8');
console.log('written master copy', master.split('\n').length, 'lines');
