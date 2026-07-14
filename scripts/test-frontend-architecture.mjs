/**
 * Frontend architecture smoke / contract checks.
 * Pure Node — no DB / no TS loader required.
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

function extractStringLiterals(src, pattern) {
  const out = [];
  let m;
  const re = new RegExp(pattern, 'g');
  while ((m = re.exec(src))) out.push(m[1]);
  return out;
}

function main() {
  const checks = [];

  for (const rel of [
    'src/app/AppProviders.tsx',
    'src/app/routeConfig.ts',
    'src/app/layouts/AdminLayout.tsx',
    'src/app/layouts/AdminHeader.tsx',
    'src/app/layouts/AdminSidebar.tsx',
    'src/app/layouts/AdminToast.tsx',
    'src/app/navigation/tabPaths.ts',
    'src/app/navigation/sidebarConfig.ts',
    'src/app/navigation/navigationTypes.ts',
    'src/features/auth/LoginPage.tsx',
  ]) {
    mustExist(rel);
    checks.push(`exists ${rel}`);
  }

  const app = read('src/App.tsx');
  assert.match(app, /AdminLayout/, 'App.tsx must mount AdminLayout');
  assert.match(app, /LoginPage/, 'App.tsx must use LoginPage');
  assert.match(app, /AppProviders/, 'App.tsx must wrap AppProviders');
  assert.doesNotMatch(app, /const SEO_SUBMENU/, 'SEO_SUBMENU must not be redefined in App');
  assert.doesNotMatch(app, /const AGENT_SUBMENU/, 'AGENT_SUBMENU must not be redefined in App');
  assert.match(app, /getBootstrapData/, 'performance bootstrap preserved');
  assert.match(app, /navigationCounts/, 'navigation counts preserved');
  checks.push('App.tsx wires new shell + keeps bootstrap');

  const routeConfig = read('src/app/routeConfig.ts');
  const paths = extractStringLiterals(routeConfig, String.raw`path:\s*['"]([^'"]+)['"]`);
  assert.ok(paths.length >= 17, `expected >=17 admin routes, got ${paths.length}`);
  assert.equal(new Set(paths).size, paths.length, 'duplicate admin paths');
  assert.ok(paths.includes('/admin/agents/findings'));
  assert.ok(paths.includes('/admin/seo/posts'));
  assert.ok(paths.includes('/admin/dashboard'));
  checks.push('routeConfig unique + critical paths');

  const tabPaths = read('src/app/navigation/tabPaths.ts');
  assert.match(tabPaths, /real_estate_ai_active_tab/);
  assert.match(tabPaths, /'agent-findings': '\/admin\/agents\/findings'/);
  assert.match(tabPaths, /'seo-posts': '\/admin\/seo\/posts'/);
  checks.push('tab path compatibility');

  const mainTsx = read('src/main.tsx');
  for (const p of [
    '/admin/login',
    '/admin/dashboard',
    '/admin/seo/posts',
    '/admin/agents',
    '/admin/agents/findings',
  ]) {
    assert.ok(mainTsx.includes(`path="${p}"`), `main.tsx missing route ${p}`);
  }
  checks.push('main.tsx keeps admin route URLs');

  const sidebar = read('src/app/layouts/AdminSidebar.tsx');
  assert.match(sidebar, /buildPrimaryNavItems/);
  assert.match(sidebar, /AGENT_SUBMENU/);
  checks.push('sidebar uses config data');

  // Batch 2 feature modules
  for (const rel of [
    'src/features/settings/pages/SystemSettingsPage.tsx',
    'src/features/settings/hooks/useSystemSettings.ts',
    'src/features/settings/services/systemSettingsApi.ts',
    'src/features/automations/pages/AutomationsPage.tsx',
    'src/features/integrations/pages/IntegrationsPage.tsx',
    'src/features/profile/pages/ProfilePage.tsx',
    'src/features/agent/sources/pages/SourcesPage.tsx',
    'src/features/agent/missions/pages/MissionsPage.tsx',
    'src/features/agent/jobs/pages/JobsPage.tsx',
    'src/features/agent/notifications/pages/NotificationsPage.tsx',
    'src/features/agent/sessions/pages/SessionsPage.tsx',
    'src/features/agent/reports/pages/ReportsPage.tsx',
    'src/features/agent/shared/AgentPlatformUi.tsx',
  ]) {
    mustExist(rel);
    checks.push(`exists ${rel}`);
  }

  assert.match(app, /SystemSettingsPage/, 'App must lazy-mount SystemSettingsPage');
  assert.match(app, /AutomationsPage/, 'App must lazy-mount AutomationsPage');
  assert.match(app, /IntegrationsPage/, 'App must lazy-mount IntegrationsPage');
  assert.match(app, /ProfilePage/, 'App must lazy-mount ProfilePage');
  assert.doesNotMatch(app, /handleSaveSettings/, 'settings save handler must leave App');
  assert.doesNotMatch(app, /handleTestTelegram/, 'telegram test handler must leave App');
  assert.doesNotMatch(app, /handleTestAgentSync/, 'agent sync test handler must leave App');
  assert.doesNotMatch(app, /Cổng cấu hình hệ thống AI Agent/, 'settings JSX must leave App');
  assert.doesNotMatch(app, /Trung tâm Tự Động Hóa AI Automation Center/, 'automations JSX must leave App');
  checks.push('Batch 2 App no longer owns settings/automations JSX+handlers');

  const agentPlatform = read('src/pages/AgentPlatformPage.tsx');
  assert.match(agentPlatform, /React\.lazy/, 'AgentPlatformPage must lazy-load Batch 2 sections');
  assert.match(agentPlatform, /features\/agent\/sources\/pages\/SourcesPage/);
  assert.match(agentPlatform, /features\/agent\/missions\/pages\/MissionsPage/);
  assert.match(agentPlatform, /features\/agent\/jobs\/pages\/JobsPage/);
  assert.match(agentPlatform, /features\/agent\/notifications\/pages\/NotificationsPage/);
  assert.match(agentPlatform, /features\/agent\/sessions\/pages\/SessionsPage/);
  assert.match(agentPlatform, /features\/agent\/reports\/pages\/ReportsPage/);
  assert.match(agentPlatform, /Suspense/);
  checks.push('AgentPlatformPage lazy Batch 2 sections');

  // App must not statically import Batch 2 page implementations
  assert.doesNotMatch(
    app,
    /import\s+SystemSettingsPage\s+from/,
    'SystemSettingsPage must be lazy, not static',
  );
  assert.doesNotMatch(app, /import\s+AutomationsPage\s+from/, 'AutomationsPage must be lazy');
  checks.push('Batch 2 pages are lazy-imported from App');

  // Batch 3 core sales + agent workflow modules
  for (const rel of [
    'src/features/agent/scanned-content/pages/ScannedContentPage.tsx',
    'src/features/agent/lead-intelligence/pages/LeadIntelligencePage.tsx',
    'src/features/agent/lead-intelligence/components/FindingDetailDrawer.tsx',
    'src/features/agent/lead-intelligence/matching/MatchingPanel.tsx',
    'src/features/agent/action-proposals/pages/ActionProposalsPage.tsx',
    'src/features/agent/external-inventory/pages/ExternalInventoryPage.tsx',
    'src/features/investor-leads/pages/InvestorLeadsPage.tsx',
    'src/features/crm/pages/CustomersPage.tsx',
  ]) {
    mustExist(rel);
    checks.push(`exists ${rel}`);
  }

  assert.match(app, /CustomersPage/, 'App must lazy-mount CRM CustomersPage');
  assert.match(app, /InvestorLeadsPage/, 'App must lazy-mount InvestorLeadsPage');
  assert.doesNotMatch(app, /Quản lý khách hàng CRM/, 'CRM table JSX must leave App');
  assert.doesNotMatch(app, /handleAddCustomer/, 'CRM add handler must leave App');
  assert.doesNotMatch(app, /showAddCustomerModal/, 'CRM modal state must leave App');
  checks.push('Batch 3 App no longer owns CRM list/modal');

  assert.match(agentPlatform, /features\/agent\/scanned-content\/pages\/ScannedContentPage/);
  assert.match(agentPlatform, /features\/agent\/lead-intelligence\/pages\/LeadIntelligencePage/);
  assert.match(agentPlatform, /features\/agent\/action-proposals\/pages\/ActionProposalsPage/);
  assert.match(agentPlatform, /features\/agent\/external-inventory\/pages\/ExternalInventoryPage/);
  assert.doesNotMatch(agentPlatform, /import AgentFindings from/);
  assert.doesNotMatch(agentPlatform, /import AgentScannedContents from/);
  assert.doesNotMatch(agentPlatform, /import AgentExternalInventory from/);
  checks.push('AgentPlatformPage lazy Batch 3 sections');

  const leadPage = read('src/features/agent/lead-intelligence/pages/LeadIntelligencePage.tsx');
  assert.match(leadPage, /intelligenceOf|ResolvedLeadIntelligence|intelligence/, 'canonical intelligence retained');
  checks.push('Lead Intelligence keeps canonical DTO usage');

  // Batch 4 — ownership boundaries
  for (const rel of [
    'src/features/users/pages/UsersPage.tsx',
    'src/features/dashboard/components/DashboardHotLeads.tsx',
  ]) {
    mustExist(rel);
    checks.push(`exists ${rel}`);
  }

  assert.match(app, /UsersPage/, 'App must lazy-mount UsersPage');
  assert.match(app, /DashboardHotLeads/, 'App must lazy-mount DashboardHotLeads');
  assert.doesNotMatch(app, /const \[customers,\s*setCustomers\]/, 'App must not own CRM customers list state');
  assert.doesNotMatch(app, /loadCrmModule/, 'App must not preload CRM into App state');
  assert.doesNotMatch(app, /selectedFinding|selectedCustomer|selectedScannedContent/, 'App must not own feature selected entities');
  assert.doesNotMatch(app, /handleCreateUser|handleToggleMemberAssignment|handleBulkMemberAssignment/, 'user permission handlers must leave App');
  assert.doesNotMatch(app, /editingUser|newUserForm|selectedPermissionMemberId/, 'Users form/modal state must leave App');
  assert.doesNotMatch(app, /User & Permission/, 'Users page JSX must leave App');
  assert.doesNotMatch(app, /create FeatureContext|useAppState\s*\(/, 'no god FeatureContext / useAppState');

  const usersPage = read('src/features/users/pages/UsersPage.tsx');
  assert.match(usersPage, /listCustomers/, 'UsersPage fetches customer assignment catalog');
  assert.match(usersPage, /listProperties/, 'UsersPage fetches property assignment catalog');
  assert.match(usersPage, /getUsers/, 'UsersPage owns users query');
  assert.doesNotMatch(usersPage, /customers:\s*Customer\[\]/, 'UsersPage must not take customers props from App');
  checks.push('Batch 4 ownership: Users + no App CRM customers state');

  const customersPage = read('src/features/crm/pages/CustomersPage.tsx');
  assert.match(customersPage, /listCustomers/, 'CRM page owns list query');
  assert.match(customersPage, /showAddModal|createCustomer/, 'CRM page owns create modal');
  checks.push('Batch 4 CRM page ownership intact');

  console.log('frontend-architecture checks passed:');
  for (const c of checks) console.log('  ✓', c);
}

main();
