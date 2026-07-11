import { Prisma } from '@prisma/client';
import type { AuthUser } from '../../src/types';
import { prisma } from '../prisma';
import { generateText } from '../aiService';
import { extractJsonPayload } from './leadAnalysisSchema';
import { buildCompanyScopeFilter } from './agentDb';
import {
  AGENT_ACTION_PROPOSAL_STATUSES,
  AGENT_ACTION_RISK_LEVELS,
  AGENT_ACTION_TYPES,
  type AgentActionProposalStatus,
  type AgentActionRiskLevel,
  type AgentActionType,
} from './agentTypes';

const DRAFT_SYSTEM = `Bạn là trợ lý soạn thảo phản hồi BĐS cho CMS nội bộ.
Nhiệm vụ: đề xuất 1–3 bản nháp ngắn để người dùng duyệt trước khi đăng thủ công.
QUY TẮC BẮT BUỘC:
- Không giả danh người khác / không nói mình là chủ group / admin Facebook.
- Không hứa giá, pháp lý, suất, hoa hồng, hoặc thông tin chưa xác minh.
- Không xin số điện thoại một cách xâm phạm; có thể mời inbox lịch sự nếu phù hợp.
- Giọng văn tiếng Việt tự nhiên, ngắn (1–3 câu), lịch sự.
- Trả về ĐÚNG JSON array, không markdown:
[
  {
    "actionType": "comment" | "message" | "save" | "follow_up",
    "draftText": "...",
    "rationale": "vì sao đề xuất bản này",
    "riskLevel": "low" | "medium" | "high"
  }
]`;

export interface DraftCandidate {
  actionType: AgentActionType;
  draftText: string;
  rationale: string;
  riskLevel: AgentActionRiskLevel;
}

const proposalInclude = {
  finding: {
    select: {
      id: true,
      title: true,
      score: true,
      status: true,
      summary: true,
      source: { select: { id: true, name: true, type: true } },
    },
  },
} as const;

async function writeAudit(input: {
  companyId: string | null;
  proposalId: string;
  actorUserId: string | null;
  action: string;
  detail?: Record<string, unknown>;
}) {
  return prisma.agentActionAuditLog.create({
    data: {
      companyId: input.companyId,
      proposalId: input.proposalId,
      actorUserId: input.actorUserId,
      action: input.action,
      detail: (input.detail ?? {}) as Prisma.InputJsonValue,
    },
  });
}

function clampCount(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 2;
  return Math.min(3, Math.max(1, Math.floor(n)));
}

function normalizeActionType(value: unknown, fallback: AgentActionType = 'comment'): AgentActionType {
  const v = String(value || '').trim();
  if ((AGENT_ACTION_TYPES as readonly string[]).includes(v)) return v as AgentActionType;
  return fallback;
}

function normalizeRisk(value: unknown): AgentActionRiskLevel {
  const v = String(value || '').trim();
  if ((AGENT_ACTION_RISK_LEVELS as readonly string[]).includes(v)) return v as AgentActionRiskLevel;
  return 'medium';
}

function fallbackDrafts(
  finding: { title: string; summary: string },
  actionType: AgentActionType,
  count: number,
): DraftCandidate[] {
  const topic = finding.title.slice(0, 80) || 'nhu cầu của bạn';
  const base: DraftCandidate[] = [
    {
      actionType,
      draftText: `Chào bạn, mình thấy bạn đang quan tâm tới “${topic}”. Nếu tiện, bạn mô tả thêm khu vực/ngân sách để mình hỗ trợ thông tin phù hợp nhé.`,
      rationale: 'Mở lời lịch sự, hỏi thêm nhu cầu, không hứa kết quả.',
      riskLevel: 'low',
    },
    {
      actionType,
      draftText: `Cảm ơn bạn đã chia sẻ. Mình có thể gửi vài gợi ý tham khảo liên quan tới nhu cầu này — bạn muốn nhận qua inbox không?`,
      rationale: 'Mời inbox, không ép số điện thoại, không khẳng định có hàng.',
      riskLevel: 'low',
    },
    {
      actionType: 'follow_up',
      draftText: `Theo dõi lead: xác nhận lại khu vực + ngân sách + timeline trước khi tư vấn chi tiết.`,
      rationale: 'Ghi chú nội bộ follow-up, không phải comment công khai.',
      riskLevel: 'low',
    },
  ];
  return base.slice(0, count).map(d => ({
    ...d,
    actionType: d.actionType === 'follow_up' && actionType !== 'follow_up' ? actionType : d.actionType,
  }));
}

export async function generateActionDrafts(input: {
  findingId: string;
  actionType?: string;
  count?: number;
}): Promise<DraftCandidate[]> {
  const finding = await prisma.agentFinding.findUnique({
    where: { id: input.findingId },
    include: {
      scannedContent: { select: { contentText: true, canonicalUrl: true, authorName: true } },
      source: { select: { name: true, type: true } },
      mission: { select: { name: true, objective: true } },
    },
  });
  if (!finding) throw new Error('Không tìm thấy finding.');

  const preferredType = normalizeActionType(
    input.actionType,
    finding.source.type === 'facebook_group' ? 'comment' : 'follow_up',
  );
  const count = clampCount(input.count);
  const bodySnippet = (finding.scannedContent?.contentText || finding.summary || '').slice(0, 1200);

  const userPrompt = JSON.stringify(
    {
      preferredActionType: preferredType,
      draftCount: count,
      finding: {
        title: finding.title,
        summary: finding.summary,
        score: finding.score,
        sourceName: finding.source.name,
        sourceType: finding.source.type,
        mission: finding.mission?.name ?? null,
        objective: finding.mission?.objective ?? null,
        authorName: finding.scannedContent?.authorName ?? null,
        url: finding.scannedContent?.canonicalUrl ?? null,
        bodySnippet,
      },
    },
    null,
    2,
  );

  try {
    const raw = await generateText(DRAFT_SYSTEM, `Tạo draft phản hồi từ finding:\n${userPrompt}`, {
      temperature: 0.4,
      maxOutputTokens: 1200,
      timeoutMs: 45_000,
      promptContext: 'editorial',
    });
    const payload = extractJsonPayload(raw);
    const parsed = JSON.parse(payload) as unknown;
    const list = Array.isArray(parsed) ? parsed : Array.isArray((parsed as { drafts?: unknown }).drafts)
      ? (parsed as { drafts: unknown[] }).drafts
      : [];

    const drafts: DraftCandidate[] = [];
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const draftText = String(row.draftText ?? row.text ?? '').trim();
      if (!draftText) continue;
      drafts.push({
        actionType: normalizeActionType(row.actionType, preferredType),
        draftText: draftText.slice(0, 2000),
        rationale: String(row.rationale ?? 'Đề xuất từ AI.').trim().slice(0, 1000) || 'Đề xuất từ AI.',
        riskLevel: normalizeRisk(row.riskLevel),
      });
      if (drafts.length >= count) break;
    }

    if (drafts.length > 0) return drafts;
  } catch {
    /* fall through to deterministic drafts */
  }

  return fallbackDrafts(finding, preferredType, count);
}

export async function createProposalsFromFinding(input: {
  user: AuthUser;
  findingId: string;
  actionType?: string;
  count?: number;
}) {
  const finding = await prisma.agentFinding.findUnique({ where: { id: input.findingId } });
  if (!finding) throw new Error('Không tìm thấy finding.');

  const drafts = await generateActionDrafts({
    findingId: input.findingId,
    actionType: input.actionType,
    count: input.count,
  });

  const created = [];
  for (const draft of drafts) {
    const proposal = await prisma.agentActionProposal.create({
      data: {
        companyId: finding.companyId,
        findingId: finding.id,
        actionType: draft.actionType,
        draftText: draft.draftText,
        rationale: draft.rationale,
        riskLevel: draft.riskLevel,
        status: 'proposed',
        createdBy: input.user.id,
      },
      include: proposalInclude,
    });
    await writeAudit({
      companyId: finding.companyId,
      proposalId: proposal.id,
      actorUserId: input.user.id,
      action: 'created',
      detail: {
        actionType: draft.actionType,
        riskLevel: draft.riskLevel,
        source: 'ai_or_fallback',
      },
    });
    created.push(proposal);
  }

  return created;
}

export async function listActionProposals(
  user: AuthUser,
  pagination: { skip: number; limit: number },
  filters: { status?: string; findingId?: string; actionType?: string },
) {
  const companyScope = buildCompanyScopeFilter(user);
  const where: Prisma.AgentActionProposalWhereInput = {
    ...companyScope,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.findingId ? { findingId: filters.findingId } : {}),
    ...(filters.actionType ? { actionType: filters.actionType } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.agentActionProposal.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      skip: pagination.skip,
      take: pagination.limit,
      include: proposalInclude,
    }),
    prisma.agentActionProposal.count({ where }),
  ]);

  return { items, total };
}

export async function getActionProposalById(id: string) {
  return prisma.agentActionProposal.findUnique({
    where: { id },
    include: {
      ...proposalInclude,
      audits: { orderBy: { createdAt: 'desc' }, take: 50 },
    },
  });
}

export async function updateProposalDraft(input: {
  user: AuthUser;
  proposalId: string;
  draftText?: string;
  rationale?: string;
  riskLevel?: string;
  actionType?: string;
}) {
  const existing = await prisma.agentActionProposal.findUnique({ where: { id: input.proposalId } });
  if (!existing) throw new Error('Không tìm thấy đề xuất.');
  if (existing.status !== 'proposed') {
    throw new Error('Chỉ sửa được đề xuất đang ở trạng thái proposed.');
  }

  const data: Prisma.AgentActionProposalUpdateInput = {};
  if (input.draftText !== undefined) {
    const text = input.draftText.trim();
    if (!text) throw new Error('draftText không được rỗng.');
    data.draftText = text.slice(0, 4000);
  }
  if (input.rationale !== undefined) {
    data.rationale = input.rationale.trim().slice(0, 2000) || existing.rationale;
  }
  if (input.riskLevel !== undefined) {
    data.riskLevel = normalizeRisk(input.riskLevel);
  }
  if (input.actionType !== undefined) {
    data.actionType = normalizeActionType(input.actionType, existing.actionType as AgentActionType);
  }

  const updated = await prisma.agentActionProposal.update({
    where: { id: existing.id },
    data,
    include: proposalInclude,
  });

  await writeAudit({
    companyId: existing.companyId,
    proposalId: existing.id,
    actorUserId: input.user.id,
    action: 'draft_updated',
    detail: {
      draftTextChanged: input.draftText !== undefined,
      rationaleChanged: input.rationale !== undefined,
      riskLevel: updated.riskLevel,
      actionType: updated.actionType,
    },
  });

  return updated;
}

export async function approveProposal(input: { user: AuthUser; proposalId: string }) {
  const existing = await prisma.agentActionProposal.findUnique({ where: { id: input.proposalId } });
  if (!existing) throw new Error('Không tìm thấy đề xuất.');
  if (existing.status !== 'proposed') {
    throw new Error('Chỉ approve được đề xuất đang proposed.');
  }

  const updated = await prisma.agentActionProposal.update({
    where: { id: existing.id },
    data: {
      status: 'approved' satisfies AgentActionProposalStatus,
      approvedBy: input.user.id,
      approvedAt: new Date(),
    },
    include: proposalInclude,
  });

  await writeAudit({
    companyId: existing.companyId,
    proposalId: existing.id,
    actorUserId: input.user.id,
    action: 'approved',
    detail: { note: 'Đã duyệt — chưa thực thi trên Facebook/MXH.' },
  });

  return updated;
}

export async function rejectProposal(input: {
  user: AuthUser;
  proposalId: string;
  reason?: string;
}) {
  const existing = await prisma.agentActionProposal.findUnique({ where: { id: input.proposalId } });
  if (!existing) throw new Error('Không tìm thấy đề xuất.');
  if (existing.status !== 'proposed' && existing.status !== 'approved') {
    throw new Error('Không reject được đề xuất ở trạng thái hiện tại.');
  }

  const updated = await prisma.agentActionProposal.update({
    where: { id: existing.id },
    data: {
      status: 'rejected',
      result: {
        rejectedBy: input.user.id,
        rejectedAt: new Date().toISOString(),
        reason: input.reason?.trim() || null,
      } as Prisma.InputJsonValue,
    },
    include: proposalInclude,
  });

  await writeAudit({
    companyId: existing.companyId,
    proposalId: existing.id,
    actorUserId: input.user.id,
    action: 'rejected',
    detail: { reason: input.reason?.trim() || null },
  });

  return updated;
}

/** Sprint 8.1: copy text only — never posts to Facebook. Optionally marks approved. */
export async function copyProposalText(input: {
  user: AuthUser;
  proposalId: string;
  markApproved?: boolean;
}) {
  const existing = await prisma.agentActionProposal.findUnique({ where: { id: input.proposalId } });
  if (!existing) throw new Error('Không tìm thấy đề xuất.');
  if (existing.status === 'rejected' || existing.status === 'failed') {
    throw new Error('Không copy đề xuất đã reject/failed.');
  }

  let proposal = existing;
  if (input.markApproved && existing.status === 'proposed') {
    proposal = await prisma.agentActionProposal.update({
      where: { id: existing.id },
      data: {
        status: 'approved',
        approvedBy: input.user.id,
        approvedAt: new Date(),
      },
    });
  }

  await writeAudit({
    companyId: existing.companyId,
    proposalId: existing.id,
    actorUserId: input.user.id,
    action: 'copied',
    detail: {
      markApproved: Boolean(input.markApproved),
      statusAfter: proposal.status,
      note: 'Chỉ copy text — chưa thực thi trên Facebook.',
    },
  });

  return {
    proposalId: proposal.id,
    draftText: proposal.draftText,
    status: proposal.status,
    actionType: proposal.actionType,
  };
}

export async function listProposalAudits(proposalId: string) {
  return prisma.agentActionAuditLog.findMany({
    where: { proposalId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

export function isValidProposalStatus(value: string): value is AgentActionProposalStatus {
  return (AGENT_ACTION_PROPOSAL_STATUSES as readonly string[]).includes(value);
}

export function isValidActionType(value: string): value is AgentActionType {
  return (AGENT_ACTION_TYPES as readonly string[]).includes(value);
}
