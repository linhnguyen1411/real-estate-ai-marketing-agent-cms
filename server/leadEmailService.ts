import type { InvestorLead } from '../src/types/investorLead';

const SITE_URL = process.env.APP_URL || 'https://bdsdanang.site';

async function sendEmail(to: string, subject: string, html: string) {
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const brevoKey = process.env.BREVO_API_KEY?.trim();
  const from = process.env.EMAIL_FROM || 'Estoria <contact@bdsdanang.site>';

  if (resendKey) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Resend error: ${text}`);
    }
    return;
  }

  if (brevoKey) {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': brevoKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Estoria', email: from.match(/<(.+)>/)?.[1] || 'contact@bdsdanang.site' },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Brevo error: ${text}`);
    }
    return;
  }

  console.log(`[LeadEmail] No provider configured. Would send to ${to}: ${subject}`);
}

function magnetLinks(lead: InvestorLead) {
  const token = lead.access_token || '';
  const base = SITE_URL.replace(/\/+$/, '');
  return {
    report: `${base}/tai-lieu-dau-tu/bao-cao-nam-da-nang-2026?token=${token}`,
    top20: `${base}/tai-lieu-dau-tu/top-20-co-hoi-dau-tu?token=${token}`,
    contact: `${base}/lien-he`,
  };
}

export async function sendLeadMagnetEmailSequence(lead: InvestorLead) {
  if (!lead.email) return;
  const links = magnetLinks(lead);

  await sendEmail(
    lead.email,
    'Báo cáo thị trường Nam Đà Nẵng 2026 — Estoria',
    `
    <p>Xin chào <strong>${lead.name}</strong>,</p>
    <p>Cảm ơn anh/chị đã quan tâm đầu tư BĐS Nam Đà Nẵng.</p>
    <p><strong>Email 1/3 — Báo cáo thị trường</strong></p>
    <p>Truy cập báo cáo FPT City, Sun Group, Mai Đăng Chơn, căn hộ & đất nền:</p>
    <p><a href="${links.report}">Xem báo cáo thị trường 2026</a></p>
    <p>Estoria — Tư vấn BĐS Đà Nẵng</p>
    `
  );

  await new Promise(r => setTimeout(r, 500));

  await sendEmail(
    lead.email,
    '20 nhóm cơ hội đầu tư Nam Đà Nẵng',
    `
    <p>Xin chào <strong>${lead.name}</strong>,</p>
    <p><strong>Email 2/3 — Khung phân tích cơ hội</strong></p>
    <p>Tài liệu định hướng theo khu vực, loại tài sản và ngân sách (không phải danh sách sản phẩm chào bán):</p>
    <p><a href="${links.top20}">Xem 20 nhóm cơ hội nên theo dõi</a></p>
    `
  );

  await new Promise(r => setTimeout(r, 500));

  await sendEmail(
    lead.email,
    'Mời tư vấn 1-1 — Cơ hội đầu tư Đà Nẵng',
    `
    <p>Xin chào <strong>${lead.name}</strong>,</p>
    <p><strong>Email 3/3 — Tư vấn cá nhân</strong></p>
    <p>Đội ngũ Estoria sẵn sàng tư vấn theo ngân sách và mục tiêu của anh/chị.</p>
    <p><a href="${links.contact}">Đặt lịch nhận danh sách đầu tư</a></p>
    <p>Hotline: 0905 777 594</p>
    `
  );
}

export async function sendSingleMagnetEmail(lead: InvestorLead, magnetTitle: string, link: string) {
  if (!lead.email) return;
  await sendEmail(
    lead.email,
    `${magnetTitle} — Estoria`,
    `<p>Xin chào <strong>${lead.name}</strong>,</p>
     <p>Link tài liệu anh/chị yêu cầu:</p>
     <p><a href="${link}">${magnetTitle}</a></p>`
  );
}
