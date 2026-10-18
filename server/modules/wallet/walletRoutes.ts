import { Router, type Request, type Response } from 'express';
import { getAuthUser } from '../auth/authAccess';
import {
  getOrCreateUserWallet,
  adminAdjustTokens,
  spendTokensForLicenseUpgrade,
  getUserTransactions,
  listAllUserWallets,
  LICENSE_PLAN_TOKEN_COST,
} from './walletService';

export function createWalletRouter(): Router {
  const router = Router();

  /**
   * GET /api/wallet/my
   * Return current user's wallet balance, locked balance, plan costs, and recent transactions
   */
  router.get('/api/wallet/my', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!user) {
        res.status(401).json({ status: 'error', message: 'Yêu cầu đăng nhập.' });
        return;
      }

      const wallet = await getOrCreateUserWallet(user.id);
      const transactions = await getUserTransactions(user.id, 20);

      res.json({
        status: 'success',
        data: {
          wallet,
          transactions,
          planCosts: LICENSE_PLAN_TOKEN_COST,
        },
      });
    } catch (err: any) {
      console.error('[wallet] get my wallet error:', err);
      res.status(500).json({ status: 'error', message: err.message || 'Lỗi khi tải thông tin ví.' });
    }
  });

  /**
   * POST /api/wallet/upgrade-license
   * Upgrade user license plan by deducting tokens from wallet
   */
  router.post('/api/wallet/upgrade-license', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!user) {
        res.status(401).json({ status: 'error', message: 'Yêu cầu đăng nhập.' });
        return;
      }

      const { plan = 'pro', periodDays = 30 } = req.body || {};
      if (plan !== 'pro' && plan !== 'enterprise') {
        res.status(400).json({ status: 'error', message: 'Gói nâng cấp không hợp lệ (hỗ trợ pro hoặc enterprise).' });
        return;
      }

      const result = await spendTokensForLicenseUpgrade({
        userId: user.id,
        userEmail: user.email,
        plan,
        periodDays: Number(periodDays) || 30,
      });

      res.json({
        status: 'success',
        message: `Nâng cấp thành công gói ${plan.toUpperCase()}! Đã trừ ${result.cost} token.`,
        data: result,
      });
    } catch (err: any) {
      console.error('[wallet] upgrade license error:', err);
      res.status(400).json({ status: 'error', message: err.message || 'Nâng cấp thất bại.' });
    }
  });

  /**
   * GET /api/admin/wallets
   * List all user wallets (Super Admin only)
   */
  router.get('/api/admin/wallets', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (user.role !== 'owner' && (user as any).roleKey !== 'super_admin') {
        res.status(403).json({ status: 'error', message: 'Chỉ Super Admin mới có quyền quản lý ví.' });
        return;
      }

      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const wallets = await listAllUserWallets(search);

      res.json({
        status: 'success',
        data: wallets,
      });
    } catch (err: any) {
      console.error('[wallet] list admin wallets error:', err);
      res.status(500).json({ status: 'error', message: err.message || 'Lỗi khi lấy danh sách ví.' });
    }
  });

  /**
   * POST /api/admin/wallets/deposit
   * Super admin credits or debits tokens to a user's wallet
   */
  router.post('/api/admin/wallets/deposit', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (user.role !== 'owner' && (user as any).roleKey !== 'super_admin') {
        res.status(403).json({ status: 'error', message: 'Chỉ Super Admin mới có quyền cộng/trừ token.' });
        return;
      }

      const { userId, amount, note } = req.body || {};
      if (!userId || typeof userId !== 'string') {
        res.status(400).json({ status: 'error', message: 'Thiếu userId người nhận token.' });
        return;
      }

      const numericAmount = Number(amount);
      if (isNaN(numericAmount) || numericAmount === 0) {
        res.status(400).json({ status: 'error', message: 'Số lượng token phải là số khác 0.' });
        return;
      }

      if (!note || typeof note !== 'string' || note.trim().length === 0) {
        res.status(400).json({ status: 'error', message: 'Ghi chú/lý do giao dịch là bắt buộc.' });
        return;
      }

      const result = await adminAdjustTokens({
        userId,
        amount: numericAmount,
        note: note.trim(),
        adminUserId: user.id,
      });

      res.json({
        status: 'success',
        message: `${numericAmount > 0 ? 'Cộng' : 'Trừ'} thành công ${Math.abs(numericAmount)} token cho user ${userId}!`,
        data: result,
      });
    } catch (err: any) {
      console.error('[wallet] admin adjust tokens error:', err);
      res.status(400).json({ status: 'error', message: err.message || 'Giao dịch token thất bại.' });
    }
  });

  /**
   * GET /api/admin/wallets/:userId/transactions
   * Super admin inspects all transactions of a user's wallet
   */
  router.get('/api/admin/wallets/:userId/transactions', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (user.role !== 'owner' && (user as any).roleKey !== 'super_admin') {
        res.status(403).json({ status: 'error', message: 'Chỉ Super Admin mới có quyền xem lịch sử ví người dùng.' });
        return;
      }

      const { userId } = req.params;
      const transactions = await getUserTransactions(userId, 100);

      res.json({
        status: 'success',
        data: transactions,
      });
    } catch (err: any) {
      console.error('[wallet] get user transactions error:', err);
      res.status(500).json({ status: 'error', message: err.message || 'Lỗi khi lấy lịch sử giao dịch.' });
    }
  });

  return router;
}
