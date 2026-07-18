/**
 * Backward-compatible facade.
 * Official registry source now lives in mission-engine domain.
 */

import {
  LEGACY_MISSION_TEMPLATES,
  type LegacyMissionTemplate as MissionTemplate,
  type LegacyMissionTemplateRules as MissionTemplateRules,
  type LegacyMissionTemplateSchedule as MissionTemplateSchedule,
  buildLegacyMissionPayloadFromTemplate,
  getLegacyMissionTemplateById,
  listLegacyMissionTemplates,
} from '../modules/mission-engine/domain/legacyMissionTemplates';

export type { MissionTemplate, MissionTemplateRules, MissionTemplateSchedule };

export const MISSION_TEMPLATES = LEGACY_MISSION_TEMPLATES;

export const getMissionTemplateById = getLegacyMissionTemplateById;

export const listMissionTemplates = listLegacyMissionTemplates;

export const buildMissionPayloadFromTemplate = buildLegacyMissionPayloadFromTemplate;
