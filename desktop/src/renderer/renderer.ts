/**
 * Renderer script for Desktop Agent App Dashboard.
 */

interface DesktopAgentAPI {
  onNewLead: (cb: (lead: any) => void) => () => void;
  onStatsUpdate: (cb: (stats: any) => void) => () => void;
  onLogMessage: (cb: (log: any) => void) => () => void;
  onSourcesUpdate: (cb: (sources: any[]) => void) => () => void;
  switchTab: (tab: 'dashboard' | 'facebook' | 'zalo' | 'settings') => void;
  getStats: () => Promise<any>;
  getSettings: () => Promise<any>;
  saveSettings: (settings: any) => Promise<any>;
  syncLeadManual: (leadId: string) => Promise<{ success: boolean; error?: string }>;
  triggerFbScroll: () => void;
  reloadTab: (tab: 'facebook' | 'zalo') => void;
  getSources: () => Promise<any[]>;
  refreshSources: () => Promise<any[]>;
  selectSource: (index: number) => void;
  nextSource: () => void;
  prevSource: () => void;
  toggleAutoRotate: (enabled: boolean) => void;
}

declare global {
  interface Window {
    desktopAgent: DesktopAgentAPI;
  }
}

const leadsList: any[] = [];
let currentFilter: 'all' | 'hot' | 'supply' | 'demand' = 'all';
let currentTab: 'dashboard' | 'facebook' | 'zalo' | 'settings' = 'dashboard';
let activeSourcesList: any[] = [];
let currentSourceIdx = 0;

// Elements
const viewDashboard = document.getElementById('view-dashboard')!;
const viewSettings = document.getElementById('view-settings')!;
const leadsTableBody = document.getElementById('leads-table-body')!;

const statFbCount = document.getElementById('stat-fb-count')!;
const statZaloCount = document.getElementById('stat-zalo-count')!;
const statHotCount = document.getElementById('stat-hot-count')!;
const statSyncedCount = document.getElementById('stat-synced-count')!;

const fbDebuggerDot = document.getElementById('fb-debugger-dot')!;
const fbDebuggerText = document.getElementById('fb-debugger-text')!;
const vpsSyncDot = document.getElementById('vps-sync-dot')!;
const vpsSyncText = document.getElementById('vps-sync-text')!;

// Source Rotation Elements
const currentSourceNameEl = document.getElementById('current-source-name')!;
const currentSourceUrlEl = document.getElementById('current-source-url') as HTMLAnchorElement;
const sourceIndexBadgeEl = document.getElementById('source-index-badge')!;
const countdownTimerEl = document.getElementById('countdown-timer')!;
const toggleAutoRotateEl = document.getElementById('toggle-auto-rotate') as HTMLInputElement;
const selectSourcesDropdown = document.getElementById('select-sources-dropdown') as HTMLSelectElement;
const btnPrevSource = document.getElementById('btn-prev-source')!;
const btnNextSource = document.getElementById('btn-next-source')!;
const btnRefreshSources = document.getElementById('btn-refresh-sources')!;

// Tab Switching
function switchTab(tab: 'dashboard' | 'facebook' | 'zalo' | 'settings'): void {
  currentTab = tab;
  document.querySelectorAll('.nav-tab').forEach((el) => {
    el.classList.toggle('active', el.getAttribute('data-tab') === tab);
  });

  if (tab === 'dashboard') {
    viewDashboard.classList.remove('hidden');
    viewSettings.classList.add('hidden');
  } else if (tab === 'settings') {
    viewDashboard.classList.add('hidden');
    viewSettings.classList.remove('hidden');
  } else {
    // 'facebook' or 'zalo' (embedded WebContentsView shown)
    viewDashboard.classList.add('hidden');
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

// Top Actions
document.getElementById('btn-scroll-fb')?.addEventListener('click', () => {
  window.desktopAgent.triggerFbScroll();
});

document.getElementById('btn-reload')?.addEventListener('click', () => {
  if (currentTab === 'facebook' || currentTab === 'zalo') {
    window.desktopAgent.reloadTab(currentTab);
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

// Helper for Countdown Timer
function formatCountdown(sec: number): string {
  if (sec <= 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Render Sources Dropdown
function renderSourcesDropdown(sources: any[], currentIndex = 0): void {
  selectSourcesDropdown.innerHTML = '';
  if (!sources || sources.length === 0) {
    const opt = document.createElement('option');
    opt.value = '-1';
    opt.textContent = '-- Chưa có nguồn nào từ VPS --';
    selectSourcesDropdown.appendChild(opt);
    return;
  }
  sources.forEach((src, idx) => {
    const opt = document.createElement('option');
    opt.value = String(idx);
    opt.textContent = `${idx + 1}. ${src.name || 'Nhóm Facebook'}`;
    if (idx === currentIndex) opt.selected = true;
    selectSourcesDropdown.appendChild(opt);
  });
}

// Update Stats UI
function updateStatsUI(stats: any): void {
  statFbCount.textContent = (stats.facebookPostsTotal || 0).toLocaleString();
  statZaloCount.textContent = (stats.zaloMessagesTotal || 0).toLocaleString();
  statHotCount.textContent = (stats.hotLeadsTotal || 0).toLocaleString();
  statSyncedCount.textContent = (stats.syncedToVpsTotal || 0).toLocaleString();

  if (stats.debuggerAttached) {
    fbDebuggerDot.className = 'status-dot online';
    fbDebuggerText.textContent = 'FB Scanner Active';
  } else {
    fbDebuggerDot.className = 'status-dot';
    fbDebuggerText.textContent = 'FB Sẵn sàng';
  }

  if (stats.vpsConnected) {
    vpsSyncDot.className = 'status-dot online';
    vpsSyncText.textContent = 'VPS Online';
  } else {
    vpsSyncDot.className = 'status-dot';
    vpsSyncText.textContent = 'VPS Sẵn sàng';
  }

  // Update Source Rotation info
  if (stats.currentSourceName) {
    currentSourceNameEl.textContent = stats.currentSourceName;
  } else if (stats.activeSourcesTotal > 0) {
    currentSourceNameEl.textContent = 'Đang chọn nhóm...';
  } else {
    currentSourceNameEl.textContent = 'Chưa có nhóm nào trên VPS';
  }

  if (stats.currentSourceUrl) {
    currentSourceUrlEl.textContent = stats.currentSourceUrl;
    currentSourceUrlEl.href = stats.currentSourceUrl;
  } else {
    currentSourceUrlEl.textContent = 'https://facebook.com';
    currentSourceUrlEl.href = '#';
  }

  const currentIdxDisplay = stats.activeSourcesTotal > 0 ? stats.currentSourceIndex + 1 : 0;
  sourceIndexBadgeEl.textContent = `${currentIdxDisplay}/${stats.activeSourcesTotal || 0}`;
  countdownTimerEl.textContent = formatCountdown(stats.secondsUntilNextRotate || 0);

  if (toggleAutoRotateEl.checked !== !!stats.autoRotateSources) {
    toggleAutoRotateEl.checked = !!stats.autoRotateSources;
  }

  if (typeof stats.currentSourceIndex === 'number' && stats.currentSourceIndex !== currentSourceIdx) {
    currentSourceIdx = stats.currentSourceIndex;
    selectSourcesDropdown.value = String(currentSourceIdx);
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
  if (!res.success) {
    alert(`Không thể gửi lên VPS: ${res.error || 'Lỗi không xác định'}`);
  }
};

// New Lead Handler
window.desktopAgent.onNewLead((lead: any) => {
  leadsList.unshift(lead);
  if (leadsList.length > 300) leadsList.pop();
  renderTable();
});

// Stats Update Handler
window.desktopAgent.onStatsUpdate((stats: any) => {
  updateStatsUI(stats);
});

// Sources Rotation Controls
selectSourcesDropdown.addEventListener('change', () => {
  const idx = parseInt(selectSourcesDropdown.value, 10);
  if (idx >= 0) {
    currentSourceIdx = idx;
    window.desktopAgent.selectSource(idx);
  }
});

btnPrevSource.addEventListener('click', () => {
  window.desktopAgent.prevSource();
});

btnNextSource.addEventListener('click', () => {
  window.desktopAgent.nextSource();
});

btnRefreshSources.addEventListener('click', async () => {
  btnRefreshSources.textContent = 'Đang tải...';
  try {
    const srcs = await window.desktopAgent.refreshSources();
    activeSourcesList = srcs;
    renderSourcesDropdown(srcs, currentSourceIdx);
  } finally {
    btnRefreshSources.textContent = '🔄 Cập nhật từ VPS';
  }
});

toggleAutoRotateEl.addEventListener('change', () => {
  window.desktopAgent.toggleAutoRotate(toggleAutoRotateEl.checked);
});

window.desktopAgent.onSourcesUpdate((sources: any[]) => {
  activeSourcesList = sources;
  renderSourcesDropdown(sources, currentSourceIdx);
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
  (document.getElementById('setting-auto-rotate-sources') as HTMLInputElement).checked =
    s.autoRotateSources !== false;
  (document.getElementById('setting-rotate-interval') as HTMLInputElement).value = String(
    s.rotateIntervalMinutes || 3
  );
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
    autoRotateSources: (document.getElementById('setting-auto-rotate-sources') as HTMLInputElement).checked,
    rotateIntervalMinutes:
      parseInt((document.getElementById('setting-rotate-interval') as HTMLInputElement).value, 10) || 3,
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
  try {
    const sources = await window.desktopAgent.getSources();
    activeSourcesList = sources;
    renderSourcesDropdown(sources, initialStats.currentSourceIndex || 0);
  } catch (err) {
    console.warn('Failed to load initial sources:', err);
  }
});
