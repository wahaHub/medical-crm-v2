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
