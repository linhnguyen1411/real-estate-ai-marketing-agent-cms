#!/usr/bin/env node
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const cols = await p.$queryRawUnsafe(
    "SELECT column_name FROM information_schema.columns WHERE table_name='agent_api_credentials' ORDER BY ordinal_position",
  );
  console.log(cols);
  await p.$disconnect();
})().catch(async (e) => {
  console.error(e.message);
  await p.$disconnect();
  process.exit(1);
});
