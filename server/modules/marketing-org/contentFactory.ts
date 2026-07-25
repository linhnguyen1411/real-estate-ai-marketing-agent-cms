/**
 * Content Factory — one seed → omnichannel variants (rule templates, no Gemini).
 */

import { createHash } from 'crypto';
import type { ContentPack, ContentVariant, MarketingChannel } from './types';

function idOf(seed: string): string {
  return `pack_${createHash('sha1').update(`${seed}:${Date.now()}`).digest('hex').slice(0, 12)}`;
}

export function produceContentPack(input: {
  topic: string;
  campaignHint?: string | null;
  usp?: string | null;
  budgetHint?: string | null;
}): ContentPack {
  const topic = String(input.topic || '').trim() || 'BĐS Đà Nẵng';
  const campaign = input.campaignHint || topic;
  const usp = input.usp || 'vị trí · pháp lý · dòng tiền';
  const budget = input.budgetHint || 'liên hệ nhận bảng giá';

  const variants: ContentVariant[] = [
    {
      channel: 'facebook',
      kind: 'post',
      title: `${topic} — mở bán / USP`,
      body: `🔥 ${topic}\n\n${usp}\n\nAi đang tìm vị trí tốt quanh khu này — comment "INFO" để nhận bảng giá.\n\n#BDS #DaNang`,
      cta: 'Comment INFO',
    },
    {
      channel: 'threads',
      kind: 'thread',
      title: `${topic} — góc nhìn NĐT`,
      body: `1/ ${topic} đang được quan tâm.\n2/ Điểm mạnh: ${usp}.\n3/ Ai cần phân tích nhanh — reply thread này.`,
      cta: 'Reply thread',
    },
    {
      channel: 'instagram',
      kind: 'caption',
      title: `${topic} — IG caption`,
      body: `${topic} ✨\n${usp}\n\nSave bài này nếu đang shortlist.\n\n#realestate #danang`,
      cta: 'Save post',
    },
    {
      channel: 'tiktok',
      kind: 'reel_script',
      title: `${topic} — TikTok 15s script`,
      body: `Hook (0-3s): “${topic} — nhìn qua là muốn giữ”\nBody (3-12s): walkthrough 3 góc + ${usp}\nClose (12-15s): “Muốn bảng giá? Comment MDC”`,
      cta: 'Comment MDC',
    },
    {
      channel: 'tiktok',
      kind: 'caption',
      title: `${topic} — TikTok caption`,
      body: `${topic} tour 15s 👀\n${usp}\nComment MDC để nhận info\n#fyp #batdongsan`,
      cta: 'Comment MDC',
    },
    {
      channel: 'seo',
      kind: 'seo_article',
      title: `Giá & pháp lý ${topic} — hướng dẫn ${new Date().getFullYear()}`,
      body: `H1: Giá & pháp lý ${topic}\nH2: Tổng quan vị trí\nH2: Pháp lý cần check\nH2: Khung giá tham khảo (${budget})\nH2: Ai phù hợp mua\nCTA: Đăng ký nhận bảng giá`,
      cta: 'Đăng ký nhận bảng giá',
    },
    {
      channel: 'landing',
      kind: 'landing_cta',
      title: `Landing CTA — ${topic}`,
      body: `Headline: Sở hữu ${topic} đúng timing\nSub: ${usp}\nForm: Họ tên · SĐT · Ngân sách\nCTA button: Nhận tư vấn trong 15 phút`,
      cta: 'Nhận tư vấn 15 phút',
    },
    {
      channel: 'email',
      kind: 'email',
      title: `Email nurture — ${topic}`,
      body: `Subject: ${topic}: 3 điểm cần xem trước khi chốt\nBody: Xin chào {name},\n\nTóm tắt USP: ${usp}.\nBudget ref: ${budget}.\n\nCTA: Đặt lịch xem`,
      cta: 'Đặt lịch xem',
    },
    {
      channel: 'zalo_oa',
      kind: 'post',
      title: `Zalo OA — ${topic}`,
      body: `${topic}\n${usp}\nNhắn “GIÁ” để nhận bảng giá nhanh.`,
      cta: 'Nhắn GIÁ',
    },
    {
      channel: 'linkedin',
      kind: 'post',
      title: `LinkedIn — ${topic}`,
      body: `Market note: ${topic}\n\nThesis: ${usp}.\nFor operators / investors scanning Đà Nẵng inventory this week.\n\nDM for deck.`,
      cta: 'DM for deck',
    },
    {
      channel: 'remarketing',
      kind: 'remarketing',
      title: `Remarketing — ${topic}`,
      body: `Vẫn đang xem ${topic}?\n${usp}\nNhận ưu đãi tư vấn hôm nay — ${budget}.`,
      cta: 'Nhận ưu đãi tư vấn',
    },
  ];

  return {
    id: idOf(topic),
    seedTopic: topic,
    campaignHint: campaign,
    variants,
    createdAt: new Date().toISOString(),
    status: 'ready',
  };
}

export function channelLabel(ch: MarketingChannel): string {
  const map: Record<MarketingChannel, string> = {
    facebook: 'Facebook',
    threads: 'Threads',
    instagram: 'Instagram',
    tiktok: 'TikTok',
    seo: 'SEO',
    landing: 'Landing',
    email: 'Email',
    zalo_oa: 'Zalo OA',
    linkedin: 'LinkedIn',
    remarketing: 'Remarketing',
  };
  return map[ch];
}
