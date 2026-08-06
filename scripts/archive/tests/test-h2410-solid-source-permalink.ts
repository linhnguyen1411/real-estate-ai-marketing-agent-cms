/**
 * H2.4.10 — Source button must keep solid Facebook permalinks (ignore login-wall redirects).
 * Run: npx tsx scripts/test-h2410-solid-source-permalink.ts
 */
import assert from 'node:assert/strict';
import {
  isDegradedFacebookUrl,
  isSolidFacebookPermalink,
  normalizeSocialLinks,
  verifySocialLinks,
} from '../server/modules/link-normalization';
import { isTrustedContentUrl } from '../server/modules/sales-layer/salesActionCardViewModel';

const POST =
  'https://www.facebook.com/groups/190227648142747/posts/2885033908662094/';
const LOGIN =
  'https://www.facebook.com/login/?next=https%3A%2F%2Fwww.facebook.com%2Fgroups%2F190227648142747%2Fposts%2F2885033908662094%2F';
const GROUP = 'https://www.facebook.com/groups/190227648142747';

async function main() {
  assert.equal(isSolidFacebookPermalink(POST), true);
  assert.equal(isSolidFacebookPermalink(LOGIN), false);
  assert.equal(isSolidFacebookPermalink(GROUP), false);
  assert.equal(isDegradedFacebookUrl(LOGIN), true);
  assert.equal(isDegradedFacebookUrl(POST), false);

  assert.equal(
    isTrustedContentUrl(POST, {
      agentSourceName: 'fb-nhs-scan',
      platform: 'Facebook',
    }),
    true,
    'solid post must stay trusted even if agent slug is config-like',
  );

  const links = normalizeSocialLinks({ postUrl: POST, groupUrl: GROUP });
  assert.ok(links.postUrl && isSolidFacebookPermalink(links.postUrl));

  const verified = await verifySocialLinks(links, {
    skipVerify: false,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      url: LOGIN, // HTTP follow lands on login wall
    }),
  });

  assert.equal(verified.verified, true);
  assert.ok(verified.openUrl);
  assert.equal(isSolidFacebookPermalink(verified.openUrl), true);
  assert.equal(isDegradedFacebookUrl(verified.openUrl), false);
  assert.ok(
    !/login|checkpoint/i.test(verified.openUrl!),
    'openUrl must not be login wall',
  );

  console.log('PASS h2410 solid source permalink');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
