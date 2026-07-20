/**
 * Fleet Manager — aggregate Fleet State from Fleet Registry (snapshot-based).
 */

import type { FleetAgent, FleetState } from './types';
import { listFleetAgents } from './registry';

export function aggregateFleetState(agents: FleetAgent[]): FleetState {
  let online = 0;
  let offline = 0;
  let busy = 0;
  let idle = 0;
  let scanning = 0;
  let publishing = 0;
  let campaign = 0;
  let browserHold = 0;
  let error = 0;
  let runningJobs = 0;
  let runningMissions = 0;
  let runningBrowsers = 0;

  for (const a of agents) {
    if (a.status === 'online' || a.status === 'degraded') online += 1;
    else offline += 1;

    switch (a.activity) {
      case 'idle':
        idle += 1;
        break;
      case 'busy':
        busy += 1;
        break;
      case 'scanning':
        scanning += 1;
        busy += 1;
        break;
      case 'publishing':
        publishing += 1;
        busy += 1;
        break;
      case 'campaign':
        campaign += 1;
        busy += 1;
        break;
      case 'browser_hold':
        browserHold += 1;
        busy += 1;
        break;
      case 'error':
        error += 1;
        break;
      case 'offline':
        break;
    }

    runningJobs += a.jobs.running || 0;
    if (a.mission?.missionName) runningMissions += 1;
    runningBrowsers += a.browserProfiles.filter(p => p.busy).length;
  }

  // Health: online ratio + penalty for errors (0–100)
  const total = agents.length;
  const onlineRatio = total > 0 ? online / total : 1;
  const errorPenalty = total > 0 ? (error / total) * 40 : 0;
  const healthScore = Math.max(
    0,
    Math.min(100, Math.round(onlineRatio * 100 - errorPenalty)),
  );

  return {
    generatedAt: new Date().toISOString(),
    total,
    online,
    offline,
    busy,
    idle,
    scanning,
    publishing,
    campaign,
    browserHold,
    error,
    runningJobs,
    runningMissions,
    runningBrowsers,
    healthScore,
    agents,
  };
}

export async function getFleetState(input?: {
  companyId?: string | null;
  onlineOnly?: boolean;
}): Promise<FleetState> {
  const agents = await listFleetAgents({
    companyId: input?.companyId,
    onlineOnly: input?.onlineOnly,
  });
  return aggregateFleetState(agents);
}
