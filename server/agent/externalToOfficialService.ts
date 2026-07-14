/**
 * Convert verified ExternalInventoryItem → official CMS Property.
 *
 * Expected ExternalInventoryItem fields (optional / not yet in schema):
 * - officialPropertyId, convertedAt, convertedBy
 * Until migrated, status=`converted_to_official` + rawData.officialPropertyId.
 */

import crypto from 'crypto';
import type { AuthUser } from '../../src/types';
import { prisma } from '../prisma';
import { createProperty } from '../dbHelper';
import { canAccessAgentRecord } from './agentDb';

export type ConvertExternalToOfficialResult = {
  outcome: 'created' | 'existing';
  propertyId: string;
  itemId: string;
};

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

function mapPropertyTypeLabel(raw: string | null | undefined): string {
  const t = String(raw || '').toLowerCase();
  if (/land|đất|dat|lô/.test(t)) return 'Đất nền';
  if (/apartment|căn hộ|can ho/.test(t)) return 'Căn Hộ';
  if (/townhouse|nhà phố|nha pho/.test(t)) return 'Nhà Phố';
  if (/shophouse/.test(t)) return 'Shophouse';
  if (/villa|biệt thự|biet thu/.test(t)) return 'Biệt thự';
  if (/warehouse|kho|xưởng/.test(t)) return 'Kho xưởng';
  if (/hotel|khách sạn/.test(t)) return 'Khách sạn';
  if (/restaurant|nhà hàng/.test(t)) return 'Nhà hàng';
  return raw && raw.length < 40 ? raw : 'Khác';
}

function priceToBillions(value: bigint | number | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === 'bigint' ? Number(value) : Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  // External prices are typically VND; CMS property.price is tỷ
  if (n >= 1_000_000) return Math.round((n / 1_000_000_000) * 1000) / 1000;
  return n;
}

function readOfficialPropertyId(item: {
  status: string;
  rawData: unknown;
}): string | null {
  const raw = (item.rawData || {}) as Record<string, unknown>;
  if (typeof raw.officialPropertyId === 'string' && raw.officialPropertyId) {
    return raw.officialPropertyId;
  }
  return null;
}

/** Verification + required-field gate. Exported for unit tests. */
export function assertConvertible(item: {
  verificationStatus: string;
  propertyType: string | null;
  city: string | null;
  district: string | null;
  contactPhone: string | null;
  askingPriceMin: bigint | null;
  askingPriceMax: bigint | null;
  rentPrice: bigint | null;
  description: string | null;
  originalContent: string;
  title: string;
}): void {
  if (item.verificationStatus !== 'verified') {
    throw new Error('Chỉ chuyển hàng đã verified sang kho chính thức.');
  }
  if (!item.propertyType?.trim()) {
    throw new Error('Thiếu propertyType.');
  }
  if (!item.city?.trim() && !item.district?.trim()) {
    throw new Error('Thiếu location (city hoặc district).');
  }
  if (!item.contactPhone?.trim()) {
    throw new Error('Thiếu contactPhone.');
  }
  const hasPrice =
    item.askingPriceMin != null || item.askingPriceMax != null || item.rentPrice != null;
  const hasNote = Boolean(item.description?.trim() || item.originalContent?.trim() || item.title?.trim());
  if (!hasPrice && !hasNote) {
    throw new Error('Cần có giá (price) hoặc ghi chú/mô tả (note).');
  }
  if (!item.description?.trim() && !item.originalContent?.trim()) {
    throw new Error('Thiếu description.');
  }
}

export async function convertExternalInventoryToOfficial(input: {
  itemId: string;
  user: AuthUser;
  confirm?: boolean;
}): Promise<ConvertExternalToOfficialResult> {
  const item = await prisma.externalInventoryItem.findUnique({ where: { id: input.itemId } });
  if (!item) throw new Error('Không tìm thấy external inventory item.');
  if (!canAccessAgentRecord(input.user, item.companyId)) {
    throw new Error('Không có quyền truy cập item này.');
  }

  // Idempotent if already converted
  const existingOfficialId = readOfficialPropertyId(item) || (item as { officialPropertyId?: string }).officialPropertyId;
  if (item.status === 'converted_to_official' && existingOfficialId) {
    return { outcome: 'existing', propertyId: existingOfficialId, itemId: item.id };
  }

  assertConvertible(item);

  if (!input.confirm) {
    throw new Error('Cần confirm=true để chuyển sang kho chính thức.');
  }

  const now = new Date();
  const location = [item.street, item.ward, item.district, item.city].filter(Boolean).join(', ');
  const description =
    item.description?.trim() ||
    item.originalContent.slice(0, 4000) ||
    item.title;
  const price =
    priceToBillions(item.askingPriceMin) ||
    priceToBillions(item.askingPriceMax) ||
    priceToBillions(item.rentPrice);

  const property = await createProperty({
    id: newId('p-ext'),
    title: item.title,
    type: mapPropertyTypeLabel(item.propertyType),
    transaction_type: item.transactionType === 'rent' ? 'Cho thuê' : 'Bán',
    location: location || item.city || item.district || '',
    area: item.areaMinM2 || item.areaMaxM2 || 0,
    price,
    legal_status: item.legalStatus || 'Đang cập nhật',
    direction: item.direction || '',
    road_width: 0,
    floors: item.floors ?? undefined,
    bedrooms: item.bedrooms ?? undefined,
    description,
    rich_description: item.originalContent?.slice(0, 8000) || description,
    internal_notes: [
      `Từ giỏ hàng ngoài: ${item.id}`,
      item.contactName ? `Liên hệ: ${item.contactName}` : null,
      item.contactPhone ? `SĐT: ${item.contactPhone}` : null,
      item.sourceUrl ? `Nguồn: ${item.sourceUrl}` : null,
    ]
      .filter(Boolean)
      .join('\n'),
    sale_status: 'available',
    images: '',
    selling_points: [],
    project_name: item.project || undefined,
    company_id: item.companyId || input.user.company_id,
    owner_user_id: input.user.id,
    created_by_user_id: input.user.id,
    contact_phone: item.contactPhone,
    contact_name: item.contactName,
    external_inventory_item_id: item.id,
    created_at: now.toISOString(),
  });

  const prevRaw = (item.rawData && typeof item.rawData === 'object' ? item.rawData : {}) as Record<
    string,
    unknown
  >;
  const nextRaw = {
    ...prevRaw,
    officialPropertyId: property.id,
    convertedAt: now.toISOString(),
    convertedBy: input.user.id,
  };

  try {
    await prisma.externalInventoryItem.update({
      where: { id: item.id },
      data: {
        status: 'converted_to_official',
        rawData: nextRaw,
        // Expected columns when migrated:
        ...({
          officialPropertyId: property.id,
          convertedAt: now,
          convertedBy: input.user.id,
        } as object),
      } as Parameters<typeof prisma.externalInventoryItem.update>[0]['data'],
    });
  } catch {
    await prisma.externalInventoryItem.update({
      where: { id: item.id },
      data: {
        status: 'converted_to_official',
        rawData: nextRaw,
      },
    });
  }

  await prisma.externalInventoryEvent.create({
    data: {
      id: newId('eie'),
      itemId: item.id,
      eventType: 'converted_to_official',
      note: `Chuyển sang kho chính thức: ${property.id}`,
      userId: input.user.id,
      metadata: {
        officialPropertyId: property.id,
        confirm: true,
      },
    },
  });

  return { outcome: 'created', propertyId: property.id, itemId: item.id };
}
