/**
 * Internal Electron webContents.debugger for Facebook GraphQL Network Interception.
 * Eliminates need for external Chrome CDP (port 9222).
 */

import type { WebContents } from 'electron';
import type { FacebookIncomingPost } from '../../shared/types';

export class FacebookGraphqlDebugger {
  private wc: WebContents;
  private attached = false;
  private onPostCaptured: (post: FacebookIncomingPost) => void;
  private seenPosts = new Set<string>();

  constructor(wc: WebContents, onPostCaptured: (post: FacebookIncomingPost) => void) {
    this.wc = wc;
    this.onPostCaptured = onPostCaptured;
  }

  isAttached(): boolean {
    return this.attached;
  }

  attach(): boolean {
    if (this.attached) return true;

    try {
      if (!this.wc.debugger.isAttached()) {
        this.wc.debugger.attach('1.3');
      }
      this.attached = true;

      this.wc.debugger.on('detach', (_event, reason) => {
        console.warn('[FB-Debugger] Detached from Facebook tab:', reason);
        this.attached = false;
      });

      this.wc.debugger.on('message', async (_event, method, params) => {
        if (method === 'Network.responseReceived') {
          await this.handleResponseReceived(params);
        }
      });

      void this.wc.debugger.sendCommand('Network.enable');
      console.log('[FB-Debugger] Successfully attached internal debugger (1.3) to Facebook tab.');
      return true;
    } catch (err: any) {
      console.error('[FB-Debugger] Failed to attach debugger:', err?.message || err);
      this.attached = false;
      return false;
    }
  }

  detach(): void {
    if (this.attached && this.wc.debugger.isAttached()) {
      try {
        this.wc.debugger.detach();
      } catch {
        /* ignore */
      }
      this.attached = false;
    }
  }

  private async handleResponseReceived(params: any): Promise<void> {
    const url = params?.response?.url || '';
    if (!url.includes('/api/graphql/') && !url.includes('graphql')) {
      return;
    }

    const requestId = params.requestId;
    if (!requestId) return;

    try {
      const result: { body: string; base64Encoded: boolean } = await this.wc.debugger.sendCommand(
        'Network.getResponseBody',
        { requestId }
      );

      let body = result.body || '';
      if (result.base64Encoded) {
        body = Buffer.from(body, 'base64').toString('utf8');
      }

      this.parseGraphqlBody(body, url);
    } catch (err: any) {
      // getResponseBody can fail if response stream was closed prematurely; ignore silently
    }
  }

  private parseGraphqlBody(body: string, _url: string): void {
    if (!body || body.length < 50) return;

    // Scan for message text patterns: "text":"..."
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

      // Extract post ID & author around match position
      const { postId, permalink } = this.extractPostIdAround(body, matchIndex);
      const authorName = this.extractAuthorAround(body, matchIndex);

      const dedupeKey = postId || cleanText.slice(0, 80);
      if (this.seenPosts.has(dedupeKey)) {
        continue;
      }
      this.seenPosts.add(dedupeKey);

      // Keep dedupe set bounded
      if (this.seenPosts.size > 2000) {
        const first = this.seenPosts.values().next().value;
        if (first) this.seenPosts.delete(first);
      }

      this.onPostCaptured({
        externalId: postId || undefined,
        authorName: authorName || 'Facebook User',
        contentText: cleanText,
        canonicalUrl: permalink || undefined,
        timestamp: Date.now(),
      });
    }
  }

  private isUsefulPost(text: string): boolean {
    if (text.length < 22 || text.length > 6000) return false;
    const noise = /^(https?:|Ảnh của |People |Bình luận đã|Người đóng góp|Like |Thích |Xem thêm)/i;
    if (noise.test(text)) return false;

    // Real estate indicator keywords (comprehensive Vietnamese slang & abbreviations)
    const reKeywords = /(?:tỷ|ty|triệu|tr|bán|cần mua|tìm mua|cho thuê|cần thuê|đất|nhà|bất động sản|bds|bđs|nam hòa xuân|hòa xuân|đà nẵng|lô|block|b2|m2|liên hệ|sđt|zalo|inbox|chính chủ|cc|mặt tiền|kiệt|đường|hướng|sổ|ngộp|hạ giá|cắt lỗ|căn hộ|chung cư|villa|biệt thự|\d{9,11})/i;
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
