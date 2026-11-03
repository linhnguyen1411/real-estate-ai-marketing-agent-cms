import type { Express } from 'express';
import type { AgentRouteDeps } from './agentTypes';
import { registerMissionEngineRoutes } from '../modules/mission-engine';
import { createAgentRouteHelpers } from './routes/agentRouteHelpers';
import { registerSourceRoutes } from './routes/sourceRoutes';
import { registerMissionRoutes } from './routes/missionRoutes';
import { registerJobRoutes } from './routes/jobRoutes';
import { registerFindingRoutes } from './routes/findingRoutes';
import { registerInventoryRoutes } from './routes/inventoryRoutes';
import { registerActionProposalRoutes } from './routes/actionProposalRoutes';
import { registerNotificationRoutes } from './routes/notificationRoutes';
import { registerRuntimeRoutes } from './routes/runtimeRoutes';
import { registerSpamRoutes } from './routes/spamRoutes';

export function registerAgentAdminRoutes(app: Express, deps: AgentRouteDeps): void {
  registerMissionEngineRoutes(app, deps);

  const helpers = createAgentRouteHelpers(deps.getAuthUser);

  registerSourceRoutes(app, deps, helpers);
  registerMissionRoutes(app, deps, helpers);
  registerJobRoutes(app, deps, helpers);
  registerFindingRoutes(app, deps, helpers);
  registerInventoryRoutes(app, deps, helpers);
  registerActionProposalRoutes(app, deps, helpers);
  registerNotificationRoutes(app, deps, helpers);
  registerRuntimeRoutes(app, deps, helpers);
  registerSpamRoutes(app, deps, helpers);
}
