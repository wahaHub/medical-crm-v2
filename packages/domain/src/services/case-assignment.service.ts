import type { Case } from '../entities/case.entity.js';
import { ValidationError } from '@medical-crm/utils';

export class CaseAssignmentService {
  validateAssignment(caze: Case, _hospitalId: string, hospitalStatus: string): void {
    if (hospitalStatus !== 'ACTIVE') {
      throw new ValidationError('Hospital must be ACTIVE to receive case assignments');
    }
    if (caze.assignedHospitalId && caze.assignmentStatus !== 'UNASSIGNED') {
      throw new ValidationError(
        'Case is already assigned and not available for reassignment',
      );
    }
  }
}
