import type { Prisma } from '@prisma/client';
import { prisma } from '../../prisma';
import type { Property } from '../../../src/types';
import { filterPublicProperties } from '../../publicPropertyMapper';
import { getProperties } from '../../dbHelper';
import {
  buildSunGroupCmsRecordWhere,
  isSunGroupChildProjectSlug,
  isSunGroupPortfolioSlug,
  matchesPortfolioProject,
  getSunGroupSearchTokens,
} from '../../../src/seo/portfolioPropertyMatch';

/**
 * Resolve properties for a portfolio / project page slug.
 * Prefer in-memory cache (same source as /api/public/properties); Prisma OR
 * path is available for direct DB reads / verification.
 */
export function getPropertiesForPortfolioSlug(projectSlug: string): Property[] {
  const slug = String(projectSlug || '').trim();
  const publicList = filterPublicProperties(getProperties()) as Property[];
  if (!slug) return publicList;
  return publicList.filter(property => matchesPortfolioProject(property, slug));
}

export function buildPortfolioCmsWhere(projectSlug: string): Prisma.CmsRecordWhereInput | null {
  const slug = String(projectSlug || '')
    .trim()
    .toLowerCase();
  if (!slug) return null;

  if (isSunGroupPortfolioSlug(slug)) {
    return buildSunGroupCmsRecordWhere() as Prisma.CmsRecordWhereInput;
  }

  if (isSunGroupChildProjectSlug(slug)) {
    const tokens = getSunGroupSearchTokens().filter(token => {
      const hay = token.toLowerCase();
      if (slug.includes('symphony')) return /symphony/.test(hay);
      if (slug.includes('cosmo')) return /cosmo/.test(hay);
      if (slug.includes('ponte')) return /ponte/.test(hay);
      if (slug.includes('cora')) return /cora/.test(hay);
      if (slug.includes('spana')) return /spana/.test(hay);
      if (slug.includes('slight') || slug.includes('s-light')) return /light/.test(hay);
      if (slug.includes('sonata')) return /sonata/.test(hay);
      return false;
    });
    const effective = tokens.length ? tokens : [slug.replace(/-/g, ' ')];
    return {
      collection: 'properties',
      OR: effective.map(token => ({
        searchText: { contains: token, mode: 'insensitive' as const },
      })),
    };
  }

  return null;
}

/**
 * Direct Prisma query — OR over searchText tokens.
 * Note: there is no `projectSlug` / `developer` column on CmsRecord; tokens cover
 * project_name + title content already indexed into searchText.
 */
export async function queryPropertiesByPortfolioSlug(projectSlug: string): Promise<Property[]> {
  const where = buildPortfolioCmsWhere(projectSlug);
  if (!where) {
    return getPropertiesForPortfolioSlug(projectSlug);
  }

  const rows = await prisma.cmsRecord.findMany({
    where: {
      AND: [
        where,
        {
          OR: [{ saleStatus: null }, { saleStatus: { notIn: ['sold', 'hidden'] } }],
        },
      ],
    },
    orderBy: { createdAt: 'desc' },
  });

  const properties = rows.map(row => row.data as unknown as Property);
  return filterPublicProperties(properties).filter(property =>
    matchesPortfolioProject(property, projectSlug),
  ) as Property[];
}
