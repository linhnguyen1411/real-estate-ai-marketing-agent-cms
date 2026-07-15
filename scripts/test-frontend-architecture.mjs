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

  // Batch 5 — Properties / Inbox / Chat ownership
  for (const rel of [
    'src/features/properties/pages/PropertiesPage.tsx',
    'src/features/inbox/pages/InboxPage.tsx',
    'src/features/chat/pages/ChatFeatureHost.tsx',
  ]) {
    mustExist(rel);
    checks.push(`exists ${rel}`);
  }

  assert.match(app, /PropertiesPage/, 'App must lazy-mount PropertiesPage');
  assert.match(app, /InboxPage/, 'App must lazy-mount InboxPage');
  assert.match(app, /ChatFeatureHost/, 'App must lazy-mount ChatFeatureHost');
  assert.doesNotMatch(app, /const \[properties,\s*setProperties\]/, 'App must not own properties list');
  assert.doesNotMatch(app, /showAddPropertyModal|editingProperty|handleSaveProperty/, 'property modal/handlers must leave App');
  assert.doesNotMatch(app, /const \[inbox,\s*setInbox\]/, 'App must not own inbox list');
  assert.doesNotMatch(app, /selectedInboxMessage|responseReplyText/, 'App must not own inbox selection');
  assert.doesNotMatch(app, /const \[chatMessages,\s*setChatMessages\]/, 'App must not own chat messages');
  assert.doesNotMatch(app, /handleSendChatbotMessage|handleSendManualReply|handleSendGuestReply/, 'chat/inbox send handlers must leave App');
  assert.doesNotMatch(app, /listInbox|sendInboxReply|sendAssistantMessage|getChatHistory|getPublicChatGuests/, 'App must not import inbox/chat APIs');
  assert.doesNotMatch(app, /refreshPublicGuestChats/, 'App must not own chat poll helpers');

  const inboxPage = read('src/features/inbox/pages/InboxPage.tsx');
  assert.match(inboxPage, /listInbox/, 'InboxPage owns list API');
  assert.match(inboxPage, /selectedInboxMessage/, 'InboxPage owns selection');
  assert.doesNotMatch(inboxPage, /createContext|InboxContext/, 'no Inbox god context');

  const chatHost = read('src/features/chat/pages/ChatFeatureHost.tsx');
  assert.match(chatHost, /sendAssistantMessage|sendPublicChatGuestMessage/, 'Chat host owns send APIs');
  assert.match(chatHost, /useChatPolling/, 'Chat host owns polling via useChatPolling');
  assert.match(chatHost, /userChatInput|setUserChatInput/, 'Chat host owns draft');
  assert.doesNotMatch(chatHost, /createContext|ChatContext/, 'no Chat god context');
  assert.doesNotMatch(app, /GlobalInboxContext|GlobalChatContext|GlobalPropertiesContext/, 'no global feature stores');
  checks.push('Batch 5 Properties/Inbox/Chat ownership boundaries');

  // Batch 6 — shell gate, badge source, decomposition, no god hooks
  function nonBlankLines(text) {
    return text.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
  }
  function countMatches(text, pattern) {
    return (text.match(pattern) || []).length;
  }
  function countUseState(text) {
    return countMatches(text, /\buseState(?:<[^>;\n]+>)?\s*\(/g);
  }
  function countUseEffect(text) {
    return countMatches(text, /\b(?:React\.)?useEffect\s*\(/g);
  }

  const appLoc = app.split(/\r?\n/).length;
  const appNb = nonBlankLines(app);
  const appUseState = countUseState(app);
  const appUseEffect = countUseEffect(app);
  assert.ok(appLoc <= 1800, `App.tsx LOC ${appLoc} must be <=1800 (legacy Posts/SEO allowed)`);
  assert.ok(appUseState <= 30, `App useState ${appUseState} advisory <=30`);
  assert.ok(appUseEffect <= 10, `App useEffect ${appUseEffect} advisory <=10`);
  assert.doesNotMatch(app, /showAddPropertyModal|editingProperty\b|handleSaveProperty/, 'App no property modal state');
  assert.doesNotMatch(app, /selectedInboxMessage|responseReplyText/, 'App no inbox selection state');
  assert.doesNotMatch(app, /const \[chatMessages,\s*setChatMessages\]/, 'App no chat messages state');
  assert.doesNotMatch(app, /listInbox|sendInboxReply|sendAssistantMessage|getChatHistory|getPublicChatGuests/, 'App no inbox/chat list APIs');
  assert.doesNotMatch(app, /extraBadges:\s*\{[^}]*websiteChat:\s*0/, 'App must not hardcode websiteChat badge to 0');
  assert.doesNotMatch(app, /extraBadges:\s*\{[^}]*chatHistory:\s*0/, 'App must not hardcode chatHistory badge to 0');
  assert.match(app, /websiteChat:\s*0,\s*\r?\n\s*chatHistory:\s*0/, 'EMPTY_NAV_COUNTS includes chat fields');

  const navTypes = read('src/app/navigation/navigationTypes.ts');
  assert.match(navTypes, /websiteChat:\s*number/, 'NavigationCountsView has websiteChat');
  assert.match(navTypes, /chatHistory:\s*number/, 'NavigationCountsView has chatHistory');
  assert.match(sidebar, /counts\.websiteChat|badgeKey === 'websiteChat'/, 'sidebar reads websiteChat count');
  assert.match(sidebar, /counts\.chatHistory|badgeKey === 'chatHistory'/, 'sidebar reads chatHistory count');

  const apiSrc = read('src/services/api.ts');
  assert.match(apiSrc, /websiteChat:\s*number/, 'API NavigationCounts has websiteChat');
  assert.match(apiSrc, /chatHistory:\s*number/, 'API NavigationCounts has chatHistory');
  assert.match(apiSrc, /\/api\/navigation-counts/, 'uses lightweight navigation-counts endpoint');

  const propertiesPage = read('src/features/properties/pages/PropertiesPage.tsx');
  const propertiesLoc = propertiesPage.split(/\r?\n/).length;
  assert.ok(propertiesLoc <= 800, `PropertiesPage LOC ${propertiesLoc} must be <=800`);
  assert.ok(propertiesLoc <= 560, `PropertiesPage LOC ${propertiesLoc} target <=560 after Batch 6 split`);
  mustExist('src/features/properties/components/PropertyFormModal.tsx');
  assert.match(propertiesPage, /PropertyFormModal/, 'PropertiesPage uses PropertyFormModal');
  assert.doesNotMatch(propertiesPage, /createContext|PropertiesContext/, 'no Properties god context');

  const chatHostLoc = chatHost.split(/\r?\n/).length;
  assert.ok(chatHostLoc <= 500, `ChatFeatureHost LOC ${chatHostLoc} must be <=500`);
  assert.ok(chatHostLoc <= 380, `ChatFeatureHost LOC ${chatHostLoc} target <=380 after mode split`);
  mustExist('src/features/chat/hooks/useChatPolling.ts');
  mustExist('src/features/chat/components/AssistantChatPanel.tsx');
  mustExist('src/features/chat/components/WebsiteChatPanel.tsx');
  mustExist('src/features/chat/components/ChatHistoryPanel.tsx');
  const pollHook = read('src/features/chat/hooks/useChatPolling.ts');
  assert.match(pollHook, /clearInterval/, 'useChatPolling cleans up interval');
  assert.match(pollHook, /setInterval/, 'useChatPolling owns polling timer');
  assert.match(chatHost, /useChatPolling/, 'ChatFeatureHost uses useChatPolling');
  assert.match(chatHost, /AssistantChatPanel|WebsiteChatPanel|ChatHistoryPanel/, 'ChatFeatureHost delegates mode panels');
  assert.doesNotMatch(app, /import\s+PropertiesPage\s+from/, 'Properties must stay lazy');
  assert.doesNotMatch(app, /import\s+InboxPage\s+from/, 'Inbox must stay lazy');
  assert.doesNotMatch(app, /import\s+ChatFeatureHost\s+from/, 'ChatFeatureHost must stay lazy');
  checks.push('Batch 6 shell gate, badges, Properties/Chat split, polling cleanup');

  // Hidden pages: feature routes only render when activeTab matches (no multi-mount of all panels)
  assert.match(app, /activeTab === 'properties'/, 'Properties gated by activeTab');
  assert.match(app, /activeTab === 'inbox'/, 'Inbox gated by activeTab');
  assert.match(app, /activeTab === 'chatbot'/, 'Chatbot gated by activeTab');
  assert.match(app, /React\.lazy\(\(\)\s*=>\s*import\('\.\/features\/properties/, 'Properties lazy chunk');
  assert.match(app, /React\.lazy\(\(\)\s*=>\s*import\('\.\/features\/inbox/, 'Inbox lazy chunk');
  assert.match(app, /React\.lazy\(\(\)\s*=>\s*import\('\.\/features\/chat/, 'Chat lazy chunk');
  checks.push('Batch 6 lazy route chunks + activeTab mount gating');

  console.log('frontend-architecture checks passed:');
  for (const c of checks) console.log('  ✓', c);
  console.log(
    `  · App LOC=${appLoc} nonBlank=${appNb} useState=${appUseState} useEffect=${appUseEffect}`,
  );
  console.log(`  · PropertiesPage LOC=${propertiesLoc} ChatFeatureHost LOC=${chatHostLoc}`);
}

main();
