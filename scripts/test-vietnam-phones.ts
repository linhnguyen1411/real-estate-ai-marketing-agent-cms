/**
 * Test cases for extractVietnamPhones
 * Run: npm run test:phones
 */
import { extractVietnamPhones } from '../server/lib/extractVietnamPhones';

type Case = {
  name: string;
  input: string;
  expectValid?: string[];
  expectPossible?: string[];
  expectNoValid?: boolean;
  expectRaw?: boolean;
};

const cases: Case[] = [
  {
    name: 'LH spaced mobile',
    input: 'Bán đất Hòa Xuân LH 0905 777 594',
    expectValid: ['0905777594']
  },
  {
    name: 'Zalo spaced',
    input: 'Liên hệ zalo: 0337 2356 123',
    expectRaw: true
  },
  {
    name: 'Call +84',
    input: 'Call +84 911 796 192',
    expectValid: ['0911796192']
  },
  {
    name: 'Price and area only',
    input: 'Giá 8.9 tỷ diện tích 100m2 ngang 5x20',
    expectNoValid: true
  },
  {
    name: 'Short possible',
    input: 'lh 09999999',
    expectPossible: ['09999999']
  },
  {
    name: 'Two valid phones',
    input: 'SĐT 0905.123.456 hoặc 0935-888-999',
    expectValid: ['0905123456', '0935888999']
  },
  {
    name: 'Plain 10 digit',
    input: '0905123456',
    expectValid: ['0905123456']
  },
  {
    name: 'Dots',
    input: '0911.796.192',
    expectValid: ['0911796192']
  },
  {
    name: 'Dashes',
    input: '0905-777-594',
    expectValid: ['0905777594']
  },
  {
    name: 'Parentheses +84',
    input: '(+84) 905 777 594',
    expectValid: ['0905777594']
  },
  {
    name: '84 prefix spaced',
    input: '84 911 796 192',
    expectValid: ['0911796192']
  },
  {
    name: 'Huge price number',
    input: 'Giá 1200000000 đ',
    expectNoValid: true
  },
  {
    name: 'BDS post with ty near phone',
    input: 'Bán đất Hòa Xuân giá 5 tỷ LH 0905777594',
    expectValid: ['0905777594']
  },
  {
    name: 'BDS post with trieu and m2',
    input: 'Nhà 100m2 giá 5tr liên hệ 0911796192',
    expectValid: ['0911796192']
  },
  {
    name: '9 digit incomplete',
    input: 'liên hệ 090512345',
    expectPossible: ['090512345']
  }
];

let passed = 0;
let failed = 0;

for (const c of cases) {
  const result = extractVietnamPhones(c.input);
  let ok = true;
  const errors: string[] = [];

  if (c.expectValid) {
    for (const p of c.expectValid) {
      if (!result.validPhones.includes(p)) {
        ok = false;
        errors.push(`missing valid ${p}, got [${result.validPhones.join(', ')}]`);
      }
    }
  }

  if (c.expectPossible) {
    for (const p of c.expectPossible) {
      if (!result.possiblePhones.includes(p)) {
        ok = false;
        errors.push(`missing possible ${p}, got [${result.possiblePhones.join(', ')}]`);
      }
    }
  }

  if (c.expectNoValid && result.validPhones.length > 0) {
    ok = false;
    errors.push(`expected no valid, got [${result.validPhones.join(', ')}]`);
  }

  if (c.expectRaw && result.rawMatches.length === 0) {
    ok = false;
    errors.push('expected raw matches');
  }

  if (ok) {
    passed += 1;
    console.log(`PASS  ${c.name}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${c.name}`);
    errors.forEach(e => console.log(`      ${e}`));
    console.log(`      raw: [${result.rawMatches.join(' | ')}]`);
    console.log(`      valid: [${result.validPhones.join(', ')}] possible: [${result.possiblePhones.join(', ')}]`);
  }
}

console.log(`\n${passed}/${cases.length} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
