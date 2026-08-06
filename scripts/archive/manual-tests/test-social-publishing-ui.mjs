/**
 * UI1 Social Publishing — architecture smoke checks (pure Node).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function mustExist(rel) {
  assert.ok(fs.existsSync(path.join(root, rel)), `missing ${rel}`);
}

function main() {
  const checks = [];

  for (const rel of [
    'src/features/agent/publishing-channels/pages/PublishingChannelsPage.tsx',
    'src/features/agent/publishing-drafts/pages/PublishingDraftsPage.tsx',
    'src/features/agent/publishing-schedule/pages/PublishingSchedulePage.tsx',
    'src/features/agent/publishing-history/pages/PublishingHistoryPage.tsx',
    'src/features/agent/publishing-campaigns/pages/PublishingCampaignsPage.tsx',
    'src/features/agent/publishing-campaigns/components/CampaignsPanel.tsx',
    'src/features/agent/social-publishing/shared/PublishingSubnav.tsx',
    'src/features/agent/social-publishing/shared/jobHelpers.ts',
    'docs/ui/SOCIAL-PUBLISHING-UI.md',
  ]) {
    mustExist(rel);
    checks.push(`exists ${rel}`);
  }

  const agentPlatform = read('src/pages/AgentPlatformPage.tsx');
  assert.match(agentPlatform, /publishing-schedule\/pages\/PublishingSchedulePage/);
  assert.match(agentPlatform, /publishing-drafts\/pages\/PublishingDraftsPage/);
  assert.match(agentPlatform, /publishing-channels\/pages\/PublishingChannelsPage/);
  assert.match(agentPlatform, /publishing-history\/pages\/PublishingHistoryPage/);
  assert.match(agentPlatform, /publishing-campaigns\/pages\/PublishingCampaignsPage/);
  assert.match(agentPlatform, /React\.lazy/);
  assert.doesNotMatch(agentPlatform, /from '\.\.\/features\/agent\/social-publishing\/pages\/SocialPublishingPage'/);
  checks.push('AgentPlatformPage lazy-loads 5 publishing feature pages');

  const app = read('src/App.tsx');
  assert.doesNotMatch(app, /fetchSocialChannels|fetchSocialDrafts|fetchSocialJobs|fetchSocialCampaigns/);
  assert.doesNotMatch(app, /PublishingChannelsPage|PublishingDraftsPage|CampaignsPanel/);
  checks.push('App.tsx has no social publishing API/UI logic');

  const sidebar = read('src/app/navigation/sidebarConfig.ts');
  assert.match(sidebar, /agent-publishing-campaigns/);
  assert.match(sidebar, /\/admin\/agents\/publishing\/campaigns/);
  checks.push('sidebar includes Campaign menu');

  const routes = read('src/app/routeConfig.ts');
  assert.match(routes, /\/admin\/agents\/publishing\/campaigns/);
  checks.push('routeConfig includes campaigns path');

  const mainTsx = read('src/main.tsx');
  for (const p of [
    '/admin/agents/publishing',
    '/admin/agents/publishing/drafts',
    '/admin/agents/publishing/channels',
    '/admin/agents/publishing/history',
    '/admin/agents/publishing/campaigns',
  ]) {
    assert.ok(mainTsx.includes(`path="${p}"`), `main.tsx missing ${p}`);
  }
  checks.push('main.tsx registers publishing routes');

  const api = read('src/services/socialPublishingApi.ts');
  for (const fn of [
    'duplicateSocialDraft',
    'regenerateSocialDraft',
    'archiveSocialDraft',
    'rescheduleSocialJob',
    'publishSocialJobNow',
    'fetchJobEvidence',
    'fetchSocialCampaigns',
    'fetchSocialDestinations',
  ]) {
    assert.match(api, new RegExp(`export function ${fn}`));
  }
  checks.push('API client covers UI1 endpoints');

  const schedule = read('src/features/agent/social-publishing/components/CalendarQueuePanel.tsx');
  assert.match(schedule, /rescheduleSocialJob/);
  assert.match(schedule, /publishSocialJobNow/);
  assert.match(schedule, /ondrag|onDrag|draggable/i);
  checks.push('schedule panel has DnD reschedule + publish now');

  const drafts = read('src/features/agent/social-publishing/components/DraftsPanel.tsx');
  assert.match(drafts, /duplicateSocialDraft/);
  assert.match(drafts, /regenerateSocialDraft/);
  assert.match(drafts, /archiveSocialDraft/);
  checks.push('drafts panel has duplicate/regenerate/archive');

  const history = read('src/features/agent/social-publishing/components/HistoryPanel.tsx');
  assert.match(history, /fetchJobEvidence/);
  assert.match(history, /evidenceFileUrl|readPublishPermalink/);
  checks.push('history panel loads evidence');

  const channels = read('src/features/agent/social-publishing/components/ChannelsPanel.tsx');
  assert.match(channels, /facebook_group/);
  assert.match(channels, /fetchSocialDestinations|capabilities/i);
  checks.push('channels panel supports group + capabilities');

  const campaigns = read('src/features/agent/publishing-campaigns/components/CampaignsPanel.tsx');
  assert.match(campaigns, /partial_success|progress/);
  assert.match(campaigns, /startSocialCampaign|Open|open/i);
  checks.push('campaigns panel shows progress + open');

  const serverRoutes = read(
    'server/modules/social-publishing/api/socialPublishingRoutes.ts',
  );
  assert.match(serverRoutes, /\/api\/social\/campaigns/);
  assert.match(serverRoutes, /\/api\/social\/destinations/);
  assert.match(serverRoutes, /jobs\/:id\/evidence/);
  checks.push('thin HTTP routes expose campaigns/destinations/evidence');

  console.log('social-publishing-ui checks passed:');
  for (const c of checks) console.log(`  ✓ ${c}`);
}

main();
