import { sendToBackground, bgGet, bgSave } from './lib/messaging';
import { leadToSavePayload, enrichLeadsWithServer } from './lib/leadApiClient';
import type { AutoScrollState, CollectedLead, ScanRoundResult, Settings } from './types';

const DEMAND_LABELS: Record<string, string> = {
  buy: 'Mua', sell: 'Bán', rent: 'Thuê', lease: 'Cho thuê', unknown: 'Chưa rõ'
};

const els = {
  loginPanel: document.getElementById('loginPanel')!,
  mainPanel: document.getElementById('mainPanel')!,
  apiBase: document.getElementById('apiBase') as HTMLInputElement,
  email: document.getElementById('email') as HTMLInputElement,
  password: document.getElementById('password') as HTMLInputElement,
  loginBtn: document.getElementById('loginBtn')!,
  scanBtn: document.getElementById('scanBtn')!,
  crmBtn: document.getElementById('crmBtn')!,
  status: document.getElementById('status')!,
  maxPosts: document.getElementById('maxPosts') as HTMLInputElement,
  autoScrollBtn: document.getElementById('autoScrollBtn') as HTMLButtonElement,
  stopBtn: document.getElementById('stopBtn') as HTMLButtonElement,
  saveSelectedBtn: document.getElementById('saveSelectedBtn') as HTMLButtonElement,
  saveAllBtn: document.getElementById('saveAllBtn') as HTMLButtonElement,
  clearBtn: document.getElementById('clearBtn') as HTMLButtonElement,
  reviewList: document.getElementById('reviewList')!,
  reviewCount: document.getElementById('reviewCount')!,
  siteHint: document.getElementById('siteHint')!,
  autoSectionNote: document.getElementById('autoSectionNote')!,
  dbgStorage: document.getElementById('dbgStorage')!,
  dbgVersion: document.getElementById('dbgVersion')!,
  dbgFeed: document.getElementById('dbgFeed')!,
  dbgTopFrame: document.getElementById('dbgTopFrame')!,
  dbgLoopCount: document.getElementById('dbgLoopCount')!,
  dbgVisibleBlocks: document.getElementById('dbgVisibleBlocks')!,
  dbgScannedBlocks: document.getElementById('dbgScannedBlocks')!,
  dbgPhonesFound: document.getElementById('dbgPhonesFound')!,
  dbgLeadsCreated: document.getElementById('dbgLeadsCreated')!,
  dbgDeduped: document.getElementById('dbgDeduped')!,
  dbgSkippedNoise: document.getElementById('dbgSkippedNoise')!,
  dbgSkippedNoBds: document.getElementById('dbgSkippedNoBds')!,
  dbgCurrentScrollY: document.getElementById('dbgCurrentScrollY')!,
  dbgStopReason: document.getElementById('dbgStopReason')!
};

let token = '';
let apiBase = 'http://localhost:3000';
let pollTimer: number | null = null;
let collectTabId: number | undefined;

function sendTabMessage<T>(tabId: number, message: object, timeoutMs = 4000): Promise<T> {
  return Promise.race([
    chrome.tabs.sendMessage(tabId, message) as Promise<T>,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Content script không phản hồi — hãy F5 tab Facebook.')), timeoutMs)
    )
  ]);
}

function setStatus(msg: string, type = '') {
  els.status.textContent = msg;
  els.status.className = `status ${type}`;
}

function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function refreshDebugPanel() {
  const ping = await sendToBackground({ type: 'STORAGE_PING' });
  els.dbgStorage.textContent = ping.ok && ping.storageAvailable ? 'yes' : 'no';

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    els.dbgTopFrame.textContent = 'n/a';
    return;
  }
  try {
    const contentPing = await sendTabMessage<{ isTopFrame?: boolean; version?: string; debug?: { hasFeed?: boolean; articleCount?: number; visibleBlocks?: number; blocksWithPhone?: number } }>(
      tab.id,
      { type: 'PING' },
      2000
    );
    els.dbgTopFrame.textContent = contentPing.isTopFrame ? 'yes' : 'no';
    els.dbgVersion.textContent = contentPing.version || 'old — F5 tab';
    const d = contentPing.debug;
    els.dbgFeed.textContent = d
      ? `${d.hasFeed ? 'yes' : 'no'} · units:${d.loadedUnits ?? 0} · loaded:${d.loadedBlocks ?? 0} · phone:${d.blocksWithPhone ?? 0}`
      : 'n/a';
  } catch {
    els.dbgTopFrame.textContent = 'n/a';
    els.dbgVersion.textContent = 'no script — F5';
    els.dbgFeed.textContent = 'n/a';
  }
}

async function loadSettings() {
  const data = (await bgGet<Settings>('GET_SETTINGS')) ?? {};
  token = data.token || '';
  apiBase = data.apiBase || 'http://localhost:3000';
  els.apiBase.value = apiBase;
  if (data.email) els.email.value = data.email;
  if (token) {
    els.loginPanel.classList.add('hidden');
    els.mainPanel.classList.remove('hidden');
    startStatePolling();
    refreshSitePolicy();
  }
  refreshDebugPanel().catch(() => undefined);
  showLastSaveResult();
}

async function showLastSaveResult() {
  const last = await bgGet<{ ok?: boolean; saved_count?: number; duplicate_count?: number; error?: string; at?: number }>('GET_LAST_SAVE_RESULT');
  if (!last?.at || Date.now() - last.at > 10 * 60 * 1000) return;
  if (last.ok === false) {
    setStatus(last.error || 'Lưu lead thất bại (lần trước).', 'err');
    return;
  }
  if (last.saved_count != null) {
    setStatus(
      `Lần lưu gần nhất: ${last.saved_count} mới, ${last.duplicate_count ?? 0} trùng.`,
      last.saved_count > 0 ? 'ok' : ''
    );
  }
}

async function login() {
  apiBase = els.apiBase.value.replace(/\/$/, '');
  setStatus('Đang đăng nhập...');
  try {
    const res = await fetch(`${apiBase}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: els.email.value, password: els.password.value })
    });
    const json = await res.json();
    if (!res.ok || json.status !== 'success') throw new Error(json.message || 'Login failed');
    token = json.data.token;
    await bgSave('SAVE_SETTINGS', { token, apiBase, email: els.email.value });
    els.loginPanel.classList.add('hidden');
    els.mainPanel.classList.remove('hidden');
    setStatus('Đã đăng nhập.', 'ok');
    startStatePolling();
    refreshSitePolicy();
    refreshDebugPanel().catch(() => undefined);
  } catch (err: any) {
    setStatus(err.message || 'Đăng nhập thất bại', 'err');
  }
}

async function refreshSitePolicy(tabId?: number) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const id = tabId ?? tab?.id;
  if (!id) return;

  try {
    await ensureContentScript(id);
    const policy = await sendTabMessage<any>(id, { type: 'GET_SITE_POLICY' }, 3000);
    els.siteHint.textContent = policy.manualScanHint;
    els.siteHint.className = policy.autoScrollSupported ? 'site-hint fb' : 'site-hint masked';
    const running = els.autoScrollBtn.dataset.running === '1';
    els.autoScrollBtn.disabled = !policy.autoScrollSupported || running;
    els.autoSectionNote.textContent = policy.autoScrollSupported
      ? 'Quét từng post block trong viewport — multi-lead mỗi vòng scroll.'
      : 'Trang này không hỗ trợ Auto Scroll — dùng Quét block thủ công.';
  } catch {
    els.siteHint.textContent = 'Mở tab Facebook Group rồi thử lại.';
    els.siteHint.className = 'site-hint';
  }
}

async function ensureContentScript(tabId: number): Promise<void> {
  try {
    await sendTabMessage(tabId, { type: 'PING' }, 2500);
    return;
  } catch {
    // inject
  }
  await chrome.scripting.executeScript({
    target: { tabId, frameIds: [0] },
    files: ['dist/content.js']
  });
  await sendTabMessage(tabId, { type: 'PING' }, 4000);
}

function leadToBatchSave(lead: CollectedLead) {
  return leadToSavePayload(lead);
}

async function reloadAuth() {
  const data = (await bgGet<Settings>('GET_SETTINGS')) ?? {};
  token = data.token || token;
  apiBase = data.apiBase || apiBase;
}

function renderReviewLeads(leads: CollectedLead[], skipped: AutoScrollState['skippedItems'] = []) {
  els.reviewCount.textContent = String(leads.length);
  const hasSelected = leads.some(l => l.selected !== false);
  els.saveSelectedBtn.disabled = !hasSelected;
  els.saveAllBtn.disabled = leads.length === 0;

  if (leads.length === 0 && !skipped.length) {
    els.reviewList.innerHTML = '<div class="review-empty">Chưa có lead — Quét block hoặc Auto Scroll.</div>';
    return;
  }

  const cards = leads.map(lead => {
    const demand = DEMAND_LABELS[lead.demand_type as keyof typeof DEMAND_LABELS] || lead.demand_type || '—';
    const budget = lead.budget && lead.budget > 0 ? `${lead.budget} tỷ` : '—';
    const preview = (lead.raw_content || '').slice(0, 300);
    const allPhones = lead.phones?.join(', ') || lead.phone;
    const possible = lead.possible_phones?.length ? lead.possible_phones.join(', ') : '—';
    const dupTag = lead.possibleDuplicate ? '<span class="tag warn">possible dup</span>' : '';

    return `<div class="review-card ${lead.possibleDuplicate ? 'dup' : ''}" data-key="${escapeHtml(lead.dedupKey)}">
      <div class="review-card-head">
        <input type="checkbox" class="lead-check" data-key="${escapeHtml(lead.dedupKey)}" ${lead.selected !== false ? 'checked' : ''} />
        <div style="flex:1">
          <div class="review-phone">Lead #${lead.leadIndex || '?'} · ${escapeHtml(lead.phone)} ${dupTag}</div>
          <div class="review-meta">${escapeHtml(demand)} · ${escapeHtml(lead.property_type || '—')} · ${escapeHtml(lead.location || '—')} · ${escapeHtml(budget)}</div>
          <div class="review-meta">All phones: ${escapeHtml(allPhones)} · Possible: ${escapeHtml(possible)}</div>
          <div class="review-snippet">${escapeHtml(preview)}</div>
          <div class="review-meta">block: ${escapeHtml(lead.blockId || '—')}</div>
          <div class="review-card-actions">
            <button class="btn-secondary btn-sm btn-highlight" data-block="${escapeHtml(lead.blockId || '')}">Highlight</button>
            <button class="btn-secondary btn-sm btn-scroll" data-block="${escapeHtml(lead.blockId || '')}">Scroll To</button>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');

  const skippedHtml = skipped.slice(-5).map(s =>
    `<div class="review-card"><span class="tag skip">skipped</span> ${escapeHtml(s.skippedReason)} ${s.phone ? '· ' + escapeHtml(s.phone) : ''}</div>`
  ).join('');

  els.reviewList.innerHTML = cards + skippedHtml;

  els.reviewList.querySelectorAll('.lead-check').forEach(el => {
    el.addEventListener('change', e => {
      const key = (e.target as HTMLInputElement).dataset.key!;
      const selected = (e.target as HTMLInputElement).checked;
      sendToBackground({ type: 'UPDATE_LEAD_SELECTION', payload: { dedupKey: key, selected } }).catch(() => undefined);
      els.saveSelectedBtn.disabled = !Array.from(els.reviewList.querySelectorAll('.lead-check')).some(c => (c as HTMLInputElement).checked);
    });
  });

  els.reviewList.querySelectorAll('.btn-highlight').forEach(btn => {
    btn.addEventListener('click', () => {
      const blockId = (btn as HTMLButtonElement).dataset.block;
      if (blockId) highlightBlock(blockId).catch(err => setStatus(err.message, 'err'));
    });
  });

  els.reviewList.querySelectorAll('.btn-scroll').forEach(btn => {
    btn.addEventListener('click', () => {
      const blockId = (btn as HTMLButtonElement).dataset.block;
      if (blockId) scrollToBlock(blockId).catch(err => setStatus(err.message, 'err'));
    });
  });
}

async function getActiveTabId(): Promise<number> {
  const tabId = collectTabId ?? (await bgGet<number>('GET_COLLECT_TAB_ID'));
  if (tabId) return tabId;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('Không tìm thấy tab.');
  return tab.id;
}

async function highlightBlock(blockId: string) {
  const tabId = await getActiveTabId();
  await ensureContentScript(tabId);
  await sendTabMessage(tabId, { type: 'HIGHLIGHT_BLOCK', blockId }, 3000);
}

async function scrollToBlock(blockId: string) {
  const tabId = await getActiveTabId();
  await ensureContentScript(tabId);
  await sendTabMessage(tabId, { type: 'SCROLL_TO_BLOCK', blockId }, 3000);
  window.close();
}

function updateAutoScrollUI(state: AutoScrollState | null) {
  if (!state) {
    els.dbgLoopCount.textContent = '0';
    els.dbgVisibleBlocks.textContent = '0';
    els.dbgScannedBlocks.textContent = '0';
    els.dbgPhonesFound.textContent = '0';
    els.dbgLeadsCreated.textContent = '0';
    els.dbgDeduped.textContent = '0';
    els.dbgSkippedNoise.textContent = '0';
    els.dbgSkippedNoBds.textContent = '0';
    els.dbgCurrentScrollY.textContent = '0';
    els.dbgStopReason.textContent = '—';
    return;
  }

  renderReviewLeads(state.collectedLeads, state.skippedItems);

  els.dbgLoopCount.textContent = String(state.loopCount);
  els.dbgVisibleBlocks.textContent = String(state.visibleBlocksCount);
  els.dbgScannedBlocks.textContent = String(state.scannedBlocksTotal);
  els.dbgPhonesFound.textContent = String(state.phonesFoundTotal);
  els.dbgLeadsCreated.textContent = String(state.leadsCreatedTotal);
  els.dbgDeduped.textContent = String(state.dedupedCount);
  els.dbgSkippedNoise.textContent = String(state.skippedNoiseCount);
  els.dbgSkippedNoBds.textContent = String(state.skippedNoBdsContextCount);
  els.dbgCurrentScrollY.textContent = String(state.currentScrollY);
  els.dbgStopReason.textContent = state.stopReason || (state.running ? 'running' : '—');

  if (state.message) {
    const isErr = state.message.toLowerCase().includes('lỗi') || state.stopReason === 'checkpoint/captcha';
    setStatus(state.message, state.running ? '' : isErr ? 'err' : 'ok');
  }

  els.autoScrollBtn.dataset.running = state.running ? '1' : '0';
  els.autoScrollBtn.disabled = state.running;
  els.stopBtn.disabled = !state.running;
  if (!state.running) refreshSitePolicy();
}

async function pollAutoScrollState() {
  const state = await bgGet<AutoScrollState>('GET_AUTO_SCROLL_STATE');
  updateAutoScrollUI(state);
}

function startStatePolling() {
  if (pollTimer) window.clearInterval(pollTimer);
  pollTimer = window.setInterval(() => pollAutoScrollState().catch(() => undefined), 1000);
  pollAutoScrollState().catch(() => undefined);
}

async function mergeManualScan(round: ScanRoundResult) {
  const existing = (await bgGet<AutoScrollState>('GET_AUTO_SCROLL_STATE')) ?? null;
  const base: AutoScrollState = existing || {
    running: false,
    targetPosts: 0,
    collectedLeads: [],
    skippedItems: [],
    loopCount: 0,
    currentScrollY: 0,
    previousScrollY: 0,
    visibleBlocksCount: 0,
    scannedBlocksTotal: 0,
    phonesFoundTotal: 0,
    leadsCreatedTotal: 0,
    newMergedLeads: 0,
    totalCollectedLeads: 0,
    dedupedCount: 0,
    skippedNoiseCount: 0,
    skippedNoBdsContextCount: 0,
    noNewBlockRounds: 0,
    unchangedScrollRounds: 0,
    stopReason: '',
    message: '',
    sessionId: '',
    startedAt: new Date().toISOString()
  };

  const keys = new Set(base.collectedLeads.map(l => l.dedupKey));
  let added = 0;
  for (const lead of round.leads) {
    if (keys.has(lead.dedupKey)) continue;
    keys.add(lead.dedupKey);
    base.collectedLeads.push({ ...lead, selected: true, leadIndex: base.collectedLeads.length + 1 });
    added += 1;
  }
  base.collectedLeads.forEach((l, i) => { l.leadIndex = i + 1; });
  base.skippedItems = [...base.skippedItems, ...round.skipped].slice(-200);
  base.visibleBlocksCount = round.stats.visibleBlocksCount;
  base.phonesFoundTotal += round.stats.phonesFoundTotal;
  base.leadsCreatedTotal += round.stats.leadsCreated;
  base.totalCollectedLeads = base.collectedLeads.length;
  base.message = `Quét block: ${round.stats.visibleBlocksCount} block · +${added} lead · tổng ${base.totalCollectedLeads}`;

  await bgSave('SAVE_AUTO_SCROLL_STATE', base);
  updateAutoScrollUI(base);
}

async function scanVisibleBlocks() {
  setStatus('Đang quét block trong viewport...');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    setStatus('Không tìm thấy tab.', 'err');
    return;
  }

  await ensureContentScript(tab.id);
  collectTabId = tab.id;
  await bgSave('SAVE_COLLECT_TAB_ID', tab.id);

  const round = await sendTabMessage<ScanRoundResult>(tab.id, { type: 'SCAN_VISIBLE_BLOCKS' }, 10000);

  if (round.leads.length) {
    round.leads = await enrichLeadsWithServer(round.leads);
  }

  if (round.stats.visibleBlocksCount === 0) {
    const ping = await sendTabMessage<any>(tab.id, { type: 'PING' }, 3000);
    const dbg = ping.debug;
    setStatus(
      `0 block — feed:${dbg?.hasFeed ? 'yes' : 'no'} articles:${dbg?.articleCount ?? 0}. Scroll tới feed bài đăng rồi F5.`,
      'err'
    );
  }

  await mergeManualScan(round);
  if (round.stats.visibleBlocksCount > 0) {
    setStatus(`Quét: ${round.stats.visibleBlocksCount} block, ${round.leads.length} lead.`, 'ok');
  }
}

async function saveLeads(leads: CollectedLead[]) {
  if (!leads.length) {
    setStatus('Không có lead để lưu.', 'err');
    return;
  }

  await reloadAuth();
  if (!token) {
    setStatus('Chưa đăng nhập — login lại CRM.', 'err');
    return;
  }

  const payloads = leads.map(leadToBatchSave).filter(Boolean) as Array<Record<string, unknown>>;
  if (!payloads.length) {
    setStatus('Không có lead hợp lệ (thiếu SĐT).', 'err');
    return;
  }

  setStatus(`Đang lưu ${payloads.length} lead (chạy nền)...`);
  els.saveSelectedBtn.disabled = true;
  els.saveAllBtn.disabled = true;

  try {
    await chrome.storage.session.set({
      pendingLeadSave: { leads: payloads, source: 'facebook-feed-auto' }
    });

    const res = await sendToBackground<{ saved_count: number; duplicate_count: number }>({
      type: 'RUN_LEAD_SAVE'
    });

    if (!res.ok) {
      setStatus(res.error || 'Lưu thất bại', 'err');
      return;
    }

    const saved = res.data?.saved_count ?? 0;
    const dup = res.data?.duplicate_count ?? 0;
    if (saved === 0 && dup === 0) {
      setStatus('Không lưu được lead nào — kiểm tra API URL và đăng nhập.', 'err');
    } else if (saved === 0) {
      setStatus(`${dup} lead trùng CRM — không có lead mới.`, 'err');
    } else {
      setStatus(`Đã lưu ${saved} lead mới, ${dup} trùng. Mở CRM kiểm tra.`, 'ok');
    }
  } catch (err: any) {
    setStatus(err.message || 'Lưu thất bại', 'err');
  } finally {
    const state = await bgGet<AutoScrollState>('GET_AUTO_SCROLL_STATE');
    const count = state?.collectedLeads?.length ?? 0;
    els.saveAllBtn.disabled = count === 0;
    els.saveSelectedBtn.disabled = !state?.collectedLeads?.some(l => l.selected !== false);
  }
}

async function saveSelected() {
  const state = await bgGet<AutoScrollState>('GET_AUTO_SCROLL_STATE');
  const leads = (state?.collectedLeads ?? []).filter(l => l.selected !== false);
  await saveLeads(leads);
}

async function saveAll() {
  const state = await bgGet<AutoScrollState>('GET_AUTO_SCROLL_STATE');
  await saveLeads(state?.collectedLeads ?? []);
}

async function clearResults() {
  await sendToBackground({ type: 'CLEAR_AUTO_SCROLL_STATE' });
  renderReviewLeads([]);
  setStatus('Đã xóa kết quả quét.', 'ok');
  updateAutoScrollUI(null);
}

function openCrm() {
  chrome.tabs.create({ url: `${apiBase}/admin/dashboard` });
}

async function startAutoScroll() {
  const targetPosts = Math.max(1, Math.min(500, Number(els.maxPosts.value) || 30));
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    setStatus('Không tìm thấy tab.', 'err');
    return;
  }

  els.autoScrollBtn.disabled = true;
  els.stopBtn.disabled = false;
  setStatus('Đang khởi động Auto Scroll...');

  try {
    await ensureContentScript(tab.id);

    const policy = await sendTabMessage<{ autoScrollSupported: boolean }>(tab.id, { type: 'GET_SITE_POLICY' }, 3000);
    if (!policy.autoScrollSupported) {
      setStatus('Auto Scroll chỉ dùng trên Facebook.', 'err');
      els.autoScrollBtn.disabled = false;
      els.stopBtn.disabled = true;
      return;
    }

    const ping = await sendTabMessage<{ isTopFrame?: boolean }>(tab.id, { type: 'PING' }, 5000);
    if (!ping.isTopFrame) {
      setStatus('Tab đang ở iframe — mở Facebook Group ở tab chính.', 'err');
      els.autoScrollBtn.disabled = false;
      els.stopBtn.disabled = true;
      return;
    }

    const sessionId = `sess-${Date.now()}`;
    collectTabId = tab.id;
    await bgSave('SAVE_COLLECT_TAB_ID', tab.id);
    await sendToBackground({ type: 'CLEAR_AUTO_SCROLL_STATE' });

    await sendTabMessage(tab.id, {
      type: 'START_AUTO_SCROLL',
      config: { targetPosts, apiBase, token, sessionId }
    }, 5000);

    startStatePolling();
    refreshDebugPanel().catch(() => undefined);
  } catch (err: any) {
    setStatus(err.message || 'Không kết nối được tab — F5 trang rồi thử lại.', 'err');
    els.autoScrollBtn.disabled = false;
    els.stopBtn.disabled = true;
  }
}

async function stopAutoScroll() {
  const tabId = collectTabId ?? (await bgGet<number>('GET_COLLECT_TAB_ID')) ?? undefined;
  if (tabId) {
    sendTabMessage(tabId, { type: 'STOP_AUTO_SCROLL' }, 2000).catch(() => undefined);
  }
  setStatus('Đang dừng...');
  els.stopBtn.disabled = true;
}

els.loginBtn.addEventListener('click', () => login().catch(err => setStatus(err.message, 'err')));
els.scanBtn.addEventListener('click', () => scanVisibleBlocks().catch(err => setStatus(err.message, 'err')));
els.crmBtn.addEventListener('click', openCrm);
els.autoScrollBtn.addEventListener('click', () => startAutoScroll().catch(err => setStatus(err.message, 'err')));
els.stopBtn.addEventListener('click', () => stopAutoScroll().catch(err => setStatus(err.message, 'err')));
els.saveSelectedBtn.addEventListener('click', () => saveSelected().catch(err => setStatus(err.message, 'err')));
els.saveAllBtn.addEventListener('click', () => saveAll().catch(err => setStatus(err.message, 'err')));
els.clearBtn.addEventListener('click', () => clearResults().catch(err => setStatus(err.message, 'err')));

loadSettings().then(() => refreshSitePolicy()).catch(() => undefined);
