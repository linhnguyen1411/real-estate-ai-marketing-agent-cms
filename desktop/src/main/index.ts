/**
 * House & Life Desktop Agent - Main Process.
 * Runs persistent sessions for Facebook and Zalo Web,
 * intercepts GraphQL traffic via internal webContents.debugger,
 * scores leads, displays Windows Toast notifications, and syncs to VPS.
 */

import { app, BrowserWindow, WebContentsView, ipcMain, Notification, session, Menu, Tray, shell, clipboard, nativeImage, safeStorage } from 'electron';
import path from 'path';
import fs from 'fs';
import { processRawPostToLead } from './pipeline/leadScoringPipeline';
import { VpsOutboxSync } from './sync/vpsOutboxSync';
import { FacebookGraphqlDebugger } from './debugger/facebookGraphqlDebugger';
import { ChromeCdpManager } from './debugger/chromeCdpManager';
import { FacebookGroupPublisher } from './publisher/facebookGroupPublisher';
import { sendLeadToTelegram, sendTelegramMessage } from './notifications/telegramNotifier';
import { AgentUpdater, APP_VERSION, type UpdateState } from './updater/agentUpdater';
import { LicenseClient } from './license/licenseClient';
import type {
  ExtractedLeadData,
  DesktopAgentStats,
  DesktopAgentSettings,
  DesktopAuthState,
  AgentCapabilities,
  ZaloIncomingMessage,
  FacebookIncomingPost,
  AgentSourceItem,
  ActiveTab,
} from '../shared/types';

let mainWindow: BrowserWindow | null = null;
let fbView: WebContentsView | null = null;
let zaloView: WebContentsView | null = null;
let fbDebugger: FacebookGraphqlDebugger | null = null;
let chromeCdpManager: ChromeCdpManager | null = null;
let vpsSync: VpsOutboxSync | null = null;
let updater: AgentUpdater | null = null;
const idleUpdateState: UpdateState = {
  currentVersion: APP_VERSION,
  latestVersion: null,
  status: 'idle',
  progressPercent: 0,
  error: '',
  notes: '',
};
let publisher: FacebookGroupPublisher | null = null;
let tray: Tray | null = null;
let licenseClient: LicenseClient | null = null;
let runtimeStarted = false;
let authNotice = '';

// Leads buffer (last 200 items in memory)
const recentLeads: ExtractedLeadData[] = [];

// Sources rotation state
let activeSources: AgentSourceItem[] = [];
let currentSourceIndex = 0;
let secondsRemaining = 45;
let rotateTicker: NodeJS.Timeout | null = null;

// Stats state
const stats: DesktopAgentStats = {
  facebookPostsTotal: 0,
  zaloMessagesTotal: 0,
  hotLeadsTotal: 0,
  syncedToVpsTotal: 0,
  debuggerAttached: false,
  chromeCdpAttached: false,
  vpsConnected: false,
  activeTab: 'dashboard',
  activeSourcesTotal: 0,
  currentSourceIndex: 0,
  currentSourceName: '',
  currentSourceUrl: '',
  autoRotateSources: true,
  secondsUntilNextRotate: 45,
  scanSpeedMode: 'turbo',
};

// Settings file path
function getSettingsFilePath(): string {
  return path.join(app.getPath('userData'), 'desktop_agent_settings.json');
}

const defaultSettings: DesktopAgentSettings = {
  vpsUrl: 'https://bdsdanang.site',
  vpsApiKeyId: '',
  vpsApiSecret: '',
  autoSyncEnabled: true,
  minHotLeadScore: 70,
  soundNotification: true,
  autoScrollFacebook: true,
  autoScrollIntervalSec: 2,
  cdpPort: 9222,
  cdpProfileDir: 'runtime/agent-cdp-profile',
  cdpAutoLaunch: false,
  autoRotateSources: true,
  rotateIntervalMinutes: 1,
  rotateIntervalSec: 45,
  scanSpeedMode: 'turbo',
  enabledSourceIds: undefined,
  telegramEnabled: false,
  telegramBotToken: '',
  telegramChatId: '',
  telegramNotifyAllDemand: false,
  autoUpdateEnabled: true,
};

function getChronologicalGroupUrl(url: string): string {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (u.pathname.includes('/groups/')) {
      if (!u.searchParams.has('sorting_setting')) {
        u.searchParams.set('sorting_setting', 'CHRONOLOGICAL');
      }
      return u.toString();
    }
  } catch {}
  return url;
}

function getEffectiveRotateIntervalSec(): number {
  if (currentSettings.rotateIntervalSec && currentSettings.rotateIntervalSec > 0) {
    return currentSettings.rotateIntervalSec;
  }
  if (currentSettings.scanSpeedMode === 'turbo') return 45;
  if (currentSettings.scanSpeedMode === 'fast') return 90;
  if (currentSettings.scanSpeedMode === 'standard') return 180;
  return (currentSettings.rotateIntervalMinutes || 1) * 60;
}

function getEffectiveScrollIntervalSec(): number {
  if (currentSettings.scanSpeedMode === 'turbo') return 2;
  if (currentSettings.scanSpeedMode === 'fast') return 3;
  if (currentSettings.scanSpeedMode === 'standard') return 5;
  return currentSettings.autoScrollIntervalSec || 2;
}

let currentSettings: DesktopAgentSettings = { ...defaultSettings };

const SECRET_PREFIX = 'enc:v1:';

/** Encrypt secrets at rest with the OS keychain when Electron supports it. */
function encryptSecret(plain: string): string {
  if (!plain) return '';
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return SECRET_PREFIX + safeStorage.encryptString(plain).toString('base64');
    }
  } catch (err) {
    console.error('[Settings] safeStorage encrypt failed:', err);
  }
  return plain;
}

function decryptSecret(stored: string): string {
  if (!stored || !stored.startsWith(SECRET_PREFIX)) return stored || '';
  try {
    return safeStorage.decryptString(Buffer.from(stored.slice(SECRET_PREFIX.length), 'base64'));
  } catch (err) {
    console.error('[Settings] safeStorage decrypt failed:', err);
    return '';
  }
}

function loadSettings(): void {
  try {
    const p = getSettingsFilePath();
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      currentSettings = { ...defaultSettings, ...data };
      currentSettings.telegramBotToken = decryptSecret(String(data.telegramBotToken || ''));
      currentSettings.vpsApiSecret = decryptSecret(String(data.vpsApiSecret || ''));
    }
  } catch (err) {
    console.error('[Settings] Error reading settings:', err);
  }
}

function getCapabilities(): AgentCapabilities | null {
  return licenseClient?.getSession().capabilities || null;
}

function isAuthenticated(): boolean {
  return Boolean(licenseClient?.hasStoredSession() && getCapabilities());
}

function userCanManageVps(): boolean {
  return Boolean(getCapabilities()?.canManageVps);
}

function sanitizeSettingsForRenderer(settings: DesktopAgentSettings): DesktopAgentSettings {
  if (userCanManageVps()) return { ...settings };
  return { ...settings, vpsUrl: '', vpsApiKeyId: '', vpsApiSecret: '' };
}

function getAuthState(): DesktopAuthState {
  const state = licenseClient?.getAuthState() || { authenticated: false };
  return { ...state, notice: authNotice || undefined };
}

function sendAuthState(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('auth:state', getAuthState());
  }
}

function denyUnauthenticated(): { success: false; error: string } {
  return { success: false, error: 'Chưa đăng nhập. Vui lòng đăng nhập để tiếp tục.' };
}

function denyPermission(permission: string): { success: false; error: string } {
  return { success: false, error: `Tài khoản của bạn không có quyền ${permission}.` };
}

/** Copies the signed-in session's server + per-device HMAC credentials into runtime settings. */
function applySessionToSettings(): void {
  if (!licenseClient) return;
  const session = licenseClient.getSession();
  const ingest = licenseClient.getIngestCredential();
  if (!session.accessToken) return;
  currentSettings.vpsUrl = licenseClient.getBaseUrl();
  // Super admins may keep a manually configured credential; everyone else always
  // signs with the credential issued for this device at activation.
  const hasManualCredential =
    userCanManageVps() && Boolean(currentSettings.vpsApiKeyId && currentSettings.vpsApiSecret);
  if (ingest && !hasManualCredential) {
    currentSettings.vpsApiKeyId = ingest.keyId;
    currentSettings.vpsApiSecret = ingest.secret;
  }
  if (vpsSync) vpsSync.updateSettings(currentSettings);
}

function saveSettings(settings: Partial<DesktopAgentSettings>): DesktopAgentSettings {
  try {
    currentSettings = { ...currentSettings, ...settings };
    const p = getSettingsFilePath();
    // VPS credentials are only persisted for super admins; agents get them from the vault.
    const persistVps = userCanManageVps();
    const onDisk = {
      ...currentSettings,
      vpsApiKeyId: persistVps ? currentSettings.vpsApiKeyId : '',
      vpsApiSecret: persistVps ? encryptSecret(currentSettings.vpsApiSecret || '') : '',
      telegramBotToken: encryptSecret(currentSettings.telegramBotToken || ''),
    };
    fs.writeFileSync(p, JSON.stringify(onDisk, null, 2), 'utf8');
    if (vpsSync) {
      vpsSync.updateSettings(currentSettings);
    }
  } catch (err) {
    console.error('[Settings] Error saving settings:', err);
  }
  return currentSettings;
}

function broadcastStats(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    stats.debuggerAttached = fbDebugger ? fbDebugger.isAttached() : false;
    stats.chromeCdpAttached = chromeCdpManager ? chromeCdpManager.isAttached() : false;
    mainWindow.webContents.send('stats:update', stats);
  }
}

function updateViewBounds(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const bounds = mainWindow.getContentBounds();
  const topBarHeight = 56;
  const contentRect = {
    x: 0,
    y: topBarHeight,
    width: Math.max(bounds.width, 300),
    height: Math.max(bounds.height - topBarHeight, 200),
  };

  if (fbView) fbView.setBounds(contentRect);
  if (zaloView) zaloView.setBounds(contentRect);
}

function showHotLeadNotification(lead: ExtractedLeadData): void {
  if (!Notification.isSupported()) return;

  const prefix = lead.classification === 'SUPPLY' ? '🟢 [BÁN/CUNG]' : lead.classification === 'DEMAND' ? '🔴 [MUA/CẦU]' : '⚪ [BĐS]';
  const price = lead.askingPrice ? ` | Giá: ${lead.askingPrice}` : '';
  const phone = lead.authorPhone ? ` | SĐT: ${lead.authorPhone}` : '';
  const sourceLine = lead.sourceUrl ? `\n🔗 Link: ${lead.sourceUrl.slice(0, 75)}` : '';
  const title = `🔥 HOT LEAD BĐS (${lead.sourceType.toUpperCase()} - Điểm: ${lead.intentScore})`;
  const body = `${prefix}${price}${phone}${sourceLine}\n${lead.rawText.slice(0, 85)}...`;

  const notif = new Notification({
    title,
    body,
    silent: !currentSettings.soundNotification,
  });

  notif.on('click', () => {
    if (lead.sourceUrl) {
      shell.openExternal(lead.sourceUrl).catch((err) => {
        console.error('[Notification] Error opening source URL:', err);
      });
    }
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      setActiveTab('dashboard');
    }
  });

  notif.show();
}

async function maybeSendTelegram(lead: ExtractedLeadData): Promise<void> {
  if (!currentSettings.telegramEnabled) return;
  const isDemand = lead.classification === 'DEMAND';
  if (!lead.isHotLead && !(currentSettings.telegramNotifyAllDemand && isDemand)) return;
  const result = await sendLeadToTelegram(
    {
      enabled: true,
      botToken: currentSettings.telegramBotToken,
      chatId: currentSettings.telegramChatId,
    },
    lead,
  );
  if (!result.ok) {
    console.warn('[Telegram] Lead notification failed:', result.error);
  }
}

async function handleLeadCaptured(lead: ExtractedLeadData): Promise<void> {
  recentLeads.unshift(lead);
  if (recentLeads.length > 200) recentLeads.pop();

  if (lead.isHotLead) {
    stats.hotLeadsTotal++;
    showHotLeadNotification(lead);
  }

  // Demand leads are the ones sales can act on; hot supply posts are kept too.
  const shouldSync = lead.classification === 'DEMAND' || lead.isHotLead;
  if (shouldSync && currentSettings.autoSyncEnabled && vpsSync) {
    const syncRes = await vpsSync.syncLeadToVps(lead);
    if (syncRes.success) {
      stats.syncedToVpsTotal++;
      stats.vpsConnected = true;
    }
  }

  void maybeSendTelegram(lead);

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('lead:new', lead);
  }
  broadcastStats();
}

function setActiveTab(tab: ActiveTab): void {
  stats.activeTab = tab;
  broadcastStats();

  if (!fbView || !zaloView) return;

  if (tab === 'facebook') {
    fbView.setVisible(true);
    zaloView.setVisible(false);
  } else if (tab === 'zalo') {
    zaloView.setVisible(true);
    fbView.setVisible(false);
  } else {
    // For 'dashboard', 'settings', and 'publisher'
    fbView.setVisible(false);
    zaloView.setVisible(false);
  }
}

async function injectSavedFacebookCookies(fbSession: Electron.Session): Promise<void> {
  const candidates = [
    path.resolve(process.cwd(), 'runtime', 'session_cookies.json'),
    path.resolve(__dirname, '../../runtime', 'session_cookies.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        const cookies: any[] = JSON.parse(fs.readFileSync(p, 'utf8'));
        for (const c of cookies) {
          try {
            await fbSession.cookies.set({
              url: 'https://www.facebook.com',
              name: c.name,
              value: c.value,
              domain: c.domain,
              path: c.path || '/',
              secure: c.secure ?? true,
              httpOnly: c.httpOnly ?? true,
              sameSite: c.sameSite === 'Strict' ? 'strict' : c.sameSite === 'Lax' ? 'lax' : 'no_restriction',
              expirationDate: c.expires && c.expires > 0 ? c.expires : undefined,
            });
          } catch {
            /* ignore individual cookie failure */
          }
        }
        console.log(`[FB-Session] Injected ${cookies.length} session cookies from old profile into app.`);
        break;
      } catch (err) {
        console.error('[FB-Session] Error injecting cookies:', err);
      }
    }
  }
}

/** Sources ticked by the user; null/undefined means "all server sources". */
function getEnabledSources(): AgentSourceItem[] {
  const ids = currentSettings.enabledSourceIds;
  if (!Array.isArray(ids)) return activeSources;
  const selected = new Set(ids);
  return activeSources.filter((source) => selected.has(source.id));
}

async function syncSourcesFromVps(): Promise<AgentSourceItem[]> {
  if (!vpsSync) return activeSources;
  try {
    const res = await vpsSync.fetchSourcesFromVps();
    if (res.success && Array.isArray(res.sources)) {
      activeSources = res.sources;
      const enabled = getEnabledSources();
      stats.activeSourcesTotal = enabled.length;
      stats.vpsConnected = true;
      console.log(
        `[Sources] Loaded ${activeSources.length} active Facebook groups from VPS (${enabled.length} ticked).`,
      );
      if (activeSources.length === 0) {
        stats.currentSourceName = '';
        stats.currentSourceUrl = '';
        stats.currentSourceIndex = 0;
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('sources:list', activeSources);
      }
      broadcastStats();
      // If we haven't navigated to any source yet, navigate to the first enabled one.
      if (!stats.currentSourceUrl && enabled.length > 0) {
        navigateToSource(0);
      }
    } else if (res.error) {
      console.warn('[Sources] Could not load sources from VPS:', res.error);
    }
  } catch (err) {
    console.error('[Sources] Error syncing sources:', err);
  }
  return activeSources;
}

function navigateToSource(index: number): void {
  const sources = getEnabledSources();
  if (!sources.length) {
    stats.currentSourceIndex = 0;
    stats.currentSourceName = '';
    stats.currentSourceUrl = '';
    broadcastStats();
    return;
  }
  const safeIdx = Math.max(0, Math.min(index, sources.length - 1));
  currentSourceIndex = safeIdx;
  const source = sources[safeIdx];
  const targetUrl = getChronologicalGroupUrl(source.url);

  stats.currentSourceIndex = safeIdx;
  stats.currentSourceName = source.name;
  stats.currentSourceUrl = targetUrl;
  stats.activeSourcesTotal = sources.length;
  secondsRemaining = getEffectiveRotateIntervalSec();
  stats.secondsUntilNextRotate = secondsRemaining;
  broadcastStats();

  console.log(`[SourceRotator] Switching to source [${safeIdx + 1}/${sources.length}]: ${source.name} (${targetUrl})`);

  if (fbView && !fbView.webContents.isDestroyed()) {
    void fbView.webContents.loadURL(targetUrl);
  }
  if (chromeCdpManager && chromeCdpManager.isAttached()) {
    void chromeCdpManager.navigate(targetUrl);
  }
}

function startSourceRotationLoop(): void {
  if (rotateTicker) clearInterval(rotateTicker);
  rotateTicker = setInterval(() => {
    const sources = getEnabledSources();
    if (!currentSettings.autoRotateSources || sources.length <= 1) {
      return;
    }
    secondsRemaining--;
    stats.secondsUntilNextRotate = Math.max(0, secondsRemaining);

    // Broadcast every 5 seconds or when reaching 0
    if (secondsRemaining % 5 === 0 || secondsRemaining <= 0) {
      broadcastStats();
    }

    if (secondsRemaining <= 0) {
      const nextIdx = (currentSourceIndex + 1) % sources.length;
      navigateToSource(nextIdx);
    }
  }, 1000);
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'House & Life Desktop Agent - Hệ thống quét BĐS Đa Kênh',
    backgroundColor: '#0f172a',
    icon: path.join(__dirname, '../renderer/assets/logo_hl.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/appPreload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Load controller dashboard HTML
  const rendererPath = path.join(__dirname, '../renderer/index.html');
  await mainWindow.loadFile(rendererPath);

  mainWindow.on('closed', () => {
    stopAgentRuntime();
    mainWindow = null;
  });

  sendAuthState();
}

async function startAgentRuntime(): Promise<void> {
  const win = mainWindow;
  if (!win || win.isDestroyed() || runtimeStarted) return;
  if (!getCapabilities()?.canScan) return;

  runtimeStarted = true;
  vpsSync = new VpsOutboxSync(currentSettings);
  applySessionToSettings();

  // Configure persistent partitions
  const fbSession = session.fromPartition('persist:facebook_agent');
  fbSession.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
  );

  // Inject authenticated cookies from old profile if available
  await injectSavedFacebookCookies(fbSession);

  const zaloSession = session.fromPartition('persist:zalo_agent');
  zaloSession.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
  );

  // Initialize Facebook WebContentsView
  fbView = new WebContentsView({
    webPreferences: {
      partition: 'persist:facebook_agent',
      preload: path.join(__dirname, '../preload/facebookPreload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.contentView.addChildView(fbView);

  // Handle OAuth popups safely inside the app without triggering Google security block
  fbView.webContents.setWindowOpenHandler(() => {
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        width: 600,
        height: 720,
        autoHideMenuBar: true,
        webPreferences: {
          partition: 'persist:facebook_agent',
          contextIsolation: true,
          nodeIntegration: false,
        },
      },
    };
  });

  fbView.webContents.on('did-create-window', (childWin) => {
    childWin.webContents.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
    );
  });

  // Temporarily detach debugger during Google OAuth navigation to prevent detection
  fbView.webContents.on('will-navigate', (_event, url) => {
    if (url.includes('accounts.google.com')) {
      if (fbDebugger && fbDebugger.isAttached()) {
        fbDebugger.detach();
        stats.debuggerAttached = false;
        broadcastStats();
      }
    }
  });

  fbView.webContents.on('did-navigate', (_event, url) => {
    if (url.includes('facebook.com')) {
      if (fbDebugger && !fbDebugger.isAttached()) {
        fbDebugger.attach();
        stats.debuggerAttached = fbDebugger.isAttached();
        broadcastStats();
      }
    }
  });

  // Initialize Zalo WebContentsView
  zaloView = new WebContentsView({
    webPreferences: {
      partition: 'persist:zalo_agent',
      preload: path.join(__dirname, '../preload/zaloPreload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.contentView.addChildView(zaloView);

  updateViewBounds();
  setActiveTab('dashboard');

  win.on('resize', () => {
    updateViewBounds();
  });

  // Attach internal debugger to Facebook tab
  fbDebugger = new FacebookGraphqlDebugger(fbView.webContents, (post: FacebookIncomingPost) => {
    stats.facebookPostsTotal++;
    const groupName = post.groupName || stats.currentSourceName || 'Facebook Group';
    const sourceUrl = post.canonicalUrl || stats.currentSourceUrl || '';
    const lead = processRawPostToLead('facebook', groupName, post.contentText, {
      externalId: post.externalId,
      sourceUrl,
      authorName: post.authorName,
      timestamp: post.timestamp,
    });
    void handleLeadCaptured(lead);
  });

  fbView.webContents.on('did-finish-load', () => {
    console.log('[FB] Tab loaded. Attaching debugger...');
    if (fbDebugger) {
      fbDebugger.attach();
      stats.debuggerAttached = fbDebugger.isAttached();
      broadcastStats();
    }
    // Set auto scroll if configured
    if (currentSettings.autoScrollFacebook) {
      fbView?.webContents.send(
        'fb:set-auto-scroll',
        true,
        getEffectiveScrollIntervalSec()
      );
    }
  });

  // Initialize Chrome CDP Manager (External Google Chrome with old profile)
  chromeCdpManager = new ChromeCdpManager(
    {
      port: currentSettings.cdpPort || 9222,
      profileDir: currentSettings.cdpProfileDir || 'runtime/agent-cdp-profile',
      autoLaunch: currentSettings.cdpAutoLaunch ?? true,
      startUrl: 'https://www.facebook.com/',
    },
    (post: FacebookIncomingPost) => {
      stats.facebookPostsTotal++;
      const groupName = post.groupName || stats.currentSourceName || 'Facebook Group (Chrome)';
      const sourceUrl = post.canonicalUrl || stats.currentSourceUrl || '';
      const lead = processRawPostToLead('facebook', groupName, post.contentText, {
        externalId: post.externalId,
        sourceUrl,
        authorName: post.authorName,
        timestamp: post.timestamp,
      });
      void handleLeadCaptured(lead);
    },
    (connected: boolean) => {
      stats.chromeCdpAttached = connected;
      broadcastStats();
    }
  );
  chromeCdpManager.start();

  // Initialize Facebook Group Publisher
  publisher = new FacebookGroupPublisher(
    () => fbView,
    (tab) => setActiveTab(tab)
  );
  publisher.setOnProgress((progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('publisher:progress', progress);
    }
  });

  // Load target URLs
  void fbView.webContents.loadURL('https://www.facebook.com');
  void zaloView.webContents.loadURL('https://chat.zalo.me');

  // Load Facebook sources from VPS and start rotation loop
  void syncSourcesFromVps();
  startSourceRotationLoop();

  if (!updater) {
    updater = new AgentUpdater({
      getVpsUrl: () => currentSettings.vpsUrl,
      isAutoEnabled: () => currentSettings.autoUpdateEnabled !== false,
      onState: (state: UpdateState) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('update:state', state);
        }
      },
    });
    console.log(`[Agent] Desktop Agent version ${APP_VERSION} — auto-update enabled.`);
  }
  updater.start();
}

function stopAgentRuntime(): void {
  runtimeStarted = false;

  if (rotateTicker) {
    clearInterval(rotateTicker);
    rotateTicker = null;
  }
  if (fbDebugger) {
    fbDebugger.detach();
    fbDebugger = null;
  }
  if (chromeCdpManager) {
    chromeCdpManager.stop();
    chromeCdpManager = null;
  }
  if (publisher) {
    publisher.stopQueue();
    publisher = null;
  }
  updater?.stop();

  if (mainWindow && !mainWindow.isDestroyed()) {
    for (const view of [fbView, zaloView]) {
      if (!view) continue;
      try {
        mainWindow.contentView.removeChildView(view);
      } catch {
        /* already detached */
      }
      try {
        view.webContents.close();
      } catch {
        /* already closed */
      }
    }
  }
  fbView = null;
  zaloView = null;

  activeSources = [];
  currentSourceIndex = 0;
  secondsRemaining = getEffectiveRotateIntervalSec();
  stats.activeSourcesTotal = 0;
  stats.currentSourceIndex = 0;
  stats.currentSourceName = '';
  stats.currentSourceUrl = '';
  stats.secondsUntilNextRotate = secondsRemaining;
  stats.debuggerAttached = false;
  stats.chromeCdpAttached = false;
  stats.vpsConnected = false;
  vpsSync = null;
}

function clearRuntimeCredentials(): void {
  currentSettings.vpsApiKeyId = '';
  currentSettings.vpsApiSecret = '';
}

function lockSession(message: string): void {
  authNotice = message;
  stopAgentRuntime();
  clearRuntimeCredentials();
  licenseClient?.logout();
  broadcastStats();
  sendAuthState();
}

async function establishSession(restored: boolean): Promise<DesktopAuthState> {
  if (!licenseClient) return { authenticated: false };
  applySessionToSettings();

  if (restored) {
    // Cached vault: confirm with the server (falls back to 48h offline grace).
    const result = await licenseClient.sendHeartbeat();
    if (!result.valid) {
      if (!result.offlineMode) {
        lockSession(result.error || 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.');
        return getAuthState();
      }
      console.warn('[Auth] Offline mode:', result.error || 'server unreachable');
    }
  }

  applySessionToSettings();
  const state = getAuthState();
  if (!state.authenticated) {
    sendAuthState();
    return state;
  }

  authNotice = '';
  sendAuthState();
  await startAgentRuntime();
  broadcastStats();
  return getAuthState();
}

// IPC Handlers
ipcMain.handle('auth:get-state', () => getAuthState());

ipcMain.handle('auth:login', async (_event, payload: { key?: string; remember?: boolean }) => {
  if (!licenseClient) {
    return { success: false, message: 'Ứng dụng chưa sẵn sàng, vui lòng thử lại.' };
  }
  const result = await licenseClient.activate(String(payload?.key || ''), Boolean(payload?.remember));
  if (!result.success) return result;

  authNotice = '';
  applySessionToSettings();
  sendAuthState();
  await startAgentRuntime();
  broadcastStats();
  return { ...result, state: getAuthState() };
});

ipcMain.handle('auth:logout', () => {
  lockSession('Bạn đã đăng xuất khỏi Desktop Agent.');
  return { success: true };
});

ipcMain.on('tab:switch', (_event, tab: ActiveTab) => {
  if (!isAuthenticated()) return;
  setActiveTab(tab);
});

ipcMain.on('tab:reload', (_event, tab: 'facebook' | 'zalo') => {
  if (!isAuthenticated()) return;
  if (tab === 'facebook' && fbView) {
    fbView.webContents.reload();
  } else if (tab === 'zalo' && zaloView) {
    zaloView.webContents.reload();
  }
});

ipcMain.on('fb:trigger-scroll', () => {
  if (!isAuthenticated()) return;
  if (fbView) {
    fbView.webContents.send('fb:scroll-down');
  }
});

ipcMain.on('url:open-external', (_event, url: string) => {
  if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
    shell.openExternal(url).catch((err) => {
      console.error('[OpenExternal] Error opening url:', url, err);
    });
  }
});

ipcMain.on('zalo:new-message', (_event, message: ZaloIncomingMessage) => {
  if (!isAuthenticated()) return;
  stats.zaloMessagesTotal++;
  const lead = processRawPostToLead('zalo', message.groupName, message.content, {
    sourceUrl: 'https://chat.zalo.me',
    senderPhone: message.senderPhone,
    authorName: message.senderName,
  });
  void handleLeadCaptured(lead);
});

ipcMain.handle('stats:get', () => {
  stats.debuggerAttached = fbDebugger ? fbDebugger.isAttached() : false;
  return stats;
});

ipcMain.handle('settings:get', () => {
  return sanitizeSettingsForRenderer(currentSettings);
});

ipcMain.on('fb:dom-post-captured', (_event, post: { authorName?: string; contentText: string; canonicalUrl?: string; timestamp: number }) => {
  if (!isAuthenticated()) return;
  stats.facebookPostsTotal++;
  const groupName = stats.currentSourceName || 'Facebook Group';
  const sourceUrl = post.canonicalUrl || stats.currentSourceUrl || '';
  const lead = processRawPostToLead('facebook', groupName, post.contentText, {
    sourceUrl,
    authorName: post.authorName,
    timestamp: post.timestamp,
  });
  void handleLeadCaptured(lead);
});

ipcMain.on('speed:set', (_event, mode: 'turbo' | 'fast' | 'standard') => {
  if (!isAuthenticated()) return;
  currentSettings.scanSpeedMode = mode;
  stats.scanSpeedMode = mode;
  if (mode === 'turbo') {
    currentSettings.rotateIntervalSec = 45;
    currentSettings.autoScrollIntervalSec = 2;
  } else if (mode === 'fast') {
    currentSettings.rotateIntervalSec = 90;
    currentSettings.autoScrollIntervalSec = 3;
  } else {
    currentSettings.rotateIntervalSec = 180;
    currentSettings.autoScrollIntervalSec = 5;
  }
  saveSettings(currentSettings);
  secondsRemaining = getEffectiveRotateIntervalSec();
  stats.secondsUntilNextRotate = secondsRemaining;

  if (fbView) {
    fbView.webContents.send('fb:set-auto-scroll', true, getEffectiveScrollIntervalSec());
  }
  if (chromeCdpManager) {
    chromeCdpManager.setAutoScrollInterval(getEffectiveScrollIntervalSec());
  }
  broadcastStats();
});

ipcMain.handle('settings:save', (_event, partialSettings: Partial<DesktopAgentSettings>) => {
  if (!isAuthenticated()) return sanitizeSettingsForRenderer(currentSettings);

  const safeSettings: Partial<DesktopAgentSettings> = { ...partialSettings };
  if (!userCanManageVps()) {
    // Agent accounts never edit the VPS connection; credentials come from the license session.
    delete safeSettings.vpsUrl;
    delete safeSettings.vpsApiKeyId;
    delete safeSettings.vpsApiSecret;
  } else if (typeof safeSettings.vpsUrl === 'string' && safeSettings.vpsUrl.trim()) {
    licenseClient?.setBaseUrl(safeSettings.vpsUrl.trim());
    safeSettings.vpsUrl = licenseClient?.getBaseUrl() || safeSettings.vpsUrl;
  }

  const updated = saveSettings(safeSettings);
  if (partialSettings.autoRotateSources !== undefined) {
    stats.autoRotateSources = updated.autoRotateSources;
  }
  if (partialSettings.scanSpeedMode) {
    stats.scanSpeedMode = updated.scanSpeedMode || 'turbo';
    secondsRemaining = getEffectiveRotateIntervalSec();
    stats.secondsUntilNextRotate = secondsRemaining;
  }
  if (partialSettings.enabledSourceIds !== undefined) {
    stats.activeSourcesTotal = getEnabledSources().length;
  }
  if (chromeCdpManager) {
    chromeCdpManager.updateConfig({
      port: updated.cdpPort || 9222,
      profileDir: updated.cdpProfileDir || 'runtime/agent-cdp-profile',
      autoLaunch: updated.cdpAutoLaunch ?? true,
    });
    chromeCdpManager.setAutoScrollInterval(getEffectiveScrollIntervalSec());
  }
  if (fbView && updated.autoScrollFacebook !== undefined) {
    fbView.webContents.send(
      'fb:set-auto-scroll',
      updated.autoScrollFacebook,
      getEffectiveScrollIntervalSec()
    );
  }
  return updated;
});

ipcMain.handle('chrome:launch-profile', () => {
  if (!isAuthenticated()) return denyUnauthenticated();
  if (chromeCdpManager) {
    return chromeCdpManager.launchChrome();
  }
  return { success: false, error: 'Chrome CDP Manager chưa được khởi tạo' };
});

ipcMain.on('chrome:trigger-scroll', () => {
  if (!isAuthenticated()) return;
  if (chromeCdpManager) {
    void chromeCdpManager.triggerScroll();
  }
});

ipcMain.handle('lead:sync-manual', async (_event, leadId: string) => {
  if (!isAuthenticated()) return denyUnauthenticated();
  const lead = recentLeads.find((l) => l.id === leadId);
  if (!lead) return { success: false, error: 'Lead not found in cache' };
  if (!vpsSync) return { success: false, error: 'VPS Sync not initialized' };

  const res = await vpsSync.syncLeadToVps(lead);
  if (res.success) {
    stats.syncedToVpsTotal++;
    broadcastStats();
  }
  return res;
});

// Sources Rotation IPC Handlers
ipcMain.handle('sources:get', () => (isAuthenticated() ? activeSources : []));

ipcMain.handle('sources:refresh', async () => {
  if (!isAuthenticated()) return [];
  return await syncSourcesFromVps();
});

ipcMain.on('sources:select', (_event, index: number) => {
  if (!isAuthenticated()) return;
  navigateToSource(index);
});

ipcMain.on('sources:next', () => {
  if (!isAuthenticated()) return;
  const sources = getEnabledSources();
  if (sources.length) {
    navigateToSource((currentSourceIndex + 1) % sources.length);
  }
});

ipcMain.on('sources:prev', () => {
  if (!isAuthenticated()) return;
  const sources = getEnabledSources();
  if (sources.length) {
    navigateToSource((currentSourceIndex - 1 + sources.length) % sources.length);
  }
});

ipcMain.handle('sources:set-enabled', (_event, ids: string[]) => {
  if (!isAuthenticated()) return { enabledSourceIds: [], enabledCount: 0 };
  const unique = Array.from(new Set((ids || []).map(String)));
  currentSettings.enabledSourceIds = unique;
  saveSettings({ enabledSourceIds: unique });
  const enabled = getEnabledSources();
  stats.activeSourcesTotal = enabled.length;
  if (unique.length === 0) {
    stats.currentSourceName = '';
    stats.currentSourceUrl = '';
    stats.currentSourceIndex = 0;
  } else if (currentSourceIndex >= enabled.length) {
    currentSourceIndex = 0;
  }
  // Do not interrupt the page the user is watching; only boot the first source.
  if (!stats.currentSourceUrl && enabled.length > 0) {
    navigateToSource(0);
  } else {
    broadcastStats();
  }
  return { enabledSourceIds: unique, enabledCount: enabled.length };
});

ipcMain.handle('telegram:test', async () => {
  if (!isAuthenticated()) return denyUnauthenticated();
  if (!getCapabilities()?.canUseNotifications) return denyPermission('dùng thông báo Telegram');
  const result = await sendTelegramMessage(
    {
      enabled: true,
      botToken: currentSettings.telegramBotToken,
      chatId: currentSettings.telegramChatId,
    },
    '✅ <b>House &amp; Life Desktop Agent</b>\nKênh Telegram đã kết nối thành công. Bạn sẽ nhận lead BĐS tại đây.',
  );
  return result;
});

ipcMain.handle('update:get-state', () => (updater ? updater.getState() : { ...idleUpdateState }));

ipcMain.handle('update:check', async () => {
  if (updater) await updater.downloadForManualInstall();
});

ipcMain.on('update:install', () => {
  void updater?.installNow().catch((err) => {
    console.error('[Updater] Manual install failed:', err);
  });
});

ipcMain.on('sources:toggle-rotate', (_event, enabled: boolean) => {
  if (!isAuthenticated()) return;
  currentSettings.autoRotateSources = enabled;
  stats.autoRotateSources = enabled;
  saveSettings({ autoRotateSources: enabled });
  broadcastStats();
});

// Publisher & Inventory Handlers
ipcMain.handle('inventory:fetch', async () => {
  if (!isAuthenticated()) return denyUnauthenticated();
  if (!getCapabilities()?.canPublish) return denyPermission('đăng bài / xem giỏ hàng');
  if (!vpsSync) return { success: false, error: 'VPS Sync chưa được kết nối' };
  return vpsSync.fetchPropertiesFromVps();
});

ipcMain.handle('publisher:generate-ai', async (_e, params) => {
  if (!isAuthenticated()) return denyUnauthenticated();
  if (!getCapabilities()?.canPublish) return denyPermission('tạo bài đăng bằng AI');
  if (!vpsSync) return { success: false, error: 'VPS Sync chưa được kết nối' };
  return vpsSync.generatePostFromVps(params);
});

ipcMain.handle('publisher:start-queue', async (_e, config) => {
  if (!isAuthenticated()) return denyUnauthenticated();
  if (!getCapabilities()?.canPublish) return denyPermission('đăng bài');
  if (!publisher) return { success: false, error: 'Bộ đăng bài chưa sẵn sàng' };
  return publisher.startQueue(config);
});

ipcMain.handle('publisher:stop-queue', async () => {
  if (!isAuthenticated()) return denyUnauthenticated();
  if (publisher) publisher.stopQueue();
  return { success: true };
});

ipcMain.handle('publisher:open-group-prepare', async (_e, { groupUrl, postText, imageUrls }) => {
  if (!isAuthenticated()) return denyUnauthenticated();
  if (!getCapabilities()?.canPublish) return denyPermission('đăng bài');
  if (!publisher) return { success: false, error: 'Bộ đăng bài chưa sẵn sàng' };
  return publisher.openGroupAndPrepare(groupUrl, postText, imageUrls);
});

ipcMain.handle('publisher:copy-image', async (_e, imageUrl: string) => {
  if (!isAuthenticated()) return denyUnauthenticated();
  if (!getCapabilities()?.canPublish) return denyPermission('đăng bài');
  try {
    if (!imageUrl) return { success: false, error: 'URL ảnh trống' };
    let buffer: Buffer | null = null;
    if (imageUrl.startsWith('data:image')) {
      const base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, '');
      buffer = Buffer.from(base64Data, 'base64');
    } else {
      const res = await fetch(imageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) return { success: false, error: `Lỗi tải ảnh (${res.status})` };
      const arr = await res.arrayBuffer();
      buffer = Buffer.from(arr);
    }
    if (buffer) {
      const img = nativeImage.createFromBuffer(buffer);
      (clipboard as any).writeImage(img);
      return { success: true };
    }
    return { success: false, error: 'Không thể tạo hình ảnh từ dữ liệu' };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('publisher:download-images', async (_e, imageUrls: string[]) => {
  if (!isAuthenticated()) return denyUnauthenticated();
  if (!getCapabilities()?.canPublish) return denyPermission('tải ảnh đăng bài');
  if (!publisher) return { success: false, error: 'Bộ đăng bài chưa sẵn sàng' };
  try {
    const downloaded = await publisher.downloadImages(imageUrls);
    if (downloaded.length > 0) {
      const dir = path.dirname(downloaded[0]);
      await shell.openPath(dir);
      return { success: true, count: downloaded.length, folderPath: dir };
    }
    return { success: false, error: 'Không có ảnh nào được tải thành công' };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// App Lifecycle
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');

  app.whenReady().then(async () => {
    // Optional application menu cleanup
    Menu.setApplicationMenu(null);
    loadSettings();

    // AGENT_VPS_URL lets QA/self-hosted builds point at a non-production server.
    // Packaged builds default to production; dev builds default to the local CMS
    // so keys created in the local database can be activated.
    const envVpsUrl = String(process.env.AGENT_VPS_URL || '').trim();
    const storedVpsUrl = String(currentSettings.vpsUrl || '').trim();
    const hasCustomStoredUrl = Boolean(storedVpsUrl) && storedVpsUrl !== defaultSettings.vpsUrl;
    const initialVpsUrl =
      envVpsUrl
      || (hasCustomStoredUrl ? storedVpsUrl : '')
      || (app.isPackaged ? defaultSettings.vpsUrl : 'http://localhost:3000');
    licenseClient = new LicenseClient(initialVpsUrl);
    licenseClient.setBaseUrl(initialVpsUrl);
    licenseClient.onSessionInvalid = (message) => lockSession(message);
    licenseClient.onSessionUpdated = () => {
      applySessionToSettings();
      sendAuthState();
    };

    await createWindow();

    if (licenseClient.hasStoredSession()) {
      await establishSession(true);
    } else {
      sendAuthState();
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void createWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
