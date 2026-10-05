/**
 * Data Retention & Privacy Lifecycle Module
 * 
 * Implements Phase 7.5 requirements:
 * - Data retention for `chat_history` and `public_chat_guests`.
 * - Configured via `RETENTION_DAYS` env variable (default: 180 days).
 * - Idempotent cleanup job with dry-run support and audit logging.
 */

import { prisma } from '../prisma';

export interface RetentionCleanupResult {
  dryRun: boolean;
  retentionDays: number;
  cutoffDate: string;
  deletedChatHistoryCount: number;
  deletedPublicGuestsCount: number;
  success: boolean;
  error?: string;
}

export function getRetentionDays(): number {
  const envVal = process.env.RETENTION_DAYS;
  const parsed = parseInt(envVal || '180', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 180;
}

/**
 * Runs the retention cleanup job.
 */
export async function runDataRetentionCleanup(options?: {
  dryRun?: boolean;
  retentionDays?: number;
}): Promise<RetentionCleanupResult> {
  const dryRun = Boolean(options?.dryRun);
  const retentionDays = options?.retentionDays ?? getRetentionDays();
  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  try {
    if (dryRun) {
      const [chatCount, guestCount] = await Promise.all([
        prisma.chatHistory.count({
          where: {
            createdAt: { lt: cutoffDate },
          },
        }),
        prisma.publicChatGuest.count({
          where: {
            updatedAt: { lt: cutoffDate },
          },
        }),
      ]);

      return {
        dryRun: true,
        retentionDays,
        cutoffDate: cutoffDate.toISOString(),
        deletedChatHistoryCount: chatCount,
        deletedPublicGuestsCount: guestCount,
        success: true,
      };
    }

    const [chatDeleteResult, guestDeleteResult] = await Promise.all([
      prisma.chatHistory.deleteMany({
        where: {
          createdAt: { lt: cutoffDate },
        },
      }),
      prisma.publicChatGuest.deleteMany({
        where: {
          updatedAt: { lt: cutoffDate },
        },
      }),
    ]);

    return {
      dryRun: false,
      retentionDays,
      cutoffDate: cutoffDate.toISOString(),
      deletedChatHistoryCount: chatDeleteResult.count,
      deletedPublicGuestsCount: guestDeleteResult.count,
      success: true,
    };
  } catch (error: any) {
    console.error('[DataRetention] Failed to run retention cleanup:', error);
    return {
      dryRun,
      retentionDays,
      cutoffDate: cutoffDate.toISOString(),
      deletedChatHistoryCount: 0,
      deletedPublicGuestsCount: 0,
      success: false,
      error: error?.message || String(error),
    };
  }
}
