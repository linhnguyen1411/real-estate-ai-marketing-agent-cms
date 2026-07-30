/**
 * HOTFIX — Canonical Facebook post URL SSOT.
 * Run: npx tsx scripts/test-facebook-canonical-url.ts
 */
import assert from 'node:assert/strict';
import {
  canonicalizeFacebookPostUrl,
  isSolidFacebookPostUrl,
  parseFacebookContentUrl,
  resolveOpenableFacebookPostUrl,
  asFacebookId,
} from '../shared/facebook-url';
import {
  isSolidFacebookPermalink,
  normalizeSocialLinks,
  toMobileFriendlyFacebookUrl,
} from '../server/modules/link-normalization';
import { resolveSourceProvenance, isTrustedContentUrl } from '../server/modules/sales-layer/salesActionCardViewModel';

function ok(name: string, cond: unknown) {
  assert.ok(cond, name);
  console.log(`✓ ${name}`);
}

// --- groups/posts ---
{
  const raw = 'https://www.facebook.com/groups/1128415051840917/posts/1756219772393772/';
  const out = canonicalizeFacebookPostUrl(raw);
  ok('groups/posts strips trailing slash', out === 'https://www.facebook.com/groups/1128415051840917/posts/1756219772393772');
  ok('groups/posts is solid', isSolidFacebookPostUrl(out));
}

// --- permalink path → posts form ---
{
  const raw = 'https://www.facebook.com/groups/2257615805/permalink/10162638072150806/';
  const out = canonicalizeFacebookPostUrl(raw);
  ok(
    'permalink path rebuilds to posts',
    out === 'https://www.facebook.com/groups/2257615805/posts/10162638072150806',
  );
}

// --- story_fbid ---
{
  const raw =
    'https://www.facebook.com/permalink.php?story_fbid=1756219772393772&id=1128415051840917&fbclid=abc';
  const out = canonicalizeFacebookPostUrl(raw);
  ok(
    'story_fbid rebuilds with group',
    out === 'https://www.facebook.com/groups/1128415051840917/posts/1756219772393772',
  );
}

// --- mobile + utm ---
{
  const raw =
    'https://m.facebook.com/groups/1128415051840917/posts/1756219772393772/?fbclid=xyz&utm_source=tg';
  const out = canonicalizeFacebookPostUrl(raw);
  ok('mobile+utm → www canonical', out === 'https://www.facebook.com/groups/1128415051840917/posts/1756219772393772');
}

// --- pfbid ---
{
  const raw = 'https://www.facebook.com/groups/abc/posts/pfbid02ExampleToken123/';
  const out = canonicalizeFacebookPostUrl(raw);
  ok('pfbid preserved', out?.includes('/posts/pfbid02ExampleToken123'));
  ok('pfbid solid', isSolidFacebookPostUrl(out));
}

// --- video / photo ---
{
  ok(
    'video watch',
    canonicalizeFacebookPostUrl('https://www.facebook.com/watch/?v=123456789012345&fbclid=x') ===
      'https://www.facebook.com/watch/?v=123456789012345',
  );
  ok(
    'photo.php',
    canonicalizeFacebookPostUrl('https://www.facebook.com/photo.php?fbid=123456789012345&set=gm.1') ===
      'https://www.facebook.com/photo.php?fbid=123456789012345',
  );
}

// --- group home rejected as post ---
{
  ok('group home not solid', !isSolidFacebookPostUrl('https://www.facebook.com/groups/2257615805/'));
  ok('group home canonicalize null', canonicalizeFacebookPostUrl('https://www.facebook.com/groups/2257615805/') === null);
}

// --- login rejected ---
{
  ok(
    'login degraded',
    !isSolidFacebookPermalink(
      'https://www.facebook.com/login/?next=https%3A%2F%2Fwww.facebook.com%2Fgroups%2F1%2Fposts%2F2',
    ),
  );
}

// --- missing canonical → rebuild from externalId + group ---
{
  const rebuilt = resolveOpenableFacebookPostUrl({
    candidates: ['https://www.facebook.com/groups/2257615805/'],
    externalId: '10162638072150806',
    groupUrl: 'https://www.facebook.com/groups/2257615805/',
  });
  ok(
    'fallback externalId+group',
    rebuilt === 'https://www.facebook.com/groups/2257615805/posts/10162638072150806',
  );
}

// --- id precision: keep as string ---
{
  const id = '10162638090785806';
  ok('asFacebookId keeps string', asFacebookId(id) === id);
  ok('never Number-cast in parse', parseFacebookContentUrl(
    `https://www.facebook.com/groups/2257615805/posts/${id}/`,
  )?.postId === id);
}

// --- l.php unwrap ---
{
  const wrapped =
    'https://l.facebook.com/l.php?u=https%3A%2F%2Fwww.facebook.com%2Fgroups%2F1128415051840917%2Fposts%2F1756219772393772';
  ok(
    'unwrap l.php',
    canonicalizeFacebookPostUrl(wrapped) ===
      'https://www.facebook.com/groups/1128415051840917/posts/1756219772393772',
  );
}

// --- normalizeSocialLinks SSOT ---
{
  const links = normalizeSocialLinks({
    canonicalUrl: 'https://www.facebook.com/groups/2257615805/posts/10162638072150806/',
    groupUrl: 'https://www.facebook.com/groups/2257615805/',
  });
  ok('normalizeSocialLinks postUrl solid', links.postUrl && isSolidFacebookPermalink(links.postUrl));
  ok('normalizeSocialLinks no trailing slash', !links.postUrl?.endsWith('/'));
  ok(
    'normalizeSocialLinks keeps full id',
    links.postUrl === 'https://www.facebook.com/groups/2257615805/posts/10162638072150806',
  );
}

// --- legacy missing canonical + externalId ---
{
  const links = normalizeSocialLinks({
    canonicalUrl: 'https://www.facebook.com/groups/2257615805/',
    groupUrl: 'https://www.facebook.com/groups/2257615805/',
    externalId: '10162638072150806',
  });
  ok(
    'legacy group-home + externalId rebuilds post',
    links.postUrl === 'https://www.facebook.com/groups/2257615805/posts/10162638072150806',
  );
}

// --- provenance ---
{
  const src = resolveSourceProvenance({
    extractedData: {
      source: {
        groupName: 'HỘI TEST',
        platform: 'facebook',
        permalink: 'https://m.facebook.com/groups/987654321098765/posts/1785209976043/?fbclid=x',
      },
    },
    agentSourceName: 'fb-scan',
    agentSourceType: 'facebook_group',
    canonicalUrl: 'https://www.facebook.com/groups/987654321098765/',
    agentSourceUrl: 'https://www.facebook.com/groups/987654321098765/',
  });
  ok('provenance prefers solid post', src.url === 'https://www.facebook.com/groups/987654321098765/posts/1785209976043');
  ok('provenance never group-home', !/\/groups\/987654321098765$/i.test(src.url || ''));
}

{
  const src = resolveSourceProvenance({
    extractedData: { source: { groupName: 'HỘI TEST', platform: 'facebook' } },
    agentSourceName: 'fb-scan',
    agentSourceType: 'facebook_group',
    canonicalUrl: 'https://www.facebook.com/groups/987654321098765/',
    externalId: '1785209976043',
    agentSourceUrl: 'https://www.facebook.com/groups/987654321098765/',
  });
  ok(
    'provenance rebuilds from externalId',
    src.url === 'https://www.facebook.com/groups/987654321098765/posts/1785209976043',
  );
}

{
  ok(
    'trusted solid post',
    isTrustedContentUrl('https://www.facebook.com/groups/987654321098765/posts/1785209976043', {
      agentSourceName: 'fb-nhs-scan',
      platform: 'Facebook',
    }),
  );
}

{
  ok(
    'toMobileFriendly delegates SSOT',
    toMobileFriendlyFacebookUrl(
      'https://www.facebook.com/groups/1128415051840917/permalink/1756219772393772/',
    ) === 'https://www.facebook.com/groups/1128415051840917/posts/1756219772393772',
  );
}

console.log('\nCanonical Facebook Post URL: ALL PASS');
