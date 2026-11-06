/**
 * Outbox Sync client for Desktop Agent App.
 * Pushes hot leads and valid real estate posts directly to VPS Production.
 */

import crypto from 'crypto';
import type {
  ExtractedLeadData,
  DesktopAgentSettings,
  AgentSourceItem,
  InventoryProperty,
  GeneratePostRequest,
} from '../../shared/types';

export class VpsOutboxSync {
  private settings: DesktopAgentSettings;

  /** serverTime - localTime, applied so a skewed PC clock still signs valid requests. */
  private clockOffsetMs = 0;

  constructor(settings: DesktopAgentSettings) {
    this.settings = settings;
  }

  updateSettings(settings: DesktopAgentSettings) {
    this.settings = settings;
  }

  private get baseUrl(): string {
    return this.settings.vpsUrl.replace(/\/+$/, '');
  }

  private buildHeaders(init: {
    method: 'GET' | 'POST';
    pathWithQuery: string;
    bodyString?: string;
  }): Record<string, string> {
    const headers: Record<string, string> = {
      'X-Agent-Client': 'HouseAndLifeDesktopAgent/1.0',
    };
    if (init.bodyString !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    if (!this.settings.vpsApiKeyId || !this.settings.vpsApiSecret) {
      return headers;
    }

    const timestamp = Math.floor((Date.now() + this.clockOffsetMs) / 1000).toString();
    const nonce = crypto.randomBytes(8).toString('hex');
    const bodyHash = crypto.createHash('sha256').update(init.bodyString ?? '').digest('hex');
    const path = init.pathWithQuery.split('?')[0];
    const canonicalString = `${init.method}\n${path}\n${timestamp}\n${nonce}\n${bodyHash}`;
    const signature = crypto
      .createHmac('sha256', this.settings.vpsApiSecret)
      .update(canonicalString)
      .digest('hex');

    headers['X-Agent-Key-Id'] = this.settings.vpsApiKeyId;
    headers['X-Agent-Timestamp'] = timestamp;
    headers['X-Agent-Nonce'] = nonce;
    headers['X-Agent-Signature'] = signature;
    return headers;
  }

  /**
   * Sign and send a request. On a clock-skew rejection the server returns its
   * epoch time; we realign locally and retry once with a brand-new timestamp
   * and nonce (reusing the nonce would be rejected as a replay).
   */
  private async fetchSigned(init: {
    method: 'GET' | 'POST';
    pathWithQuery: string;
    bodyString?: string;
    timeoutMs: number;
  }): Promise<Response> {
    if (!this.baseUrl) {
      throw new Error('VPS URL is empty');
    }

    const send = () =>
      fetch(`${this.baseUrl}${init.pathWithQuery}`, {
        method: init.method,
        headers: this.buildHeaders(init),
        body: init.bodyString,
        signal: AbortSignal.timeout(init.timeoutMs),
      });

    let response = await send();
    if (response.status !== 401) return response;

    const body = (await response.clone().json().catch(() => null)) as
      | { code?: string; serverTime?: number }
      | null;
    const serverTime = Number(body?.serverTime);
    if (body?.code !== 'TIMESTAMP_SKEW' || !Number.isFinite(serverTime) || serverTime <= 0) {
      return response;
    }

    this.clockOffsetMs = serverTime - Date.now();
    response = await send();
    return response;
  }

  private async readError(response: Response): Promise<string> {
    const errorText = await response.text().catch(() => '');
    return `HTTP ${response.status}: ${errorText.slice(0, 200) || response.statusText}`;
  }

  async syncLeadToVps(lead: ExtractedLeadData): Promise<{ success: boolean; error?: string }> {
    if (!this.settings.autoSyncEnabled) {
      return { success: false, error: 'Auto sync is disabled in settings' };
    }

    const vpsBase = this.settings.vpsUrl.replace(/\/+$/, '');
    if (!vpsBase) {
      return { success: false, error: 'VPS URL is empty' };
    }

    const payload = {
      apiVersion: 'v1',
      eventType: 'finding_upsert',
      ingestionId: `desktop-${lead.id}`,
      // Stable per-lead key so retries and re-scans never duplicate the finding.
      idempotencyKey: `desktop-finding-${lead.id}`,
      localWorkerId: 'desktop-agent-win32',
      capturedAt: new Date(lead.timestamp || Date.now()).toISOString(),
      payload: {
        source: {
          name: lead.sourceName || 'Facebook Group',
          type: lead.sourceType || 'facebook_group',
          url: lead.sourceUrl || '',
        },
        scannedContent: {
          canonicalUrl: lead.sourceUrl || '',
          url: lead.sourceUrl || '',
          contentText: lead.rawText,
          content: lead.rawText,
          authorName: lead.authorName || '',
          publishedAt: new Date(lead.timestamp || Date.now()).toISOString(),
        },
        finding: {
          id: lead.id,
          score: lead.intentScore,
          finalScore: lead.intentScore,
          title: `Nhu cầu BĐS: ${lead.locationArea || 'Đà Nẵng'} - ${lead.askingPrice || ''}`.trim(),
          summary: lead.rawText.slice(0, 1000),
          classification: lead.classification || 'DEMAND',
          intent: 'BUY',
          actorRole: 'buyer',
          primaryPhone: lead.authorPhone || null,
          primaryLocation: lead.locationArea || null,
          askingPrice: lead.askingPrice || null,
          personName: lead.authorName || null,
          extractedData: {
            intentScore: lead.intentScore,
            isHighPriorityLead: lead.isHotLead || lead.intentScore >= 70,
            authorPhone: lead.authorPhone,
            authorName: lead.authorName,
            locationArea: lead.locationArea,
            askingPrice: lead.askingPrice,
            projectBlock: lead.projectBlock,
            source: {
              postUrl: lead.sourceUrl,
              permalink: lead.sourceUrl,
              canonicalUrl: lead.sourceUrl,
              url: lead.sourceUrl,
              groupUrl: lead.sourceUrl,
              groupName: lead.sourceName || 'Facebook Group',
              authorName: lead.authorName,
            },
          },
        },
      },
    };

    try {
      const response = await this.fetchSigned({
        method: 'POST',
        pathWithQuery: '/api/agent-ingest/v1/events',
        bodyString: JSON.stringify(payload),
        timeoutMs: 10000,
      });

      if (!response.ok) {
        return { success: false, error: await this.readError(response) };
      }

      lead.syncStatus = 'synced';
      return { success: true };
    } catch (err: any) {
      lead.syncStatus = 'failed';
      return { success: false, error: err?.message || String(err) };
    }
  }

  async fetchSourcesFromVps(): Promise<{ success: boolean; sources?: AgentSourceItem[]; error?: string }> {
    const vpsBase = this.settings.vpsUrl.replace(/\/+$/, '');
    if (!vpsBase) {
      return { success: false, error: 'VPS URL is empty' };
    }

    try {
      const response = await this.fetchSigned({
        method: 'GET',
        pathWithQuery: '/api/agent-ingest/v1/sources?type=facebook_group',
        timeoutMs: 10000,
      });

      if (!response.ok) {
        return { success: false, error: await this.readError(response) };
      }

      const json = (await response.json()) as { status?: string; data?: AgentSourceItem[] };
      const rawSources = Array.isArray(json.data) ? json.data : [];
      // Filter valid facebook URLs
      const validSources = rawSources.filter(
        (s) => s.url && s.url.startsWith('http') && s.url.includes('facebook.com') && s.status === 'active'
      );

      return { success: true, sources: validSources };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  async fetchPropertiesFromVps(): Promise<{ success: boolean; properties?: InventoryProperty[]; error?: string }> {
    const vpsBase = this.settings.vpsUrl.replace(/\/+$/, '');
    if (!vpsBase) {
      return { success: false, error: 'VPS URL is empty' };
    }

    try {
      const response = await this.fetchSigned({
        method: 'GET',
        pathWithQuery: '/api/agent-ingest/v1/properties',
        timeoutMs: 12000,
      });

      if (!response.ok) {
        return { success: false, error: await this.readError(response) };
      }

      const json = (await response.json()) as { status?: string; data?: InventoryProperty[] };
      const properties = Array.isArray(json.data) ? json.data : [];
      return { success: true, properties };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  async generatePostFromVps(
    req: GeneratePostRequest
  ): Promise<{ success: boolean; data?: { facebook: string; zalo?: string }; error?: string }> {
    const vpsBase = this.settings.vpsUrl.replace(/\/+$/, '');
    if (!vpsBase) {
      return { success: false, error: 'VPS URL is empty' };
    }

    // Đảm bảo payload chỉ chứa text metadata, không chứa ảnh base64 gây lỗi 413
    const cleanPropertyData = req.propertyData ? { ...req.propertyData } : undefined;
    if (cleanPropertyData) {
      delete (cleanPropertyData as any).images;
      delete (cleanPropertyData as any).gallery_images;
      delete (cleanPropertyData as any).imageUrls;
      delete (cleanPropertyData as any).image;
      if (typeof cleanPropertyData.description === 'string') {
        cleanPropertyData.description = cleanPropertyData.description
          .replace(/data:image\/[^;]+;base64,[^"'\s)]+/g, '')
          .slice(0, 3000);
      }
    }

    const payload = {
      propertyId: req.propertyId,
      propertyData: cleanPropertyData,
      tone: req.tone,
    };
    try {
      const response = await this.fetchSigned({
        method: 'POST',
        pathWithQuery: '/api/agent-ingest/v1/generate-post',
        bodyString: JSON.stringify(payload),
        timeoutMs: 30000,
      });

      if (!response.ok) {
        return { success: false, error: await this.readError(response) };
      }

      const json = (await response.json()) as { status?: string; data?: { facebook: string; zalo?: string } };
      return { success: true, data: json.data };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }
}
