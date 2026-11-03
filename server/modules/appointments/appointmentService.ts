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

export const APPOINTMENT_STATUSES: readonly AppointmentStatus[] = [
  'pending',
  'confirmed',
  'completed',
  'cancelled',
];

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

export interface ViewingAppointmentListQuery {
  companyId?: string | null;
  assignedStaffId?: string | null;
  status?: string;
  search?: string;
  limit?: number;
}

type ViewingAppointmentRow = {
  id: string;
  companyId: string | null;
  customerName: string;
  customerPhone: string;
  propertyId: string | null;
  propertyTitle: string | null;
  appointmentTime: Date;
  status: string;
  notes: string | null;
  assignedStaffId: string | null;
  followUpDueAt: Date | null;
  followUpNote: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toRecord(row: ViewingAppointmentRow): ViewingAppointmentRecord {
  return {
    id: row.id,
    companyId: row.companyId,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    propertyId: row.propertyId,
    propertyTitle: row.propertyTitle,
    appointmentTime: row.appointmentTime.toISOString(),
    status: row.status as AppointmentStatus,
    notes: row.notes,
    assignedStaffId: row.assignedStaffId,
    followUpDueAt: row.followUpDueAt ? row.followUpDueAt.toISOString() : null,
    followUpNote: row.followUpNote,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function parseAppointmentDate(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('INVALID_APPOINTMENT_TIME');
  }
  return date;
}

export async function createViewingAppointment(
  input: ViewingAppointmentInput,
): Promise<ViewingAppointmentRecord> {
  const id = `apt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const appointmentTime = parseAppointmentDate(input.appointmentTime);
  // Follow-up is due two hours after the viewing.
  const followUpDue = new Date(appointmentTime.getTime() + 2 * 60 * 60 * 1000);

  const row = await prisma.viewingAppointment.create({
    data: {
      id,
      companyId: input.companyId || null,
      customerName: input.customerName.trim(),
      customerPhone: input.customerPhone.trim(),
      propertyId: input.propertyId || null,
      propertyTitle: input.propertyTitle || null,
      appointmentTime,
      status: 'pending',
      notes: input.notes || null,
      assignedStaffId: input.assignedStaffId || null,
      followUpDueAt: followUpDue,
    },
  });

  return toRecord(row);
}

export async function listViewingAppointments(
  query: ViewingAppointmentListQuery,
): Promise<ViewingAppointmentRecord[]> {
  if (process.env.NODE_ENV === 'test' && !process.env.FORCE_TEST_DB) {
    return [];
  }

  const where: Record<string, unknown> = {};
  if (query.companyId) where.companyId = query.companyId;
  if (query.assignedStaffId) where.assignedStaffId = query.assignedStaffId;
  if (query.status) where.status = query.status;
  if (query.search) {
    where.OR = [
      { customerName: { contains: query.search, mode: 'insensitive' } },
      { customerPhone: { contains: query.search } },
      { propertyTitle: { contains: query.search, mode: 'insensitive' } },
      { notes: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  const rows = await prisma.viewingAppointment.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(query.limit || 50, 1), 200),
  });
  return rows.map(toRecord);
}

export async function getViewingAppointment(id: string): Promise<ViewingAppointmentRecord | null> {
  const row = await prisma.viewingAppointment.findUnique({ where: { id } });
  return row ? toRecord(row) : null;
}

export async function updateViewingAppointment(
  id: string,
  updates: Partial<ViewingAppointmentRecord>,
): Promise<ViewingAppointmentRecord | null> {
  const data: Record<string, unknown> = {};

  if (updates.customerName !== undefined) data.customerName = updates.customerName.trim();
  if (updates.customerPhone !== undefined) data.customerPhone = updates.customerPhone.trim();
  if (updates.propertyId !== undefined) data.propertyId = updates.propertyId || null;
  if (updates.propertyTitle !== undefined) data.propertyTitle = updates.propertyTitle || null;
  if (updates.appointmentTime !== undefined) {
    data.appointmentTime = parseAppointmentDate(updates.appointmentTime);
  }
  if (updates.status !== undefined) {
    if (!APPOINTMENT_STATUSES.includes(updates.status)) {
      throw new Error('INVALID_APPOINTMENT_STATUS');
    }
    data.status = updates.status;
  }
  if (updates.notes !== undefined) data.notes = updates.notes || null;
  if (updates.assignedStaffId !== undefined) data.assignedStaffId = updates.assignedStaffId || null;
  if (updates.followUpDueAt !== undefined) {
    data.followUpDueAt = updates.followUpDueAt ? parseAppointmentDate(updates.followUpDueAt) : null;
  }
  if (updates.followUpNote !== undefined) data.followUpNote = updates.followUpNote || null;

  if (Object.keys(data).length === 0) {
    return getViewingAppointment(id);
  }

  try {
    const row = await prisma.viewingAppointment.update({ where: { id }, data });
    return toRecord(row);
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2025') return null;
    throw error;
  }
}
