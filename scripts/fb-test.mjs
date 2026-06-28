#!/usr/bin/env node
/**
 * Test Facebook Page connection via Graph API.
 * Usage: npm run fb:test
 */
import 'dotenv/config';
import { testFacebookPageConnection } from '../server/facebook/graphApi.ts';

const result = await testFacebookPageConnection();

if (result.ok) {
  console.log('Facebook Page Connected:');
  console.log(`  id:   ${result.pageId}`);
  console.log(`  name: ${result.pageName}`);
  process.exit(0);
}

console.error('Facebook Page Connection FAILED');
if (result.error) {
  console.error(`  status:  error`);
  console.error(`  message: ${result.error.message}`);
  if (result.error.code != null) console.error(`  code:    ${result.error.code}`);
  if (result.error.type) console.error(`  type:    ${result.error.type}`);
}
if (result.hint) {
  console.error(`  hint:    ${result.hint}`);
}
process.exit(1);
