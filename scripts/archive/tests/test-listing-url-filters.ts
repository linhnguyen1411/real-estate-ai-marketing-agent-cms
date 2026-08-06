import assert from 'node:assert/strict';

import {
  applyListingFilters,
  listingPageSizeForWidth,
  parseListingSearchParams,
  serializeListingSearchParams,
  EMPTY_LISTING_FILTERS,
  getListingFacet,
} from '../src/features/listings/listingFilters.ts';

const params = new URLSearchParams('q=mai&price=3-5&area=80-150&page=2&district=ngu-hanh-son');
const parsed = parseListingSearchParams(params);
assert.equal(parsed.q, 'mai');
assert.equal(parsed.price, '3to5');
assert.equal(parsed.area, '80to150');
assert.equal(parsed.page, 2);
assert.equal(parsed.district, 'ngu-hanh-son');

const roundTrip = serializeListingSearchParams(parsed);
assert.equal(roundTrip.get('q'), 'mai');
assert.equal(roundTrip.get('price'), '3to5');
assert.equal(roundTrip.get('page'), '2');
assert.equal(roundTrip.get('type'), null);

assert.equal(listingPageSizeForWidth(1280, 3), 9);
assert.equal(listingPageSizeForWidth(800, 3), 6);
assert.equal(listingPageSizeForWidth(400, 3), 3);
assert.equal(listingPageSizeForWidth(1280, 4), 12);

assert.ok(getListingFacet('dat-nen'));
assert.equal(getListingFacet('dat-nen')?.typeIncludes, 'đất');

const sample = [
  {
    id: '1',
    title: 'Đất Mai Đăng Chơn',
    location: 'Ngũ Hành Sơn',
    type: 'Đất nền',
    price: 4,
    area: 100,
    description: 'test',
    sale_status: 'available',
    transaction_type: 'Bán',
    project_name: 'Mai Đăng Chơn',
  },
  {
    id: '2',
    title: 'Căn hộ Symphony',
    location: 'Sơn Trà',
    type: 'Căn hộ',
    price: 8,
    area: 70,
    description: 'test',
    sale_status: 'available',
    transaction_type: 'Bán',
    project_name: 'Sun Symphony',
  },
] as any[];

const filtered = applyListingFilters(
  sample,
  { ...EMPTY_LISTING_FILTERS, q: 'mai', price: '3to5' },
  getListingFacet('dat-nen'),
);
assert.equal(filtered.length, 1);
assert.equal(filtered[0].id, '1');

console.log('listing-url-filters: PASS');
