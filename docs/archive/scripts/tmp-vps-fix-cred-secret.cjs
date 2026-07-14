#!/usr/bin/env node
require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

function getKey() {
  const secret =
    process.env.FACEBOOK_TOKEN_ENCRYPTION_KEY ||
    process.env.AUTH_SECRET ||
    process.env.FACEBOOK_APP_SECRET;
  if (!secret) throw new Error('Missing AUTH_SECRET/FACEBOOK_TOKEN_ENCRYPTION_KEY');
  return crypto.createHash('sha256').update(secret).digest();
}
function encrypt(plain) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

(async () => {
  const saved = JSON.parse(fs.readFileSync('/root/.agent-ingest-secret', 'utf8'));
  const enc = encrypt(saved.secret);
  const p = new PrismaClient();
  await p.$executeRawUnsafe(
    `UPDATE agent_api_credentials SET encrypted_secret = $1 WHERE key_id = $2`,
    enc,
    saved.keyId,
  );
  console.log('Updated encrypted_secret for', saved.keyId);
  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
