import { sendError } from '../../utils/httpResponses';
import { Router, type Request, type Response } from 'express';
import { getAuthUser } from '../auth/authAccess';
import { isSuperAdminUser } from '../auth/tenantScope';
import {
  getOrCreateUserWallet,
  adminAdjustTokens,
  spendTokensForLicenseUpgrade,
  getUserTransactions,
  listAllUserWallets,
  LICENSE_PLAN_TOKEN_COST,
  getTopUpConfig,
  createTopUpRequest,
  listUserTopUpRequests,
  cancelTopUpRequest,
  listTopUpRequests,
  approveTopUpRequest,
  rejectTopUpRequest,
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
        sendError(res, 401, 'Yêu cầu đăng nhập.');
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
          topUpConfig: getTopUpConfig(),
        },
      });
    } catch (err: any) {
      console.error('[wallet] get my wallet error:', err);
      sendError(res, 500, err.message || 'Lỗi khi tải thông tin ví.');
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
        sendError(res, 401, 'Yêu cầu đăng nhập.');
        return;
      }

      const { plan = 'pro', periodDays = 30 } = req.body || {};
      if (plan !== 'pro' && plan !== 'enterprise') {
        sendError(res, 400, 'Gói nâng cấp không hợp lệ (hỗ trợ pro hoặc enterprise).');
        return;
      }

      const result = await spendTokensForLicenseUpgrade({
        userId: user.id,
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
      sendError(res, 400, err.message || 'Nâng cấp thất bại.');
    }
  });

  /**
   * GET /api/admin/wallets
   * List all user wallets (Super Admin only)
   */
  router.get('/api/admin/wallets', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!isSuperAdminUser(user)) {
        sendError(res, 403, 'Chỉ Super Admin mới có quyền quản lý ví.');
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
      sendError(res, 500, err.message || 'Lỗi khi lấy danh sách ví.');
    }
  });

  /**
   * POST /api/admin/wallets/deposit
   * Super admin credits or debits tokens to a user's wallet
   */
  router.post('/api/admin/wallets/deposit', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!isSuperAdminUser(user)) {
        sendError(res, 403, 'Chỉ Super Admin mới có quyền cộng/trừ token.');
        return;
      }

      const { userId, amount, note } = req.body || {};
      if (!userId || typeof userId !== 'string') {
        sendError(res, 400, 'Thiếu userId người nhận token.');
        return;
      }

      const numericAmount = Number(amount);
      if (isNaN(numericAmount) || numericAmount === 0) {
        sendError(res, 400, 'Số lượng token phải là số khác 0.');
        return;
      }

      if (!note || typeof note !== 'string' || note.trim().length === 0) {
        sendError(res, 400, 'Ghi chú/lý do giao dịch là bắt buộc.');
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
      sendError(res, 400, err.message || 'Giao dịch token thất bại.');
    }
  });

  /**
   * GET /api/admin/wallets/:userId/transactions
   * Super admin inspects all transactions of a user's wallet
   */
  router.get('/api/admin/wallets/:userId/transactions', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!isSuperAdminUser(user)) {
        sendError(res, 403, 'Chỉ Super Admin mới có quyền xem lịch sử ví người dùng.');
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
      sendError(res, 500, err.message || 'Lỗi khi lấy lịch sử giao dịch.');
    }
  });

  /**
   * POST /api/wallet/topup-requests
   * User opens a token top-up request and receives the bank QR payload
   */
  router.post('/api/wallet/topup-requests', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!user) {
        sendError(res, 401, 'Yêu cầu đăng nhập.');
        return;
      }

      const tokens = Number(req.body?.tokens);
      const result = await createTopUpRequest({ userId: user.id, tokens });

      res.json({
        status: 'success',
        message: `Đã tạo yêu cầu nạp ${result.request.tokens} token. Vui lòng chuyển khoản đúng số tiền và nội dung ${result.request.code}.`,
        data: result,
      });
    } catch (err: any) {
      console.error('[wallet] create topup request error:', err);
      sendError(res, 400, err.message || 'Không tạo được yêu cầu nạp token.');
    }
  });

  /**
   * GET /api/wallet/topup-requests
   * Current user's top-up requests and their review status
   */
  router.get('/api/wallet/topup-requests', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!user) {
        sendError(res, 401, 'Yêu cầu đăng nhập.');
        return;
      }

      const requests = await listUserTopUpRequests(user.id);
      res.json({ status: 'success', data: requests });
    } catch (err: any) {
      console.error('[wallet] list my topup requests error:', err);
      sendError(res, 500, err.message || 'Lỗi khi tải yêu cầu nạp token.');
    }
  });

  /**
   * POST /api/wallet/topup-requests/:id/cancel
   * User cancels a pending top-up request
   */
  router.post('/api/wallet/topup-requests/:id/cancel', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!user) {
        sendError(res, 401, 'Yêu cầu đăng nhập.');
        return;
      }

      await cancelTopUpRequest({ requestId: req.params.id, userId: user.id });
      res.json({ status: 'success', message: 'Đã hủy yêu cầu nạp token.' });
    } catch (err: any) {
      console.error('[wallet] cancel topup request error:', err);
      sendError(res, 400, err.message || 'Không hủy được yêu cầu nạp token.');
    }
  });

  /**
   * GET /api/admin/wallet/topup-requests
   * Super admin reviews token top-up requests
   */
  router.get('/api/admin/wallet/topup-requests', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!isSuperAdminUser(user)) {
        sendError(res, 403, 'Chỉ Super Admin mới có quyền duyệt yêu cầu nạp token.');
        return;
      }

      const status = typeof req.query.status === 'string' ? req.query.status : 'pending';
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const requests = await listTopUpRequests({ status, search });

      res.json({ status: 'success', data: requests });
    } catch (err: any) {
      console.error('[wallet] list admin topup requests error:', err);
      sendError(res, 500, err.message || 'Lỗi khi tải yêu cầu nạp token.');
    }
  });

  /**
   * POST /api/admin/wallet/topup-requests/:id/approve
   * Super admin confirms the transfer arrived and credits tokens once
   */
  router.post('/api/admin/wallet/topup-requests/:id/approve', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!isSuperAdminUser(user)) {
        sendError(res, 403, 'Chỉ Super Admin mới có quyền duyệt yêu cầu nạp token.');
        return;
      }

      const result = await approveTopUpRequest({
        requestId: req.params.id,
        adminUserId: user.id,
        note: typeof req.body?.note === 'string' ? req.body.note : undefined,
      });

      res.json({
        status: 'success',
        message: `Đã cộng ${result.request.tokens} token theo mã ${result.request.code}.`,
        data: result,
      });
    } catch (err: any) {
      console.error('[wallet] approve topup request error:', err);
      sendError(res, 400, err.message || 'Không duyệt được yêu cầu nạp token.');
    }
  });

  /**
   * POST /api/admin/wallet/topup-requests/:id/reject
   * Super admin rejects a pending top-up request with a reason
   */
  router.post('/api/admin/wallet/topup-requests/:id/reject', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!isSuperAdminUser(user)) {
        sendError(res, 403, 'Chỉ Super Admin mới có quyền duyệt yêu cầu nạp token.');
        return;
      }

      const request = await rejectTopUpRequest({
        requestId: req.params.id,
        adminUserId: user.id,
        reason: typeof req.body?.reason === 'string' ? req.body.reason : '',
      });

      res.json({
        status: 'success',
        message: `Đã từ chối yêu cầu nạp ${request.code}.`,
        data: request,
      });
    } catch (err: any) {
      console.error('[wallet] reject topup request error:', err);
      sendError(res, 400, err.message || 'Không từ chối được yêu cầu nạp token.');
    }
  });

  return router;
}
