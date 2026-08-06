import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { auditLeadMagnetContent } from '../src/leadGen/leadMagnetContentAudit';

const result = auditLeadMagnetContent();
const docPath = resolve(process.cwd(), 'docs/LEAD-MAGNET-CONTENT-AUDIT.md');

const lines = [
  '# Lead Magnet Content Audit',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
  '## Validation rules',
  '',
  `1. Pairwise Jaccard similarity between text blocks must be **≤ ${Math.round(result.threshold * 100)}%**.`,
  '2. Commercial balance: **FPT mentions ≤ Sun Group + Mai Đăng Chơn**; Sun/Mai/Nam appear before FPT in corpus.',
  '',
  '## Result',
  '',
  result.passed ? '**PASS** — similarity and commercial balance OK.' : '**FAIL** — see details below.',
  '',
  `- Text blocks scanned: **${result.blockCount}**`,
  `- Similarity failures: **${result.failures.length}**`,
  `- Commercial balance: **${result.commercial.passed ? 'PASS' : 'FAIL'}** — ${result.commercial.message}`,
  `- Mentions — Sun: **${result.commercial.counts.sunGroup}**, Mai Đăng Chơn: **${result.commercial.counts.maiDangChon}**, FPT: **${result.commercial.counts.fpt}**, Nam Đà Nẵng: **${result.commercial.counts.namDaNang}**`,
  '',
];

if (result.failures.length > 0) {
  lines.push('## Failures', '');
  lines.push('| Block A | Block B | Similarity |');
  lines.push('|---------|---------|------------|');
  result.failures.forEach(pair => {
    lines.push(`| \`${pair.a}\` | \`${pair.b}\` | ${(pair.similarity * 100).toFixed(1)}% |`);
  });
  lines.push('');
}

lines.push('## Magnets covered', '');
lines.push('- `bao-cao-nam-da-nang-2026` — budget framework, remote ops risks, 90-day checklist');
lines.push('- `top-20-co-hoi-dau-tu` — investment playbook (4 chapters, subsections + tables)');
lines.push('');

writeFileSync(docPath, `${lines.join('\n')}\n`, 'utf8');

console.log(result.passed ? 'PASS' : 'FAIL');
console.log(`Blocks: ${result.blockCount}, similarity failures: ${result.failures.length}`);
console.log(`Commercial: ${result.commercial.message}`);
if (!result.passed) {
  result.failures.slice(0, 10).forEach(pair => {
    console.log(`  ${pair.a} <> ${pair.b}: ${(pair.similarity * 100).toFixed(1)}%`);
  });
  process.exit(1);
}
