cd /var/www/real-estate-ai-cms
set -a && . ./.env && set +a
node <<'NODE'
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
(async()=>{
  const rows=await p.$queryRawUnsafe(`SELECT * FROM settings LIMIT 1`);
  const row=rows[0];
  const data=typeof row.data==='string'?JSON.parse(row.data):row.data;
  const token=String(data.telegram_bot_token||'').trim();
  console.log('token_ok', token.length>10);

  const log=await p.telegramDeliveryLog.findFirst({
    where:{status:'sent', eventKey:{contains:':telegram:new'}},
    orderBy:{createdAt:'desc'},
    select:{findingId:true, telegramMsgId:true, chatId:true}
  });
  console.log('log', log);

  const finding=await p.agentFinding.findUnique({
    where:{id:log.findingId},
    select:{scannedContent:{select:{canonicalUrl:true}}, source:{select:{url:true,name:true}}}
  });
  console.log('canonical', finding.scannedContent?.canonicalUrl);
  console.log('agentUrl', finding.source?.url);

  // Forward to same chat to get Message.reply_markup in response
  const api=`https://api.telegram.org/bot${token}/forwardMessage`;
  const res=await fetch(api,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      chat_id: log.chatId,
      from_chat_id: log.chatId,
      message_id: Number(log.telegramMsgId),
    }),
  });
  const body=await res.json();
  const markup=body.result && body.result.reply_markup;
  console.log('forward_ok', body.ok, body.description||null);
  console.log('reply_markup', JSON.stringify(markup,null,2));
  // cleanup forwarded noise
  if(body.ok && body.result && body.result.message_id){
    await fetch(`https://api.telegram.org/bot${token}/deleteMessage`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({chat_id:log.chatId, message_id:body.result.message_id}),
    });
  }
  await p.$disconnect();
})().catch(e=>{console.error(e);process.exit(1)});
NODE