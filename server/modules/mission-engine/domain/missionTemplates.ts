/**
 * Built-in Mission 2.0 workflow templates.
 */

import type { WorkflowPipelineDefinition } from './workflowTypes';
import { buildDefaultLeadPipeline } from './workflowPolicies';
import {
  PUBLISH_BROWSER_CONTENT_PIPELINE,
  PUBLISH_BROWSER_CONTENT_TEMPLATE_KEY,
} from './publishMissionTemplate';

export interface MissionWorkflowTemplate {
  id: string;
  name: string;
  objective: string;
  category: 'buyer' | 'supply' | 'brand' | 'research' | 'lead_watch' | 'publisher';
  pipeline: WorkflowPipelineDefinition;
  /** Merged into AgentMission.rules for keyword / score compatibility */
  rulesDefaults: Record<string, unknown>;
  schedule?: {
    cadence: 'hourly' | 'every_2h' | 'every_4h' | 'daily' | 'manual';
    timezone?: string;
  };
}

const TZ = 'Asia/Ho_Chi_Minh';

export const BUYER_HUNTER_PIPELINE: WorkflowPipelineDefinition = {
  version: 1,
  steps: [
    { id: 'spam', type: 'spam_filter', enabled: true, executionTarget: 'either', config: {} },
    {
      id: 'extract',
      type: 'extract_structured_data',
      enabled: true,
      dependsOn: ['spam'],
      executionTarget: 'vps',
    },
    {
      id: 'classify',
      type: 'classify_subject',
      enabled: true,
      dependsOn: ['extract'],
      executionTarget: 'vps',
      config: {
        allowedClassifications: ['buyer', 'renter', 'investor'],
        allowedActors: ['demand_side'],
      },
    },
    {
      id: 'enrich',
      type: 'ai_enrich',
      enabled: true,
      dependsOn: ['classify'],
      executionTarget: 'vps',
    },
    {
      id: 'finding',
      type: 'create_lead_intelligence',
      enabled: true,
      dependsOn: ['enrich'],
      executionTarget: 'vps',
      retry: { onFailure: 'stop_workflow' },
    },
    {
      id: 'matching',
      type: 'match_inventory',
      enabled: true,
      dependsOn: ['finding'],
      executionTarget: 'vps',
    },
    {
      id: 'notify_cms',
      type: 'notify_cms',
      enabled: true,
      dependsOn: ['finding'],
      executionTarget: 'vps',
      config: { minimumScore: 60 },
      retry: { onFailure: 'continue' },
    },
    {
      id: 'telegram',
      type: 'notify_telegram',
      enabled: true,
      dependsOn: ['finding'],
      executionTarget: 'vps',
      config: { minimumScore: 60 },
      retry: { onFailure: 'continue' },
    },
  ],
  defaults: { maxAttempts: 2, onFailure: 'continue' },
};

export const SUPPLY_HUNTER_PIPELINE: WorkflowPipelineDefinition = {
  version: 1,
  steps: [
    { id: 'spam', type: 'spam_filter', enabled: true, executionTarget: 'either' },
    {
      id: 'extract',
      type: 'extract_structured_data',
      enabled: true,
      dependsOn: ['spam'],
      executionTarget: 'vps',
    },
    {
      id: 'classify',
      type: 'classify_subject',
      enabled: true,
      dependsOn: ['extract'],
      executionTarget: 'vps',
      config: {
        allowedClassifications: ['seller', 'landlord', 'broker'],
        allowedActors: ['supply_side'],
      },
    },
    {
      id: 'enrich',
      type: 'ai_enrich',
      enabled: true,
      dependsOn: ['classify'],
      executionTarget: 'vps',
    },
    {
      id: 'inventory',
      type: 'create_external_inventory_candidate',
      enabled: true,
      dependsOn: ['enrich'],
      executionTarget: 'vps',
      retry: { onFailure: 'stop_workflow' },
    },
    {
      id: 'matching',
      type: 'match_inventory',
      enabled: true,
      dependsOn: ['inventory'],
      executionTarget: 'vps',
    },
    {
      id: 'notify_cms',
      type: 'notify_cms',
      enabled: true,
      dependsOn: ['inventory'],
      executionTarget: 'vps',
      retry: { onFailure: 'continue' },
    },
  ],
  defaults: { maxAttempts: 2, onFailure: 'continue' },
};

export const BRAND_MONITORING_PIPELINE: WorkflowPipelineDefinition = {
  version: 1,
  steps: [
    { id: 'spam', type: 'spam_filter', enabled: true, executionTarget: 'either' },
    {
      id: 'topic',
      type: 'topic_match',
      enabled: true,
      dependsOn: ['spam'],
      executionTarget: 'vps',
    },
    {
      id: 'sentiment',
      type: 'sentiment_analysis',
      enabled: true,
      dependsOn: ['topic'],
      executionTarget: 'vps',
    },
    {
      id: 'summary',
      type: 'summarize',
      enabled: true,
      dependsOn: ['sentiment'],
      executionTarget: 'vps',
    },
    {
      id: 'telegram',
      type: 'notify_telegram',
      enabled: true,
      dependsOn: ['summary'],
      executionTarget: 'vps',
      config: { mode: 'summary' },
      retry: { onFailure: 'continue' },
    },
  ],
  defaults: { maxAttempts: 2, onFailure: 'continue' },
};

export const CONTENT_RESEARCH_PIPELINE: WorkflowPipelineDefinition = {
  version: 1,
  steps: [
    { id: 'spam', type: 'spam_filter', enabled: true, executionTarget: 'either' },
    {
      id: 'topic',
      type: 'topic_match',
      enabled: true,
      dependsOn: ['spam'],
      executionTarget: 'vps',
    },
    {
      id: 'summary',
      type: 'summarize',
      enabled: true,
      dependsOn: ['topic'],
      executionTarget: 'vps',
    },
    {
      id: 'notify_cms',
      type: 'notify_cms',
      enabled: true,
      dependsOn: ['summary'],
      executionTarget: 'vps',
      config: { mode: 'summary' },
      retry: { onFailure: 'continue' },
    },
  ],
};

export const LEAD_WATCH_HIGH_PRIORITY_PIPELINE: WorkflowPipelineDefinition = {
  version: 1,
  steps: [
    { id: 'spam', type: 'spam_filter', enabled: true, executionTarget: 'either' },
    {
      id: 'extract',
      type: 'extract_structured_data',
      enabled: true,
      dependsOn: ['spam'],
      executionTarget: 'vps',
    },
    {
      id: 'classify',
      type: 'classify_subject',
      enabled: true,
      dependsOn: ['extract'],
      executionTarget: 'vps',
      config: {
        allowedClassifications: ['buyer', 'renter', 'investor'],
        allowedActors: ['demand_side'],
      },
    },
    {
      id: 'finding',
      type: 'create_lead_intelligence',
      enabled: true,
      dependsOn: ['classify'],
      executionTarget: 'vps',
    },
    {
      id: 'score_gate',
      type: 'condition',
      enabled: true,
      dependsOn: ['finding'],
      executionTarget: 'vps',
      config: {
        field: 'classification.finalScore',
        operator: 'greater_or_equal',
        value: 75,
      },
    },
    {
      id: 'telegram',
      type: 'notify_telegram',
      enabled: true,
      dependsOn: ['score_gate'],
      executionTarget: 'vps',
      config: { minimumScore: 75 },
      retry: { onFailure: 'continue' },
    },
  ],
};

export const MISSION_WORKFLOW_TEMPLATES: MissionWorkflowTemplate[] = [
  {
    id: 'buyer-hunter',
    name: 'Buyer Hunter',
    objective:
      'Quét nguồn → lọc spam → extract/classify → tạo Lead Intelligence cho buyer/renter/investor → matching → notify.',
    category: 'buyer',
    pipeline: BUYER_HUNTER_PIPELINE,
    rulesDefaults: {
      templateId: 'buyer-hunter',
      targetClassifications: ['buyer', 'renter', 'investor'],
      minScore: 50,
      notifyScore: 60,
      maxItemsPerRun: 40,
    },
    schedule: { cadence: 'every_4h', timezone: TZ },
  },
  {
    id: 'supply-hunter',
    name: 'Supply Hunter',
    objective:
      'Thu thập tín hiệu nguồn hàng (seller/landlord/broker) → External Inventory candidate → matching → notify CMS.',
    category: 'supply',
    pipeline: SUPPLY_HUNTER_PIPELINE,
    rulesDefaults: {
      templateId: 'supply-hunter',
      targetClassifications: ['seller', 'landlord', 'broker'],
      minScore: 45,
      notifyScore: 65,
      maxItemsPerRun: 40,
    },
    schedule: { cadence: 'every_4h', timezone: TZ },
  },
  {
    id: 'brand-monitoring',
    name: 'Brand Monitoring',
    objective: 'Theo dõi topic/sentiment và tóm tắt — không tạo Lead Intelligence.',
    category: 'brand',
    pipeline: BRAND_MONITORING_PIPELINE,
    rulesDefaults: {
      templateId: 'brand-monitoring',
      minScore: 0,
      notifyScore: 0,
      maxItemsPerRun: 60,
    },
    schedule: { cadence: 'hourly', timezone: TZ },
  },
  {
    id: 'content-research',
    name: 'Content Research',
    objective: 'Nghiên cứu chủ đề / tóm tắt nội dung → thông báo CMS, không tạo Finding.',
    category: 'research',
    pipeline: CONTENT_RESEARCH_PIPELINE,
    rulesDefaults: {
      templateId: 'content-research',
      maxItemsPerRun: 50,
    },
    schedule: { cadence: 'daily', timezone: TZ },
  },
  {
    id: 'lead-watch-high-priority',
    name: 'Lead Watch — High Priority',
    objective: 'Lead Intelligence + condition finalScore >= 75 → Telegram.',
    category: 'lead_watch',
    pipeline: LEAD_WATCH_HIGH_PRIORITY_PIPELINE,
    rulesDefaults: {
      templateId: 'lead-watch-high-priority',
      minScore: 50,
      notifyScore: 75,
      maxItemsPerRun: 40,
    },
    schedule: { cadence: 'every_2h', timezone: TZ },
  },
  {
    id: PUBLISH_BROWSER_CONTENT_TEMPLATE_KEY,
    name: 'Publish Browser Content',
    objective:
      'Browser publish approved draft to configured destination — prepare → navigate → upload → fill → publish → verify → capture → cleanup.',
    category: 'publisher',
    pipeline: PUBLISH_BROWSER_CONTENT_PIPELINE,
    rulesDefaults: {
      templateId: PUBLISH_BROWSER_CONTENT_TEMPLATE_KEY,
      publishOnly: true,
    },
    schedule: { cadence: 'manual' },
  },
];

export function getMissionWorkflowTemplate(id: string): MissionWorkflowTemplate | undefined {
  return MISSION_WORKFLOW_TEMPLATES.find(t => t.id === id);
}

export function listMissionWorkflowTemplates(): MissionWorkflowTemplate[] {
  return MISSION_WORKFLOW_TEMPLATES.map(t => ({
    ...t,
    pipeline: structuredClone(t.pipeline),
    rulesDefaults: { ...t.rulesDefaults },
  }));
}

export function resolveMissionPipeline(mission: {
  pipeline?: unknown;
  rules?: unknown;
}): WorkflowPipelineDefinition {
  const p = mission.pipeline;
  if (p && typeof p === 'object' && Array.isArray((p as WorkflowPipelineDefinition).steps)) {
    return p as WorkflowPipelineDefinition;
  }
  const rules = (mission.rules || {}) as Record<string, unknown>;
  const templateId = typeof rules.templateId === 'string' ? rules.templateId : null;
  const tmpl = templateId ? getMissionWorkflowTemplate(templateId) : undefined;
  if (tmpl) return structuredClone(tmpl.pipeline);
  return buildDefaultLeadPipeline({
    minScore: typeof rules.minScore === 'number' ? rules.minScore : undefined,
    notifyScore: typeof rules.notifyScore === 'number' ? rules.notifyScore : undefined,
  });
}
