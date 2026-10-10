/**
 * Outbox Sync client for Desktop Agent App.
 * Pushes hot leads and valid real estate posts directly to VPS Production.
 */

import crypto from 'crypto';
import type { ExtractedLeadData, DesktopAgentSettings } from '../../shared/types';

export class VpsOutboxSync {
  private settings: DesktopAgentSettings;

  constructor(settings: DesktopAgentSettings) {
    this.settings = settings;
  }

  updateSettings(settings: DesktopAgentSettings) {
    this.settings = settings;
  }

  async syncLeadToVps(lead: ExtractedLeadData): Promise<{ success: boolean; error?: string }> {
    if (!this.settings.autoSyncEnabled) {
      return { success: false, error: 'Auto sync is disabled in settings' };
    }

    const vpsBase = this.settings.vpsUrl.replace(/\/+$/, '');
    if (!vpsBase) {
      return { success: false, error: 'VPS URL is empty' };
    }

    const endpoint = `${vpsBase}/api/agent-ingest/v1/events`;
    const payload = {
      event_type: 'finding_upsert',
      agent_id: 'desktop-agent-win32',
      source: {
        name: lead.sourceName || 'Facebook Group',
        type: lead.sourceType || 'facebook_group',
        url: lead.sourceUrl || '',
      },
      scannedContent: {
        content: lead.rawText,
        url: lead.sourceUrl || '',
        authorName: lead.authorName || '',
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
            authorName: lead.authorName,
          },
        },
      },
    };

    const bodyString = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomBytes(8).toString('hex');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Agent-Client': 'HouseAndLifeDesktopAgent/1.0',
    };

    if (this.settings.vpsApiKeyId && this.settings.vpsApiSecret) {
      // HMAC signing
      const method = 'POST';
      const path = '/api/agent-ingest/v1/events';
      const bodyHash = crypto.createHash('sha256').update(bodyString).digest('hex');
      const canonicalString = `${method}\n${path}\n${timestamp}\n${nonce}\n${bodyHash}`;
      const signature = crypto
        .createHmac('sha256', this.settings.vpsApiSecret)
        .update(canonicalString)
        .digest('hex');

      headers['X-Agent-Key-Id'] = this.settings.vpsApiKeyId;
      headers['X-Agent-Timestamp'] = timestamp;
      headers['X-Agent-Nonce'] = nonce;
      headers['X-Agent-Signature'] = signature;
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: bodyString,
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        return {
          success: false,
          error: `HTTP ${response.status}: ${errorText.slice(0, 100) || response.statusText}`,
        };
      }

      lead.syncStatus = 'synced';
      return { success: true };
    } catch (err: any) {
      lead.syncStatus = 'failed';
      return { success: false, error: err?.message || String(err) };
    }
  }
}
