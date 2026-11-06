import crypto from 'crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../prisma';
import {
  decryptLicenseKey,
  encryptLicenseKey,
  generateRawLicenseKey,
  hashLicenseKey,
} from '../license/licenseService';
import { LICENSE_PLAN_FEATURES, LICENSE_PLAN_MAX_DEVICES } from '../license/planCatalog';
import {
  PAYMENT_BANK,
  TOPUP_MAX_PENDING_PER_USER,
  TOPUP_MAX_TOKENS,
  TOPUP_MIN_TOKENS,
  TOKEN_RATE_VND,
  buildVietQrUrl,
  tokensToVnd,
} from './paymentConfig';

export const LICENSE_PLAN_TOKEN_COST: Record<string, number> = {
  pro: 20,
  enterprise: 100,
};

export interface WalletView {
  id: string;
  userId: string;
  balance: number;
  lockedBalance: number;
  availableBalance: number;
  status: string;
  updatedAt: Date;
}

export interface TransactionView {
  id: string;
  walletId: string;
  userId: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  type: string;
  status: string;
  referenceId: string | null;
  note: string;
  createdBy: string | null;
  createdAt: Date;
}

export async function getOrCreateUserWallet(userId: string): Promise<WalletView> {
  const existing = await prisma.userWallet.findUnique({
    where: { userId },
  });

  if (existing) {
    const balance = Number(existing.balance);
    const lockedBalance = Number(existing.lockedBalance);
    return {
      id: existing.id,
      userId: existing.userId,
      balance,
      lockedBalance,
      availableBalance: Math.max(0, balance - lockedBalance),
      status: existing.status,
      updatedAt: existing.updatedAt,
    };
  }

  // Create initial wallet with 0 balance (upsert avoids duplicate-wallet race)
  const created = await prisma.userWallet.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      balance: 0,
      lockedBalance: 0,
      status: 'active',
      version: 0,
    },
  });

  return {
    id: created.id,
    userId: created.userId,
    balance: 0,
    lockedBalance: 0,
    availableBalance: 0,
    status: created.status,
    updatedAt: created.updatedAt,
  };
}

async function applyWalletDelta(
  tx: Prisma.TransactionClient,
  opts: {
    userId: string;
    amount: number;
    note: string;
    createdBy: string;
    referenceId?: string | null;
  }
): Promise<{ wallet: WalletView; transaction: TransactionView }> {
  const { userId, amount, note, createdBy, referenceId = null } = opts;

  const wallet = await tx.userWallet.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      balance: 0,
      lockedBalance: 0,
      status: 'active',
      version: 0,
    },
  });

  if (wallet.status === 'frozen') {
    throw new Error('Ví của người dùng này đang bị tạm khóa (frozen).');
  }

  const currentBalance = Number(wallet.balance);
  const currentLocked = Number(wallet.lockedBalance);
  const available = currentBalance - currentLocked;

  if (amount < 0 && available + amount < 0) {
    throw new Error(`Số dư khả dụng không đủ để trừ token (Khả dụng: ${available}, cần trừ: ${Math.abs(amount)}).`);
  }

  const newBalance = currentBalance + amount;

  // Concurrent writers must not overwrite each other's balance snapshot.
  const updated = await tx.userWallet.updateMany({
    where: { id: wallet.id, version: wallet.version },
    data: {
      balance: newBalance,
      version: { increment: 1 },
    },
  });
  if (updated.count !== 1) {
    throw new Error('Ví vừa được cập nhật bởi giao dịch khác. Vui lòng thử lại.');
  }
  const updatedWallet = await tx.userWallet.findUniqueOrThrow({ where: { id: wallet.id } });

  const txRecord = await tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      userId,
      amount,
      balanceBefore: currentBalance,
      balanceAfter: newBalance,
      type: amount > 0 ? 'admin_deposit' : 'admin_deduct',
      status: 'completed',
      referenceId,
      note: note.trim(),
      createdBy,
    },
  });

  return {
    wallet: {
      id: updatedWallet.id,
      userId: updatedWallet.userId,
      balance: Number(updatedWallet.balance),
      lockedBalance: Number(updatedWallet.lockedBalance),
      availableBalance: Math.max(0, Number(updatedWallet.balance) - Number(updatedWallet.lockedBalance)),
      status: updatedWallet.status,
      updatedAt: updatedWallet.updatedAt,
    },
    transaction: {
      id: txRecord.id,
      walletId: txRecord.walletId,
      userId: txRecord.userId,
      amount: Number(txRecord.amount),
      balanceBefore: Number(txRecord.balanceBefore),
      balanceAfter: Number(txRecord.balanceAfter),
      type: txRecord.type,
      status: txRecord.status,
      referenceId: txRecord.referenceId,
      note: txRecord.note,
      createdBy: txRecord.createdBy,
      createdAt: txRecord.createdAt,
    },
  };
}

export async function adminAdjustTokens(opts: {
  userId: string;
  amount: number;
  note: string;
  adminUserId: string;
}): Promise<{ wallet: WalletView; transaction: TransactionView }> {
  const { userId, amount, note, adminUserId } = opts;

  if (!amount || isNaN(amount) || amount === 0) {
    throw new Error('Số lượng token phải khác 0.');
  }
  if (!Number.isInteger(amount)) {
    throw new Error('Số lượng token phải là số nguyên.');
  }

  if (!note || note.trim().length === 0) {
    throw new Error('Cần có lý do/ghi chú cho giao dịch token.');
  }

  return await prisma.$transaction((tx) =>
    applyWalletDelta(tx, { userId, amount, note, createdBy: adminUserId })
  );
}

export async function lockWalletBalance(opts: {
  userId: string;
  amount: number;
  referenceId?: string;
  note: string;
}): Promise<WalletView> {
  const { userId, amount, referenceId, note } = opts;
  if (amount <= 0) throw new Error('Số lượng token khóa phải lớn hơn 0.');
  if (!Number.isInteger(amount)) throw new Error('Số lượng token khóa phải là số nguyên.');

  return await prisma.$transaction(async (tx) => {
    const wallet = await tx.userWallet.findUnique({ where: { userId } });
    if (!wallet) throw new Error('Không tìm thấy ví người dùng.');
    if (wallet.status === 'frozen') throw new Error('Ví của người dùng này đang bị tạm khóa (frozen).');

    const currentBalance = Number(wallet.balance);
    const currentLocked = Number(wallet.lockedBalance);
    const available = currentBalance - currentLocked;

    if (available < amount) {
      throw new Error(`Số dư khả dụng không đủ để khóa (Khả dụng: ${available}, cần: ${amount}).`);
    }

    const locked = await tx.userWallet.updateMany({
      where: { id: wallet.id, version: wallet.version },
      data: {
        lockedBalance: { increment: amount },
        version: { increment: 1 },
      },
    });
    if (locked.count !== 1) {
      throw new Error('Ví vừa được cập nhật bởi giao dịch khác. Vui lòng thử lại.');
    }
    const updated = await tx.userWallet.findUniqueOrThrow({ where: { id: wallet.id } });

    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        userId,
        amount: 0,
        balanceBefore: currentBalance,
        balanceAfter: currentBalance,
        type: 'lock',
        status: 'completed',
        referenceId,
        note: `Khóa ${amount} token: ${note}`,
      },
    });

    return {
      id: updated.id,
      userId: updated.userId,
      balance: Number(updated.balance),
      lockedBalance: Number(updated.lockedBalance),
      availableBalance: Math.max(0, Number(updated.balance) - Number(updated.lockedBalance)),
      status: updated.status,
      updatedAt: updated.updatedAt,
    };
  });
}

export async function unlockWalletBalance(opts: {
  userId: string;
  amount: number;
  referenceId?: string;
  note: string;
}): Promise<WalletView> {
  const { userId, amount, referenceId, note } = opts;
  if (amount <= 0) throw new Error('Số lượng token mở khóa phải lớn hơn 0.');
  if (!Number.isInteger(amount)) throw new Error('Số lượng token mở khóa phải là số nguyên.');

  return await prisma.$transaction(async (tx) => {
    const wallet = await tx.userWallet.findUnique({ where: { userId } });
    if (!wallet) throw new Error('Không tìm thấy ví người dùng.');

    const currentBalance = Number(wallet.balance);
    const currentLocked = Number(wallet.lockedBalance);

    if (currentLocked < amount) {
      throw new Error(`Số token đang khóa (${currentLocked}) nhỏ hơn số lượng muốn mở khóa (${amount}).`);
    }

    const unlocked = await tx.userWallet.updateMany({
      where: { id: wallet.id, version: wallet.version },
      data: {
        lockedBalance: { decrement: amount },
        version: { increment: 1 },
      },
    });
    if (unlocked.count !== 1) {
      throw new Error('Ví vừa được cập nhật bởi giao dịch khác. Vui lòng thử lại.');
    }
    const updated = await tx.userWallet.findUniqueOrThrow({ where: { id: wallet.id } });

    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        userId,
        amount: 0,
        balanceBefore: currentBalance,
        balanceAfter: currentBalance,
        type: 'unlock',
        status: 'completed',
        referenceId,
        note: `Mở khóa ${amount} token: ${note}`,
      },
    });

    return {
      id: updated.id,
      userId: updated.userId,
      balance: Number(updated.balance),
      lockedBalance: Number(updated.lockedBalance),
      availableBalance: Math.max(0, Number(updated.balance) - Number(updated.lockedBalance)),
      status: updated.status,
      updatedAt: updated.updatedAt,
    };
  });
}

export async function spendTokensForLicenseUpgrade(opts: {
  userId: string;
  plan: 'pro' | 'enterprise';
  periodDays?: number;
}): Promise<{
  plan: string;
  cost: number;
  newBalance: number;
  expiresAt: Date;
  licenseKey: string;
  features: string[];
}> {
  const { userId, plan, periodDays = 30 } = opts;
  if (!Number.isInteger(periodDays) || periodDays < 1 || periodDays > 365) {
    throw new Error('Thời hạn gói không hợp lệ (phải là số nguyên từ 1 đến 365 ngày).');
  }
  const cost = LICENSE_PLAN_TOKEN_COST[plan];
  if (!cost) {
    throw new Error('Gói nâng cấp không hợp lệ.');
  }
  const expiresAt = new Date(Date.now() + periodDays * 86400_000);
  const licensePlan = plan === 'enterprise' ? 'enterprise' : 'pro';
  const maxDevices = LICENSE_PLAN_MAX_DEVICES[licensePlan];

  const features = LICENSE_PLAN_FEATURES[licensePlan];

  // Every write happens on the same transaction client so a failure anywhere
  // rolls back the token deduction, entitlement and license issuance together.
  const { newBalance, rawKey } = await prisma.$transaction(async (tx) => {
    const wallet = await tx.userWallet.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        balance: 0,
        lockedBalance: 0,
        status: 'active',
        version: 0,
      },
    });

    if (wallet.status === 'frozen') {
      throw new Error('Ví của bạn đang bị khóa, không thể thực hiện giao dịch.');
    }

    const currentBalance = Number(wallet.balance);
    const currentLocked = Number(wallet.lockedBalance);
    const available = currentBalance - currentLocked;

    if (available < cost) {
      throw new Error(
        `Số dư token không đủ để nâng cấp gói ${plan.toUpperCase()}! Cần: ${cost} token, số dư khả dụng hiện tại: ${available} token. Vui lòng liên hệ Admin để nạp thêm token vào ví.`
      );
    }

    const licenseKeys = await tx.licenseKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    const activeKey = licenseKeys.find((k) => k.status === 'active');
    if (!activeKey && licenseKeys.length > 0) {
      const error: any = new Error(
        'Khóa bản quyền của tài khoản đã bị thu hồi. Không thể nâng cấp gói cho tới khi quản trị viên xử lý.'
      );
      error.code = 'KEY_REVOKED';
      throw error;
    }

    const newBalance = currentBalance - cost;

    // 1. Deduct tokens with optimistic version guard
    const deducted = await tx.userWallet.updateMany({
      where: { id: wallet.id, version: wallet.version },
      data: {
        balance: newBalance,
        version: { increment: 1 },
      },
    });
    if (deducted.count !== 1) {
      throw new Error('Ví vừa được cập nhật bởi giao dịch khác. Vui lòng thử lại.');
    }

    // 2. Log transaction
    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        userId,
        amount: -cost,
        balanceBefore: currentBalance,
        balanceAfter: newBalance,
        type: 'license_upgrade',
        status: 'completed',
        referenceId: plan,
        note: `Nâng cấp bản quyền gói ${plan.toUpperCase()} (${periodDays} ngày)`,
        createdBy: userId,
      },
    });

    // 3. Create entitlement
    await tx.entitlement.create({
      data: {
        subjectType: 'user',
        subjectId: userId,
        plan,
        features,
        startsAt: new Date(),
        expiresAt,
        source: 'token_wallet_upgrade',
        grantedBy: userId,
      },
    });

    // 4. Reuse the account's single key (rotate legacy hash-only rows in place)
    let rawKey: string;
    if (activeKey) {
      const stored = decryptLicenseKey(activeKey.keyCipher);
      rawKey = stored || generateRawLicenseKey();
      await tx.licenseKey.update({
        where: { id: activeKey.id },
        data: {
          keyHash: hashLicenseKey(rawKey),
          keyCipher: encryptLicenseKey(rawKey),
          maxDevices,
        },
      });
    } else {
      rawKey = generateRawLicenseKey();
      await tx.licenseKey.create({
        data: {
          userId,
          keyHash: hashLicenseKey(rawKey),
          keyCipher: encryptLicenseKey(rawKey),
          maxDevices,
          status: 'active',
        },
      });
    }

    return { newBalance, rawKey };
  });

  return {
    plan,
    cost,
    newBalance,
    expiresAt,
    licenseKey: rawKey,
    features,
  };
}

export async function getUserTransactions(userId: string, limit = 50): Promise<TransactionView[]> {
  const rows = await prisma.walletTransaction.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return rows.map((r) => ({
    id: r.id,
    walletId: r.walletId,
    userId: r.userId,
    amount: Number(r.amount),
    balanceBefore: Number(r.balanceBefore),
    balanceAfter: Number(r.balanceAfter),
    type: r.type,
    status: r.status,
    referenceId: r.referenceId,
    note: r.note,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
  }));
}

export async function listAllUserWallets(search?: string): Promise<Array<WalletView & { email?: string; name?: string }>> {  const users = await prisma.user.findMany({
    where: search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' } },
            { id: { contains: search, mode: 'insensitive' } },
          ],
        }
      : undefined,
    take: 100,
  });

  const userIds = users.map((u) => u.id);
  const wallets = await prisma.userWallet.findMany({
    where: { userId: { in: userIds } },
  });

  const walletMap = new Map(wallets.map((w) => [w.userId, w]));

  return users.map((u) => {
    const w = walletMap.get(u.id);
    const balance = w ? Number(w.balance) : 0;
    const lockedBalance = w ? Number(w.lockedBalance) : 0;
    const userData = (u.data as any) || {};

    return {
      id: w?.id || `new-${u.id}`,
      userId: u.id,
      email: u.email,
      name: userData.name || u.email.split('@')[0],
      balance,
      lockedBalance,
      availableBalance: Math.max(0, balance - lockedBalance),
      status: w?.status || 'active',
      updatedAt: w?.updatedAt || u.createdAt,
    };
  });
}

export interface TopUpRequestView {
  id: string;
  code: string;
  userId: string;
  tokens: number;
  amountVnd: number;
  status: string;
  note: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  walletTransactionId: string | null;
  createdAt: Date;
  email?: string;
  name?: string;
}

export interface TopUpPaymentInfo {
  code: string;
  tokens: number;
  amountVnd: number;
  qrUrl: string;
  bank: typeof PAYMENT_BANK;
  tokenRateVnd: number;
}

const TOPUP_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateTopUpCode(): string {
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += TOPUP_CODE_ALPHABET[crypto.randomInt(0, TOPUP_CODE_ALPHABET.length)];
  }
  return `NAP-${suffix}`;
}

function toTopUpView(row: {
  id: string;
  code: string;
  userId: string;
  tokens: number;
  amountVnd: number;
  status: string;
  note: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  walletTransactionId: string | null;
  createdAt: Date;
}): TopUpRequestView {
  return {
    id: row.id,
    code: row.code,
    userId: row.userId,
    tokens: row.tokens,
    amountVnd: row.amountVnd,
    status: row.status,
    note: row.note,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt,
    walletTransactionId: row.walletTransactionId,
    createdAt: row.createdAt,
  };
}

export function getTopUpConfig() {
  return {
    tokenRateVnd: TOKEN_RATE_VND,
    minTokens: TOPUP_MIN_TOKENS,
    maxTokens: TOPUP_MAX_TOKENS,
    bank: PAYMENT_BANK,
    planCosts: LICENSE_PLAN_TOKEN_COST,
  };
}

export async function createTopUpRequest(opts: {
  userId: string;
  tokens: number;
}): Promise<{ request: TopUpRequestView; payment: TopUpPaymentInfo }> {
  const { userId, tokens } = opts;

  if (!Number.isInteger(tokens) || tokens <= 0) {
    throw new Error('Số token cần nạp phải là số nguyên dương.');
  }
  if (tokens < TOPUP_MIN_TOKENS) {
    throw new Error(`Số token nạp tối thiểu là ${TOPUP_MIN_TOKENS} token.`);
  }
  if (tokens > TOPUP_MAX_TOKENS) {
    throw new Error(`Số token nạp tối đa mỗi yêu cầu là ${TOPUP_MAX_TOKENS} token.`);
  }

  const pendingCount = await prisma.tokenTopUpRequest.count({
    where: { userId, status: 'pending' },
  });
  if (pendingCount >= TOPUP_MAX_PENDING_PER_USER) {
    throw new Error(
      `Bạn đang có ${pendingCount} yêu cầu nạp chờ duyệt. Vui lòng chờ admin xác nhận hoặc hủy bớt trước khi tạo yêu cầu mới.`
    );
  }

  const amountVnd = tokensToVnd(tokens);
  let created: Awaited<ReturnType<typeof prisma.tokenTopUpRequest.create>> | null = null;

  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    try {
      created = await prisma.tokenTopUpRequest.create({
        data: { code: generateTopUpCode(), userId, tokens, amountVnd, status: 'pending' },
      });
    } catch (err: any) {
      if (err?.code !== 'P2002') throw err;
    }
  }
  if (!created) {
    throw new Error('Không tạo được mã yêu cầu nạp, vui lòng thử lại.');
  }

  const request = toTopUpView(created);
  return {
    request,
    payment: {
      code: request.code,
      tokens: request.tokens,
      amountVnd: request.amountVnd,
      qrUrl: buildVietQrUrl({ amountVnd: request.amountVnd, content: request.code }),
      bank: PAYMENT_BANK,
      tokenRateVnd: TOKEN_RATE_VND,
    },
  };
}

export async function listUserTopUpRequests(userId: string, limit = 20): Promise<TopUpRequestView[]> {
  const rows = await prisma.tokenTopUpRequest.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return rows.map(toTopUpView);
}

export async function cancelTopUpRequest(opts: { requestId: string; userId: string }): Promise<void> {
  const { requestId, userId } = opts;
  const result = await prisma.tokenTopUpRequest.updateMany({
    where: { id: requestId, userId, status: 'pending' },
    data: { status: 'cancelled' },
  });
  if (result.count !== 1) {
    throw new Error('Yêu cầu không tồn tại hoặc đã được xử lý.');
  }
}

export async function listTopUpRequests(opts: {
  status?: string;
  search?: string;
  limit?: number;
} = {}): Promise<TopUpRequestView[]> {
  const { status, search, limit = 50 } = opts;
  const where: Prisma.TokenTopUpRequestWhereInput = {};

  if (status && status !== 'all') {
    where.status = status;
  }

  if (search && search.trim()) {
    const needle = search.trim();
    const users = await prisma.user.findMany({
      where: { email: { contains: needle, mode: 'insensitive' } },
      select: { id: true },
      take: 50,
    });
    where.OR = [
      { code: { contains: needle, mode: 'insensitive' } },
      { userId: { in: users.map((u) => u.id) } },
    ];
  }

  const rows = await prisma.tokenTopUpRequest.findMany({
    where,
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: limit,
  });
  if (rows.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: Array.from(new Set(rows.map((r) => r.userId))) } },
    select: { id: true, email: true, data: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  return rows.map((row) => {
    const user = userMap.get(row.userId);
    const userData = (user?.data as any) || {};
    return {
      ...toTopUpView(row),
      email: user?.email,
      name: userData.name || user?.email?.split('@')[0],
    };
  });
}

export async function approveTopUpRequest(opts: {
  requestId: string;
  adminUserId: string;
  note?: string;
}): Promise<{ request: TopUpRequestView; wallet: WalletView; transaction: TransactionView }> {
  const { requestId, adminUserId } = opts;
  const note = (opts.note || '').trim();

  return await prisma.$transaction(async (tx) => {
    const request = await tx.tokenTopUpRequest.findUnique({ where: { id: requestId } });
    if (!request) {
      throw new Error('Không tìm thấy yêu cầu nạp token.');
    }
    if (request.status !== 'pending') {
      throw new Error('Yêu cầu này đã được xử lý trước đó.');
    }

    // Claim the pending row first so two admins can never credit it twice.
    const claimed = await tx.tokenTopUpRequest.updateMany({
      where: { id: requestId, status: 'pending' },
      data: {
        status: 'approved',
        reviewedBy: adminUserId,
        reviewedAt: new Date(),
        note: note || null,
      },
    });
    if (claimed.count !== 1) {
      throw new Error('Yêu cầu này vừa được xử lý bởi người khác. Vui lòng tải lại danh sách.');
    }

    const result = await applyWalletDelta(tx, {
      userId: request.userId,
      amount: request.tokens,
      note: `Nạp ${request.tokens} token theo mã ${request.code}${note ? ` — ${note}` : ''}`,
      createdBy: adminUserId,
      referenceId: request.code,
    });

    const updated = await tx.tokenTopUpRequest.update({
      where: { id: requestId },
      data: { walletTransactionId: result.transaction.id },
    });

    return { request: toTopUpView(updated), wallet: result.wallet, transaction: result.transaction };
  });
}

export async function rejectTopUpRequest(opts: {
  requestId: string;
  adminUserId: string;
  reason: string;
}): Promise<TopUpRequestView> {
  const { requestId, adminUserId } = opts;
  const reason = (opts.reason || '').trim();
  if (!reason) {
    throw new Error('Cần nhập lý do từ chối yêu cầu nạp.');
  }

  const result = await prisma.tokenTopUpRequest.updateMany({
    where: { id: requestId, status: 'pending' },
    data: {
      status: 'rejected',
      reviewedBy: adminUserId,
      reviewedAt: new Date(),
      note: reason,
    },
  });
  if (result.count !== 1) {
    throw new Error('Yêu cầu không tồn tại hoặc đã được xử lý.');
  }

  const updated = await prisma.tokenTopUpRequest.findUniqueOrThrow({ where: { id: requestId } });
  return toTopUpView(updated);
}
