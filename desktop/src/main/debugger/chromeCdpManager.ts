/**
 * Chrome CDP Manager for Desktop Agent.
 * Connects to external Google Chrome running with the old profile (runtime/agent-cdp-profile)
 * on port 9222.
 * Completely eliminates Google's "Trình duyệt không an toàn" block because genuine Google Chrome is used.
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { FacebookIncomingPost } from '../../shared/types';

export interface ChromeCdpConfig {
  port: number;
  profileDir: string;
  autoLaunch: boolean;
  startUrl: string;
}

export class ChromeCdpManager {
  private config: ChromeCdpConfig;
  private onPostCaptured: (post: FacebookIncomingPost) => void;
  private onStatusChange?: (connected: boolean) => void;
  private isConnected = false;
  private ws: WebSocket | null = null;
  private nextReqId = 100;
  private pendingRequests = new Map<number, (res: any) => void>();
  private pollTimer: NodeJS.Timeout | null = null;
  private seenPosts = new Set<string>();

  constructor(
    config: ChromeCdpConfig,
    onPostCaptured: (post: FacebookIncomingPost) => void,
    onStatusChange?: (connected: boolean) => void
  ) {
    this.config = config;
    this.onPostCaptured = onPostCaptured;
    this.onStatusChange = onStatusChange;
  }

  isAttached(): boolean {
    return this.isConnected;
  }

  updateConfig(cfg: Partial<ChromeCdpConfig>): void {
    this.config = { ...this.config, ...cfg };
  }

  start(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => {
      void this.checkAndConnect();
    }, 3000);

    // Initial attempt immediately
    void this.checkAndConnect();
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.disconnect();
  }

  private disconnect(): void {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
    if (this.isConnected) {
      this.isConnected = false;
      this.onStatusChange?.(false);
    }
  }

  findChromeExecutable(): string | null {
    const custom = process.env.CHROME_PATH;
    if (custom && fs.existsSync(custom)) return custom;

    const candidates = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    ];

    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  launchChrome(): { success: boolean; error?: string } {
    const chrome = this.findChromeExecutable();
    if (!chrome) {
      return { success: false, error: 'Không tìm thấy Google Chrome trên máy (chrome.exe).' };
    }

    const resolvedProfile = path.resolve(this.config.profileDir);
    try {
      fs.mkdirSync(resolvedProfile, { recursive: true });
    } catch {
      /* ignore */
    }

    // Clean stale lock files
    const lockFiles = ['SingletonLock', 'SingletonSocket', 'SingletonCookie'];
    for (const f of lockFiles) {
      const p = path.join(resolvedProfile, f);
      if (fs.existsSync(p)) {
        try {
          fs.unlinkSync(p);
        } catch {
          /* ignore */
        }
      }
    }

    const args = [
      `--remote-debugging-port=${this.config.port}`,
      `--user-data-dir=${resolvedProfile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-sync',
      this.config.startUrl || 'https://www.facebook.com/',
    ];

    try {
      const child = spawn(chrome, args, {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      console.log(`[ChromeCDP] Spawned Chrome with profile: ${resolvedProfile} on port: ${this.config.port}`);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  private async checkAndConnect(): Promise<void> {
    const cdpUrl = `http://127.0.0.1:${this.config.port}/json/version`;
    let isCdpRunning = false;

    try {
      const res = await fetch(cdpUrl, { signal: AbortSignal.timeout(1500) });
      if (res.ok) {
        isCdpRunning = true;
      }
    } catch {
      isCdpRunning = false;
    }

    if (!isCdpRunning) {
      if (this.isConnected) {
        this.disconnect();
      }
      if (this.config.autoLaunch) {
        // Auto-launch once
        this.launchChrome();
      }
      return;
    }

    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    // Port is responding, let's query tabs
    try {
      const listRes = await fetch(`http://127.0.0.1:${this.config.port}/json`, {
        signal: AbortSignal.timeout(2000),
      });
      const tabs: Array<{ title: string; url: string; webSocketDebuggerUrl?: string }> = await listRes.json();

      // Find Facebook tab, or fallback to first page tab
      let targetTab = tabs.find((t) => t.url && t.url.includes('facebook.com') && t.webSocketDebuggerUrl);
      if (!targetTab) {
        targetTab = tabs.find((t) => t.webSocketDebuggerUrl && t.url && !t.url.startsWith('chrome-extension://'));
      }

      if (targetTab && targetTab.webSocketDebuggerUrl) {
        this.attachToWebSocket(targetTab.webSocketDebuggerUrl);
      }
    } catch (err: any) {
      console.warn('[ChromeCDP] Error querying tabs:', err?.message || err);
    }
  }

  private attachToWebSocket(wsUrl: string): void {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }

    try {
      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      ws.onopen = () => {
        console.log('[ChromeCDP] WebSocket connected to Chrome tab:', wsUrl);
        this.isConnected = true;
        this.onStatusChange?.(true);

        // Enable Network domain
        this.sendCdpCommand('Network.enable', {});
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data));
          if (data.id && this.pendingRequests.has(data.id)) {
            const resolver = this.pendingRequests.get(data.id);
            this.pendingRequests.delete(data.id);
            resolver?.(data.result);
            return;
          }

          if (data.method === 'Network.responseReceived') {
            void this.handleNetworkResponse(data.params);
          }
        } catch (err) {
          /* ignore parse errors */
        }
      };

      ws.onclose = () => {
        console.warn('[ChromeCDP] WebSocket connection closed.');
        this.isConnected = false;
        this.onStatusChange?.(false);
      };

      ws.onerror = (err) => {
        console.error('[ChromeCDP] WebSocket error:', err);
      };
    } catch (err) {
      console.error('[ChromeCDP] Failed to create WebSocket:', err);
    }
  }

  private sendCdpCommand(method: string, params: any): Promise<any> {
    return new Promise((resolve) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        resolve(null);
        return;
      }
      const id = ++this.nextReqId;
      this.pendingRequests.set(id, resolve);
      this.ws.send(JSON.stringify({ id, method, params }));

      // Timeout safety
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          resolve(null);
        }
      }, 8000);
    });
  }

  async triggerScroll(): Promise<void> {
    if (!this.isConnected) return;
    await this.sendCdpCommand('Runtime.evaluate', {
      expression: 'window.scrollBy({ top: 600, behavior: "smooth" })',
    });
    console.log('[ChromeCDP] Triggered smooth scroll on Chrome tab.');
  }

  private async handleNetworkResponse(params: any): Promise<void> {
    const url = params?.response?.url || '';
    if (!url.includes('/api/graphql/') && !url.includes('graphql')) {
      return;
    }

    const requestId = params?.requestId;
    if (!requestId) return;

    try {
      const result = await this.sendCdpCommand('Network.getResponseBody', { requestId });
      if (!result || !result.body) return;

      let body = result.body;
      if (result.base64Encoded) {
        body = Buffer.from(body, 'base64').toString('utf8');
      }

      this.parseGraphqlBody(body);
    } catch {
      /* ignore */
    }
  }

  private parseGraphqlBody(body: string): void {
    if (!body || body.length < 50) return;

    const textPattern = /"text"\s*:\s*"((?:\\.|[^"\\]){25,4000})"/g;
    let match: RegExpExecArray | null;

    while ((match = textPattern.exec(body)) !== null) {
      const rawTextJson = match[1];
      const matchIndex = match.index;

      let decodedText = '';
      try {
        decodedText = JSON.parse(`"${rawTextJson}"`);
      } catch {
        decodedText = rawTextJson.replace(/\\n/g, '\n').replace(/\\"/g, '"');
      }

      const cleanText = decodedText.trim();
      if (!this.isUsefulPost(cleanText)) {
        continue;
      }

      const { postId, permalink } = this.extractPostIdAround(body, matchIndex);
      const authorName = this.extractAuthorAround(body, matchIndex);

      const dedupeKey = postId || cleanText.slice(0, 80);
      if (this.seenPosts.has(dedupeKey)) {
        continue;
      }
      this.seenPosts.add(dedupeKey);

      if (this.seenPosts.size > 2000) {
        const first = this.seenPosts.values().next().value;
        if (first) this.seenPosts.delete(first);
      }

      this.onPostCaptured({
        externalId: postId || undefined,
        authorName: authorName || 'Facebook Member',
        contentText: cleanText,
        canonicalUrl: permalink || undefined,
        timestamp: Date.now(),
      });
    }
  }

  private isUsefulPost(text: string): boolean {
    if (text.length < 35 || text.length > 5000) return false;
    const noise = /^(https?:|Ảnh của |People |Bình luận đã|Người đóng góp|Like |Thích |Xem thêm)/i;
    if (noise.test(text)) return false;

    const reKeywords =
      /(?:tỷ|ty|triệu|bán|cần mua|tìm mua|cho thuê|cần thuê|đất|nhà|bất động sản|nam hòa xuân|hòa xuân|đà nẵng|lô|block|b2|m2|liên hệ|sđt|zalo|inbox|\d{9,11})/i;
    return reKeywords.test(text);
  }

  private extractPostIdAround(body: string, index: number): { postId: string | null; permalink: string | null } {
    const start = Math.max(0, index - 4000);
    const end = Math.min(body.length, index + 4000);
    const window = body.slice(start, end);

    const patterns = [
      /"post_id"\s*:\s*"(\d{8,})"/,
      /"legacy_story_id"\s*:\s*"(\d{8,})"/,
      /set=gm\.(\d{8,})/,
      /\/posts\/(\d{8,})/,
      /\\\/posts\\\/(\d{8,})/,
    ];

    for (const pat of patterns) {
      const m = window.match(pat);
      if (m) {
        const id = m[1];
        return {
          postId: id,
          permalink: `https://www.facebook.com/${id}`,
        };
      }
    }

    return { postId: null, permalink: null };
  }

  private extractAuthorAround(body: string, index: number): string | null {
    const start = Math.max(0, index - 2000);
    const end = Math.min(body.length, index + 2000);
    const window = body.slice(start, end);

    const authorPatterns = [
      /"actors"\s*:\s*\[\s*\{\s*"__typename"\s*:\s*"User",\s*"name"\s*:\s*"([^"\\]+)"/,
      /"author"\s*:\s*\{\s*"name"\s*:\s*"([^"\\]+)"/,
      /"name"\s*:\s*"([^"\\]{2,40})"/,
    ];

    for (const pat of authorPatterns) {
      const m = window.match(pat);
      if (m && m[1] && !m[1].startsWith('http')) {
        return m[1].trim();
      }
    }

    return null;
  }
}
