import express, { type Express, type Request, type Response } from 'express';
import path from 'path';
import fs from 'fs';
import { checkDatabaseConnection } from '../prisma';
import { getAgentSchedulerStatus } from '../agent/agentScheduler';
import { getProperties } from '../dbHelper';
import { createInvestorLeadPublicRouter, registerInvestorLeadAdminRoutes } from '../investorLeadRoutes';
import { registerBlogAdminRoutes, registerBlogPublicRoutes } from '../blogRoutes';
import {
  registerShortLinkAdminRoutes,
  registerShortLinkPublicRoutes,
  registerShortLinkRedirect,
} from '../shortLink/shortLinkRoutes';
import { registerFacebookAdminRoutes } from '../facebookRoutes';
import { registerAgentAdminRoutes } from '../agent/agentRoutes';
import { registerAgentIngestRoutes } from '../agentIngest/ingestRoutes';
import { registerSocialPublishingRoutes } from '../modules/social-publishing/api/socialPublishingRoutes';
import { registerPlanningRoutes } from '../modules/planning';
import { registerLeadAcquisitionRoutes } from '../modules/lead-acquisition';
import { registerSalesLayerRoutes } from '../modules/sales-layer';
import { registerMarketingOrgRoutes } from '../modules/marketing-org';
import { registerAiGatewayRoutes } from '../modules/ai-gateway';
import { registerDecisionCenterRoutes } from '../modules/decision-center';
import { registerKnowledgeBaseRoutes } from '../modules/knowledge-base';
import { registerExecutiveDashboardRoutes } from '../modules/executive-dashboard';
import { registerExecutionTraceRoutes } from '../modules/execution-trace';
import {
  registerRuntimeAgentRoutes,
  registerTelegramControlPlaneRoutes,
} from '../modules/control-plane';
import { accessDefaults, getAuthUser } from '../modules/auth/authAccess';
import {
  createAuthLoginRouter,
  createApiAuthGate,
  createAuthMeRouter,
} from '../modules/auth/authRoutes';
import { createPublicSiteRouter } from '../modules/public-site/publicSiteRoutes';
import { createSeoPublicRouter } from '../modules/public-site/seoPublicRoutes';
import { createUsersRouter } from '../modules/users/usersRoutes';
import { createCustomersRouter } from '../modules/customers/customersRoutes';
import { createPropertiesRouter } from '../modules/properties/propertiesRoutes';
import { createPostsRouter } from '../modules/posts/postsRoutes';
import { createInboxRouter } from '../modules/inbox/inboxRoutes';
import { createChatRouter } from '../modules/chat/chatRoutes';
import { createContentRouter } from '../modules/content/contentRoutes';

export type MountRoutesOptions = {
  facebookGraphLegacyEnabled: boolean;
  agentEnabled: boolean;
};

export function mountRoutes(app: Express, opts: MountRoutesOptions): void {
  const {
    facebookGraphLegacyEnabled: FACEBOOK_GRAPH_LEGACY_ENABLED,
    agentEnabled: AGENT_ENABLED,
  } = opts;

  app.get('/api/health', async (_req: Request, res: Response) => {
    const dbStatus = await checkDatabaseConnection();
    const scheduler = getAgentSchedulerStatus();
    res.json({
      status: dbStatus.ok ? 'success' : 'degraded',
      data: {
        service: 'real-estate-ai-marketing-agent-cms',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        database: dbStatus.message,
        aiProvider: process.env.DEFAULT_AI_MODE || 'db-settings',
        scheduler: {
          enabled: scheduler.enabled,
          running: scheduler.running,
          tickIntervalMs: scheduler.tickIntervalMs,
          lastTickAt: scheduler.lastTickAt,
          lastError: scheduler.lastError,
          lastTickResult: scheduler.lastTickResult
            ? {
                skipped: scheduler.lastTickResult.skipped,
                reason: scheduler.lastTickResult.reason,
                sourcesDue: scheduler.lastTickResult.sourcesDue,
                jobsCreated: scheduler.lastTickResult.jobsCreated,
                jobsSkippedDuplicate: scheduler.lastTickResult.jobsSkippedDuplicate,
              }
            : null,
        },
      },
    });
  });

  app.use(createAuthLoginRouter());
  app.use(createPublicSiteRouter());

  registerBlogPublicRoutes(app);
  registerShortLinkPublicRoutes(app, getProperties);
  registerShortLinkRedirect(app, getProperties);
  app.use('/api/public', createInvestorLeadPublicRouter());

  // Public social-draft images (unguessable names). Must be BEFORE /api auth gate
  // so <img> preview and agent download work without Bearer token.
  {
    const socialMediaDir = path.join(process.cwd(), 'runtime', 'social-media');
    fs.mkdirSync(socialMediaDir, { recursive: true });
    app.use(
      '/api/social/media/files',
      express.static(socialMediaDir, {
        fallthrough: false,
        index: false,
        setHeaders: (res: Response) => {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        },
      }),
    );
  }

  app.use('/api', createApiAuthGate());
  app.use(createAuthMeRouter());

  registerInvestorLeadAdminRoutes(app);
  registerBlogAdminRoutes(app);
  registerShortLinkAdminRoutes(app);
  if (FACEBOOK_GRAPH_LEGACY_ENABLED) {
    registerFacebookAdminRoutes(app);
  }
  if (AGENT_ENABLED) {
    registerAgentAdminRoutes(app, { getAuthUser, accessDefaults });
    registerSocialPublishingRoutes(app, { getAuthUser, accessDefaults });
    registerRuntimeAgentRoutes(app);
    registerTelegramControlPlaneRoutes(app);
    registerPlanningRoutes(app);
    registerLeadAcquisitionRoutes(app);
    registerSalesLayerRoutes(app);
    registerMarketingOrgRoutes(app);
    registerAiGatewayRoutes(app);
    registerDecisionCenterRoutes(app);
    registerKnowledgeBaseRoutes(app);
    registerExecutiveDashboardRoutes(app);
    registerExecutionTraceRoutes(app);
  } else {
    console.warn('[agent] Admin agent routes disabled (AGENT_ENABLED=false)');
  }
  registerAgentIngestRoutes(app, { getAuthUser, accessDefaults });
  if (AGENT_ENABLED) {
    // Unknown /api/agent/* must stay JSON (never SPA HTML → "Phản hồi không đúng JSON").
    // Must run AFTER all /api/agent registrations (admin + ingest credentials).
    app.use('/api/agent', (_req: Request, res: Response) => {
      res.status(404).json({
        status: 'error',
        message:
          'Agent API route không tồn tại. Restart server nếu vừa thêm endpoint mới (operations/fleet/runtime).',
      });
    });
  } else {
    // Never fall through to Vite HTML for /api/agent/* — frontend expects JSON.
    app.use('/api/agent', (_req: Request, res: Response) => {
      res.status(503).json({
        status: 'error',
        message: 'AI Agent API đang tắt (AGENT_ENABLED=false). Bật flag trong .env rồi restart server.',
      });
    });
  }
  // Unknown /api/social/* must stay JSON (never SPA HTML → "Phản hồi không đúng JSON").
  app.use('/api/social', (_req: Request, res: Response) => {
    res.status(404).json({
      status: 'error',
      message: 'Social API route không tồn tại. Restart server nếu vừa thêm endpoint mới.',
    });
  });

  app.use(createUsersRouter());
  app.use(createCustomersRouter());
  app.use(createPropertiesRouter());
  app.use(createPostsRouter());
  app.use(createInboxRouter());
  app.use(createChatRouter());
  app.use(createContentRouter({ agentEnabled: AGENT_ENABLED }));
  app.use(createSeoPublicRouter());
}
