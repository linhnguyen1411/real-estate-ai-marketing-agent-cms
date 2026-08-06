#!/usr/bin/env node
/**
 * Diagnose a single AgentFinding mapping.
 *
 *   npm run agent:diagnose-finding -- --id=<findingId>
 *   npm run agent:diagnose-finding -- --sample=10
 */
import 'dotenv/config';
import { prisma } from '../server/prisma';
import { ensureDatabaseReady } from '../server/dbHelper';
import { resolveLeadIntelligence } from '../src/utils/resolveLeadIntelligence';

function argValue(...names: string[]): string | undefined {
  for (const name of names) {
    const prefix = `--${name}=`;
    const hit = process.argv.find(a => a.startsWith(prefix));
    if (hit) return hit.slice(prefix.length);
  }
  return undefined;
}

function printFinding(row: Record<string, any>) {
  const ed = (row.extractedData && typeof row.extractedData === 'object'
    ? row.extractedData
    : {}) as Record<string, any>;

  console.log('\n========== FINDING', row.id, '==========');
  console.log('\n-- Database columns --');
  console.log({
    title: row.title,
    status: row.status,
    score_legacy: row.score,
    classification: row.classification,
    intent: row.intent,
    actorRole: row.actorRole,
    keywordScore: row.keywordScore,
    aiScore: row.aiScore,
    leadFitScore: row.leadFitScore,
    finalScore: row.finalScore,
    primaryPhone: row.primaryPhone,
    primaryLocation: row.primaryLocation,
    budgetMin: row.budgetMin?.toString?.() ?? row.budgetMin,
    budgetMax: row.budgetMax?.toString?.() ?? row.budgetMax,
    propertyType: row.propertyType,
    dedupeStatus: row.dedupeStatus,
    priority: row.priority,
  });

  console.log('\n-- extractedData paths --');
  console.log({
    keys: Object.keys(ed),
    classification: ed.classification,
    leadAnalysis_classification: ed.leadAnalysis?.classification,
    actorRole: ed.actorRole,
    keywordScore: ed.keywordScore,
    aiScore: ed.aiScore,
    leadFitScore: ed.leadFitScore,
    finalScore: ed.finalScore,
    scoreBreakdown: ed.scoreBreakdown,
    intelligence_summary: ed.intelligence?.summary?.slice?.(0, 120),
    contact: ed.contact,
    money: ed.money,
    location: ed.location,
  });

  const resolved = resolveLeadIntelligence({
    ...row,
    budgetMin: row.budgetMin?.toString?.() ?? row.budgetMin,
    budgetMax: row.budgetMax?.toString?.() ?? row.budgetMax,
    askingPrice: row.askingPrice?.toString?.() ?? row.askingPrice,
  });

  console.log('\n-- Resolved schema --');
  console.log({
    classification: resolved.classification,
    intent: resolved.intent,
    actorRole: resolved.actorRole,
    keywordScore: resolved.keywordScore,
    aiScore: resolved.aiScore,
    leadFitScore: resolved.leadFitScore,
    finalScore: resolved.finalScore,
    displayScoreLabel: resolved.displayScoreLabel,
    displayClassificationLabel: resolved.displayClassificationLabel,
    analysisStatus: resolved.analysisStatus,
    showAsConfirmedLead: resolved.showAsConfirmedLead,
    phones: resolved.phones,
    location: resolved.primaryLocation,
    budgetMin: resolved.budgetMin,
    budgetMax: resolved.budgetMax,
    propertyTypes: resolved.propertyTypes,
    summary: resolved.summary.slice(0, 160),
  });

  console.log('\n-- Consistency warnings --');
  if (!resolved.consistencyWarnings.length) console.log('(none)');
  else resolved.consistencyWarnings.forEach(w => console.log('!', w));

  const missing: string[] = [];
  if (!resolved.classification) missing.push('classification');
  if (!resolved.actorRole) missing.push('actorRole');
  if (resolved.finalScore == null) missing.push('finalScore');
  if (!resolved.primaryPhone) missing.push('phone');
  if (!resolved.primaryLocation) missing.push('location');
  if (resolved.budgetMin == null && resolved.budgetMax == null) missing.push('budget');
  console.log('\n-- Fields missing --', missing.length ? missing.join(', ') : '(none critical)');
}

async function main() {
  await ensureDatabaseReady();
  const id = argValue('id');
  const sample = Math.max(0, Number(argValue('sample') || 0) || 0);

  if (id) {
    const row = await prisma.agentFinding.findUnique({ where: { id } });
    if (!row) {
      console.error('Finding not found:', id);
      process.exit(1);
    }
    printFinding(row as any);
  } else {
    const take = sample || 10;
    // Prefer a mix: buyer, renter, seller, unknown/null, dismissed, duplicate
    const groups = await Promise.all([
      prisma.agentFinding.findFirst({ where: { classification: 'buyer' } }),
      prisma.agentFinding.findFirst({ where: { classification: 'renter' } }),
      prisma.agentFinding.findFirst({ where: { classification: 'seller' } }),
      prisma.agentFinding.findFirst({
        where: { OR: [{ classification: null }, { classification: 'unknown' }] },
      }),
      prisma.agentFinding.findFirst({ where: { status: 'dismissed' } }),
      prisma.agentFinding.findFirst({ where: { dedupeStatus: 'duplicate' } }),
      prisma.agentFinding.findMany({
        where: { finalScore: null, score: { gte: 70 } },
        take: 2,
      }),
      prisma.agentFinding.findMany({ orderBy: { updatedAt: 'desc' }, take: 4 }),
    ]);

    const seen = new Set<string>();
    const rows: any[] = [];
    for (const g of groups.flat()) {
      if (!g || seen.has(g.id)) continue;
      seen.add(g.id);
      rows.push(g);
      if (rows.length >= take) break;
    }

    console.log(`Diagnosing ${rows.length} findings…`);
    let inconsistent = 0;
    let needsReanalyze = 0;
    for (const row of rows) {
      printFinding(row);
      const resolved = resolveLeadIntelligence(row);
      if (resolved.dataInconsistent) inconsistent += 1;
      if (
        resolved.analysisStatus === 'not_analyzed' ||
        resolved.analysisStatus === 'needs_review' ||
        resolved.analysisStatus === 'inconsistent'
      ) {
        needsReanalyze += 1;
      }
    }
    console.log('\n===== SAMPLE SUMMARY =====');
    console.log({ sampled: rows.length, inconsistent, needsReanalyze });
  }

  await prisma.$disconnect();
}

main().catch(async e => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
