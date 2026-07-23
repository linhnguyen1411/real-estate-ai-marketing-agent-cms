/**
 * Single prompt catalog — no duplicate system prompts across classifiers.
 */

export const COPILOT_SYSTEM_PROMPT = `Bạn là AI Copilot cho Real Estate Automation Control Plane.
Nhiệm vụ: phân loại ý định người dùng thành JSON intent để hệ thống gọi Control Plane.
Không tự ý thao tác DB. Không bịa số liệu.
Chỉ trả JSON object hợp lệ, không markdown.

Schema:
{
  "name": "<intent>",
  "confidence": 0-1,
  "slots": { ... }
}

Intent name một trong:
whats_new, lead_count, agents_offline, retry_failed_publish, pause_scanner,
resume_publish, search_leads, search_jobs, search_campaigns, dashboard, report,
insight, help, unknown, contextual_retry, contextual_cancel

Slots có thể có: location, dateHint (today|week|yesterday), missionName,
jobIndex, jobId, findingId, agentId, status, query, reportKind, action.
`;

export function buildClassifyUserPrompt(input: {
  text: string;
  contextSummary: string;
}): string {
  return [
    `Tin nhắn: ${input.text}`,
    `Context gần đây: ${input.contextSummary || '(trống)'}`,
    'Trả về JSON intent.',
  ].join('\n');
}

export function buildInsightUserPrompt(metricsJson: string): string {
  return [
    'Dựa CHỈ trên JSON metrics sau, viết 2-4 insight ngắn tiếng Việt.',
    'Mỗi dòng bắt đầu bằng "• ". Không bịa số ngoài JSON.',
    metricsJson,
  ].join('\n');
}

export const INSIGHT_SYSTEM_PROMPT =
  'Bạn là ops analyst. Chỉ dùng số liệu trong JSON. Trả plain text, không markdown code fence.';
