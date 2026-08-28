/**
 * Facebook permalink + stable dedupe identity tests.
 * Run: npx tsx scripts/archive/tests/test-facebook-permalink-resolver.ts
 */
import assert from 'node:assert/strict';
import { resolveFacebookScannedPostIdentity } from '../../../server/agent-worker/facebook/facebookPermalinkResolver';
import { normalizeLeadContent } from '../../../server/agent/dedup/contentNormalizer';

function ok(name: string) {
  console.log(`✓ ${name}`);
}

{
  const body =
    'Cho thuê căn hộ 2PN view biển Mỹ Khê, giá 12 triệu/tháng, liên hệ 0905123456';
  const a = resolveFacebookScannedPostIdentity({
    permalink: 'https://www.facebook.com/groups/2257615805/posts/10162759713665806',
    externalId: '10162759713665806',
    contentText: body,
    groupUrl: 'https://www.facebook.com/groups/2257615805',
  });
  const b = resolveFacebookScannedPostIdentity({
    permalink: 'https://www.facebook.com/groups/2257615805/posts/99999999999999999',
    externalId: '99999999999999999',
    contentText: body,
    groupUrl: 'https://www.facebook.com/groups/2257615805',
  });
  assert.equal(a.stableContentHash, b.stableContentHash, 'same body → same stable hash');
  ok('wrong photo id does not change stable content hash');
}

{
  const norm = normalizeLeadContent('Bán nhà 19h 5 lượt thích 2 bình luận tại Sơn Trà');
  assert.ok(!/\b19h\b/.test(norm), 'strips relative time');
  assert.ok(!/lượt thích/.test(norm), 'strips reaction counts');
  ok('normalizeLeadContent strips volatile facebook chrome');
}

console.log('\nFacebook permalink resolver: ALL PASS');
