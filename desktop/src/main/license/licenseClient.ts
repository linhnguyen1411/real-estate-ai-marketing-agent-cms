/**
 * House & Life Desktop Agent - License Client & Hardware Fingerprint
 * Manages device-bound token authentication, safeStorage persistence,
 * periodic heartbeat daemon with offline grace period, and account checkpoint safety notices.
 */

import crypto from 'crypto';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { app, safeStorage } from 'electron';

export interface LicenseSessionData {
  licenseKeyHash?: string;
  deviceId: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  plan?: string;
  features?: string[];
  lastHeartbeatSuccess?: string;
  activatedAt?: string;
}

export const CHECKPOINT_SAFETY_WARNING =
  'CẢNH BÁO BẢO MẬT: Tự động đăng nhập Facebook/Zalo cá nhân có rủi ro checkpoint hoặc tạm khoá tài khoản do chính sách bảo mật mạng xã hội. Khuyến nghị sử dụng tài khoản phụ hoặc tài khoản chuyên dụng phục vụ công việc.';

export class LicenseClient {
  private vpsUrl: string;
  private session: LicenseSessionData;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private readonly offlineGraceHours = 48;

  constructor(vpsUrl: string = 'https://bdsdanang.site') {
    this.vpsUrl = vpsUrl.replace(/\/+$/, '');
    this.session = this.loadSession();
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

  public isWithinOfflineGrace(): boolean {
    if (!this.session.accessToken) return false;
    if (!this.session.lastHeartbeatSuccess) return false;

    const lastTime = new Date(this.session.lastHeartbeatSuccess).getTime();
    const diffHours = (Date.now() - lastTime) / (3600 * 1000);
    return diffHours <= this.offlineGraceHours;
  }

  /**
   * Activate software license with key
   */
  public async activate(rawKey: string): Promise<{ success: boolean; message?: string; data?: any }> {
    try {
      const endpoint = `${this.vpsUrl}/api/license/activate`;
      const deviceId = this.session.deviceId;
      const deviceName = `${os.hostname()} (${os.platform()})`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: rawKey, deviceId, deviceName }),
      });

      const body = await res.json();
      if (!res.ok || body.status !== 'success') {
        return {
          success: false,
          message: body.message || 'Kích hoạt bản quyền thất bại.',
        };
      }

      const data = body.data;
      this.session.accessToken = data.accessToken;
      this.session.refreshToken = data.refreshToken;
      this.session.plan = data.plan;
      this.session.features = data.features;
      this.session.lastHeartbeatSuccess = new Date().toISOString();
      this.session.activatedAt = new Date().toISOString();
      this.saveSession();

      this.startHeartbeatDaemon();

      return {
        success: true,
        message: body.message,
        data: {
          ...data,
          warning: CHECKPOINT_SAFETY_WARNING,
        },
      };
    } catch (err: any) {
      return { success: false, message: `Lỗi kết nối máy chủ: ${err?.message || err}` };
    }
  }

  /**
   * Send heartbeat to server
   */
  public async sendHeartbeat(): Promise<{ valid: boolean; offlineMode?: boolean; error?: string }> {
    if (!this.session.accessToken) {
      return { valid: false, error: 'Chưa kích hoạt bản quyền' };
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
      });

      if (res.status === 401 || res.status === 403) {
        // Try refresh token once
        const refreshed = await this.refreshToken();
        if (refreshed) {
          return this.sendHeartbeat();
        }

        // License revoked or expired
        const errJson = await res.json().catch(() => ({}));
        this.session.accessToken = undefined;
        this.saveSession();
        return { valid: false, error: errJson.message || 'Bản quyền bị thu hồi hoặc đã hết hạn' };
      }

      if (!res.ok) {
        // Server unreachable or network error: check offline grace period
        if (this.isWithinOfflineGrace()) {
          return { valid: true, offlineMode: true };
        }
        return { valid: false, error: 'Quá thời gian offline grace (48 giờ).' };
      }

      const data = await res.json();
      this.session.lastHeartbeatSuccess = new Date().toISOString();
      if (data.expiresAt) {
        this.session.expiresAt = data.expiresAt;
      }
      this.saveSession();

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
