import type { IntegrityBlock, IntegrityCheck, SourcePerformanceRow } from './types';

type IntegrityInputs = {
  buyersTodayKpi: number;
  buyersTodayActual: number;
  qualifiedTodayKpi: number;
  qualifiedTodayActual: number;
  urgentKpi: number;
  urgentActual: number;
  pipelineKpi: number;
  pipelineActual: number;
  expectedRevenueKpi: number;
  expectedRevenueActual: number;
  sourceLeadsKpi: number;
  sourceLeadsActual: number;
  sourceBuyersKpi: number;
  sourceBuyersActual: number;
  sourceQualifiedKpi: number;
  sourceQualifiedActual: number;
  sourceInvestorsKpi: number;
  sourceInvestorsActual: number;
  sourceStatusKpi: number;
  sourceStatusActual: number;
};

function mk(name: IntegrityCheck['name'], expected: number, actual: number): IntegrityCheck {
  return {
    name,
    expected,
    actual,
    status: expected === actual ? 'OK' : 'MISMATCH',
  };
}

export function buildIntegrityBlock(input: IntegrityInputs): IntegrityBlock {
  const checks: IntegrityCheck[] = [
    mk('buyers_today', input.buyersTodayKpi, input.buyersTodayActual),
    mk('qualified_today', input.qualifiedTodayKpi, input.qualifiedTodayActual),
    mk('urgent_buyers', input.urgentKpi, input.urgentActual),
    mk('pipeline_value', input.pipelineKpi, input.pipelineActual),
    mk('expected_revenue', input.expectedRevenueKpi, input.expectedRevenueActual),
    mk('source_leads', input.sourceLeadsKpi, input.sourceLeadsActual),
    mk('source_buyers', input.sourceBuyersKpi, input.sourceBuyersActual),
    mk('source_qualified', input.sourceQualifiedKpi, input.sourceQualifiedActual),
    mk('source_investors', input.sourceInvestorsKpi, input.sourceInvestorsActual),
    mk('source_status', input.sourceStatusKpi, input.sourceStatusActual),
  ];
  const mismatchCount = checks.filter(c => c.status === 'MISMATCH').length;
  return {
    status: mismatchCount > 0 ? 'MISMATCH' : 'OK',
    checks,
    mismatchCount,
    generatedAt: new Date().toISOString(),
  };
}

const FAKE_MARKER_RE =
  /\b(?:prodv100|prodv\d+|h244|h2\.4\.|product-v|fixture|test-source|demo|mock|fake)\b/i;

export function scanSnapshotFakeMarkers(snapshot: unknown): string[] {
  const hits: string[] = [];
  const walk = (value: unknown, path: string) => {
    if (typeof value === 'string') {
      if (FAKE_MARKER_RE.test(value)) hits.push(`${path}: ${value}`);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, `${path}[${i}]`));
      return;
    }
    if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        walk(v, `${path}.${k}`);
      }
    }
  };
  walk(snapshot, 'snapshot');
  return hits;
}

export function sourceAggregate(rows: SourcePerformanceRow[]) {
  return rows.reduce(
    (acc, row) => {
      acc.leads += row.leads;
      acc.buyers += row.buyers;
      acc.qualified += row.qualified;
      acc.investors += row.investor;
      return acc;
    },
    { leads: 0, buyers: 0, qualified: 0, investors: 0 },
  );
}
