import { app, net, Notification } from 'electron';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';

declare const __DESKTOP_APP_VERSION__: string | undefined;

export const APP_VERSION: string =
  (typeof __DESKTOP_APP_VERSION__ === 'string' && __DESKTOP_APP_VERSION__) || app.getVersion();

export interface UpdateManifest {
  version: string;
  url: string;
  sha256: string;
  size?: number;
  releasedAt?: string;
  notes?: string;
}

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'uptodate'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'error';

export interface UpdateState {
  currentVersion: string;
  latestVersion: string | null;
  status: UpdateStatus;
  progressPercent: number;
  error: string;
  notes: string;
}

const MANIFEST_PATH = '/downloads/agent-version.json';
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const INITIAL_CHECK_DELAY_MS = 20 * 1000;

function parseSemver(version: string): number[] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(String(version).trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function isNewerVersion(remote: string, current: string): boolean {
  const a = parseSemver(remote);
  const b = parseSemver(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

function isLocalHost(url: URL): boolean {
  return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}

export class AgentUpdater {
  private state: UpdateState = {
    currentVersion: APP_VERSION,
    latestVersion: null,
    status: 'idle',
    progressPercent: 0,
    error: '',
    notes: '',
  };
  private timer: NodeJS.Timeout | null = null;
  private downloadedPath = '';
  private busy = false;

  constructor(
    private opts: {
      getVpsUrl: () => string;
      isAutoEnabled: () => boolean;
      onState: (state: UpdateState) => void;
    },
  ) {}

  getState(): UpdateState {
    return { ...this.state };
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.checkAndApply();
    }, CHECK_INTERVAL_MS);
    setTimeout(() => {
      void this.checkAndApply();
    }, INITIAL_CHECK_DELAY_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private setState(patch: Partial<UpdateState>): void {
    this.state = { ...this.state, ...patch };
    this.opts.onState(this.getState());
  }

  async checkAndApply(): Promise<void> {
    if (this.busy) return;
    const vpsUrl = (this.opts.getVpsUrl() || '').replace(/\/+$/, '');
    if (!vpsUrl) {
      this.setState({ status: 'idle', error: '' });
      return;
    }
    this.busy = true;
    try {
      this.setState({ status: 'checking', error: '' });
      const manifest = await this.fetchManifest(vpsUrl);
      this.setState({ latestVersion: manifest.version, notes: manifest.notes || '' });
      if (!isNewerVersion(manifest.version, APP_VERSION)) {
        this.setState({ status: 'uptodate', progressPercent: 0 });
        return;
      }
      this.setState({ status: 'available' });
      if (!this.opts.isAutoEnabled()) return;
      await this.download(manifest, vpsUrl);
      this.notify(`Đã tải bản cập nhật ${manifest.version}`, 'Ứng dụng sẽ khởi động lại để cài đặt.');
      await this.installNow();
    } catch (err: any) {
      console.warn('[Updater] Check failed:', err?.message || err);
      this.setState({ status: 'error', error: err?.message || String(err) });
    } finally {
      this.busy = false;
    }
  }

  private async fetchManifest(vpsUrl: string): Promise<UpdateManifest> {
    const manifestUrl = new URL(MANIFEST_PATH, vpsUrl);
    if (manifestUrl.protocol !== 'https:' && !isLocalHost(manifestUrl)) {
      throw new Error('Chỉ nhận cập nhật qua HTTPS.');
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await net.fetch(manifestUrl.toString(), {
        signal: controller.signal,
        headers: { 'Cache-Control': 'no-store' },
      });
      if (!res.ok) {
        throw new Error(`Manifest ${res.status}`);
      }
      const manifest = (await res.json()) as Partial<UpdateManifest>;
      if (!manifest.version || !manifest.sha256 || !manifest.url) {
        throw new Error('Manifest thiếu version/sha256/url.');
      }
      return {
        version: String(manifest.version),
        url: String(manifest.url),
        sha256: String(manifest.sha256).toLowerCase(),
        size: manifest.size,
        releasedAt: manifest.releasedAt,
        notes: manifest.notes,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private download(manifest: UpdateManifest, vpsUrl: string): Promise<string> {
    const downloadUrl = new URL(manifest.url, vpsUrl);
    if (downloadUrl.protocol !== 'https:' && !isLocalHost(downloadUrl)) {
      return Promise.reject(new Error('Chỉ tải cập nhật qua HTTPS.'));
    }
    const targetDir = path.join(app.getPath('temp'), 'houseandlife-updates');
    fs.mkdirSync(targetDir, { recursive: true });
    const targetPath = path.join(targetDir, `HouseAndLife-Agent-Setup-${manifest.version}.exe`);

    return new Promise<string>((resolve, reject) => {
      const request = net.request(downloadUrl.toString());
      request.on('response', (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Tải cập nhật thất bại (HTTP ${response.statusCode}).`));
          return;
        }
        const total = Number(response.headers['content-length']) || manifest.size || 0;
        let received = 0;
        const hash = crypto.createHash('sha256');
        const fileStream = fs.createWriteStream(targetPath);
        this.setState({ status: 'downloading', progressPercent: 0 });

        response.on('data', (chunk: Buffer) => {
          hash.update(chunk);
          received += chunk.length;
          fileStream.write(chunk);
          if (total > 0) {
            this.setState({ progressPercent: Math.min(99, Math.floor((received / total) * 100)) });
          }
        });
        response.on('end', () => {
          fileStream.end(() => {
            try {
              const digest = hash.digest('hex');
              if (digest !== manifest.sha256) {
                fs.unlinkSync(targetPath);
                reject(new Error('Tệp cập nhật không khớp SHA-256 — đã hủy cài đặt.'));
                return;
              }
              this.setState({ status: 'ready', progressPercent: 100 });
              this.downloadedPath = targetPath;
              resolve(targetPath);
            } catch (err: any) {
              reject(err);
            }
          });
        });
        response.on('error', (err: Error) => {
          fileStream.destroy();
          reject(err);
        });
      });
      request.on('error', (err: Error) => reject(err));
      request.end();
    });
  }

  async downloadForManualInstall(): Promise<void> {
    if (this.busy) return;
    const vpsUrl = (this.opts.getVpsUrl() || '').replace(/\/+$/, '');
    if (!vpsUrl) throw new Error('Chưa cấu hình Địa chỉ máy chủ (VPS URL).');
    this.busy = true;
    try {
      this.setState({ status: 'checking', error: '' });
      const manifest = await this.fetchManifest(vpsUrl);
      this.setState({ latestVersion: manifest.version, notes: manifest.notes || '' });
      if (!isNewerVersion(manifest.version, APP_VERSION)) {
        this.setState({ status: 'uptodate', progressPercent: 0 });
        return;
      }
      this.setState({ status: 'available' });
      await this.download(manifest, vpsUrl);
      this.notify(`Đã tải bản cập nhật ${manifest.version}`, 'Bấm "Khởi động lại & cập nhật" để cài.');
    } catch (err: any) {
      console.warn('[Updater] Manual check failed:', err?.message || err);
      this.setState({ status: 'error', error: err?.message || String(err) });
    } finally {
      this.busy = false;
    }
  }

  installNow(): Promise<void> {
    if (!this.downloadedPath || !fs.existsSync(this.downloadedPath)) {
      return Promise.reject(new Error('Chưa có bản cập nhật đã tải.'));
    }
    this.notify('Đang cài đặt bản cập nhật', 'Ứng dụng sẽ tự mở lại sau khi hoàn tất.');
    const child = spawn(this.downloadedPath, ['--silent'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
    setTimeout(() => {
      app.quit();
    }, 1500);
    return Promise.resolve();
  }

  private notify(title: string, body: string): void {
    try {
      if (Notification.isSupported()) {
        new Notification({ title, body }).show();
      }
    } catch {
      // Notification failures must never block the update flow.
    }
  }
}
