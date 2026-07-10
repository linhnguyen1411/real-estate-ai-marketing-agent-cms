import {
  AGENT_FINDING_STATUSES,
  AGENT_MISSION_STATUSES,
  AGENT_SOURCE_STATUSES,
  AGENT_SOURCE_TYPES,
  type PaginationInput,
} from './agentTypes';

type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

function fail<T>(message: string): ValidationResult<T> {
  return { ok: false, message };
}

export function parsePagination(query: Record<string, unknown>): PaginationInput {
  const page = Math.max(1, Number.parseInt(String(query.page ?? '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(String(query.limit ?? '20'), 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

export function parseOptionalInt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function validateSourceCreate(body: Record<string, unknown>): ValidationResult<{
  name: string;
  type: string;
  url: string;
  status?: string;
  priority?: number;
  scanIntervalMinutes?: number;
  config?: Record<string, unknown>;
  checkpoint?: Record<string, unknown> | null;
}> {
  const name = String(body.name ?? '').trim();
  const type = String(body.type ?? '').trim();
  const url = String(body.url ?? '').trim();

  if (!name) return fail('Tên nguồn là bắt buộc.');
  if (!AGENT_SOURCE_TYPES.includes(type as (typeof AGENT_SOURCE_TYPES)[number])) {
    return fail(`type phải là một trong: ${AGENT_SOURCE_TYPES.join(', ')}`);
  }
  if (!url) return fail('url là bắt buộc.');
  try {
    new URL(url);
  } catch {
    return fail('url không hợp lệ.');
  }

  const status = body.status !== undefined ? String(body.status).trim() : undefined;
  if (status && !AGENT_SOURCE_STATUSES.includes(status as (typeof AGENT_SOURCE_STATUSES)[number])) {
    return fail(`status phải là một trong: ${AGENT_SOURCE_STATUSES.join(', ')}`);
  }

  const priority = parseOptionalInt(body.priority);
  if (priority !== undefined && (priority < 1 || priority > 10)) {
    return fail('priority phải từ 1 đến 10.');
  }

  const scanIntervalMinutes = parseOptionalInt(body.scanIntervalMinutes ?? body.scan_interval_minutes);
  if (scanIntervalMinutes !== undefined && scanIntervalMinutes < 5) {
    return fail('scanIntervalMinutes tối thiểu 5 phút.');
  }

  return {
    ok: true,
    value: {
      name,
      type,
      url,
      status,
      priority,
      scanIntervalMinutes,
      config: typeof body.config === 'object' && body.config !== null ? body.config as Record<string, unknown> : undefined,
      checkpoint: body.checkpoint === null
        ? null
        : typeof body.checkpoint === 'object' && body.checkpoint !== null
          ? body.checkpoint as Record<string, unknown>
          : undefined,
    },
  };
}

export function validateSourcePatch(body: Record<string, unknown>): ValidationResult<Record<string, unknown>> {
  if (!body || typeof body !== 'object' || Object.keys(body).length === 0) {
    return fail('Body cập nhật trống.');
  }

  const patch: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return fail('name không được rỗng.');
    patch.name = name;
  }

  if (body.type !== undefined) {
    const type = String(body.type).trim();
    if (!AGENT_SOURCE_TYPES.includes(type as (typeof AGENT_SOURCE_TYPES)[number])) {
      return fail(`type phải là một trong: ${AGENT_SOURCE_TYPES.join(', ')}`);
    }
    patch.type = type;
  }

  if (body.url !== undefined) {
    const url = String(body.url).trim();
    if (!url) return fail('url không được rỗng.');
    try {
      new URL(url);
    } catch {
      return fail('url không hợp lệ.');
    }
    patch.url = url;
  }

  if (body.status !== undefined) {
    const status = String(body.status).trim();
    if (!AGENT_SOURCE_STATUSES.includes(status as (typeof AGENT_SOURCE_STATUSES)[number])) {
      return fail(`status phải là một trong: ${AGENT_SOURCE_STATUSES.join(', ')}`);
    }
    patch.status = status;
  }

  if (body.priority !== undefined) {
    const priority = parseOptionalInt(body.priority);
    if (priority === undefined || priority < 1 || priority > 10) return fail('priority phải từ 1 đến 10.');
    patch.priority = priority;
  }

  if (body.scanIntervalMinutes !== undefined || body.scan_interval_minutes !== undefined) {
    const scanIntervalMinutes = parseOptionalInt(body.scanIntervalMinutes ?? body.scan_interval_minutes);
    if (scanIntervalMinutes === undefined || scanIntervalMinutes < 5) {
      return fail('scanIntervalMinutes tối thiểu 5 phút.');
    }
    patch.scanIntervalMinutes = scanIntervalMinutes;
  }

  if (body.config !== undefined) {
    if (typeof body.config !== 'object' || body.config === null) return fail('config phải là object.');
    patch.config = body.config;
  }

  if (body.checkpoint !== undefined) {
    if (body.checkpoint !== null && (typeof body.checkpoint !== 'object')) {
      return fail('checkpoint phải là object hoặc null.');
    }
    patch.checkpoint = body.checkpoint;
  }

  return { ok: true, value: patch };
}

export function validateMissionCreate(body: Record<string, unknown>): ValidationResult<{
  name: string;
  objective: string;
  status?: string;
  rules?: Record<string, unknown>;
  schedule?: Record<string, unknown> | null;
}> {
  const name = String(body.name ?? '').trim();
  const objective = String(body.objective ?? '').trim();

  if (!name) return fail('Tên mission là bắt buộc.');
  if (!objective) return fail('objective là bắt buộc.');

  const status = body.status !== undefined ? String(body.status).trim() : undefined;
  if (status && !AGENT_MISSION_STATUSES.includes(status as (typeof AGENT_MISSION_STATUSES)[number])) {
    return fail(`status phải là một trong: ${AGENT_MISSION_STATUSES.join(', ')}`);
  }

  if (body.rules !== undefined && (typeof body.rules !== 'object' || body.rules === null)) {
    return fail('rules phải là object.');
  }

  if (body.schedule !== undefined && body.schedule !== null && typeof body.schedule !== 'object') {
    return fail('schedule phải là object hoặc null.');
  }

  return {
    ok: true,
    value: {
      name,
      objective,
      status,
      rules: body.rules as Record<string, unknown> | undefined,
      schedule: body.schedule === null ? null : body.schedule as Record<string, unknown> | undefined,
    },
  };
}

export function validateMissionPatch(body: Record<string, unknown>): ValidationResult<Record<string, unknown>> {
  if (!body || typeof body !== 'object' || Object.keys(body).length === 0) {
    return fail('Body cập nhật trống.');
  }

  const patch: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return fail('name không được rỗng.');
    patch.name = name;
  }

  if (body.objective !== undefined) {
    const objective = String(body.objective).trim();
    if (!objective) return fail('objective không được rỗng.');
    patch.objective = objective;
  }

  if (body.status !== undefined) {
    const status = String(body.status).trim();
    if (!AGENT_MISSION_STATUSES.includes(status as (typeof AGENT_MISSION_STATUSES)[number])) {
      return fail(`status phải là một trong: ${AGENT_MISSION_STATUSES.join(', ')}`);
    }
    patch.status = status;
  }

  if (body.rules !== undefined) {
    if (typeof body.rules !== 'object' || body.rules === null) return fail('rules phải là object.');
    patch.rules = body.rules;
  }

  if (body.schedule !== undefined) {
    if (body.schedule !== null && typeof body.schedule !== 'object') return fail('schedule phải là object hoặc null.');
    patch.schedule = body.schedule;
  }

  return { ok: true, value: patch };
}

export function validateFindingPatch(body: Record<string, unknown>): ValidationResult<{
  status: string;
  promotedLeadId?: string | null;
}> {
  const status = String(body.status ?? '').trim();
  if (!AGENT_FINDING_STATUSES.includes(status as (typeof AGENT_FINDING_STATUSES)[number])) {
    return fail(`status phải là một trong: ${AGENT_FINDING_STATUSES.join(', ')}`);
  }

  if (status === 'promoted') {
    const promotedLeadId = body.promotedLeadId ?? body.promoted_lead_id;
    if (promotedLeadId !== undefined && promotedLeadId !== null && !String(promotedLeadId).trim()) {
      return fail('promotedLeadId không hợp lệ khi status=promoted.');
    }
  }

  const promotedLeadId = body.promotedLeadId ?? body.promoted_lead_id;
  return {
    ok: true,
    value: {
      status,
      promotedLeadId: promotedLeadId === undefined
        ? undefined
        : promotedLeadId === null
          ? null
          : String(promotedLeadId).trim() || null,
    },
  };
}
