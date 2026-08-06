cd /var/www/real-estate-ai-cms
set -a && . ./.env && set +a
node <<'NODE'
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
(async()=>{
  // AppSettings is typically a single JSON row via getSettings helper - try raw
  let token=null;
  try {
    const rows=await p.$queryRawUnsafe(`SELECT * FROM "AppSettings" LIMIT 1`);
    console.log('AppSettings keys', rows[0]?Object.keys(rows[0]):null);
  } catch(e){ console.log('AppSettings err', e.message); }
  try {
    const rows=await p.$queryRawUnsafe(`SELECT * FROM app_settings LIMIT 1`);
    console.log('app_settings keys', rows[0]?Object.keys(rows[0]):null);
    const row=rows[0];
    if(row){
      const json=row.data||row.settings||row.value||row;
      const parsed=typeof json==='string'?JSON.parse(json):json;
      token=parsed.telegram_bot_token||parsed.telegramBotToken||null;
      console.log('token_len', token?String(token).length:0);
    }
  } catch(e){ console.log('app_settings err', e.message); }

  // Try Settings table variants
  const tables=await p.$queryRawUnsafe(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name ILIKE '%setting%'`);
  console.log('tables', tables);

  await p.$disconnect();
})().catch(e=>{console.error(e);process.exit(1)});
NODE