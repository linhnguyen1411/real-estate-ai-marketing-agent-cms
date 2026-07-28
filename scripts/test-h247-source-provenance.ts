/**
 * H2.4.7 — Source provenance: content provenance ≠ AgentSource/campaign config.
 * Run: npx tsx scripts/test-h247-source-provenance.ts
 */
import assert from 'node:assert/strict';
import {
  formatSalesActionCard,
  resolveSourceProvenance,
  resolveLeadSource,
  validateSourceProvenance,
  isTrustedContentUrl,
  looksLikeConfigSourceName,
  salesActionCardKeyboard,
} from '../server/modules/sales-layer';

const REAL_GROUP = 'HỘI MUA BÁN NHÀ VÀ ĐẤT ĐÀ NẴNG';
const REAL_PERMALINK =
  'https://www.facebook.com/groups/987654321098765/posts/1785209976043';
const BAD_URL = 'https://www.facebook.com/groups/prodv100/posts/1785209976043';

let n = 0;
function ok(name: string, cond: boolean) {
  assert.ok(cond, name);
  n += 1;
  console.log(`✓ ${name}`);
}

ok('alias same', resolveLeadSource === resolveSourceProvenance);

ok('config slug prodv100', looksLikeConfigSourceName('prodv100'));
ok('config product-v100', looksLikeConfigSourceName('product-v100-deploy'));
ok('config campaign', looksLikeConfigSourceName('h2.4.4-unify-lead-alert buyer'));
ok('real group not config', !looksLikeConfigSourceName(REAL_GROUP));

ok('reject prodv100 url', !isTrustedContentUrl(BAD_URL, { agentSourceName: 'prodv100' }));
ok('accept real permalink', isTrustedContentUrl(REAL_PERMALINK));

// Exact failure regression
{
  const src = resolveSourceProvenance({
    extractedData: {
      source: {
        groupName: REAL_GROUP,
        platform: 'facebook',
        permalink: REAL_PERMALINK,
        sourceName: 'prodv100', // AgentSource echo — must not win
      },
    },
    agentSourceName: 'prodv100',
    agentSourceType: 'facebook_group',
    canonicalUrl: BAD_URL, // fabricated from config — must reject
  });
  ok('label real group', src.label === `Facebook · ${REAL_GROUP}`);
  ok('url real permalink', src.url === REAL_PERMALINK);
  ok('no prodv100 in label', !/prodv100/i.test(src.label || ''));
  ok('no prodv100 in url', !/prodv100/i.test(src.url || ''));
  ok('valid', src.valid === true);
}

// Prefer permalink over bad canonical
{
  const src = resolveSourceProvenance({
    extractedData: {
      source: {
        groupName: REAL_GROUP,
        platform: 'facebook',
        postUrl: REAL_PERMALINK,
      },
    },
    agentSourceName: 'prodv100',
    agentSourceType: 'facebook_group',
    canonicalUrl: BAD_URL,
  });
  ok('postUrl wins over bad canonical', src.url === REAL_PERMALINK);
}

// Fail closed URL — keep platform label
{
  const src = resolveSourceProvenance({
    extractedData: {
      source: { platform: 'facebook', groupName: REAL_GROUP },
    },
    agentSourceName: 'prodv100',
    agentSourceType: 'facebook_group',
    canonicalUrl: BAD_URL,
  });
  ok('fail closed url null', src.url === null);
  ok('label still real group', src.label === `Facebook · ${REAL_GROUP}`);
}

// No group name + config AgentSource → platform only
{
  const src = resolveSourceProvenance({
    extractedData: { source: { platform: 'facebook', sourceName: 'prodv100' } },
    agentSourceName: 'prodv100',
    agentSourceType: 'facebook_group',
    canonicalUrl: REAL_PERMALINK,
  });
  ok('platform only label', src.label === 'Facebook');
  ok('url ok when trusted', src.url === REAL_PERMALINK);
  ok('name null', src.name == null);
}

// validateSourceProvenance strips bad
{
  const v = validateSourceProvenance(
    {
      platform: 'Facebook',
      type: 'group_post',
      name: 'prodv100',
      url: BAD_URL,
    },
    { agentSourceName: 'prodv100' },
  );
  ok('validate drops name', v.name == null);
  ok('validate drops url', v.url == null);
  ok('validate label Facebook', v.label === 'Facebook');
}

// Card + keyboard — all personas
for (const role of ['buyer', 'tenant', 'investor'] as const) {
  const card = formatSalesActionCard({
    findingId: `f-h247-${role}`,
    role,
    confidencePct: 65,
    propertyType: role === 'tenant' ? 'nhà' : 'đất nền',
    location: 'Ngũ Hành Sơn',
    phone: '0905111001',
    agentSourceName: 'prodv100',
    agentSourceType: 'facebook_group',
    extractedData: {
      source: {
        groupName: REAL_GROUP,
        platform: 'facebook',
        permalink: REAL_PERMALINK,
      },
    },
    sourceUrl: BAD_URL, // must not leak via input.sourceUrl into label; VM resolves from extracted
  });
  ok(`${role} source label`, card.includes(`Facebook · ${REAL_GROUP}`));
  ok(`${role} no prodv100`, !/prodv100/i.test(card));

  // Keyboard uses only trusted URL passed by caller — simulate producer
  const prov = resolveSourceProvenance({
    extractedData: {
      source: { groupName: REAL_GROUP, platform: 'facebook', permalink: REAL_PERMALINK },
    },
    agentSourceName: 'prodv100',
    agentSourceType: 'facebook_group',
    canonicalUrl: BAD_URL,
  });
  const kb = salesActionCardKeyboard({
    findingId: `f-h247-${role}`,
    sourceUrl: prov.url,
    leadCenterUrl: 'https://bdsdanang.site/admin/agents/lead-center?findingId=x',
    hasPhone: true,
    phone: '0905111001',
  });
  const srcBtn = kb.inline_keyboard.flat().find(b => b.text.includes('Source'));
  ok(
    `${role} source btn`,
    Boolean(srcBtn && 'url' in srcBtn && srcBtn.url === REAL_PERMALINK),
  );
}

// Bad URL only → no Source button
{
  const kb = salesActionCardKeyboard({
    findingId: 'f-bad',
    sourceUrl: null,
    hasPhone: false,
  });
  ok(
    'no source btn when null',
    !kb.inline_keyboard.flat().some(b => b.text.includes('Source')),
  );
}

console.log(`\nPASS H2.4.7 source provenance (${n} checks)`);
