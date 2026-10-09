/**
 * House & Life Desktop Agent - Main Process.
 * Runs persistent sessions for Facebook and Zalo Web,
 * intercepts GraphQL traffic via internal webContents.debugger,
 * scores leads, displays Windows Toast notifications, and syncs to VPS.
 */

import { app, BrowserWindow, WebContentsView, ipcMain, Notification, session, Menu, Tray } from 'electron';
import path from 'path';
import fs from 'fs';
import { processRawPostToLead } from './pipeline/leadScoringPipeline';
import { VpsOutboxSync } from './sync/vpsOutboxSync';
import { FacebookGraphqlDebugger } from './debugger/facebookGraphqlDebugger';
import { ChromeCdpManager } from './debugger/chromeCdpManager';
import type {
  ExtractedLeadData,
  DesktopAgentStats,
  DesktopAgentSettings,
  ZaloIncomingMessage,
  FacebookIncomingPost,
} from '../shared/types';

let mainWindow: BrowserWindow | null = null;
let fbView: WebContentsView | null = null;
let zaloView: WebContentsView | null = null;
let fbDebugger: FacebookGraphqlDebugger | null = null;
let chromeCdpManager: ChromeCdpManager | null = null;
let vpsSync: VpsOutboxSync | null = null;
let tray: Tray | null = null;

// Leads buffer (last 200 items in memory)
const recentLeads: ExtractedLeadData[] = [];

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
  autoScrollIntervalSec: 8,
  cdpPort: 9222,
  cdpProfileDir: 'runtime/agent-cdp-profile',
  cdpAutoLaunch: false,
};

let currentSettings: DesktopAgentSettings = { ...defaultSettings };

function loadSettings(): void {
  try {
    const p = getSettingsFilePath();
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      currentSettings = { ...defaultSettings, ...data };
    }
  } catch (err) {
    console.error('[Settings] Error reading settings:', err);
  }
}

function saveSettings(settings: Partial<DesktopAgentSettings>): DesktopAgentSettings {
  try {
    currentSettings = { ...currentSettings, ...settings };
    const p = getSettingsFilePath();
    fs.writeFileSync(p, JSON.stringify(currentSettings, null, 2), 'utf8');
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
  const title = `🔥 HOT LEAD BĐS (${lead.sourceType.toUpperCase()} - Điểm: ${lead.intentScore})`;
  const body = `${prefix}${price}${phone}\n${lead.rawText.slice(0, 110)}...`;

  const notif = new Notification({
    title,
    body,
    silent: !currentSettings.soundNotification,
  });

  notif.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      setActiveTab('dashboard');
    }
  });

  notif.show();
}

async function handleLeadCaptured(lead: ExtractedLeadData): Promise<void> {
  recentLeads.unshift(lead);
  if (recentLeads.length > 200) recentLeads.pop();

  if (lead.isHotLead) {
    stats.hotLeadsTotal++;
    showHotLeadNotification(lead);

    if (currentSettings.autoSyncEnabled && vpsSync) {
      const syncRes = await vpsSync.syncLeadToVps(lead);
      if (syncRes.success) {
        stats.syncedToVpsTotal++;
        stats.vpsConnected = true;
      }
    }
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('lead:new', lead);
  }
  broadcastStats();
}

function setActiveTab(tab: 'dashboard' | 'facebook' | 'zalo' | 'settings'): void {
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
    // For 'dashboard' and 'settings'
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

async function createWindow(): Promise<void> {
  loadSettings();
  vpsSync = new VpsOutboxSync(currentSettings);

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'House & Life Desktop Agent - Hệ thống quét BĐS Đa Kênh',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, '../preload/appPreload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Load controller dashboard HTML
  const rendererPath = path.join(__dirname, '../renderer/index.html');
  await mainWindow.loadFile(rendererPath);

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
  mainWindow.contentView.addChildView(fbView);

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
  mainWindow.contentView.addChildView(zaloView);

  updateViewBounds();
  setActiveTab('dashboard');

  mainWindow.on('resize', () => {
    updateViewBounds();
  });

  // Attach internal debugger to Facebook tab
  fbDebugger = new FacebookGraphqlDebugger(fbView.webContents, (post: FacebookIncomingPost) => {
    stats.facebookPostsTotal++;
    const lead = processRawPostToLead('facebook', post.groupName || 'Facebook Group', post.contentText, {
      externalId: post.externalId,
      sourceUrl: post.canonicalUrl,
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
        currentSettings.autoScrollIntervalSec || 8
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
      const lead = processRawPostToLead('facebook', post.groupName || 'Facebook Group (Chrome)', post.contentText, {
        externalId: post.externalId,
        sourceUrl: post.canonicalUrl,
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

  // Load target URLs
  void fbView.webContents.loadURL('https://www.facebook.com');
  void zaloView.webContents.loadURL('https://chat.zalo.me');

  mainWindow.on('closed', () => {
    if (chromeCdpManager) {
      chromeCdpManager.stop();
      chromeCdpManager = null;
    }
    mainWindow = null;
    fbView = null;
    zaloView = null;
  });
}

// IPC Handlers
ipcMain.on('tab:switch', (_event, tab: 'dashboard' | 'facebook' | 'zalo' | 'settings') => {
  setActiveTab(tab);
});

ipcMain.on('tab:reload', (_event, tab: 'facebook' | 'zalo') => {
  if (tab === 'facebook' && fbView) {
    fbView.webContents.reload();
  } else if (tab === 'zalo' && zaloView) {
    zaloView.webContents.reload();
  }
});

ipcMain.on('fb:trigger-scroll', () => {
  if (fbView) {
    fbView.webContents.send('fb:scroll-down');
  }
});

ipcMain.on('zalo:new-message', (_event, message: ZaloIncomingMessage) => {
  stats.zaloMessagesTotal++;
  const lead = processRawPostToLead('zalo', message.groupName, message.content, {
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
  return currentSettings;
});

ipcMain.handle('settings:save', (_event, partialSettings: Partial<DesktopAgentSettings>) => {
  const updated = saveSettings(partialSettings);
  if (chromeCdpManager) {
    chromeCdpManager.updateConfig({
      port: updated.cdpPort || 9222,
      profileDir: updated.cdpProfileDir || 'runtime/agent-cdp-profile',
      autoLaunch: updated.cdpAutoLaunch ?? true,
    });
  }
  if (fbView && updated.autoScrollFacebook !== undefined) {
    fbView.webContents.send(
      'fb:set-auto-scroll',
      updated.autoScrollFacebook,
      updated.autoScrollIntervalSec || 8
    );
  }
  return updated;
});

ipcMain.handle('chrome:launch-profile', () => {
  if (chromeCdpManager) {
    return chromeCdpManager.launchChrome();
  }
  return { success: false, error: 'Chrome CDP Manager chưa được khởi tạo' };
});

ipcMain.on('chrome:trigger-scroll', () => {
  if (chromeCdpManager) {
    void chromeCdpManager.triggerScroll();
  }
});

ipcMain.handle('lead:sync-manual', async (_event, leadId: string) => {
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
    await createWindow();

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
