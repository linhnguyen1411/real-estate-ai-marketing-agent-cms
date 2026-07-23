/**
 * One-shot: prune zombie BrowserSessions so Fleet shows real machines.
 * Marks offline superseded PID-workers / test agents; keeps freshest per machine.
 */
import { prisma } from '../server/prisma';
import {
  isEphemeralAgentId,
  resolveMachineKey,
  sessionToAgentNode,
} from '../server/modules/control-plane/agentRegistry';

async function main() {
  const sessions = await prisma.browserSession.findMany({
    orderBy: { lastHeartbeatAt: 'desc' },
  });
  const now = Date.now();
  const keep = new Set<string>();
  const byMachine = new Map<string, string>();

  for (const s of sessions) {
    const node = sessionToAgentNode(s, now);
    if (isEphemeralAgentId(node.agentId)) continue;
    const key = resolveMachineKey(s, node.agentId);
    if (!byMachine.has(key)) {
      byMachine.set(key, s.id);
      keep.add(s.id);
    }
  }

  // Always keep currently online heartbeats
  for (const s of sessions) {
    if (
      s.lastHeartbeatAt &&
      now - s.lastHeartbeatAt.getTime() < 60_000 &&
      s.status !== 'offline'
    ) {
      keep.add(s.id);
    }
  }

  const toOffline = sessions.filter(s => !keep.has(s.id)).map(s => s.id);
  console.log('sessions=', sessions.length, 'keep=', keep.size, 'offline=', toOffline.length);
  console.log('machines=', [...byMachine.keys()]);

  if (toOffline.length) {
    const res = await prisma.browserSession.updateMany({
      where: { id: { in: toOffline } },
      data: {
        status: 'offline',
        lastError: 'Pruned zombie session — Fleet uses one node per machine',
      },
    });
    console.log('updated', res.count);
  }

  const { listRegisteredAgents } = await import(
    '../server/modules/control-plane/agentRegistry'
  );
  const agents = await listRegisteredAgents();
  console.log(
    'fleet agents now=',
    agents.length,
    agents.map(a => ({ id: a.agentId, status: a.status, host: a.hostname })),
  );

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
