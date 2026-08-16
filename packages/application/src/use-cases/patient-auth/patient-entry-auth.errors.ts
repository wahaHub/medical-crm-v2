import { DomainError } from '@medical-crm/utils';

export class EmailRoleConflictError extends DomainError {
  readonly code = 'EMAIL_ROLE_CONFLICT' as const;

  constructor() {
    super('This email is already associated with a hospital or admin account.');
  }
}

export class PatientAlreadyExistsError extends DomainError {
  readonly code = 'PATIENT_ALREADY_EXISTS' as const;

  constructor() {
    super('This email is already registered as a patient. Please sign in instead.');
  }
}

/**
 * Case Lifecycle Phase 2: thrown when a merged (secondary) patient profile
 * attempts to log in. Merged profiles are soft-marked via merged_into_user_id
 * and must authenticate with the surviving primary profile instead.
 */
export class PatientMergedError extends DomainError {
  readonly code = 'PATIENT_MERGED' as const;

  constructor() {
    super('This patient profile has been merged into another profile. Please sign in with your primary profile or contact support.');
  }
}
