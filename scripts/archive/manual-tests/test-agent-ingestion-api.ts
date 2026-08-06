#!/usr/bin/env node
/**
 * Agent ingest HMAC auth — pure crypto tests (no DB).
 * Nonce / full verifyIngestHmac require DB credentials → skipped.
 */
import assert from 'assert';
import {
  buildCanonicalString,
  sha256Hex,
  signCanonical,
  timingSafeEqualString,
  hashApiSecret,
  generateApiKeyPair,
} from '../server/agentIngest/hmacAuth';

let passed = 0;
function ok(name: string, cond: boolean) {
  assert.ok(cond, name);
  passed += 1;
  console.log(`✓ ${name}`);
}

const secret = 'as_test_secret_for_hmac';
const method = 'POST';
const path = '/api/agent/ingest/findings';
const timestamp = String(Math.floor(Date.now() / 1000));
const nonce = 'nonce-test-001';
const body = JSON.stringify({ hello: 'world' });
const bodyHash = sha256Hex(body);

const canonical = buildCanonicalString({
  method,
  path,
  timestamp,
  nonce,
  bodyHash,
});

{
  ok('canonical has 5 lines', canonical.split('\n').length === 5);
  ok('canonical starts with METHOD', canonical.startsWith('POST\n'));
  ok('body hash is 64 hex chars', /^[a-f0-9]{64}$/.test(bodyHash));
}

{
  const sig = signCanonical(secret, canonical);
  ok('valid signature is 64 hex', /^[a-f0-9]{64}$/.test(sig));
  ok(
    'valid signature verifies',
    timingSafeEqualString(sig.toLowerCase(), signCanonical(secret, canonical).toLowerCase()),
  );

  const badSig = signCanonical('wrong-secret', canonical);
  ok('invalid signature does not match', !timingSafeEqualString(sig, badSig));
  ok(
    'tampered body invalidates signature',
    !timingSafeEqualString(
      sig,
      signCanonical(
        secret,
        buildCanonicalString({
          method,
          path,
          timestamp,
          nonce,
          bodyHash: sha256Hex('{"hello":"tampered"}'),
        }),
      ),
    ),
  );
}

{
  // Same skew logic as verifyIngestHmac (pure; no DB).
  const skewSeconds = 300;
  const expiredTs = Math.floor(Date.now() / 1000) - skewSeconds - 60;
  const tsMs = expiredTs > 1e12 ? expiredTs : expiredTs * 1000;
  const drift = Math.abs(Date.now() - tsMs);
  ok('expired timestamp exceeds skew', drift > skewSeconds * 1000);

  const freshTs = Math.floor(Date.now() / 1000);
  const freshMs = freshTs > 1e12 ? freshTs : freshTs * 1000;
  const freshDrift = Math.abs(Date.now() - freshMs);
  ok('fresh timestamp within skew', freshDrift <= skewSeconds * 1000);
}

{
  const pair = generateApiKeyPair();
  ok('keyId prefix', pair.keyId.startsWith('ak_'));
  ok('secret prefix', pair.secret.startsWith('as_'));
  ok('hashApiSecret stable', hashApiSecret(secret) === hashApiSecret(secret));
  ok('hashApiSecret differs for other secret', hashApiSecret(secret) !== hashApiSecret('other'));
}

{
  console.log('⊘ skip nonce / verifyIngestHmac: requires DB (agentApiCredential + agentIngestNonce)');
}

console.log(`\n${passed} assertions passed`);
