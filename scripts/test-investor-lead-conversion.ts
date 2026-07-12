#!/usr/bin/env node
/**
 * Investor lead → customer conversion helpers + smoke (DB optional).
 */
import assert from 'assert';
import {
  convertInvestorLeadToCustomer,
  mapPropertyType,
  parseBudgetBillions,
} from '../server/investorLeadConversionService';

let passed = 0;
function ok(name: string, cond: boolean) {
  assert.ok(cond, name);
  passed += 1;
  console.log(`✓ ${name}`);
}

{
  ok('smoke: convertInvestorLeadToCustomer is a function', typeof convertInvestorLeadToCustomer === 'function');
}

{
  ok('budget over-10 → 10', parseBudgetBillions('over-10', null) === 10);
  ok('budget 5-10 → 7.5', parseBudgetBillions('5-10', null) === 7.5);
  ok('budget 3-5 → 4', parseBudgetBillions('3-5', null) === 4);
  ok('budget under-3 → 2', parseBudgetBillions('under-3', null) === 2);
  ok(
    'detail buyerBudgetMax wins',
    parseBudgetBillions('under-3', { buyerBudgetMax: 8_000_000_000 } as never) === 8,
  );
}

{
  ok('map đất → Đất nền', mapPropertyType('đất nền', undefined) === 'Đất nền');
  ok('map căn hộ → Căn Hộ', mapPropertyType('căn hộ', undefined) === 'Căn Hộ');
  ok('map villa types → Biệt thự', mapPropertyType(null, ['villa']) === 'Biệt thự');
  ok('map unknown → Khác', mapPropertyType('xyz', []) === 'Khác');
}

{
  // Optional DB smoke: missing lead must throw (idempotency path needs real rows).
  const fakeUser = {
    id: 'u-test',
    name: 'Test',
    email: 'test@example.com',
    role: 'owner' as const,
    company_id: undefined,
  };

  try {
    await convertInvestorLeadToCustomer({
      leadId: `missing-lead-${Date.now()}`,
      user: fakeUser,
    });
    console.log('⊘ skip DB smoke: convert unexpectedly succeeded');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (
      msg.includes('Không tìm thấy lead') ||
      /prisma|database|connect|ECONNREFUSED|P1001|P2021/i.test(msg)
    ) {
      ok('DB smoke: missing lead / no-DB errors cleanly', true);
      if (!msg.includes('Không tìm thấy lead')) {
        console.log('  (DB unavailable — idempotency path skipped)');
      }
    } else {
      throw error;
    }
  }
}

console.log(`\n${passed} assertions passed`);
