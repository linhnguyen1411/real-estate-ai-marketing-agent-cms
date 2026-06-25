import {
  INVESTMENT_MAP_ZONES,
  MARKET_REPORT_SECTIONS,
  OPPORTUNITY_GROUPS,
} from '../../src/leadGen/leadMagnetFramework';
import { normalizeOpportunityGroups } from '../../src/leadGen/normalizeOpportunityGroup';
import { LEAD_MAGNETS, getLeadMagnet } from '../../src/leadGen/leadMagnets';
import type {
  LeadMagnetContent,
  LeadMagnetContentMeta,
  LeadMagnetContentSource,
} from '../../src/types/leadMagnetContent';
import { LEAD_MAGNET_FRAMEWORK_SOURCE_LABEL } from '../../src/types/leadMagnetContent';

const DEFAULT_SOURCE: LeadMagnetContentSource = 'static-framework';

function withFrameworkMeta<T extends Omit<LeadMagnetContent, 'source' | 'sourceLabel'>>(
  content: T
): T & { source: LeadMagnetContentSource; sourceLabel: string } {
  return {
    ...content,
    source: DEFAULT_SOURCE,
    sourceLabel: LEAD_MAGNET_FRAMEWORK_SOURCE_LABEL,
  };
}

export function getLeadMagnetContent(slug: string): LeadMagnetContent | null {
  const magnet = getLeadMagnet(slug);
  if (!magnet) return null;

  if (slug === 'bao-cao-nam-da-nang-2026') {
    return withFrameworkMeta({
      type: 'report',
      sections: MARKET_REPORT_SECTIONS,
    });
  }

  if (slug === 'top-20-co-hoi-dau-tu') {
    return withFrameworkMeta({
      type: 'opportunity-framework',
      groups: normalizeOpportunityGroups(OPPORTUNITY_GROUPS),
    });
  }

  if (slug === 'ban-do-dau-tu-nam-da-nang') {
    return withFrameworkMeta({
      type: 'map',
      zones: INVESTMENT_MAP_ZONES,
    });
  }

  return null;
}

export function listLeadMagnetContentMeta(): LeadMagnetContentMeta[] {
  return LEAD_MAGNETS.map(magnet => {
    const content = getLeadMagnetContent(magnet.slug);
    const itemCount =
      content?.type === 'opportunity-framework'
        ? content.groups.length
        : content?.type === 'report'
          ? content.sections.length
          : content?.type === 'map'
            ? content.zones.length
            : 0;

    return {
      slug: magnet.slug,
      title: magnet.title,
      contentType: content?.type ?? 'report',
      source: content?.source ?? DEFAULT_SOURCE,
      itemCount,
    };
  });
}
