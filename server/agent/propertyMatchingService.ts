/**
 * Deterministic property matching MVP for Lead Intelligence (no vector DB).
 */

import { prisma } from '../prisma';

export interface MatchedProperty {
  propertyId: string;
  title: string;
  matchScore: number;
  reasons: string[];
  price: number | null;
  location: string | null;
  url: string | null;
}

export interface PropertyMatchResult {
  items: MatchedProperty[];
  missingReason: string | null;
}

export async function matchPropertiesForLead(input: {
  companyId: string | null;
  classification: string;
  budgetMin?: number | null;
  budgetMax?: number | null;
  location?: string | null;
  propertyTypes?: string[];
  purpose?: string | null;
  requirements?: string[];
  limit?: number;
}): Promise<PropertyMatchResult> {
  const demand = ['buyer', 'renter', 'investor'];
  if (!demand.includes(input.classification)) {
    return {
      items: [],
      missingReason: 'Không match kho BĐS cho tín hiệu phía cung / ngoài target.',
    };
  }

  if (!input.companyId) {
    return { items: [], missingReason: 'Thiếu companyId để tìm bất động sản.' };
  }

  const hasSignal =
    Boolean(input.location) ||
    Boolean(input.budgetMin || input.budgetMax) ||
    Boolean(input.propertyTypes?.length);

  if (!hasSignal) {
    return {
      items: [],
      missingReason: 'Thiếu ngân sách, khu vực hoặc loại tài sản để match.',
    };
  }

  // Prefer Listing / Property models if present in this codebase
  const listings = await loadCandidateListings(input.companyId, input.limit ?? 40);
  if (!listings.length) {
    return { items: [], missingReason: 'Chưa có dữ liệu bất động sản trong kho.' };
  }

  const scored = listings
    .map(listing => scoreListing(listing, input))
    .filter(item => item.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 5);

  return {
    items: scored,
    missingReason: scored.length ? null : 'Không có bất động sản đủ điều kiện match.',
  };
}

type CandidateListing = {
  id: string;
  title: string;
  price: number | null;
  location: string | null;
  propertyType: string | null;
  area: number | null;
  url: string | null;
};

async function loadCandidateListings(
  companyId: string,
  take: number,
): Promise<CandidateListing[]> {
  // Best-effort: try common table names used in this CMS.
  try {
    const rows = await prisma.$queryRawUnsafe<
      Array<{
        id: string;
        title: string | null;
        price: number | bigint | null;
        location: string | null;
        property_type: string | null;
        area: number | null;
        slug: string | null;
      }>
    >(
      `SELECT id, title, price, location, property_type, area, slug
       FROM listings
       WHERE company_id = $1
       ORDER BY updated_at DESC NULLS LAST
       LIMIT $2`,
      companyId,
      take,
    );
    return rows.map(r => ({
      id: r.id,
      title: r.title || 'Bất động sản',
      price: r.price == null ? null : Number(r.price),
      location: r.location,
      propertyType: r.property_type,
      area: r.area,
      url: r.slug ? `/listings/${r.slug}` : null,
    }));
  } catch {
    // Table may not exist — soft fail
  }

  try {
    const rows = await prisma.$queryRawUnsafe<
      Array<{
        id: string;
        title: string | null;
        price: number | bigint | null;
        address: string | null;
        type: string | null;
        area: number | null;
      }>
    >(
      `SELECT id, title, price, address, type, area
       FROM properties
       WHERE company_id = $1
       ORDER BY updated_at DESC NULLS LAST
       LIMIT $2`,
      companyId,
      take,
    );
    return rows.map(r => ({
      id: r.id,
      title: r.title || 'Bất động sản',
      price: r.price == null ? null : Number(r.price),
      location: r.address,
      propertyType: r.type,
      area: r.area,
      url: null,
    }));
  } catch {
    return [];
  }
}

function scoreListing(
  listing: CandidateListing,
  input: {
    budgetMin?: number | null;
    budgetMax?: number | null;
    location?: string | null;
    propertyTypes?: string[];
  },
): MatchedProperty {
  let score = 0;
  const reasons: string[] = [];

  if (input.propertyTypes?.length && listing.propertyType) {
    const hit = input.propertyTypes.some(t =>
      listing.propertyType!.toLowerCase().includes(t.toLowerCase()),
    );
    if (hit) {
      score += 35;
      reasons.push(`Loại BĐS khớp: ${listing.propertyType}`);
    }
  }

  if (input.location && listing.location) {
    const loc = input.location.toLowerCase();
    const hay = listing.location.toLowerCase();
    if (hay.includes(loc) || loc.includes(hay)) {
      score += 30;
      reasons.push(`Khu vực khớp: ${listing.location}`);
    }
  }

  if (listing.price != null && (input.budgetMin != null || input.budgetMax != null)) {
    const min = input.budgetMin ?? 0;
    const max = input.budgetMax ?? Number.MAX_SAFE_INTEGER;
    if (listing.price >= min * 0.85 && listing.price <= max * 1.15) {
      score += 30;
      reasons.push('Giá nằm trong khoảng ngân sách (±15%)');
    } else if (listing.price < min || listing.price > max) {
      score -= 10;
      reasons.push('Giá ngoài ngân sách');
    }
  }

  return {
    propertyId: listing.id,
    title: listing.title,
    matchScore: Math.max(0, Math.min(100, score)),
    reasons,
    price: listing.price,
    location: listing.location,
    url: listing.url,
  };
}
