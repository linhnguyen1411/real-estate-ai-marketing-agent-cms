import type { InternalLinkEdge, InternalLinkNode, InternalLinkRelation } from '../types/InternalLink';
import {
  getInternalLinkNodeRecord,
  listInternalLinkEdgeRecords,
  listInternalLinkNodeRecords,
} from '../data/internalLinks';
import { normalizePathname } from '../utils/normalizeCanonical';

export type ResolveInternalLinksInput = {
  slug: string;
  relation?: InternalLinkRelation;
};

export type ResolvedInternalLinks = {
  node?: InternalLinkNode;
  edges: InternalLinkEdge[];
  related: { slug: string; label?: string; relation: InternalLinkRelation }[];
};

/**
 * Pure internal-link resolver — graph lookup only, no HTML.
 */
export function resolveInternalLinks(input: ResolveInternalLinksInput): ResolvedInternalLinks {
  const slug = normalizePathname(input.slug);
  const node = getInternalLinkNodeRecord(slug);
  const edges = listInternalLinkEdgeRecords().filter(edge => {
    if (edge.fromSlug !== slug && edge.toSlug !== slug) return false;
    if (input.relation && edge.relation !== input.relation) return false;
    return true;
  });

  const related: ResolvedInternalLinks['related'] = [];
  if (node) {
    const pushMany = (slugs: string[] | undefined, relation: InternalLinkRelation) => {
      for (const target of slugs || []) {
        if (input.relation && input.relation !== relation) continue;
        const targetNode = getInternalLinkNodeRecord(target);
        related.push({ slug: target, label: targetNode?.label, relation });
      }
    };
    if (node.parentSlug) pushMany([node.parentSlug], 'parent');
    pushMany(node.childSlugs, 'children');
    pushMany(node.relatedSlugs, 'related');
    pushMany(node.comparisonSlugs, 'comparison');
    pushMany(node.financialSlugs, 'financial');
    pushMany(node.locationSlugs, 'location');
    pushMany(node.projectSlugs, 'project');
    pushMany(node.articleSlugs, 'article');
  }

  for (const edge of edges) {
    const target = edge.fromSlug === slug ? edge.toSlug : edge.fromSlug;
    if (!related.some(item => item.slug === target && item.relation === edge.relation)) {
      related.push({ slug: target, label: edge.label, relation: edge.relation });
    }
  }

  return { node, edges, related };
}

export function resolveAllInternalLinkNodes(): readonly InternalLinkNode[] {
  return listInternalLinkNodeRecords();
}
