import { prisma } from '../../prisma';
import { generateLicensePem, generateRawLicenseKey, hashLicenseKey } from '../license/licenseService';
import { createLicenseKey } from '../license/licenseRepository';
import { createEntitlement } from '../rbac/rbacRepository';

export const LICENSE_PLAN_TOKEN_COST: Record<string, number> = {
  pro: 100,
  enterprise: 300,
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

  // Create initial wallet with 0 balance
  const created = await prisma.userWallet.create({
    data: {
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

  if (!note || note.trim().length === 0) {
    throw new Error('Cần có lý do/ghi chú cho giao dịch token.');
  }

  return await prisma.$transaction(async (tx) => {
    // 1. Ensure wallet exists
    let wallet = await tx.userWallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      wallet = await tx.userWallet.create({
        data: {
          userId,
          balance: 0,
          lockedBalance: 0,
          status: 'active',
          version: 0,
        },
      });
    }

    if (wallet.status === 'frozen') {
      throw new Error('Ví của người dùng này đang bị tạm khóa (frozen).');
    }

    const currentBalance = Number(wallet.balance);
    const currentLocked = Number(wallet.lockedBalance);
    const available = currentBalance - currentLocked;

    // Check if deducting more than available
    if (amount < 0 && available + amount < 0) {
      throw new Error(`Số dư khả dụng không đủ để trừ token (Khả dụng: ${available}, cần trừ: ${Math.abs(amount)}).`);
    }

    const newBalance = currentBalance + amount;

    // 2. Update wallet with optimistic lock
    const updatedWallet = await tx.userWallet.update({
      where: { id: wallet.id },
      data: {
        balance: newBalance,
        version: { increment: 1 },
      },
    });

    // 3. Insert transaction log
    const txRecord = await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        userId,
        amount,
        balanceBefore: currentBalance,
        balanceAfter: newBalance,
        type: amount > 0 ? 'admin_deposit' : 'admin_deduct',
        status: 'completed',
        note: note.trim(),
        createdBy: adminUserId,
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
  });
}

export async function lockWalletBalance(opts: {
  userId: string;
  amount: number;
  referenceId?: string;
  note: string;
}): Promise<WalletView> {
  const { userId, amount, referenceId, note } = opts;
  if (amount <= 0) throw new Error('Số lượng token khóa phải lớn hơn 0.');

  return await prisma.$transaction(async (tx) => {
    let wallet = await tx.userWallet.findUnique({ where: { userId } });
    if (!wallet) throw new Error('Không tìm thấy ví người dùng.');

    const currentBalance = Number(wallet.balance);
    const currentLocked = Number(wallet.lockedBalance);
    const available = currentBalance - currentLocked;

    if (available < amount) {
      throw new Error(`Số dư khả dụng không đủ để khóa (Khả dụng: ${available}, cần: ${amount}).`);
    }

    const updated = await tx.userWallet.update({
      where: { id: wallet.id },
      data: {
        lockedBalance: { increment: amount },
        version: { increment: 1 },
      },
    });

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

  return await prisma.$transaction(async (tx) => {
    let wallet = await tx.userWallet.findUnique({ where: { userId } });
    if (!wallet) throw new Error('Không tìm thấy ví người dùng.');

    const currentBalance = Number(wallet.balance);
    const currentLocked = Number(wallet.lockedBalance);

    if (currentLocked < amount) {
      throw new Error(`Số token đang khóa (${currentLocked}) nhỏ hơn số lượng muốn mở khóa (${amount}).`);
    }

    const updated = await tx.userWallet.update({
      where: { id: wallet.id },
      data: {
        lockedBalance: { decrement: amount },
        version: { increment: 1 },
      },
    });

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
  userEmail: string;
  plan: 'pro' | 'enterprise';
  periodDays?: number;
}): Promise<{
  plan: string;
  cost: number;
  newBalance: number;
  expiresAt: Date;
  licenseKey: string;
  pem: string;
  features: string[];
}> {
  const { userId, userEmail, plan, periodDays = 30 } = opts;
  const cost = LICENSE_PLAN_TOKEN_COST[plan] || 100;
  const expiresAt = new Date(Date.now() + Number(periodDays) * 86400_000);

  const features =
    plan === 'enterprise'
      ? ['tool.exe', 'agent.*', 'lead.intel', 'crm', 'investor_leads', 'fb_inbox', 'automation.*', 'team.manage']
      : ['tool.exe', 'agent.sources', 'agent.runtime', 'agent.reports', 'agent.notifications', 'lead.intel', 'crm', 'investor_leads'];

  return await prisma.$transaction(async (tx) => {
    let wallet = await tx.userWallet.findUnique({ where: { userId } });
    if (!wallet) {
      wallet = await tx.userWallet.create({
        data: {
          userId,
          balance: 0,
          lockedBalance: 0,
          status: 'active',
          version: 0,
        },
      });
    }

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

    const newBalance = currentBalance - cost;

    // 1. Deduct tokens
    await tx.userWallet.update({
      where: { id: wallet.id },
      data: {
        balance: newBalance,
        version: { increment: 1 },
      },
    });

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
    await createEntitlement({
      subjectType: 'user',
      subjectId: userId,
      plan,
      features,
      startsAt: new Date(),
      expiresAt,
      source: 'token_wallet_upgrade',
      grantedBy: userId,
    });

    // 4. Generate license key & PEM
    const rawKey = generateRawLicenseKey();
    const maxDevices = plan === 'enterprise' ? 10 : 3;

    await createLicenseKey({
      userId,
      keyHash: hashLicenseKey(rawKey),
      maxDevices,
    });

    const pem = generateLicensePem({
      licenseKey: rawKey,
      userId,
      userEmail,
      plan,
      expiresAt,
      maxDevices,
    });

    return {
      plan,
      cost,
      newBalance,
      expiresAt,
      licenseKey: rawKey,
      pem,
      features,
    };
  });
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

export async function listAllUserWallets(search?: string): Promise<Array<WalletView & { email?: string; name?: string }>> {
  const users = await prisma.user.findMany({
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
