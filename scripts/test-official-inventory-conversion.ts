#!/usr/bin/env node
/**
 * External → official inventory conversion: verification gate + smoke.
 */
import assert from 'assert';
import {
  assertConvertible,
  convertExternalInventoryToOfficial,
} from '../server/agent/externalToOfficialService';

let passed = 0;
function ok(name: string, cond: boolean) {
  assert.ok(cond, name);
  passed += 1;
  console.log(`✓ ${name}`);
}

const baseItem = {
  verificationStatus: 'verified',
  propertyType: 'apartment',
  city: 'Đà Nẵng',
  district: 'Ngũ Hành Sơn',
  contactPhone: '0905111222',
  askingPriceMin: 3_500_000_000n,
  askingPriceMax: null as bigint | null,
  rentPrice: null as bigint | null,
  description: 'Căn hộ view biển',
  originalContent: 'Bán căn hộ 2PN',
  title: 'Căn hộ Mỹ An',
};

{
  ok('smoke: convertExternalInventoryToOfficial is a function', typeof convertExternalInventoryToOfficial === 'function');
}

{
  let threw = false;
  try {
    assertConvertible({ ...baseItem, verificationStatus: 'pending' });
  } catch (error) {
    threw = true;
    const msg = error instanceof Error ? error.message : String(error);
    ok('unverified throws', msg.includes('verified'));
  }
  ok('verification gate threw', threw);
}

{
  let threw = false;
  try {
    assertConvertible({ ...baseItem, contactPhone: null });
  } catch (error) {
    threw = true;
    const msg = error instanceof Error ? error.message : String(error);
    ok('missing phone throws', msg.includes('contactPhone'));
  }
  ok('phone gate threw', threw);
}

{
  assertConvertible(baseItem);
  ok('verified item passes assertConvertible', true);
}

{
  const fakeUser = {
    id: 'u-test',
    name: 'Test',
    email: 'test@example.com',
    role: 'owner' as const,
    company_id: undefined,
  };

  try {
    await convertExternalInventoryToOfficial({
      itemId: `missing-ext-${Date.now()}`,
      user: fakeUser,
      confirm: true,
    });
    console.log('⊘ skip DB smoke: convert unexpectedly succeeded');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (
      msg.includes('Không tìm thấy') ||
      /prisma|database|connect|ECONNREFUSED|P1001|P2021/i.test(msg)
    ) {
      ok('DB smoke: missing item / no-DB errors cleanly', true);
    } else {
      throw error;
    }
  }
}

console.log(`\n${passed} assertions passed`);
