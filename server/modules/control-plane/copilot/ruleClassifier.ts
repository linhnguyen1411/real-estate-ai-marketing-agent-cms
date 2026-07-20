/**
 * Deterministic rule classifier — primary path (tests + offline).
 * No LLM required. Strategy list, not a monolithic switch on free text.
 */

import type { ClassifiedIntent, CopilotIntentName, CopilotSlots } from './types';

type Rule = {
  name: CopilotIntentName;
  confidence: number;
  test: (normalized: string) => boolean;
  slots?: (normalized: string, original: string) => CopilotSlots;
};

function norm(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFC')
    .replace(/[?.!]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractLocation(text: string): string | undefined {
  const m =
    text.match(
      /(?:lead|tìm|tim|ở|o|tại|tai)\s+([a-zăâđêôơưáàảãạéèẻẽẹíìỉĩịóòỏõọúùủũụýỳỷỹỵ\s]{2,40}?)(?:\s+hôm|\s+hom|\s+today|$)/i,
    ) ||
    text.match(/hòa\s*xuân|hoa\s*xuan|ngũ\s*hành\s*sơn|ngu\s*hanh\s*son|fpt|sơn\s*trà|son\s*tra/i);
  if (!m) return undefined;
  const loc = (m[1] || m[0] || '').replace(/^(lead|tìm|tim|ở|o|tại|tai)\s+/i, '').trim();
  return loc || undefined;
}

function extractMissionName(text: string): string | undefined {
  const m = text.match(
    /(?:scanner|scan|mission|dừng|dung|pause|stop)\s+(?:scanner\s+)?([a-z0-9_\- ]{2,40})/i,
  );
  if (!m) return undefined;
  return m[1].replace(/\s+/g, ' ').trim();
}

function extractJobIndex(text: string): number | undefined {
  const m = text.match(/(?:job|mission)\s*#?\s*(\d+)/i) || text.match(/retry\s+(\d+)/i);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : undefined;
}

const RULES: Rule[] = [
  {
    name: 'whats_new',
    confidence: 0.92,
    test: t =>
      /có gì mới|co gi moi|what'?s new|tin mới|tinh hinh|tình hình|what'?s up|hệ thống đang làm gì|he thong dang lam gi/.test(
        t,
      ),
  },
  {
    name: 'fleet_summary',
    confidence: 0.95,
    test: t =>
      /máy nào đang bận|may nao dang ban|fleet|máy nào|may nao|workstation|ai đang làm|ai dang lam|machines?/.test(
        t,
      ) && !/offline|mất|mat/.test(t),
  },
  {
    name: 'incident_summary',
    confidence: 0.95,
    test: t =>
      /có lỗi không|co loi khong|incident|sự cố|su co|có vấn đề|co van de|cảnh báo|canh bao|alert/.test(
        t,
      ),
  },
  {
    name: 'scanner_summary',
    confidence: 0.94,
    test: t =>
      /scanner sao|scan sao|scanner thế|scanner the|scanner thế nào|scanner the nao|scanner\??$|tình hình scan|tinh hinh scan/.test(
        t,
      ) ||
      (/scanner|scan/.test(t) && /sao|thế nào|the nao|status|tóm tắt|tom tat/.test(t)),
  },
  {
    name: 'publisher_summary',
    confidence: 0.94,
    test: t =>
      /publisher thế|publisher the|publish thế|publish the|publisher\??$|đăng bài sao|dang bai sao/.test(t) ||
      (/publisher|publish|đăng bài|dang bai/.test(t) &&
        /sao|thế nào|the nao|status|queue|tóm tắt|tom tat/.test(t)),
  },
  {
    name: 'mission_summary',
    confidence: 0.93,
    test: t =>
      /mission thế|mission the|mission sao|mission\??$|nhiệm vụ/.test(t) ||
      (/mission|nhiệm vụ|nhiem vu/.test(t) && /sao|thế nào|the nao|status|tóm tắt|tom tat/.test(t)),
  },
  {
    name: 'runtime_explain',
    confidence: 0.96,
    test: t =>
      /tại sao scanner|tai sao scanner|why scanner|scanner không chạy|scanner khong chay|không scan|khong scan/.test(
        t,
      ),
  },
  {
    name: 'machine_detail',
    confidence: 0.9,
    test: t =>
      /chi tiết máy|chi tiet may|machine detail|máy\s+\S+|may\s+\S+|linh-?pc|mini-?pc|vps/.test(t) &&
      !/fleet|bận|ban/.test(t),
    slots: (_n, o) => {
      const m =
        o.match(/(?:máy|may|machine|host)\s+([a-zA-Z0-9_\-.]+)/i) ||
        o.match(/\b(linh-?pc|mini-?pc|vps|[A-Za-z0-9_\-.]{3,})\b/i);
      return { agentId: m?.[1], query: o.trim() };
    },
  },
  {
    name: 'browser_detail',
    confidence: 0.92,
    test: t =>
      /browser detail|chi tiết browser|chi tiet browser|trình duyệt|trinh duyet|chrome profile|browser\??$/.test(
        t,
      ),
  },
  {
    name: 'ops_recommendation',
    confidence: 0.9,
    test: t =>
      /nên làm gì|nen lam gi|khuyến nghị|khuyen nghi|recommend|cần mình xử lý|can minh xu ly|làm gì tiếp|lam gi tiep/.test(
        t,
      ),
  },
  {
    name: 'lead_count',
    confidence: 0.93,
    test: t =>
      /(bao nhiêu|bao nhieu|how many).*(lead|finding)/.test(t) ||
      /hôm nay có.*lead|hom nay co.*lead/.test(t),
    slots: t => ({
      dateHint: 'today',
      location: extractLocation(t),
    }),
  },
  {
    name: 'agents_offline',
    confidence: 0.94,
    test: t =>
      /agent.*(offline|mất|mat|down)/.test(t) ||
      /(offline|mất kết nối).*(agent)/.test(t) ||
      /có agent nào offline|co agent nao offline/.test(t),
  },
  {
    name: 'retry_failed_publish',
    confidence: 0.95,
    test: t =>
      /retry.*(tất cả|tat ca|all).*(publish|đăng|dang).*?(lỗi|loi|fail)/.test(t) ||
      /retry.*(publish|đăng).*(lỗi|loi|fail)/.test(t) ||
      /(thử lại|thu lai).*(publish|đăng).*(lỗi|fail)/.test(t),
  },
  {
    name: 'pause_scanner',
    confidence: 0.9,
    test: t =>
      /(dừng|dung|pause|stop).*(scanner|scan|mission)/.test(t) ||
      /(scanner|scan).*(dừng|dung|pause|stop)/.test(t),
    slots: (t, o) => ({ missionName: extractMissionName(o) || extractMissionName(t) || 'buyer' }),
  },
  {
    name: 'resume_publish',
    confidence: 0.88,
    test: t =>
      /(khởi động lại|khoi dong lai|restart|resume).*(publish|đăng|dang)/.test(t) ||
      /(publish|đăng).*(lại|lai|restart|resume)/.test(t),
  },
  {
    name: 'search_leads',
    confidence: 0.91,
    test: t =>
      /(tìm|tim|search|find).*(lead|finding)/.test(t) ||
      /lead.*(hòa xuân|hoa xuan|hôm nay|hom nay)/.test(t),
    slots: (t, o) => ({
      location: extractLocation(o) || extractLocation(t),
      dateHint: /hôm nay|hom nay|today/.test(t) ? 'today' : /tuần|tuan|week/.test(t) ? 'week' : 'today',
      query: o.trim(),
    }),
  },
  {
    name: 'search_jobs',
    confidence: 0.9,
    test: t =>
      /(job|việc).*(publish).*(lỗi|loi|fail)/.test(t) ||
      /publish.*(bị lỗi|bi loi|failed|fail)/.test(t) ||
      /job publish/.test(t),
    slots: () => ({ status: 'failed', query: 'publish' }),
  },
  {
    name: 'search_campaigns',
    confidence: 0.88,
    test: t =>
      /campaign.*(tuần trước|tuan truoc|last week|week)/.test(t) ||
      /(tuần trước|tuan truoc).*(campaign)/.test(t),
    slots: () => ({ dateHint: 'week', reportKind: 'campaign' }),
  },
  {
    name: 'insight',
    confidence: 0.86,
    test: t =>
      /insight|nhận xét|nhan xet|phân tích|phan tich|tại sao fail|tai sao fail|cho insight/.test(t),
  },
  {
    name: 'dashboard',
    confidence: 0.85,
    test: t => /dashboard|health|sức khỏe|suc khoe|runtime/.test(t),
  },
  {
    name: 'report',
    confidence: 0.84,
    test: t => /báo cáo|bao cao|report/.test(t),
    slots: t => ({
      reportKind: /publish/.test(t)
        ? 'publish'
        : /scan|scanner/.test(t)
          ? 'scanner'
          : /fail/.test(t)
            ? 'failed'
            : /week|tuần|tuan/.test(t)
              ? 'weekly'
              : 'daily',
    }),
  },
  {
    name: 'contextual_retry',
    confidence: 0.9,
    test: t => /^retry(\s|$)/.test(t) || /retry\s+(job|mission|#)?\s*\d+/.test(t),
    slots: t => ({ jobIndex: extractJobIndex(t), action: 'retry' }),
  },
  {
    name: 'contextual_cancel',
    confidence: 0.88,
    test: t => /^cancel(\s|$)/.test(t) || /hủy|huy\s+(job|mission)/.test(t),
    slots: t => ({ jobIndex: extractJobIndex(t), action: 'cancel' }),
  },
  {
    name: 'help',
    confidence: 0.8,
    test: t => /^(help|giúp|giup|hướng dẫn|huong dan)$/.test(t),
  },
];

export function classifyByRules(text: string): ClassifiedIntent {
  const original = String(text || '').trim();
  const normalized = norm(original);
  if (!normalized) {
    return { name: 'unknown', confidence: 0, slots: {}, source: 'rule' };
  }

  for (const rule of RULES) {
    if (rule.test(normalized)) {
      return {
        name: rule.name,
        confidence: rule.confidence,
        slots: rule.slots ? rule.slots(normalized, original) : {},
        source: 'rule',
      };
    }
  }

  return {
    name: 'unknown',
    confidence: 0.2,
    slots: { query: original },
    source: 'rule',
  };
}
