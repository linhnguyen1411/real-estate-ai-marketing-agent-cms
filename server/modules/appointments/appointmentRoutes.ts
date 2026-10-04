/**
 * Viewing Appointment API Routes (Public & Admin).
 */

import { Router, type Request, type Response } from 'express';
import {
  createViewingAppointment,
  listViewingAppointments,
  updateViewingAppointment,
} from './appointmentService';

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

      const appointment = await createViewingAppointment({
        customerName,
        customerPhone,
        propertyId,
        propertyTitle,
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
  router.get('/api/appointments', async (req: Request, res: Response) => {
    try {
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : 50;

      const items = await listViewingAppointments({ status, search, limit });
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
      const updated = await updateViewingAppointment(id, updates);
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
