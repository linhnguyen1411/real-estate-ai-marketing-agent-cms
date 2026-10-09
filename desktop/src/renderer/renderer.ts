/**
 * Renderer script for Desktop Agent App Dashboard.
 */

interface DesktopAgentAPI {
  onNewLead: (cb: (lead: any) => void) => () => void;
  onStatsUpdate: (cb: (stats: any) => void) => () => void;
  onLogMessage: (cb: (log: any) => void) => () => void;
  switchTab: (tab: 'dashboard' | 'facebook' | 'zalo' | 'settings') => void;
  getStats: () => Promise<any>;
  getSettings: () => Promise<any>;
  saveSettings: (settings: any) => Promise<any>;
  syncLeadManual: (leadId: string) => Promise<{ success: boolean; error?: string }>;
  triggerFbScroll: () => void;
  reloadTab: (tab: 'facebook' | 'zalo') => void;
  launchChromeProfile: () => Promise<{ success: boolean; error?: string }>;
  triggerChromeScroll: () => void;
}

declare global {
  interface Window {
    desktopAgent: DesktopAgentAPI;
  }
}

const leadsList: any[] = [];
const fbLeadsList: any[] = [];
let currentFilter: 'all' | 'hot' | 'supply' | 'demand' = 'all';
let currentTab: 'dashboard' | 'facebook' | 'zalo' | 'settings' = 'dashboard';

// Elements
const viewDashboard = document.getElementById('view-dashboard')!;
const viewFacebook = document.getElementById('view-facebook')!;
const viewSettings = document.getElementById('view-settings')!;
const leadsTableBody = document.getElementById('leads-table-body')!;
const fbLeadsTableBody = document.getElementById('fb-leads-table-body')!;

const statFbCount = document.getElementById('stat-fb-count')!;
const statZaloCount = document.getElementById('stat-zalo-count')!;
const statHotCount = document.getElementById('stat-hot-count')!;
const statSyncedCount = document.getElementById('stat-synced-count')!;

const chromeCdpDot = document.getElementById('chrome-cdp-dot')!;
const chromeCdpText = document.getElementById('chrome-cdp-text')!;
const vpsSyncDot = document.getElementById('vps-sync-dot')!;
const vpsSyncText = document.getElementById('vps-sync-text')!;

const fbPanelStatus = document.getElementById('fb-panel-status')!;
const fbPanelProfile = document.getElementById('fb-panel-profile')!;
const fbPanelPort = document.getElementById('fb-panel-port')!;

// Tab Switching
function switchTab(tab: 'dashboard' | 'facebook' | 'zalo' | 'settings'): void {
  currentTab = tab;
  document.querySelectorAll('.nav-tab').forEach((el) => {
    el.classList.toggle('active', el.getAttribute('data-tab') === tab);
  });

  if (tab === 'dashboard') {
    viewDashboard.classList.remove('hidden');
    viewFacebook.classList.add('hidden');
    viewSettings.classList.add('hidden');
  } else if (tab === 'facebook') {
    viewDashboard.classList.add('hidden');
    viewFacebook.classList.remove('hidden');
    viewSettings.classList.add('hidden');
  } else if (tab === 'settings') {
    viewDashboard.classList.add('hidden');
    viewFacebook.classList.add('hidden');
    viewSettings.classList.remove('hidden');
  } else {
    // zalo tab
    viewDashboard.classList.add('hidden');
    viewFacebook.classList.add('hidden');
    viewSettings.classList.add('hidden');
  }

  window.desktopAgent.switchTab(tab);
}

// Navigation Tabs Setup
document.querySelectorAll('.nav-tab').forEach((el) => {
  el.addEventListener('click', () => {
    const tab = el.getAttribute('data-tab') as any;
    if (tab) switchTab(tab);
  });
});

// Chrome Launch Action
async function handleLaunchChrome(): Promise<void> {
  const btn = document.getElementById('btn-launch-chrome') as HTMLButtonElement;
  const btnFb = document.getElementById('btn-fb-open-chrome') as HTMLButtonElement;
  if (btn) btn.textContent = '⏳ Đang mở Chrome...';
  if (btnFb) btnFb.textContent = '⏳ Đang mở Chrome...';

  const res = await window.desktopAgent.launchChromeProfile();
  if (!res.success) {
    alert(`Không thể mở Google Chrome: ${res.error || 'Lỗi không xác định'}`);
  }

  setTimeout(() => {
    if (btn) btn.textContent = '🚀 Mở Chrome Profile Cũ';
    if (btnFb) btnFb.textContent = '🚀 Mở Google Chrome';
  }, 2000);
}

document.getElementById('btn-launch-chrome')?.addEventListener('click', handleLaunchChrome);
document.getElementById('btn-fb-open-chrome')?.addEventListener('click', handleLaunchChrome);

// Chrome Scroll Action
document.getElementById('btn-scroll-chrome')?.addEventListener('click', () => {
  window.desktopAgent.triggerChromeScroll();
});
document.getElementById('btn-fb-scroll')?.addEventListener('click', () => {
  window.desktopAgent.triggerChromeScroll();
});

document.getElementById('btn-reload')?.addEventListener('click', () => {
  if (currentTab === 'zalo') {
    window.desktopAgent.reloadTab('zalo');
  } else {
    location.reload();
  }
});

// Filters Setup
document.querySelectorAll('.filter-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = (btn.getAttribute('data-filter') as any) || 'all';
    renderTable();
  });
});

// Update Stats UI
function updateStatsUI(stats: any): void {
  statFbCount.textContent = (stats.facebookPostsTotal || 0).toLocaleString();
  statZaloCount.textContent = (stats.zaloMessagesTotal || 0).toLocaleString();
  statHotCount.textContent = (stats.hotLeadsTotal || 0).toLocaleString();
  statSyncedCount.textContent = (stats.syncedToVpsTotal || 0).toLocaleString();

  if (stats.chromeCdpAttached) {
    chromeCdpDot.className = 'status-dot online';
    chromeCdpText.textContent = 'Chrome CDP Online (9222)';
    fbPanelStatus.textContent = '🟢 Đã kết nối & Đang quét bài viết';
    fbPanelStatus.style.color = '#34d399';
  } else {
    chromeCdpDot.className = 'status-dot offline';
    chromeCdpText.textContent = 'Chrome CDP Offline';
    fbPanelStatus.textContent = '🔴 Chưa kết nối (Nhấp "Mở Google Chrome")';
    fbPanelStatus.style.color = '#f87171';
  }

  if (stats.vpsConnected) {
    vpsSyncDot.className = 'status-dot online';
    vpsSyncText.textContent = 'VPS Online';
  } else {
    vpsSyncDot.className = 'status-dot';
    vpsSyncText.textContent = 'VPS Sẵn sàng';
  }
}

function formatRow(lead: any): string {
  const srcTag =
    lead.sourceType === 'facebook'
      ? '<span class="tag" style="background:#1e3a8a;color:#93c5fd;">FB</span>'
      : '<span class="tag" style="background:#065f46;color:#a7f3d0;">Zalo</span>';

  let classTag = '<span class="tag tag-unknown">CHƯA RÕ</span>';
  if (lead.classification === 'SUPPLY') {
    classTag = '<span class="tag tag-supply">BÁN / CUNG</span>';
  } else if (lead.classification === 'DEMAND') {
    classTag = '<span class="tag tag-demand">MUA / CẦU</span>';
  }

  const scoreColor = lead.intentScore >= 70 ? '#f87171' : lead.intentScore >= 40 ? '#fbbf24' : '#94a3b8';
  const scoreBadge = `<span class="score-badge" style="color: ${scoreColor}">${lead.intentScore}</span>`;

  const blockStr = lead.projectBlock
    ? `<span style="color:#60a5fa;font-weight:600;">${lead.projectBlock}</span>`
    : lead.locationArea || '-';
  const priceStr = lead.askingPrice
    ? `<span style="color:#34d399;font-weight:600;">${lead.askingPrice}</span>`
    : '-';
  const phoneStr = lead.authorPhone
    ? `<span style="color:#fde047;font-weight:600;">${lead.authorPhone}</span>`
    : '<span style="color:#64748b;">N/A</span>';

  const syncBtn =
    lead.syncStatus === 'synced'
      ? '<span style="color:#10b981;font-size:12px;">✓ Đã gửi</span>'
      : `<button class="btn-sync" onclick="manualSync('${lead.id}')">Gửi VPS</button>`;

  const snippet = lead.rawText.length > 130 ? `${lead.rawText.slice(0, 130)}...` : lead.rawText;

  return `
    <tr>
      <td>${srcTag}</td>
      <td>${classTag}</td>
      <td>${scoreBadge}</td>
      <td>${priceStr}</td>
      <td>${blockStr}</td>
      <td>${phoneStr}</td>
      <td title="${lead.rawText.replace(/"/g, '&quot;')}">${snippet}</td>
      <td>${syncBtn}</td>
    </tr>
  `;
}

// Render Table Rows
function renderTable(): void {
  const filtered = leadsList.filter((lead) => {
    if (currentFilter === 'hot') return lead.isHotLead;
    if (currentFilter === 'supply') return lead.classification === 'SUPPLY';
    if (currentFilter === 'demand') return lead.classification === 'DEMAND';
    return true;
  });

  if (filtered.length === 0) {
    leadsTableBody.innerHTML = `
      <tr>
        <td colspan="8" class="empty-state">
          Chưa có bài viết nào phù hợp bộ lọc hiện tại.
        </td>
      </tr>
    `;
    return;
  }

  leadsTableBody.innerHTML = filtered.map(formatRow).join('');
}

function renderFbTable(): void {
  if (fbLeadsList.length === 0) {
    fbLeadsTableBody.innerHTML = `
      <tr>
        <td colspan="8" class="empty-state">
          Chưa bắt được bài viết Facebook nào từ Chrome.<br>
          Hãy mở Chrome và lướt qua nhóm BĐS Đà Nẵng / Nam Hòa Xuân!
        </td>
      </tr>
    `;
    return;
  }

  fbLeadsTableBody.innerHTML = fbLeadsList.map(formatRow).join('');
}

// Global Manual Sync Callback
(window as any).manualSync = async (leadId: string) => {
  const btn = document.querySelector(`button[onclick="manualSync('${leadId}')"]`) as HTMLButtonElement;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Đang gửi...';
  }

  const res = await window.desktopAgent.syncLeadManual(leadId);
  const target = leadsList.find((l) => l.id === leadId);
  if (target) {
    target.syncStatus = res.success ? 'synced' : 'failed';
  }

  renderTable();
  renderFbTable();
  if (!res.success) {
    alert(`Không thể gửi lên VPS: ${res.error || 'Lỗi không xác định'}`);
  }
};

// New Lead Handler
window.desktopAgent.onNewLead((lead: any) => {
  leadsList.unshift(lead);
  if (leadsList.length > 300) leadsList.pop();

  if (lead.sourceType === 'facebook') {
    fbLeadsList.unshift(lead);
    if (fbLeadsList.length > 100) fbLeadsList.pop();
    renderFbTable();
  }

  renderTable();
});

// Stats Update Handler
window.desktopAgent.onStatsUpdate((stats: any) => {
  updateStatsUI(stats);
});

// Settings Handlers
async function loadSettingsUI(): Promise<void> {
  const s = await window.desktopAgent.getSettings();
  (document.getElementById('setting-vps-url') as HTMLInputElement).value = s.vpsUrl || '';
  (document.getElementById('setting-vps-key') as HTMLInputElement).value = s.vpsApiKeyId || '';
  (document.getElementById('setting-vps-secret') as HTMLInputElement).value = s.vpsApiSecret || '';
  (document.getElementById('setting-auto-sync') as HTMLInputElement).checked = !!s.autoSyncEnabled;
  (document.getElementById('setting-sound') as HTMLInputElement).checked = !!s.soundNotification;
  (document.getElementById('setting-auto-scroll') as HTMLInputElement).checked = !!s.autoScrollFacebook;
  (document.getElementById('setting-scroll-interval') as HTMLInputElement).value = String(
    s.autoScrollIntervalSec || 8
  );

  (document.getElementById('setting-cdp-port') as HTMLInputElement).value = String(s.cdpPort || 9222);
  (document.getElementById('setting-cdp-profile') as HTMLInputElement).value =
    s.cdpProfileDir || 'runtime/agent-cdp-profile';
  (document.getElementById('setting-cdp-autolaunch') as HTMLInputElement).checked = !!s.cdpAutoLaunch;

  if (fbPanelProfile) fbPanelProfile.textContent = s.cdpProfileDir || 'runtime/agent-cdp-profile';
  if (fbPanelPort) fbPanelPort.textContent = String(s.cdpPort || 9222);
}

document.getElementById('btn-save-settings')?.addEventListener('click', async () => {
  const partial = {
    vpsUrl: (document.getElementById('setting-vps-url') as HTMLInputElement).value.trim(),
    vpsApiKeyId: (document.getElementById('setting-vps-key') as HTMLInputElement).value.trim(),
    vpsApiSecret: (document.getElementById('setting-vps-secret') as HTMLInputElement).value.trim(),
    autoSyncEnabled: (document.getElementById('setting-auto-sync') as HTMLInputElement).checked,
    soundNotification: (document.getElementById('setting-sound') as HTMLInputElement).checked,
    autoScrollFacebook: (document.getElementById('setting-auto-scroll') as HTMLInputElement).checked,
    autoScrollIntervalSec:
      parseInt((document.getElementById('setting-scroll-interval') as HTMLInputElement).value, 10) || 8,
    cdpPort: parseInt((document.getElementById('setting-cdp-port') as HTMLInputElement).value, 10) || 9222,
    cdpProfileDir: (document.getElementById('setting-cdp-profile') as HTMLInputElement).value.trim() || 'runtime/agent-cdp-profile',
    cdpAutoLaunch: (document.getElementById('setting-cdp-autolaunch') as HTMLInputElement).checked,
  };

  await window.desktopAgent.saveSettings(partial);
  const msg = document.getElementById('save-settings-msg')!;
  msg.style.display = 'inline';
  setTimeout(() => {
    msg.style.display = 'none';
  }, 2500);
});

// Init
window.addEventListener('DOMContentLoaded', async () => {
  await loadSettingsUI();
  const initialStats = await window.desktopAgent.getStats();
  updateStatsUI(initialStats);
});
