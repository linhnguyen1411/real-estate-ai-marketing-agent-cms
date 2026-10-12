/**
 * Renderer script for Desktop Agent App Dashboard.
 */

interface DesktopAgentAPI {
  onNewLead: (cb: (lead: any) => void) => () => void;
  onStatsUpdate: (cb: (stats: any) => void) => () => void;
  onLogMessage: (cb: (log: any) => void) => () => void;
  onSourcesUpdate: (cb: (sources: any[]) => void) => () => void;
  switchTab: (tab: 'dashboard' | 'facebook' | 'zalo' | 'publisher' | 'settings') => void;
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
  setScanSpeed: (mode: 'turbo' | 'fast' | 'standard') => void;

  // Publishing & Inventory
  fetchInventory: () => Promise<{ success: boolean; properties?: any[]; error?: string }>;
  generateAiPost: (params: { propertyId?: string; propertyData?: any; tone?: string }) => Promise<{ success: boolean; data?: { facebook: string; zalo?: string }; error?: string }>;
  startPublishQueue: (config: any) => Promise<{ success: boolean; error?: string }>;
  stopPublishQueue: () => Promise<void>;
  openGroupAndPrepare: (params: { groupUrl: string; postText: string }) => Promise<{ success: boolean; message?: string; error?: string }>;
  onPublishProgress: (callback: (status: any) => void) => () => void;
}

declare global {
  interface Window {
    desktopAgent: DesktopAgentAPI;
  }
}

const leadsList: any[] = [];
let currentFilter: 'all' | 'hot' | 'supply' | 'demand' = 'all';
let currentTab: 'dashboard' | 'facebook' | 'zalo' | 'publisher' | 'settings' = 'dashboard';
let activeSourcesList: any[] = [];
let currentSourceIdx = 0;

// Publisher state
let inventoryList: any[] = [];
let selectedProperty: any = null;
const selectedGroupUrls = new Set<string>();

// Elements
const viewDashboard = document.getElementById('view-dashboard')!;
const viewPublisher = document.getElementById('view-publisher');
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

// Speed Controls
const btnSpeedTurbo = document.getElementById('btn-speed-turbo')!;
const btnSpeedFast = document.getElementById('btn-speed-fast')!;
const btnSpeedStandard = document.getElementById('btn-speed-standard')!;
const settingSpeedMode = document.getElementById('setting-speed-mode') as HTMLSelectElement;

// Tab Switching
function switchTab(tab: 'dashboard' | 'facebook' | 'zalo' | 'publisher' | 'settings'): void {
  currentTab = tab;
  document.querySelectorAll('.nav-tab').forEach((el) => {
    el.classList.toggle('active', el.getAttribute('data-tab') === tab);
  });

  if (tab === 'dashboard') {
    viewDashboard.classList.remove('hidden');
    viewPublisher?.classList.add('hidden');
    viewSettings.classList.add('hidden');
  } else if (tab === 'publisher') {
    viewDashboard.classList.add('hidden');
    viewPublisher?.classList.remove('hidden');
    viewSettings.classList.add('hidden');
    if (inventoryList.length === 0) void loadInventory();
    renderPublisherGroups();
  } else if (tab === 'settings') {
    viewDashboard.classList.add('hidden');
    viewPublisher?.classList.add('hidden');
    viewSettings.classList.remove('hidden');
  } else {
    // 'facebook' or 'zalo' (embedded WebContentsView shown)
    viewDashboard.classList.add('hidden');
    viewPublisher?.classList.add('hidden');
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

  if (stats.scanSpeedMode) {
    updateSpeedUI(stats.scanSpeedMode);
  }

  if (typeof stats.currentSourceIndex === 'number' && stats.currentSourceIndex !== currentSourceIdx) {
    currentSourceIdx = stats.currentSourceIndex;
    selectSourcesDropdown.value = String(currentSourceIdx);
  }
}

function updateSpeedUI(mode: 'turbo' | 'fast' | 'standard'): void {
  btnSpeedTurbo.classList.toggle('active', mode === 'turbo');
  btnSpeedFast.classList.toggle('active', mode === 'fast');
  btnSpeedStandard.classList.toggle('active', mode === 'standard');
  if (settingSpeedMode) settingSpeedMode.value = mode;
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

// Speed Button Listeners
btnSpeedTurbo?.addEventListener('click', () => {
  window.desktopAgent.setScanSpeed('turbo');
  updateSpeedUI('turbo');
});

btnSpeedFast?.addEventListener('click', () => {
  window.desktopAgent.setScanSpeed('fast');
  updateSpeedUI('fast');
});

btnSpeedStandard?.addEventListener('click', () => {
  window.desktopAgent.setScanSpeed('standard');
  updateSpeedUI('standard');
});

settingSpeedMode?.addEventListener('change', () => {
  const mode = settingSpeedMode.value as any;
  window.desktopAgent.setScanSpeed(mode);
  updateSpeedUI(mode);
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
    s.autoScrollIntervalSec || 2
  );
  (document.getElementById('setting-auto-rotate-sources') as HTMLInputElement).checked =
    s.autoRotateSources !== false;
  (document.getElementById('setting-rotate-interval') as HTMLInputElement).value = String(
    s.rotateIntervalMinutes || 1
  );
  if (settingSpeedMode) {
    settingSpeedMode.value = s.scanSpeedMode || 'turbo';
  }
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
      parseInt((document.getElementById('setting-scroll-interval') as HTMLInputElement).value, 10) || 2,
    autoRotateSources: (document.getElementById('setting-auto-rotate-sources') as HTMLInputElement).checked,
    rotateIntervalMinutes:
      parseInt((document.getElementById('setting-rotate-interval') as HTMLInputElement).value, 10) || 1,
    scanSpeedMode: (settingSpeedMode?.value as any) || 'turbo',
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

// ==========================================
// PUBLISHER & INVENTORY LOGIC
// ==========================================

const inventoryListContainer = document.getElementById('inventory-list-container')!;
const inventoryCountEl = document.getElementById('inventory-count')!;
const inventorySearchInput = document.getElementById('inventory-search-input') as HTMLInputElement;
const btnRefreshInventory = document.getElementById('btn-refresh-inventory')!;

const bannerPropertyName = document.getElementById('banner-property-name')!;
const bannerPropertyPrice = document.getElementById('banner-property-price')!;
const publisherToneSelect = document.getElementById('publisher-tone-select') as HTMLSelectElement;
const btnGenAiPost = document.getElementById('btn-gen-ai-post')!;
const publisherPostContent = document.getElementById('publisher-post-content') as HTMLTextAreaElement;
const charCountBadge = document.getElementById('char-count-badge')!;

const publisherGroupsGrid = document.getElementById('publisher-groups-grid')!;
const selectedGroupsCountTag = document.getElementById('selected-groups-count-tag')!;
const btnSelectAllGroups = document.getElementById('btn-select-all-groups')!;
const btnDeselectAllGroups = document.getElementById('btn-deselect-all-groups')!;
const btnRefreshPubGroups = document.getElementById('btn-refresh-pub-groups')!;

const publishIntervalSec = document.getElementById('publish-interval-sec') as HTMLInputElement;
const publishModeSelect = document.getElementById('publish-mode-select') as HTMLSelectElement;
const btnStartPublish = document.getElementById('btn-start-publish')!;
const btnStopPublish = document.getElementById('btn-stop-publish')!;
const publishStatusBox = document.getElementById('publish-status-box')!;
const publishStatusMsg = document.getElementById('publish-status-msg')!;
const publishCountdown = document.getElementById('publish-countdown')!;
const publishQueueBody = document.getElementById('publish-queue-body')!;

function formatPriceNumber(val?: number | string): string {
  if (!val) return 'Thỏa thuận';
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num) || num <= 0) return 'Thỏa thuận';
  if (num >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toFixed(2).replace(/\.00$/, '')} Tỷ`;
  }
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(0)} Triệu`;
  }
  return `${num.toLocaleString('vi-VN')} đ`;
}

async function loadInventory(): Promise<void> {
  if (!inventoryListContainer) return;
  inventoryListContainer.innerHTML = '<div class="empty-state" style="padding: 20px 10px; font-size: 12px;">Đang tải danh sách từ VPS...</div>';
  try {
    const res = await window.desktopAgent.fetchInventory();
    if (res.success && Array.isArray(res.properties)) {
      inventoryList = res.properties;
      if (inventoryCountEl) inventoryCountEl.textContent = String(inventoryList.length);
      renderInventoryList(inventoryList);
    } else {
      inventoryListContainer.innerHTML = `<div class="empty-state" style="color: #f87171; padding: 20px 10px; font-size: 12px;">Lỗi: ${res.error || 'Không thể tải giỏ hàng'}</div>`;
    }
  } catch (err: any) {
    inventoryListContainer.innerHTML = `<div class="empty-state" style="color: #f87171; padding: 20px 10px; font-size: 12px;">Lỗi kết nối VPS: ${err.message}</div>`;
  }
}

function renderInventoryList(list: any[]): void {
  if (!inventoryListContainer) return;
  inventoryListContainer.innerHTML = '';
  if (list.length === 0) {
    inventoryListContainer.innerHTML = '<div class="empty-state" style="padding: 20px 10px; font-size: 12px;">Không tìm thấy sản phẩm nào</div>';
    return;
  }

  list.forEach((item) => {
    const card = document.createElement('div');
    card.className = `property-card ${selectedProperty?.id === item.id ? 'selected' : ''}`;
    
    const code = item.property_code || item.property_code_id || 'BĐS';
    const title = item.title || item.name || 'Bất động sản không tên';
    const priceStr = formatPriceNumber(item.price);
    const areaStr = item.area ? `${item.area} m²` : '';
    const locationStr = item.location || item.address || item.district || 'Đà Nẵng';
    const statusStr = item.sale_status === 'available' ? '🟢 Còn hàng' : item.sale_status || '';

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span class="prop-badge">Mã: ${code}</span>
        <span style="font-size: 11px; color: #94a3b8;">${statusStr}</span>
      </div>
      <div class="prop-title">${title}</div>
      <div class="prop-meta">
        <span>${priceStr}</span>
        <span>${areaStr}</span>
      </div>
      <div class="prop-location">📍 ${locationStr}</div>
    `;

    card.addEventListener('click', () => {
      document.querySelectorAll('.property-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      selectInventoryItem(item);
    });

    inventoryListContainer.appendChild(card);
  });
}

function selectInventoryItem(item: any): void {
  selectedProperty = item;
  if (bannerPropertyName) {
    bannerPropertyName.textContent = `${item.property_code ? `[${item.property_code}] ` : ''}${item.title || item.name || 'BĐS'}`;
  }
  if (bannerPropertyPrice) {
    bannerPropertyPrice.textContent = formatPriceNumber(item.price);
  }
}

// Search Inventory filter
inventorySearchInput?.addEventListener('input', () => {
  const query = inventorySearchInput.value.toLowerCase().trim();
  if (!query) {
    renderInventoryList(inventoryList);
    return;
  }
  const filtered = inventoryList.filter((item) => {
    const text = `${item.title || ''} ${item.property_code || ''} ${item.location || ''} ${item.address || ''} ${item.project_name || ''}`.toLowerCase();
    return text.includes(query);
  });
  renderInventoryList(filtered);
});

btnRefreshInventory?.addEventListener('click', () => {
  void loadInventory();
});

// AI Generation Trigger
btnGenAiPost?.addEventListener('click', async () => {
  if (!selectedProperty) {
    alert('Vui lòng click chọn 1 sản phẩm từ danh sách Giỏ hàng bên trái trước!');
    return;
  }

  const tone = publisherToneSelect?.value || 'professional';
  const originalHtml = btnGenAiPost.innerHTML;
  btnGenAiPost.setAttribute('disabled', 'true');
  btnGenAiPost.innerHTML = '<span>⏳ Đang tạo tin AI...</span>';

  try {
    const res = await window.desktopAgent.generateAiPost({
      propertyId: selectedProperty.id,
      propertyData: selectedProperty,
      tone,
    });

    if (res.success && res.data?.facebook) {
      publisherPostContent.value = res.data.facebook;
      updateCharCount();
    } else {
      alert(`Không thể tạo tin đăng bằng AI: ${res.error || 'Lỗi không xác định từ VPS'}`);
    }
  } catch (err: any) {
    alert(`Lỗi kết nối máy chủ AI: ${err.message}`);
  } finally {
    btnGenAiPost.removeAttribute('disabled');
    btnGenAiPost.innerHTML = originalHtml;
  }
});

function updateCharCount(): void {
  if (charCountBadge && publisherPostContent) {
    charCountBadge.textContent = `${publisherPostContent.value.length} ký tự`;
  }
}
publisherPostContent?.addEventListener('input', updateCharCount);

// Group Selection Logic
function renderPublisherGroups(): void {
  if (!publisherGroupsGrid) return;
  publisherGroupsGrid.innerHTML = '';

  const groups = activeSourcesList.filter((s) => !s.platform || s.platform === 'facebook' || (s.url && s.url.includes('facebook')));
  if (groups.length === 0) {
    publisherGroupsGrid.innerHTML = '<div class="empty-state" style="grid-column: 1 / -1; padding: 20px; font-size: 12px;">Chưa có nhóm Facebook nào từ danh sách nguồn của VPS</div>';
    if (selectedGroupsCountTag) selectedGroupsCountTag.textContent = 'Đã chọn 0 nhóm';
    return;
  }

  // Mặc định chọn tất cả nếu chưa có selection nào
  if (selectedGroupUrls.size === 0) {
    groups.forEach((g) => {
      if (g.url) selectedGroupUrls.add(g.url);
    });
  }

  groups.forEach((g, idx) => {
    const item = document.createElement('label');
    item.className = 'group-item';

    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = selectedGroupUrls.has(g.url);

    chk.addEventListener('change', () => {
      if (chk.checked) {
        selectedGroupUrls.add(g.url);
      } else {
        selectedGroupUrls.delete(g.url);
      }
      updateSelectedGroupsBadge();
    });

    const info = document.createElement('div');
    info.style.overflow = 'hidden';
    info.style.textOverflow = 'ellipsis';
    info.style.whiteSpace = 'nowrap';
    info.innerHTML = `<strong>${g.name || `Nhóm ${idx + 1}`}</strong><br><span style="font-size: 10px; color: #94a3b8;">${g.url || ''}</span>`;

    item.appendChild(chk);
    item.appendChild(info);
    publisherGroupsGrid.appendChild(item);
  });

  updateSelectedGroupsBadge();
}

function updateSelectedGroupsBadge(): void {
  if (selectedGroupsCountTag) {
    selectedGroupsCountTag.textContent = `Đã chọn ${selectedGroupUrls.size} nhóm`;
  }
}

btnSelectAllGroups?.addEventListener('click', () => {
  activeSourcesList.forEach((g) => {
    if (g.url) selectedGroupUrls.add(g.url);
  });
  renderPublisherGroups();
});

btnDeselectAllGroups?.addEventListener('click', () => {
  selectedGroupUrls.clear();
  renderPublisherGroups();
});

btnRefreshPubGroups?.addEventListener('click', async () => {
  btnRefreshPubGroups.textContent = '...';
  try {
    const srcs = await window.desktopAgent.refreshSources();
    activeSourcesList = srcs;
    renderPublisherGroups();
  } finally {
    btnRefreshPubGroups.textContent = '🔄 Tải nguồn';
  }
});

// Publish Queue Trigger & Real-time Progress
btnStartPublish?.addEventListener('click', async () => {
  const content = publisherPostContent?.value.trim();
  if (!content) {
    alert('Vui lòng nhập hoặc gen bằng AI nội dung bài đăng trước khi bắt đầu!');
    return;
  }

  if (selectedGroupUrls.size === 0) {
    alert('Vui lòng chọn ít nhất 1 nhóm Facebook để đăng bài!');
    return;
  }

  const intervalSec = parseInt(publishIntervalSec?.value, 10) || 45;
  const mode = (publishModeSelect?.value as 'auto' | 'review') || 'auto';

  const chosenGroups = activeSourcesList
    .filter((g) => selectedGroupUrls.has(g.url))
    .map((g, idx) => ({
      id: g.id || `grp_${idx}`,
      name: g.name || `Nhóm FB ${idx + 1}`,
      url: g.url,
    }));

  const res = await window.desktopAgent.startPublishQueue({
    groups: chosenGroups,
    postContent: content,
    intervalSeconds: intervalSec,
    mode,
    propertyId: selectedProperty?.id,
  });

  if (!res.success) {
    alert(`Không thể bắt đầu: ${res.error || 'Lỗi không xác định'}`);
    return;
  }

  if (publishStatusBox) publishStatusBox.style.display = 'block';
  if (btnStartPublish) btnStartPublish.style.display = 'none';
  if (btnStopPublish) btnStopPublish.style.display = 'inline-flex';
});

btnStopPublish?.addEventListener('click', async () => {
  await window.desktopAgent.stopPublishQueue();
  if (btnStartPublish) btnStartPublish.style.display = 'inline-flex';
  if (btnStopPublish) btnStopPublish.style.display = 'none';
});

// Listener for real-time publishing status
window.desktopAgent.onPublishProgress((status: any) => {
  if (publishStatusBox) publishStatusBox.style.display = 'block';

  if (!status.isRunning) {
    if (btnStartPublish) btnStartPublish.style.display = 'inline-flex';
    if (btnStopPublish) btnStopPublish.style.display = 'none';
  } else {
    if (btnStartPublish) btnStartPublish.style.display = 'none';
    if (btnStopPublish) btnStopPublish.style.display = 'inline-flex';
  }

  if (publishStatusMsg) {
    publishStatusMsg.textContent = status.logMessage || (status.isRunning ? 'Đang tiến hành đăng bài...' : 'Đã kết thúc');
  }

  if (publishCountdown) {
    publishCountdown.textContent = status.secondsUntilNext > 0 ? `${status.secondsUntilNext}s` : '--';
  }

  if (publishQueueBody && Array.isArray(status.queue)) {
    publishQueueBody.innerHTML = '';
    status.queue.forEach((item: any, idx: number) => {
      const tr = document.createElement('tr');
      const tagClass =
        item.status === 'success'
          ? 'queue-success'
          : item.status === 'posting'
          ? 'queue-posting'
          : item.status === 'failed'
          ? 'queue-failed'
          : 'queue-pending';

      const tagText =
        item.status === 'success'
          ? '✓ Đã đăng'
          : item.status === 'posting'
          ? '⏳ Đang đăng'
          : item.status === 'failed'
          ? '✕ Thất bại'
          : 'Đang chờ';

      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td><strong>${item.groupName}</strong></td>
        <td><span class="queue-status-tag ${tagClass}">${tagText}</span></td>
        <td style="font-size: 11px; color: ${item.status === 'failed' ? '#f87171' : 'var(--text-muted)'};">${item.error || item.postedAt || '--'}</td>
      `;
      publishQueueBody.appendChild(tr);
    });
  }
});

