/**
 * House & Life Desktop Agent - Account / License Client.
 * Device-bound login with a license key, safeStorage vault, heartbeat with
 * offline grace, role capabilities and per-device HMAC ingest credentials.
 */

import crypto from 'crypto';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { app, safeStorage } from 'electron';
import type {
  AgentCapabilities,
  DesktopAuthState,
  DesktopLoginResult,
  DesktopUserProfile,
  IngestCredentialInfo,
} from '../../shared/types';

export interface LicenseSessionData {
  deviceId: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  plan?: string;
  features?: string[];
  lastHeartbeatSuccess?: string;
  activatedAt?: string;
  remember?: boolean;
  user?: DesktopUserProfile;
  capabilities?: AgentCapabilities;
  ingest?: IngestCredentialInfo;
}

export interface HeartbeatResult {
  valid: boolean;
  offlineMode?: boolean;
  error?: string;
  code?: string;
}

export const CHECKPOINT_SAFETY_WARNING =
  'CẢNH BÁO BẢO MẬT: Tự động đăng nhập Facebook/Zalo cá nhân có rủi ro checkpoint hoặc tạm khoá tài khoản do chính sách bảo mật mạng xã hội. Khuyến nghị sử dụng tài khoản phụ hoặc tài khoản chuyên dụng phục vụ công việc.';

/** Normalises pasted keys to `XXXX-XXXX-XXXX-XXXX`. */
export function normalizeLicenseKey(raw: string): string {
  const cleaned = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return cleaned.replace(/(.{4})/g, '$1-').replace(/-+$/, '');
}

export class LicenseClient {
  private vpsUrl: string;
  private session: LicenseSessionData;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private readonly offlineGraceHours = 48;

  /** Fired when the server definitively rejects the session (revoked/expired). */
  public onSessionInvalid: ((message: string) => void) | null = null;

  /** Fired after a successful heartbeat with refreshed profile/capabilities/credentials. */
  public onSessionUpdated: ((state: DesktopAuthState) => void) | null = null;

  constructor(vpsUrl: string = 'https://bdsdanang.site') {
    this.vpsUrl = vpsUrl.replace(/\/+$/, '');
    this.session = this.loadSession();
  }

  public setBaseUrl(vpsUrl: string): void {
    this.vpsUrl = String(vpsUrl || '').replace(/\/+$/, '');
  }

  public getBaseUrl(): string {
    return this.vpsUrl;
  }

  /**
   * Generates a deterministic hardware device fingerprint (SHA-256)
   */
  public static getHardwareFingerprint(): string {
    try {
      const cpus = os.cpus();
      const cpuModel = cpus.length > 0 ? cpus[0].model : 'unknown-cpu';
      const hostname = os.hostname();
      const platform = os.platform();
      const arch = os.arch();
      const totalMem = os.totalmem();
      const homedir = os.homedir();

      // Collect network MAC addresses (filtered)
      const networkInterfaces = os.networkInterfaces();
      const macs: string[] = [];
      for (const iface of Object.values(networkInterfaces)) {
        if (iface) {
          for (const alias of iface) {
            if (alias.mac && alias.mac !== '00:00:00:00:00:00' && !alias.internal) {
              macs.push(alias.mac);
            }
          }
        }
      }
      macs.sort();

      const raw = [hostname, platform, arch, cpuModel, totalMem, homedir, macs.join(',')].join('|');
      return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
    } catch {
      return crypto.createHash('sha256').update(os.hostname() || 'fallback-device').digest('hex').slice(0, 32);
    }
  }

  private getStorageFilePath(): string {
    const userData = app?.getPath ? app.getPath('userData') : process.cwd();
    return path.join(userData, 'license_vault.bin');
  }

  private loadSession(): LicenseSessionData {
    const deviceId = LicenseClient.getHardwareFingerprint();
    const filePath = this.getStorageFilePath();
    if (!fs.existsSync(filePath)) {
      return { deviceId };
    }

    try {
      const buffer = fs.readFileSync(filePath);
      let jsonStr = '';

      if (safeStorage && safeStorage.isEncryptionAvailable()) {
        try {
          jsonStr = safeStorage.decryptString(buffer);
        } catch {
          // Decryption failed, reset session
          return { deviceId };
        }
      } else {
        // Fallback decryption using device-bound key
        const decipher = crypto.createDecipheriv(
          'aes-256-cbc',
          crypto.createHash('sha256').update(deviceId).digest(),
          Buffer.alloc(16, 0)
        );
        jsonStr = Buffer.concat([decipher.update(buffer), decipher.final()]).toString('utf8');
      }

      const parsed = JSON.parse(jsonStr);
      return { ...parsed, deviceId };
    } catch {
      return { deviceId };
    }
  }

  private saveSession(): void {
    const filePath = this.getStorageFilePath();
    // "Remember account" unchecked: keep the session in memory only.
    if (!this.session.remember) {
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      const jsonStr = JSON.stringify(this.session);
      let buffer: Buffer;

      if (safeStorage && safeStorage.isEncryptionAvailable()) {
        buffer = safeStorage.encryptString(jsonStr);
      } else {
        const cipher = crypto.createCipheriv(
          'aes-256-cbc',
          crypto.createHash('sha256').update(this.session.deviceId).digest(),
          Buffer.alloc(16, 0)
        );
        buffer = Buffer.concat([cipher.update(Buffer.from(jsonStr, 'utf8')), cipher.final()]);
      }

      fs.writeFileSync(filePath, buffer);
    } catch (err) {
      console.error('[LicenseClient] Failed to persist license session:', err);
    }
  }

  public getSession(): LicenseSessionData {
    return { ...this.session };
  }

  public getIngestCredential(): IngestCredentialInfo | null {
    return this.session.ingest ? { ...this.session.ingest } : null;
  }

  public hasStoredSession(): boolean {
    return Boolean(this.session.accessToken);
  }

  public getAuthState(): DesktopAuthState {
    if (!this.session.accessToken || !this.session.user || !this.session.capabilities) {
      return { authenticated: false, vpsUrl: this.vpsUrl };
    }
    return {
      authenticated: true,
      user: { ...this.session.user },
      capabilities: { ...this.session.capabilities },
      plan: this.session.plan || null,
      features: [...(this.session.features || [])],
      expiresAt: this.session.expiresAt || null,
      vpsUrl: this.vpsUrl,
      remember: Boolean(this.session.remember),
      serverTime: new Date().toISOString(),
    };
  }

  public isWithinOfflineGrace(): boolean {
    if (!this.session.accessToken) return false;
    if (!this.session.lastHeartbeatSuccess) return false;

    const lastTime = new Date(this.session.lastHeartbeatSuccess).getTime();
    const diffHours = (Date.now() - lastTime) / (3600 * 1000);
    return diffHours <= this.offlineGraceHours;
  }

  /**
   * Log in (activate) with a license key.
   */
  public async activate(rawKey: string, remember: boolean): Promise<DesktopLoginResult> {
    const key = normalizeLicenseKey(rawKey);
    if (key.length < 19) {
      return { success: false, code: 'INVALID_KEY', message: 'Khóa bản quyền không hợp lệ (định dạng XXXX-XXXX-XXXX-XXXX).' };
    }
    if (!this.vpsUrl) {
      return { success: false, code: 'NO_SERVER', message: 'Chưa cấu hình địa chỉ máy chủ.' };
    }

    try {
      const endpoint = `${this.vpsUrl}/api/license/activate`;
      const deviceId = LicenseClient.getHardwareFingerprint();
      const deviceName = `${os.hostname()} (${os.platform()})`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, deviceId, deviceName }),
        signal: AbortSignal.timeout(20000),
      });

      const body = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || body.status !== 'success') {
        return {
          success: false,
          code: body.code || `HTTP_${res.status}`,
          message: `${body.message || 'Kích hoạt bản quyền thất bại.'} (Máy chủ kiểm tra: ${this.vpsUrl})`,
        };
      }

      const data = body.data || {};
      if (!data.capabilities?.canScan) {
        return {
          success: false,
          code: 'AGENT_NOT_ALLOWED',
          message: 'Tài khoản chưa được cấp quyền sử dụng Desktop Agent.',
        };
      }

      this.session = {
        deviceId,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        plan: data.plan,
        features: data.features || [],
        expiresAt: data.expiresAt || null,
        lastHeartbeatSuccess: new Date().toISOString(),
        activatedAt: new Date().toISOString(),
        remember: Boolean(remember),
        user: data.user,
        capabilities: data.capabilities,
        ingest: data.ingest || undefined,
      };
      this.saveSession();
      this.startHeartbeatDaemon();

      return {
        success: true,
        message: body.message || 'Đăng nhập thành công.',
        state: this.getAuthState(),
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Lỗi kết nối máy chủ ${this.vpsUrl}: ${err?.message || err}`,
      };
    }
  }

  /**
   * Send heartbeat to server
   */
  public async sendHeartbeat(): Promise<HeartbeatResult> {
    if (!this.session.accessToken) {
      return { valid: false, error: 'Chưa đăng nhập' };
    }

    try {
      const endpoint = `${this.vpsUrl}/api/license/heartbeat`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.session.accessToken}`,
          'X-Device-Id': this.session.deviceId,
        },
        body: JSON.stringify({ deviceId: this.session.deviceId }),
        signal: AbortSignal.timeout(15000),
      });

      if (res.status === 401 || res.status === 403) {
        // Try refresh token once
        const refreshed = await this.refreshToken();
        if (refreshed) {
          return this.sendHeartbeat();
        }

        const errJson = (await res.json().catch(() => ({}))) as any;
        this.invalidate(errJson.message || 'Phiên đăng nhập đã hết hạn hoặc bản quyền bị thu hồi.');
        return { valid: false, code: errJson.code, error: errJson.message || 'Phiên đăng nhập không hợp lệ.' };
      }

      if (!res.ok) {
        // Server error: fall back to offline grace
        if (this.isWithinOfflineGrace()) {
          return { valid: true, offlineMode: true };
        }
        return { valid: false, error: 'Quá thời gian offline grace (48 giờ).' };
      }

      const body = (await res.json().catch(() => ({}))) as any;
      const data = body.data || {};
      this.session.lastHeartbeatSuccess = new Date().toISOString();
      if (body.expiresAt) this.session.expiresAt = body.expiresAt;
      if (data.plan) this.session.plan = data.plan;
      if (Array.isArray(data.features)) this.session.features = data.features;
      if (data.user) this.session.user = data.user;
      if (data.capabilities) this.session.capabilities = data.capabilities;
      if (data.ingest?.secret) this.session.ingest = data.ingest;
      this.saveSession();
      try {
        this.onSessionUpdated?.(this.getAuthState());
      } catch (err) {
        console.error('[LicenseClient] onSessionUpdated handler failed:', err);
      }

      return { valid: true, offlineMode: false };
    } catch {
      // Network failure
      if (this.isWithinOfflineGrace()) {
        return { valid: true, offlineMode: true };
      }
      return { valid: false, error: 'Không thể kết nối máy chủ và đã hết thời gian offline grace.' };
    }
  }

  /**
   * Refresh access token
   */
  public async refreshToken(): Promise<boolean> {
    if (!this.session.refreshToken) return false;

    try {
      const endpoint = `${this.vpsUrl}/api/license/refresh-token`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Device-Id': this.session.deviceId,
        },
        body: JSON.stringify({
          refreshToken: this.session.refreshToken,
          deviceId: this.session.deviceId,
        }),
      });

      if (!res.ok) return false;
      const data = await res.json();
      if (data.status === 'success' && data.data?.accessToken) {
        this.session.accessToken = data.data.accessToken;
        this.saveSession();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  public logout(): void {
    this.stopHeartbeatDaemon();
    this.session = { deviceId: LicenseClient.getHardwareFingerprint() };
    try {
      const filePath = this.getStorageFilePath();
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (err) {
      console.error('[LicenseClient] Failed to clear vault:', err);
    }
  }

  private invalidate(message: string): void {
    const remember = this.session.remember;
    this.session = { deviceId: LicenseClient.getHardwareFingerprint(), remember };
    this.saveSession();
    this.stopHeartbeatDaemon();
    try {
      this.onSessionInvalid?.(message);
    } catch (err) {
      console.error('[LicenseClient] onSessionInvalid handler failed:', err);
    }
  }

  public startHeartbeatDaemon(intervalMs: number = 30 * 60 * 1000): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(async () => {
      const result = await this.sendHeartbeat();
      if (!result.valid) {
        console.warn('[LicenseClient] Heartbeat failed:', result.error);
      }
    }, intervalMs);
  }

  public stopHeartbeatDaemon(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
