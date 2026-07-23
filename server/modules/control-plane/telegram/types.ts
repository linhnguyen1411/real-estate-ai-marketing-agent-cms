/**
 * Telegram Control Plane — shared types (no Prisma).
 */

export type TelegramConsoleMode = 'polling' | 'webhook';

export type TelegramConsoleRole = 'admin' | 'operator' | 'viewer' | 'denied';

export type NormalizedTelegramUpdate = {
  updateId: number;
  chatId: string;
  userId: string;
  username?: string | null;
  text: string;
  messageId?: number;
  isCommand: boolean;
};

export type TelegramAclDecision = {
  ok: boolean;
  role: TelegramConsoleRole;
  reason?: string;
};

export type TelegramConsoleConfig = {
  enabled: boolean;
  botToken: string;
  /** Default outbound notify / fallback allow chat */
  primaryChatId: string;
  allowedUserIds: string[];
  allowedChatIds: string[];
  adminUserIds: string[];
  mode: TelegramConsoleMode;
  webhookSecret: string;
  companyId: string | null;
  pollIntervalMs: number;
  eventNotifyIntervalMs: number;
  rateLimitPerMinute: number;
};

export interface TelegramUpdateReceiver {
  readonly mode: TelegramConsoleMode;
  start(): Promise<void>;
  stop(): Promise<void>;
}
