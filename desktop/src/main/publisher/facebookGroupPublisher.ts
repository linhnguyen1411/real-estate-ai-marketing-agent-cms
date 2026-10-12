/**
 * Facebook Group Auto-Publisher Engine for Desktop Agent App.
 * Handles DOM injection into Facebook Group composer, scheduling, and anti-checkpoint queue.
 */

import { WebContentsView } from 'electron';
import type { PublishQueueItem, PublishSessionConfig } from '../../shared/types';

export class FacebookGroupPublisher {
  private isRunning: boolean = false;
  private currentQueue: PublishQueueItem[] = [];
  private activeConfig: PublishSessionConfig | null = null;
  private timer: NodeJS.Timeout | null = null;
  private onProgressCallback?: (status: {
    isRunning: boolean;
    queue: PublishQueueItem[];
    currentIdx: number;
    secondsUntilNext: number;
    activeGroupUrl?: string;
    logMessage?: string;
  }) => void;

  constructor(
    private getFbView: () => WebContentsView | any,
    private switchTabCallback: (tab: 'facebook' | 'publisher') => void
  ) {}

  setOnProgress(
    cb: (status: {
      isRunning: boolean;
      queue: PublishQueueItem[];
      currentIdx: number;
      secondsUntilNext: number;
      activeGroupUrl?: string;
      logMessage?: string;
    }) => void
  ): void {
    this.onProgressCallback = cb;
  }

  getQueue(): PublishQueueItem[] {
    return this.currentQueue;
  }

  isSessionActive(): boolean {
    return this.isRunning;
  }

  startQueue(config: PublishSessionConfig): { success: boolean; error?: string } {
    if (this.isRunning) {
      return { success: false, error: 'Tiến trình đăng bài đang chạy dở.' };
    }
    if (!config.groups.length) {
      return { success: false, error: 'Chưa chọn nhóm nào để đăng.' };
    }
    if (!config.postContent.trim()) {
      return { success: false, error: 'Nội dung bài đăng đang trống.' };
    }

    this.activeConfig = config;
    this.currentQueue = config.groups.map((g, idx) => ({
      id: `pub_${Date.now()}_${idx}`,
      groupId: g.id,
      groupName: g.name,
      groupUrl: g.url,
      status: 'pending',
    }));

    this.isRunning = true;
    this.processNext(0);
    return { success: true };
  }

  stopQueue(): void {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.broadcast(0, 0, undefined, 'Đã dừng tiến trình đăng bài theo yêu cầu.');
  }

  private broadcast(currentIdx: number, secondsUntilNext: number, activeGroupUrl?: string, logMessage?: string): void {
    this.onProgressCallback?.({
      isRunning: this.isRunning,
      queue: this.currentQueue,
      currentIdx,
      secondsUntilNext,
      activeGroupUrl,
      logMessage,
    });
  }

  private async processNext(index: number): Promise<void> {
    if (!this.isRunning || !this.activeConfig) return;

    if (index >= this.currentQueue.length) {
      this.isRunning = false;
      this.broadcast(index, 0, undefined, '🎉 Đã hoàn thành toàn bộ danh sách đăng bài!');
      return;
    }

    const item = this.currentQueue[index];
    item.status = 'posting';
    this.broadcast(index, 0, item.groupUrl, `Đang xử lý nhóm [${index + 1}/${this.currentQueue.length}]: ${item.groupName}...`);

    const result = await this.publishSingleGroup(item.groupUrl, this.activeConfig.postContent, this.activeConfig.mode === 'auto');

    if (result.success) {
      item.status = 'success';
      item.message = result.message || 'Thành công';
      item.postedAt = Date.now();
      this.broadcast(index, 0, item.groupUrl, `✅ Nhóm "${item.groupName}": ${item.message}`);
    } else {
      item.status = 'failed';
      item.message = result.error || 'Thất bại';
      this.broadcast(index, 0, item.groupUrl, `❌ Nhóm "${item.groupName}": ${item.message}`);
    }

    if (!this.isRunning) return;

    const nextIndex = index + 1;
    if (nextIndex < this.currentQueue.length) {
      let secondsLeft = Math.max(10, this.activeConfig.intervalSeconds || 45);
      const countdownInterval = setInterval(() => {
        if (!this.isRunning) {
          clearInterval(countdownInterval);
          return;
        }
        secondsLeft--;
        this.broadcast(nextIndex, Math.max(0, secondsLeft), item.groupUrl, `Chờ ${secondsLeft}s trước khi chuyển sang nhóm tiếp theo để an toàn tài khoản...`);
        if (secondsLeft <= 0) {
          clearInterval(countdownInterval);
          void this.processNext(nextIndex);
        }
      }, 1000);
    } else {
      this.isRunning = false;
      this.broadcast(nextIndex, 0, undefined, '🎉 Đã hoàn thành đăng bài cho tất cả nhóm!');
    }
  }

  async publishSingleGroup(
    groupUrl: string,
    postText: string,
    autoClickPost: boolean
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    const fbView = this.getFbView();
    if (!fbView || fbView.webContents.isDestroyed()) {
      return { success: false, error: 'Facebook tab chưa sẵn sàng.' };
    }

    try {
      // 1. Navigate to Group URL
      await fbView.webContents.loadURL(groupUrl);
      // Wait for React DOM to hydrate
      await new Promise((r) => setTimeout(r, 4000));

      // 2. Inject Composer Script
      const injectScript = `
        (async function(text, clickPost) {
          function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

          // 1. Tìm nút mở hộp thoại tạo bài viết
          let composerBtn = null;
          const buttons = document.querySelectorAll('div[role="button"]');
          for (const b of buttons) {
            const t = (b.textContent || '').trim().toLowerCase();
            if (
              t.includes('bạn viết gì đi') ||
              t.includes('write something') ||
              t.includes('tạo bài viết') ||
              t.includes('create a public post') ||
              t.includes('bạn đang nghĩ gì')
            ) {
              composerBtn = b;
              break;
            }
          }

          if (!composerBtn) {
            const pagelet = document.querySelector('[data-pagelet="GroupInlineComposer"]');
            if (pagelet) {
              composerBtn = pagelet.querySelector('div[role="button"]') || pagelet;
            }
          }

          if (composerBtn) {
            composerBtn.click();
            await sleep(2500);
          }

          // 2. Tìm khung soạn thảo contenteditable
          let box = document.querySelector('div[role="dialog"] div[role="textbox"][contenteditable="true"]');
          if (!box) {
            box = document.querySelector('div[role="dialog"] [contenteditable="true"]');
          }
          if (!box) {
            box = document.querySelector('div[role="textbox"][contenteditable="true"]');
          }

          if (!box) {
            return { ok: false, error: 'Không tìm thấy khung soạn thảo bài viết trên Facebook.' };
          }

          box.focus();
          await sleep(500);

          // Xóa nội dung cũ và nhập text mới vào DraftJS
          document.execCommand('selectAll', false, null);
          document.execCommand('insertText', false, text);
          box.dispatchEvent(new Event('input', { bubbles: true }));

          await sleep(2000);

          if (!clickPost) {
            return { ok: true, mode: 'review', message: 'Đã điền sẵn nội dung bài đăng. Bạn có thể kiểm tra và bấm Đăng.' };
          }

          // 3. Tìm và nhấn nút Đăng
          const dialog = document.querySelector('div[role="dialog"]') || document;
          const dialogButtons = dialog.querySelectorAll('div[role="button"], button');
          let postBtn = null;
          for (const btn of dialogButtons) {
            const aria = (btn.getAttribute('aria-label') || '').trim().toLowerCase();
            const txt = (btn.textContent || '').trim().toLowerCase();
            if (aria === 'đăng' || aria === 'post' || txt === 'đăng' || txt === 'post') {
              postBtn = btn;
              break;
            }
          }

          if (postBtn) {
            const disabled = postBtn.getAttribute('aria-disabled') === 'true';
            if (disabled) {
              return { ok: false, error: 'Nút Đăng đang bị khóa (cần thêm tương tác hoặc duyệt thành viên).' };
            }
            postBtn.click();
            await sleep(3500);
            return { ok: true, mode: 'auto', message: 'Đã nhấn Đăng thành công.' };
          }

          return { ok: false, error: 'Không tìm thấy nút Đăng trong khung soạn thảo.' };
        })(${JSON.stringify(postText)}, ${autoClickPost});
      `;

      const result = await fbView.webContents.executeJavaScript(injectScript);
      if (result && result.ok) {
        return { success: true, message: result.message };
      }
      return { success: false, error: result?.error || 'Không thể điền nội dung vào Facebook.' };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  async openGroupAndPrepare(groupUrl: string, postText: string): Promise<{ success: boolean; message?: string; error?: string }> {
    this.switchTabCallback('facebook');
    return this.publishSingleGroup(groupUrl, postText, false);
  }
}
