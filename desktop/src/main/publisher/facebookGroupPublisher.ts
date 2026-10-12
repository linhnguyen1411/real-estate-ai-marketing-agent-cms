/**
 * Facebook Group Auto-Publisher Engine for Desktop Agent App.
 * Handles DOM injection into Facebook Group composer, scheduling, and anti-checkpoint queue.
 * Fixed: Preserves multiline formatting, paragraphs, emojis, and line-breaks on Facebook DraftJS/Lexical.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { app, clipboard, nativeImage, WebContentsView } from 'electron';
import type { PublishQueueItem, PublishSessionConfig } from '../../shared/types';

export class FacebookGroupPublisher {
  private isRunning: boolean = false;
  private currentQueue: PublishQueueItem[] = [];
  private activeConfig: PublishSessionConfig | null = null;
  private timer: NodeJS.Timeout | null = null;
  private downloadedImagePaths: string[] = [];
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

  async downloadImages(urls: string[]): Promise<string[]> {
    const downloaded: string[] = [];
    if (!urls || urls.length === 0) return downloaded;

    const tempDir = path.join(os.tmpdir(), 'realestate_publish_images');
    try {
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
    } catch {
      // ignore
    }

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      if (!url || typeof url !== 'string') continue;

      try {
        if (url.startsWith('data:image')) {
          const matches = url.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
          if (matches) {
            const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
            const buffer = Buffer.from(matches[2], 'base64');
            const filePath = path.join(tempDir, `img_${Date.now()}_${i}.${ext}`);
            fs.writeFileSync(filePath, buffer);
            downloaded.push(filePath);
          }
          continue;
        }

        if (url.startsWith('http://') || url.startsWith('https://')) {
          const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          if (!res.ok) continue;
          const arrayBuffer = await res.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);

          let ext = 'jpg';
          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('png')) ext = 'png';
          else if (contentType.includes('webp')) ext = 'webp';

          const filePath = path.join(tempDir, `img_${Date.now()}_${i}.${ext}`);
          fs.writeFileSync(filePath, buffer);
          downloaded.push(filePath);
        }
      } catch (err) {
        console.warn(`[Publisher] Failed to download image ${url}:`, err);
      }
    }

    return downloaded;
  }

  async startQueue(config: PublishSessionConfig): Promise<{ success: boolean; error?: string }> {
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

    // Tải trước các hình ảnh đã chọn nếu có
    if (config.imageUrls && config.imageUrls.length > 0) {
      this.broadcast(0, 0, undefined, `Đang tải ${config.imageUrls.length} hình ảnh về bộ đệm...`);
      try {
        this.downloadedImagePaths = await this.downloadImages(config.imageUrls);
        this.broadcast(0, 0, undefined, `Đã tải thành công ${this.downloadedImagePaths.length} hình ảnh.`);
      } catch (err) {
        console.warn('[Publisher] Pre-downloading images failed:', err);
      }
    } else {
      this.downloadedImagePaths = [];
    }

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

    const result = await this.publishSingleGroup(
      item.groupUrl,
      this.activeConfig.postContent,
      this.activeConfig.mode === 'auto',
      this.downloadedImagePaths
    );

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
    autoClickPost: boolean,
    imagePaths?: string[]
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    const fbView = this.getFbView();
    if (!fbView || fbView.webContents.isDestroyed()) {
      return { success: false, error: 'Facebook tab chưa sẵn sàng.' };
    }

    try {
      // 1. Điều hướng tới nhóm Facebook
      await fbView.webContents.loadURL(groupUrl);
      // Chờ React hydration
      await new Promise((r) => setTimeout(r, 4000));

      // 2. Mở hộp thoại soạn thảo & Focus vào editor box
      const prepareComposerScript = `
        (async function() {
          function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

          // Tìm nút mở hộp thoại tạo bài viết
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

          // Tìm khung soạn thảo contenteditable
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
          await sleep(400);

          // Xóa toàn bộ nội dung cũ
          document.execCommand('selectAll', false, null);
          document.execCommand('delete', false, null);
          await sleep(200);

          return { ok: true, ready: true };
        })();
      `;

      const prepRes = await fbView.webContents.executeJavaScript(prepareComposerScript);
      if (!prepRes || !prepRes.ok) {
        return { success: false, error: prepRes?.error || 'Không thể mở khung soạn thảo Facebook.' };
      }

      // 3. ĐIỀN NỘI DUNG VỚI ĐỊNH DẠNG XUỐNG DÒNG (NATIVE CLIPBOARD PASTE)
      // Ghi text nguyên bản (chứa \n, \r\n) vào clipboard hệ thống
      clipboard.writeText(postText);
      await new Promise((r) => setTimeout(r, 200));

      // Gọi lệnh paste native của Chromium vào textbox đang focus
      fbView.webContents.paste();
      await new Promise((r) => setTimeout(r, 1500));

      // 4. Kiểm tra nội dung & Fallback chia dòng nếu paste bị chặn
      const verifyAndFallbackScript = `
        (async function(rawText) {
          function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
          let box = document.querySelector('div[role="dialog"] div[role="textbox"][contenteditable="true"]') ||
                    document.querySelector('div[role="dialog"] [contenteditable="true"]') ||
                    document.querySelector('div[role="textbox"][contenteditable="true"]');
          if (!box) return { ok: false, error: 'Mất focus khung soạn thảo.' };

          const currentText = (box.innerText || box.textContent || '').trim();

          // Nếu text trống hoặc chưa được paste
          if (!currentText || currentText.length < 5) {
            box.focus();
            document.execCommand('selectAll', false, null);
            document.execCommand('delete', false, null);

            // Chèn từng dòng kèm insertParagraph để giữ chuẩn ngắt dòng
            const lines = rawText.split(/\\r?\\n/);
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              if (line.length > 0) {
                document.execCommand('insertText', false, line);
              }
              if (i < lines.length - 1) {
                document.execCommand('insertParagraph', false);
              }
            }
            box.dispatchEvent(new Event('input', { bubbles: true }));
            await sleep(1000);
          }

          return { ok: true };
        })(${JSON.stringify(postText)});
      `;

      await fbView.webContents.executeJavaScript(verifyAndFallbackScript);

      // 5. Đính kèm hình ảnh nếu có qua Clipboard Paste
      if (imagePaths && imagePaths.length > 0) {
        try {
          await new Promise((r) => setTimeout(r, 1000));
          for (const imgPath of imagePaths) {
            if (fs.existsSync(imgPath)) {
              const image = nativeImage.createFromPath(imgPath);
              if (!image.isEmpty()) {
                clipboard.writeImage(image);
                await new Promise((r) => setTimeout(r, 200));
                fbView.webContents.paste();
                // Chờ Facebook upload và gắn ảnh
                await new Promise((r) => setTimeout(r, 2500));
              }
            }
          }
        } catch (imgErr) {
          console.warn('[Publisher] Error pasting images into composer:', imgErr);
        }
      }

      // Khôi phục lại postText vào clipboard để người dùng có thể dán lại bất kỳ lúc nào
      clipboard.writeText(postText);

      // Nếu ở chế độ Review (kiểm duyệt thủ công)
      if (!autoClickPost) {
        return {
          success: true,
          message: `Đã điền bài viết chuẩn định dạng${imagePaths && imagePaths.length > 0 ? ` kèm ${imagePaths.length} ảnh` : ''}. Bạn có thể kiểm tra và bấm Đăng.`,
        };
      }

      // 6. Nếu chế độ Auto, chờ 2.5s và nhấn nút Đăng
      await new Promise((r) => setTimeout(r, 2500));
      const clickPostScript = `
        (async function() {
          function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
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
            return { ok: true, message: 'Đã nhấn Đăng thành công.' };
          }

          return { ok: false, error: 'Không tìm thấy nút Đăng trong khung soạn thảo.' };
        })();
      `;

      const postResult = await fbView.webContents.executeJavaScript(clickPostScript);
      if (postResult && postResult.ok) {
        return { success: true, message: postResult.message };
      }
      return { success: false, error: postResult?.error || 'Lỗi khi nhấn Đăng bài.' };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  async openGroupAndPrepare(
    groupUrl: string,
    postText: string,
    imageUrls?: string[]
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    this.switchTabCallback('facebook');
    let localPaths: string[] = [];
    if (imageUrls && imageUrls.length > 0) {
      localPaths = await this.downloadImages(imageUrls);
    }
    return this.publishSingleGroup(groupUrl, postText, false, localPaths);
  }
}
