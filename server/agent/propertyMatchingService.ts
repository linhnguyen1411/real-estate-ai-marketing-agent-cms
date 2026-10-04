/**
 * Auto-Matching Engine & Dual-Inventory Architecture.
 *
 * Implements Stage 4 of Master Plan:
 * 1. Dual-Inventory:
 *    - In-house Inventory (Primary): properties from cms_records (collection='properties')
 *    - Market Feed (Fallback): verified items from external_inventory_items
 * 2. Auto-Matching:
 *    - Criteria: Area/Location (+35%), Budget ±15% (+30%), Property Type (+35%)
 *    - Returns top 3-5 best matching properties with % compatibility
 */

import { prisma } from '../prisma';

export interface MatchedProperty {
  propertyId: string;
  title: string;
  matchScore: number;
  compatibilityPct: number;
  reasons: string[];
  price: number | null;
  priceDisplay: string;
  location: string | null;
  propertyType: string | null;
  inventorySource: 'in_house' | 'market_feed';
  url: string | null;
  shareUrl?: string | null;
}

export interface PropertyMatchResult {
  items: MatchedProperty[];
  missingReason: string | null;
}

type CandidateListing = {
  id: string;
  title: string;
  price: number | null;
  location: string | null;
  propertyType: string | null;
  area: number | null;
  inventorySource: 'in_house' | 'market_feed';
  slug: string | null;
};

function formatPriceDisplay(price: number | null): string {
  if (price == null || price <= 0) return 'Thương lượng';
  if (price >= 1_000_000_000) {
    const ty = (price / 1_000_000_000).toFixed(2).replace(/\.?0+$/, '');
    return `${ty} tỷ`;
  }
  if (price >= 1_000_000) {
    const tr = Math.round(price / 1_000_000);
    return `${tr} triệu`;
  }
  return `${price.toLocaleString('vi-VN')} đ`;
}

async function loadInHouseProperties(take = 50): Promise<CandidateListing[]> {
  try {
    const records = await prisma.cmsRecord.findMany({
      where: { collection: 'properties' },
      orderBy: { updatedAt: 'desc' },
      take,
    });

    return records.map(r => {
      const data = (r.data || {}) as Record<string, any>;
      return {
        id: r.id,
        title: String(data.title || 'Bất động sản House & Life'),
        price: data.price != null ? Number(data.price) : null,
        location: String(data.location || data.address || ''),
        propertyType: String(data.type || data.property_type || ''),
        area: data.area != null ? Number(data.area) : null,
        inventorySource: 'in_house',
        slug: data.slug || r.id,
      };
    });
  } catch (err) {
    console.warn('[propertyMatching] Failed to load in-house properties:', err);
    return [];
  }
}

async function loadMarketFeedProperties(take = 30): Promise<CandidateListing[]> {
  try {
    const items = await prisma.externalInventoryItem.findMany({
      where: { status: 'active' },
      orderBy: { createdAt: 'desc' },
      take,
    });

    return items.map(item => ({
      id: item.id,
      title: item.title,
      price: item.askingPriceMin ? Number(item.askingPriceMin) : item.askingPriceMax ? Number(item.askingPriceMax) : null,
      location: [item.project, item.ward, item.district, item.city].filter(Boolean).join(', ') || item.city || '',
      propertyType: item.propertyType,
      area: item.areaMinM2 ?? item.areaMaxM2 ?? null,
      inventorySource: 'market_feed',
      slug: null,
    }));
  } catch (err) {
    console.warn('[propertyMatching] Failed to load market feed properties:', err);
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

  // 1. Property Type match (+35%)
  if (input.propertyTypes?.length && listing.propertyType) {
    const hit = input.propertyTypes.some(t =>
      listing.propertyType!.toLowerCase().includes(t.toLowerCase()) ||
      t.toLowerCase().includes(listing.propertyType!.toLowerCase()),
    );
    if (hit) {
      score += 35;
      reasons.push(`Khớp loại BĐS: ${listing.propertyType}`);
    }
  }

  // 2. Location match (+35%)
  if (input.location && listing.location) {
    const loc = input.location.toLowerCase();
    const hay = listing.location.toLowerCase();
    if (hay.includes(loc) || loc.includes(hay)) {
      score += 35;
      reasons.push(`Khớp khu vực: ${listing.location}`);
    }
  }

  // 3. Price / Budget match (±15%) (+30%)
  if (listing.price != null && (input.budgetMin != null || input.budgetMax != null)) {
    const min = input.budgetMin ?? 0;
    const max = input.budgetMax ?? Number.MAX_SAFE_INTEGER;
    // Allow ±15% tolerance
    const minWithTol = min * 0.85;
    const maxWithTol = max * 1.15;

    if (listing.price >= minWithTol && listing.price <= maxWithTol) {
      score += 30;
      reasons.push('Mức giá phù hợp ngân sách (dung sai ±15%)');
    } else if (listing.price < minWithTol || listing.price > maxWithTol) {
      score -= 10;
      reasons.push('Mức giá nằm ngoài khoảng ngân sách dự kiến');
    }
  }

  // Prioritize In-House Inventory (+5 bonus)
  if (listing.inventorySource === 'in_house') {
    score += 5;
  }

  const finalScore = Math.max(0, Math.min(100, score));

  return {
    propertyId: listing.id,
    title: listing.title,
    matchScore: finalScore,
    compatibilityPct: finalScore,
    reasons,
    price: listing.price,
    priceDisplay: formatPriceDisplay(listing.price),
    location: listing.location,
    propertyType: listing.propertyType,
    inventorySource: listing.inventorySource,
    url: listing.slug ? `/p/${listing.slug}` : null,
    shareUrl: listing.slug ? `https://bdsdanang.site/p/${listing.slug}` : null,
  };
}

export async function matchPropertiesForLead(input: {
  companyId?: string | null;
  classification: string;
  budgetMin?: number | null;
  budgetMax?: number | null;
  location?: string | null;
  propertyTypes?: string[];
  purpose?: string | null;
  requirements?: string[];
  limit?: number;
}): Promise<PropertyMatchResult> {
  const demandClassifications = ['buyer', 'renter', 'investor'];
  if (!demandClassifications.includes(input.classification)) {
    return {
      items: [],
      missingReason: 'Không khớp kho BĐS cho tín hiệu phía cung hoặc ngoài mục tiêu.',
    };
  }

  const hasSignal =
    Boolean(input.location) ||
    Boolean(input.budgetMin || input.budgetMax) ||
    Boolean(input.propertyTypes?.length);

  if (!hasSignal) {
    return {
      items: [],
      missingReason: 'Thiếu thông tin vị trí, ngân sách hoặc loại tài sản để so khớp.',
    };
  }

  // Dual-inventory query: First try In-House Inventory
  const inHouseCandidates = await loadInHouseProperties(50);
  let scored = inHouseCandidates
    .map(c => scoreListing(c, input))
    .filter(item => item.matchScore >= 40)
    .sort((a, b) => b.matchScore - a.matchScore);

  // If in-house has fewer than 3 matches, complement with Market Feed candidates
  if (scored.length < 3) {
    const marketCandidates = await loadMarketFeedProperties(30);
    const scoredMarket = marketCandidates
      .map(c => scoreListing(c, input))
      .filter(item => item.matchScore >= 40)
      .sort((a, b) => b.matchScore - a.matchScore);

    scored = [...scored, ...scoredMarket].slice(0, input.limit ?? 5);
  } else {
    scored = scored.slice(0, input.limit ?? 5);
  }

  return {
    items: scored,
    missingReason: scored.length ? null : 'Chưa có bất động sản nào trong kho đạt độ tương thích ≥ 40%.',
  };
}
