import type { Case } from '../entities/case.entity.js';
import { ValidationError } from '@medical-crm/utils';

export class CaseAssignmentService {
  validateAssignment(caze: Case, _hospitalId: string, hospitalStatus: string): void {
    if (hospitalStatus !== 'ACTIVE') {
      throw new ValidationError('Hospital must be ACTIVE to receive case assignments');
    }
    if (caze.assignedHospitalId && caze.stage !== 'PENDING_ASSIGNMENT') {
      throw new ValidationError(
        'Case is already assigned and past PENDING_ASSIGNMENT stage',
      );
    }
  }
}
