/**
 * Telegram Control Plane public exports.
 */

export type {
  TelegramConsoleConfig,
  TelegramConsoleMode,
  TelegramConsoleRole,
  NormalizedTelegramUpdate,
  TelegramUpdateReceiver,
} from './types';

export { loadTelegramConsoleConfig } from './config';
export {
  checkTelegramAcl,
  resolveTelegramRole,
  canMutateViaTelegram,
  resetTelegramAclRateLimitForTests,
} from './acl';
export { createTelegramReplyPort } from './outbound';
export { normalizeTelegramUpdate } from './normalizeUpdate';
export { routeTelegramUpdate } from './router';
export {
  createTelegramUpdateReceiver,
  createPollingReceiver,
  createWebhookReceiver,
} from './updateReceiver';
export { createTelegramEventNotifier } from './eventNotifier';
export {
  startTelegramControlPlane,
  stopTelegramControlPlane,
  getTelegramConsoleStatus,
  handleTelegramWebhookUpdate,
  _resetTelegramControlPlaneForTests,
} from './lifecycle';
export { registerTelegramControlPlaneRoutes } from './routes';
