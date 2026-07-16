import type { WorkflowPipelineDefinition } from './workflowTypes';
import { buildDefaultLeadPipeline } from './workflowPolicies';
import {
  type MissionWorkflowTemplate,
  getMissionWorkflowTemplate,
  listMissionWorkflowTemplates,
} from './missionTemplates';
import {
  type LegacyMissionTemplate,
  buildLegacyMissionPayloadFromTemplate,
  getLegacyMissionTemplateById,
  listLegacyMissionTemplates,
} from './legacyMissionTemplates';

export interface MissionRegistryEntry {
  id: string;
  kind: 'workflow_v2' | 'legacy_v1';
  name: string;
  objective: string;
}

export function listMissionRegistryEntries(): MissionRegistryEntry[] {
  const v2 = listMissionWorkflowTemplates().map<MissionRegistryEntry>(t => ({
    id: t.id,
    kind: 'workflow_v2',
    name: t.name,
    objective: t.objective,
  }));
  const v1 = listLegacyMissionTemplates().map<MissionRegistryEntry>(t => ({
    id: t.id,
    kind: 'legacy_v1',
    name: t.name,
    objective: t.objective,
  }));
  return [...v2, ...v1];
}

export function getRegisteredWorkflowTemplate(id: string): MissionWorkflowTemplate | undefined {
  return getMissionWorkflowTemplate(id);
}

export function getRegisteredLegacyTemplate(id: string): LegacyMissionTemplate | undefined {
  return getLegacyMissionTemplateById(id);
}

export function buildPayloadFromRegisteredLegacyTemplate(
  template: LegacyMissionTemplate,
  overrides?: {
    sourceIds?: string[];
    name?: string;
    objective?: string;
    status?: string;
  },
) {
  return buildLegacyMissionPayloadFromTemplate(template, overrides);
}

export function resolveMissionPipelineFromRegistry(mission: {
  pipeline?: unknown;
  rules?: unknown;
}): WorkflowPipelineDefinition {
  const p = mission.pipeline;
  if (p && typeof p === 'object' && Array.isArray((p as WorkflowPipelineDefinition).steps)) {
    return p as WorkflowPipelineDefinition;
  }

  const rules = (mission.rules || {}) as Record<string, unknown>;
  const templateId = typeof rules.templateId === 'string' ? rules.templateId : null;
  const tmpl = templateId ? getRegisteredWorkflowTemplate(templateId) : undefined;
  if (tmpl) return structuredClone(tmpl.pipeline);

  return buildDefaultLeadPipeline({
    minScore: typeof rules.minScore === 'number' ? rules.minScore : undefined,
    notifyScore: typeof rules.notifyScore === 'number' ? rules.notifyScore : undefined,
  });
}
