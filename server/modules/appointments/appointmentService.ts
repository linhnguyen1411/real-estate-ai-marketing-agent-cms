/**
 * Viewing Appointment & Follow-up Scheduling Service.
 *
 * Implements Stage 3.3 of Master Plan:
 * - Viewing appointments: customer, property, appointment_time, status (pending, confirmed, completed, cancelled)
 * - Automated Follow-up Task creation after appointment
 */

import { prisma } from '../../prisma';

export type AppointmentStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';

export interface ViewingAppointmentInput {
  companyId?: string | null;
  customerName: string;
  customerPhone: string;
  propertyId?: string | null;
  propertyTitle?: string | null;
  appointmentTime: string; // ISO date string
  notes?: string | null;
  assignedStaffId?: string | null;
}

export interface ViewingAppointmentRecord {
  id: string;
  companyId: string | null;
  customerName: string;
  customerPhone: string;
  propertyId: string | null;
  propertyTitle: string | null;
  appointmentTime: string;
  status: AppointmentStatus;
  notes: string | null;
  assignedStaffId: string | null;
  followUpDueAt: string | null;
  followUpNote: string | null;
  createdAt: string;
  updatedAt: string;
}

const COLLECTION = 'viewing_appointments';

export async function createViewingAppointment(
  input: ViewingAppointmentInput,
): Promise<ViewingAppointmentRecord> {
  const id = `apt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date();

  // Follow-up due automatically 2 hours after viewing appointment
  const aptDate = new Date(input.appointmentTime);
  const followUpDue = new Date(aptDate.getTime() + 2 * 60 * 60 * 1000);

  const data: ViewingAppointmentRecord = {
    id,
    companyId: input.companyId || null,
    customerName: input.customerName.trim(),
    customerPhone: input.customerPhone.trim(),
    propertyId: input.propertyId || null,
    propertyTitle: input.propertyTitle || null,
    appointmentTime: input.appointmentTime,
    status: 'pending',
    notes: input.notes || null,
    assignedStaffId: input.assignedStaffId || null,
    followUpDueAt: followUpDue.toISOString(),
    followUpNote: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  await prisma.cmsRecord.create({
    data: {
      collection: COLLECTION,
      id,
      companyId: input.companyId || null,
      status: 'pending',
      data: data as any,
      searchText: `${data.customerName} ${data.customerPhone} ${data.propertyTitle || ''} ${data.notes || ''}`,
    },
  });

  // Dual-write to relational viewing_appointments table if present
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO viewing_appointments (id, company_id, customer_name, customer_phone, property_id, property_title, appointment_time, status, notes, assigned_staff_id, follow_up_due_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, updated_at = EXCLUDED.updated_at`,
      data.id,
      data.companyId,
      data.customerName,
      data.customerPhone,
      data.propertyId,
      data.propertyTitle,
      new Date(data.appointmentTime),
      data.status,
      data.notes,
      data.assignedStaffId,
      data.followUpDueAt ? new Date(data.followUpDueAt) : null,
      now,
      now,
    );
  } catch {
    // Silently continue if relational table not yet created
  }

  return data;
}

export async function listViewingAppointments(query: {
  companyId?: string | null;
  status?: string;
  search?: string;
  limit?: number;
}): Promise<ViewingAppointmentRecord[]> {
  const where: any = { collection: COLLECTION };
  if (query.companyId) {
    where.companyId = query.companyId;
  }
  if (query.status) {
    where.status = query.status;
  }
  if (query.search) {
    where.searchText = { contains: query.search, mode: 'insensitive' };
  }

  const records = await prisma.cmsRecord.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: query.limit || 50,
  });

  return records.map(r => r.data as unknown as ViewingAppointmentRecord);
}

export async function updateViewingAppointment(
  id: string,
  updates: Partial<ViewingAppointmentRecord>,
): Promise<ViewingAppointmentRecord | null> {
  const existing = await prisma.cmsRecord.findUnique({
    where: { collection_id: { collection: COLLECTION, id } },
  });
  if (!existing) return null;

  const current = existing.data as unknown as ViewingAppointmentRecord;
  const updatedData: ViewingAppointmentRecord = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await prisma.cmsRecord.update({
    where: { collection_id: { collection: COLLECTION, id } },
    data: {
      status: updatedData.status,
      data: updatedData as any,
      searchText: `${updatedData.customerName} ${updatedData.customerPhone} ${updatedData.propertyTitle || ''} ${updatedData.notes || ''} ${updatedData.followUpNote || ''}`,
    },
  });

  return updatedData;
}
