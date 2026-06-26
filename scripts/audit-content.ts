import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SEO_POSTS } from '../server/seed/allPosts';
import { auditSeoPosts, formatAuditMarkdown } from '../server/seed/contentAudit';

const result = auditSeoPosts(SEO_POSTS);
const docPath = resolve(process.cwd(), 'docs/CONTENT-DUPLICATION-AUDIT.md');

writeFileSync(docPath, formatAuditMarkdown(result), 'utf8');

console.log(result.passed ? 'PASS' : 'FAIL');
console.log(`Posts: ${result.posts.length}, failures: ${result.failures.length}`);
if (!result.passed) {
  result.failures.slice(0, 20).forEach(msg => console.log(`  - ${msg}`));
  process.exit(1);
}
