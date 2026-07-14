/**
 * Domain errors for Agent repository / lifecycle boundaries.
 * Routes map these to compatible HTTP statuses.
 */

export class EntityNotFoundError extends Error {
  readonly code = 'ENTITY_NOT_FOUND';
  constructor(message: string) {
    super(message);
    this.name = 'EntityNotFoundError';
  }
}

export class TenantScopeError extends Error {
  readonly code = 'TENANT_SCOPE';
  constructor(message = 'Không có quyền truy cập bản ghi này.') {
    super(message);
    this.name = 'TenantScopeError';
  }
}

export class LifecycleConflictError extends Error {
  readonly code = 'LIFECYCLE_CONFLICT';
  constructor(message: string) {
    super(message);
    this.name = 'LifecycleConflictError';
  }
}

export class DuplicateEntityError extends Error {
  readonly code = 'DUPLICATE_ENTITY';
  constructor(message: string) {
    super(message);
    this.name = 'DuplicateEntityError';
  }
}

export class TransitionAlreadyCompletedError extends Error {
  readonly code = 'TRANSITION_ALREADY_COMPLETED';
  readonly resourceId: string | null;
  constructor(message: string, resourceId: string | null = null) {
    super(message);
    this.name = 'TransitionAlreadyCompletedError';
    this.resourceId = resourceId;
  }
}

export class ValidationError extends Error {
  readonly code = 'VALIDATION';
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function httpStatusForDomainError(error: unknown): number {
  if (error instanceof EntityNotFoundError) return 404;
  if (error instanceof TenantScopeError) return 403;
  if (error instanceof LifecycleConflictError) return 409;
  if (error instanceof TransitionAlreadyCompletedError) return 200;
  if (error instanceof DuplicateEntityError) return 409;
  if (error instanceof ValidationError) return 400;
  return 500;
}

export function isDomainError(error: unknown): boolean {
  return (
    error instanceof EntityNotFoundError ||
    error instanceof TenantScopeError ||
    error instanceof LifecycleConflictError ||
    error instanceof DuplicateEntityError ||
    error instanceof TransitionAlreadyCompletedError ||
    error instanceof ValidationError
  );
}
