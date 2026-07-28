cd /var/www/real-estate-ai-cms
set -a && . ./.env && set +a
node <<'NODE'
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async()=>{
  const now = new Date();
  const latestLead = await p.agentFinding.findFirst({
    where:{ type:'lead_signal', status:{notIn:['duplicate','dismissed']} },
    orderBy:{ createdAt:'desc' },
    select:{ id:true, createdAt:true, source:{select:{name:true}} }
  });
  const latestJob = await p.agentJob.findFirst({
    where:{ type:'scan_source' },
    orderBy:{ updatedAt:'desc' },
    select:{ id:true, status:true, updatedAt:true, createdAt:true, source:{select:{name:true}}, errorMessage:true }
  });
  const q = await p.agentJob.count({ where:{ type:'scan_source', status:'queued' } });
  const running = await p.agentJob.count({ where:{ type:'scan_source', status:'running' } });
  const completed24h = await p.agentJob.count({ where:{ type:'scan_source', status:'completed', updatedAt:{ gte:new Date(Date.now()-24*3600*1000) } } });
  console.log(JSON.stringify({ now, latestLead, latestJob, queued:q, running, completed24h }, null, 2));
  await p.$disconnect();
})().catch(async e=>{console.error(e); await p.$disconnect(); process.exit(1)});
NODE