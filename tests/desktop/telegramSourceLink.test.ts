import { describe, it, expect } from 'vitest';
import {
  formatSalesActionCard,
  salesActionCardKeyboard,
} from '../../server/modules/sales-layer/telegramSalesActionCard';
import { resolveSourceProvenance } from '../../server/modules/sales-layer/salesActionCardViewModel';

describe('Telegram Sales Action Card - Source Link Guarantee', () => {
  it('includes clickable source URL in card text body under 📂 Source', () => {
    const text = formatSalesActionCard({
      findingId: 'f-test-1',
      confidencePct: 85,
      role: 'buyer',
      sourceUrl: 'https://www.facebook.com/groups/123456789/posts/987654321',
      extractedData: {
        source: {
          groupName: 'BẤT ĐỘNG SẢN ĐÀ NẴNG',
          postUrl: 'https://www.facebook.com/groups/123456789/posts/987654321',
          permalink: 'https://www.facebook.com/groups/123456789/posts/987654321',
        },
      },
    });

    expect(text).toContain('📂 Source');
    expect(text).toContain('Facebook · BẤT ĐỘNG SẢN ĐÀ NẴNG');
    expect(text).toContain('🔗 https://www.facebook.com/groups/123456789/posts/987654321');
  });

  it('renders inline keyboard with 🔗 Source button when sourceUrl is present', () => {
    const kb = salesActionCardKeyboard({
      findingId: 'f-test-2',
      sourceUrl: 'https://www.facebook.com/groups/123456789/posts/987654321',
      leadCenterUrl: 'https://bdsdanang.site/admin/agents/lead-center?findingId=f-test-2',
      hasPhone: true,
      phone: '0905123456',
    });

    const buttons = kb.inline_keyboard.flat();
    const sourceBtn = buttons.find((b) => b.text.includes('Source'));
    expect(sourceBtn).toBeDefined();
    expect('url' in sourceBtn!).toBe(true);
    expect((sourceBtn as any).url).toBe(
      'https://www.facebook.com/groups/123456789/posts/987654321'
    );
  });

  it('resolves source provenance correctly when desktop outbox sync sends fields', () => {
    const prov = resolveSourceProvenance({
      extractedData: {
        source: {
          groupName: 'Nhà Đất Hòa Xuân Đà Nẵng',
          postUrl: 'https://www.facebook.com/groups/danangbds/posts/1122334455',
          permalink: 'https://www.facebook.com/groups/danangbds/posts/1122334455',
          canonicalUrl: 'https://www.facebook.com/groups/danangbds/posts/1122334455',
        },
      },
      agentSourceName: 'Nhà Đất Hòa Xuân Đà Nẵng',
      agentSourceType: 'facebook_group',
      canonicalUrl: 'https://www.facebook.com/groups/danangbds/posts/1122334455',
    });

    expect(prov.valid).toBe(true);
    expect(prov.url).toBe('https://www.facebook.com/groups/danangbds/posts/1122334455');
    expect(prov.label).toContain('Nhà Đất Hòa Xuân Đà Nẵng');
  });
});
