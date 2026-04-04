export abstract class DomainError extends Error {
  abstract readonly code: string;
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND' as const;
}

export class ConflictError extends DomainError {
  readonly code = 'CONFLICT' as const;
}

export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_FAILED' as const;
  constructor(message: string, readonly details?: unknown) {
    super(message);
  }
}

export class ForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN' as const;
}

/** Map domain error codes to HTTP status codes. */
const ERROR_STATUS_MAP: Record<string, number> = {
  NOT_FOUND: 404,
  VALIDATION_FAILED: 422,
  CONFLICT: 409,
  FORBIDDEN: 403,
  EMAIL_ROLE_CONFLICT: 409,
  PATIENT_ALREADY_EXISTS: 409,
};

export function mapErrorToStatus(code: string): number {
  return ERROR_STATUS_MAP[code] ?? 500;
}
