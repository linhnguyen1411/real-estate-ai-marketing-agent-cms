import type { LeadCapturePayload } from '../src/types/investorLead';

import { createCustomer, createInboxMessage } from './dbHelper';

import {

  calculateInvestorScore,

  createInvestorLead,

  incrementLeadEmailsSent,

  recordLeadEvent,

} from './investorLeadDb';

import { sendLeadMagnetEmailSequence } from './leadEmailService';



export async function processLeadCapture(payload: LeadCapturePayload) {

  const score = calculateInvestorScore(payload);

  const lead = await createInvestorLead(payload, score);



  await recordLeadEvent({

    lead_id: lead.id,

    session_id: payload.session_id,

    event_type: 'generate_lead',

    event_data: {

      form_type: payload.form_type,

      magnet_slug: payload.magnet_slug,

      score: score.total,

    },

    page_path: payload.page_path,

  });



  if (payload.magnet_slug) {

    await recordLeadEvent({

      lead_id: lead.id,

      session_id: payload.session_id,

      event_type: payload.magnet_slug.includes('bao-cao') ? 'download_report' : 'ebook_download',

      event_data: { magnet_slug: payload.magnet_slug },

      page_path: payload.page_path,

    });

  } else {

    await recordLeadEvent({

      lead_id: lead.id,

      session_id: payload.session_id,

      event_type: 'contact_submit',

      page_path: payload.page_path,

    });

  }



  const customerStatus = score.total >= 80 ? 'hot' : score.total >= 50 ? 'warm' : 'new';

  try {

    await createCustomer({

      id: `crm-${lead.id}`,

      name: lead.name,

      phone: lead.phone,

      email: lead.email || '',

      source: 'website',

      budget: budgetLabel(payload.budget_range),

      interested_area: payload.city || 'Nam Đà Nẵng',

      property_type: interestToPropertyType(payload.interest_type),

      status: customerStatus,

      notes: buildCrmNotes(lead, payload),

      ai_summary: `Lead đầu tư — điểm ${score.total}. Nguồn: ${payload.source || 'website'}.`,

      lead_score: Math.min(score.total, 100),

      created_at: new Date().toISOString(),

      company_id: 'comp-da-nang',

      owner_user_id: 'u-owner',

      assigned_member_ids: [],

    });

  } catch {

    // customer may exist

  }



  await createInboxMessage({

    id: `in-lead-${Date.now()}`,

    sender_name: lead.name,

    platform: 'website',

    message: buildCrmNotes(lead, payload),

    intent: score.total >= 60 ? 'đặt lịch xem' : 'hỏi giá',

    status: 'pending',

    company_id: 'comp-da-nang',

    owner_user_id: 'u-owner',

    assigned_member_ids: [],

    created_at: new Date().toISOString(),

  });



  if (lead.email) {

    try {

      await sendLeadMagnetEmailSequence(lead);

      await incrementLeadEmailsSent(lead.id);

    } catch (error) {

      console.warn('[LeadEmail] Sequence failed:', error);

    }

  }



  return lead;

}



function budgetLabel(range?: string) {

  const map: Record<string, string> = {

    'under-3': '2',

    '3-5': '4',

    '5-10': '7',

    'over-10': '12',

  };

  return map[range || ''] || '5';

}



function interestToPropertyType(interest?: string) {

  const map: Record<string, string> = {

    'dat-nen': 'Đất nền',

    'can-ho': 'Căn Hộ',

    'nha-pho': 'Nhà Phố',

    'du-an': 'Đất nền',

  };

  return map[interest || ''] || 'Đất nền';

}



function buildCrmNotes(lead: { investor_score: number; phone: string; email?: string }, payload: LeadCapturePayload) {

  return [

    `[INVESTOR LEAD] Điểm: ${lead.investor_score}`,

    `Họ tên: ${payload.name}`,

    `SĐT: ${payload.phone}`,

    payload.email ? `Email: ${payload.email}` : '',

    payload.city ? `Thành phố: ${payload.city}` : '',

    payload.interest_type ? `Quan tâm: ${payload.interest_type}` : '',

    payload.budget_range ? `Ngân sách: ${payload.budget_range}` : '',

    payload.magnet_slug ? `Lead magnet: ${payload.magnet_slug}` : '',

    payload.source ? `Nguồn form: ${payload.source}` : '',

    payload.page_path ? `Trang: ${payload.page_path}` : '',

    payload.note ? `Ghi chú: ${payload.note}` : '',

  ].filter(Boolean).join('\n');

}

