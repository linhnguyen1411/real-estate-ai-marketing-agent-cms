/**
 * Lead Memory — merge multi-channel signals into one Buyer (no new CRM entity).
 */

import { createHash } from 'crypto';
import { prisma } from '../../prisma';

function normalizePhone(phone: string | null | undefined): string | null {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.length < 9) return null;
  if (d.startsWith('84') && d.length >= 11) d = `0${d.slice(2)}`;
  if (d.length === 9) d = `0${d}`;
  return d.slice(-10);
}

function normalizeName(name: string | null | undefined): string | null {
  const n = String(name || '')
    .toLowerCase()
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return n.length >= 3 ? n : null;
}

export function computeBuyerKey(input: {
  companyId?: string | null;
  primaryPhone?: string | null;
  personName?: string | null;
  findingId: string;
}): string {
  const phone = normalizePhone(input.primaryPhone);
  const name = normalizeName(input.personName);
  const base = phone
    ? `phone:${phone}`
    : name
      ? `name:${name}`
      : `finding:${input.findingId}`;
  const company = input.companyId || 'global';
  return createHash('sha1').update(`${company}|${base}`).digest('hex').slice(0, 24);
}

export async function findSiblingFindings(input: {
  companyId?: string | null;
  primaryPhone?: string | null;
  personName?: string | null;
  findingId: string;
  limit?: number;
}): Promise<Array<{ id: string; title: string; createdAt: Date; extractedData: unknown; sourceId: string }>> {
  const phone = normalizePhone(input.primaryPhone);
  const name = normalizeName(input.personName);
  if (!phone && !name) return [];

  const wherePhone = phone
    ? {
        ...(input.companyId ? { companyId: input.companyId } : {}),
        primaryPhone: { contains: phone.slice(-9) },
        id: { not: input.findingId },
        status: { notIn: ['duplicate'] },
      }
    : null;

  const rows = wherePhone
    ? await prisma.agentFinding.findMany({
        where: wherePhone,
        orderBy: { createdAt: 'asc' },
        take: input.limit ?? 20,
        select: {
          id: true,
          title: true,
          createdAt: true,
          extractedData: true,
          sourceId: true,
          primaryPhone: true,
          personName: true,
        },
      })
    : [];

  // Soft name match if no phone siblings
  if (!rows.length && name) {
    const byName = await prisma.agentFinding.findMany({
      where: {
        ...(input.companyId ? { companyId: input.companyId } : {}),
        personName: { contains: name.slice(0, 24), mode: 'insensitive' },
        id: { not: input.findingId },
        status: { notIn: ['duplicate', 'dismissed'] },
      },
      orderBy: { createdAt: 'asc' },
      take: input.limit ?? 12,
      select: {
        id: true,
        title: true,
        createdAt: true,
        extractedData: true,
        sourceId: true,
      },
    });
    return byName;
  }

  return rows.map(r => ({
    id: r.id,
    title: r.title,
    createdAt: r.createdAt,
    extractedData: r.extractedData,
    sourceId: r.sourceId,
  }));
}

export function pickCanonicalFindingId(
  currentId: string,
  siblings: Array<{ id: string; createdAt: Date }>,
): string {
  if (!siblings.length) return currentId;
  const oldest = [...siblings].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
  return oldest && oldest.createdAt.getTime() < Date.now() ? oldest.id : currentId;
  // Prefer oldest sibling as canonical memory root
}
