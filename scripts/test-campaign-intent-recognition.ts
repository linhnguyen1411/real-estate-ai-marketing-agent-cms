/**
 * H2.5 HOTFIX — Campaign Intent Recognition regression.
 * Run: npx tsx scripts/test-campaign-intent-recognition.ts
 */
import assert from 'node:assert/strict';
import { classifyByRules } from '../server/modules/control-plane';
import {
  detectSalesMode,
  isCampaignPlanningUtterance,
  matchAssetIdentity,
  validateAssetIdentity,
  AssetValidationError,
} from '../server/modules/planning';

function ok(name: string, cond: unknown) {
  assert.ok(cond, name);
  console.log(`✓ ${name}`);
}

const MUST_CREATE = [
  'Tạo mission bán shophouse khối đế cho các tòa nhà sun',
  'Tạo mission bán shophouse khối đế Sun',
  'Tạo campaign bán shophouse Sun Symphony',
  'Làm chiến dịch bán Sun Cora',
  'Làm chiến dịch bán Sun Cora',
  'Marketing cho Sun Cosmo',
  'Marketing Sun Symphony',
  'Bán shophouse Sun',
  'Bán khối đế Sun Symphony',
  'Làm content cho Sun Cora',
  'Làm content Sun Cosmo',
  'Làm chiến dịch cho Sun Spana',
  'Tìm buyer cho Sun',
  'Tìm buyer Sun Spana',
  'Research Sun Symphony',
  'Hôm nay cần bán mạnh lô Mai Đăng Chơn.',
];

for (const u of MUST_CREATE) {
  ok(`intent campaign: ${u.slice(0, 48)}`, isCampaignPlanningUtterance(u));
  ok(`classify ai_sales_campaign: ${u.slice(0, 40)}`, classifyByRules(u).name === 'ai_sales_campaign');
  ok(`mode campaign_board: ${u.slice(0, 40)}`, detectSalesMode(u) === 'campaign_board');
  ok(`not unknown fallback: ${u.slice(0, 40)}`, classifyByRules(u).name !== 'unknown');
}

// Entity extraction via existing AssetMatcher
{
  const a = matchAssetIdentity({
    utterance: 'Tạo mission bán shophouse khối đế cho các tòa nhà sun',
  });
  ok('asset type shophouse', a.type === 'shophouse');
  ok('asset mentions sun', /sun/i.test(a.name) || /sun/i.test(a.developer || ''));
  ok('asset validates', validateAssetIdentity(a).name.length >= 3);
}

{
  const a = matchAssetIdentity({ utterance: 'Làm chiến dịch bán Sun Cora' });
  ok('project Sun Cora', /sun\s*cora/i.test(a.project || a.name));
}

{
  const a = matchAssetIdentity({ utterance: 'Marketing Sun Symphony' });
  ok('project Sun Symphony', /sun\s*symphony/i.test(a.project || a.name));
}

{
  const a = matchAssetIdentity({ utterance: 'Research Sun Symphony' });
  ok('research+asset extracts symphony', /symphony/i.test(a.project || a.name));
}

// Fail closed — generic BĐS / shell without asset
{
  ok('generic bán BĐS is campaign intent', isCampaignPlanningUtterance('Bán bất động sản'));
  let prompted = false;
  try {
    validateAssetIdentity(matchAssetIdentity({ utterance: 'Bán bất động sản' }));
  } catch (e) {
    prompted = e instanceof AssetValidationError && /dự án nào/i.test(e.prompt);
  }
  ok('generic asks for project', prompted);

  ok('shell tạo chiến dịch is campaign intent', isCampaignPlanningUtterance('Tạo chiến dịch'));
  let shellPrompt = false;
  try {
    validateAssetIdentity(matchAssetIdentity({ utterance: 'Tạo chiến dịch' }));
  } catch (e) {
    shellPrompt = e instanceof AssetValidationError && /dự án nào/i.test(e.prompt);
  }
  ok('shell asks for project', shellPrompt);
}

// Must NOT steal ops / workspace / content-for-existing
{
  ok('mission status stays mission_summary', classifyByRules('Mission nào đang chạy?').name === 'mission_summary');
  ok('marketing health stays marketing', classifyByRules('Marketing thế nào hôm nay?').name === 'marketing_org_summary');
  ok('workspace Q&A stays campaign_workspace', classifyByRules('Campaign Mai Đăng Chơn đang tới đâu?').name === 'campaign_workspace');
  ok('pure market research stays research', classifyByRules('Research giá thị trường Đà Nẵng').name === 'ai_sales_research');
  ok('research giá + asset stays research', classifyByRules('Research giá Sun Symphony').name === 'ai_sales_research');
  ok(
    'viết content for existing campaign stays content',
    classifyByRules('Viết content cho campaign này').name === 'ai_sales_content',
  );
  ok('content plan stays content', classifyByRules('Content plan tuần này').name === 'ai_sales_content');
}

console.log('\nCampaign Intent Recognition: ALL PASS');
