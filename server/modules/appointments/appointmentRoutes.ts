/**
 * Viewing Appointment API Routes (Public & Admin).
 */

import { Router, type Request, type Response } from 'express';
import {
  createViewingAppointment,
  getViewingAppointment,
  listViewingAppointments,
  updateViewingAppointment,
} from './appointmentService';
import { requirePermission } from '../rbac';
import { getAuthUser } from '../auth/authAccess';
import { readDatabase } from '../../dbHelper';

function isPlatformOwner(req: Request): boolean {
  const user = getAuthUser(req);
  return user?.role === 'owner' || (user?.role as string) === 'super_admin';
}

export function createAppointmentRouter() {
  const router = Router();

  // Public endpoint: Khách đặt lịch xem nhà từ website hoặc landing page
  router.post('/api/public/appointments', async (req: Request, res: Response) => {
    try {
      const { customerName, customerPhone, propertyId, propertyTitle, appointmentTime, notes } = req.body;
      if (!customerName || !customerPhone || !appointmentTime) {
        return res.status(400).json({
          status: 'error',
          message: 'Vui lòng cung cấp đầy đủ: Tên, Số điện thoại và Thời gian hẹn xem nhà.',
        });
      }
      if (Number.isNaN(new Date(String(appointmentTime)).getTime())) {
        return res.status(400).json({
          status: 'error',
          message: 'Thời gian hẹn xem nhà không hợp lệ.',
        });
      }

      let property: any;
      try {
        property = propertyId
          ? readDatabase().properties.find((item: any) => item.id === propertyId)
          : undefined;
      } catch {
        property = undefined;
      }

      const appointment = await createViewingAppointment({
        companyId: property?.company_id || null,
        customerName,
        customerPhone,
        propertyId,
        propertyTitle: propertyTitle || property?.title,
        appointmentTime,
        notes,
      });

      return res.status(201).json({
        status: 'success',
        message: 'Đặt lịch xem nhà thành công. Chuyên viên tư vấn sẽ liên hệ xác nhận trong ít phút.',
        data: appointment,
      });
    } catch (error) {
      console.error('[appointments] Error creating public appointment:', error);
      return res.status(500).json({ status: 'error', message: 'Không thể đặt lịch xem nhà lúc này.' });
    }
  });

  // Admin endpoint: Lấy danh sách lịch hẹn
  router.use('/api/appointments', requirePermission('appointments.manage'));
  router.get('/api/appointments', async (req: Request, res: Response) => {
    try {
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const parsedLimit = req.query.limit ? Number(req.query.limit) : 50;
      const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 50;

      const user = getAuthUser(req);
      const isOwner = isPlatformOwner(req);
      if (!isOwner && !user?.company_id) {
        return res.status(403).json({
          status: 'error',
          message: 'Bạn không có quyền xem lịch hẹn ngoài công ty của mình.',
        });
      }

      const items = await listViewingAppointments({
        companyId: isOwner ? null : user?.company_id,
        assignedStaffId: !isOwner && req.scope === 'own' ? user?.id : null,
        status,
        search,
        limit,
      });
      return res.json({ status: 'success', data: items });
    } catch (error) {
      console.error('[appointments] Error listing appointments:', error);
      return res.status(500).json({ status: 'error', message: 'Lỗi khi tải danh sách lịch hẹn.' });
    }
  });

  // Admin endpoint: Cập nhật trạng thái lịch hẹn và nhắc việc follow-up
  router.patch('/api/appointments/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const existing = await getViewingAppointment(id);
      if (!existing) {
        return res.status(404).json({ status: 'error', message: 'Không tìm thấy lịch hẹn này.' });
      }

      const isOwner = isPlatformOwner(req);
      if (!isOwner) {
        const user = getAuthUser(req);
        if (!user?.company_id || existing.companyId !== user.company_id) {
          return res.status(403).json({
            status: 'error',
            message: 'Bạn không có quyền cập nhật lịch hẹn của công ty khác.',
          });
        }
        if (req.scope === 'own' && existing.assignedStaffId !== user.id) {
          return res.status(403).json({
            status: 'error',
            message: 'Bạn chỉ có thể cập nhật lịch hẹn được giao cho mình.',
          });
        }
      }

      let updated;
      try {
        updated = await updateViewingAppointment(id, updates);
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (message === 'INVALID_APPOINTMENT_STATUS' || message === 'INVALID_APPOINTMENT_TIME') {
          return res.status(400).json({ status: 'error', message: 'Dữ liệu lịch hẹn không hợp lệ.' });
        }
        throw error;
      }
      if (!updated) {
        return res.status(404).json({ status: 'error', message: 'Không tìm thấy lịch hẹn này.' });
      }

      return res.json({ status: 'success', data: updated });
    } catch (error) {
      console.error('[appointments] Error updating appointment:', error);
      return res.status(500).json({ status: 'error', message: 'Lỗi khi cập nhật lịch hẹn.' });
    }
  });

  return router;
}
