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
export { normalizeTelegramUpdate, normalizeTelegramInbound } from './normalizeUpdate';
export { routeTelegramUpdate } from './router';
export {
  missionActionKeyboard,
  publishJobKeyboard,
  agentJobKeyboard,
  leadAlertKeyboard,
  callbackDataToCommand,
} from '../inlineKeyboard';
export {
  createTelegramUpdateReceiver,
  createPollingReceiver,
  createWebhookReceiver,
} from './updateReceiver';
export { createTelegramEventNotifier } from './eventNotifier';
export {
  SMART_NOTIFICATION_KINDS,
  formatSmartNotification,
  formatSmartNotificationBullet,
  mapRuntimeEventToSmartKind,
  smartNotificationLabel,
} from './smartNotifications';
export type { SmartNotificationKind } from './smartNotifications';
export {
  startTelegramControlPlane,
  stopTelegramControlPlane,
  getTelegramConsoleStatus,
  handleTelegramWebhookUpdate,
  _resetTelegramControlPlaneForTests,
} from './lifecycle';
export { registerTelegramControlPlaneRoutes } from './routes';

