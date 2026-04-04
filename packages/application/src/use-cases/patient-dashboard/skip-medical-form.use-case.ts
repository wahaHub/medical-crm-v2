import type { ICaseRepository } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';
import { asRecord } from '../../utils/structured-data.js';

export interface SkipMedicalFormInput {
  caseId: string;
  patientId: string;
}

export class SkipMedicalFormUseCase {
  constructor(private readonly caseRepo: ICaseRepository) {}

  async execute(input: SkipMedicalFormInput): Promise<void> {
    const caseEntity = await this.caseRepo.findById(input.caseId);
    if (!caseEntity) throw new NotFoundError(`Case ${input.caseId} not found`);
    if (caseEntity.patientId !== input.patientId) {
      throw new ForbiddenError('Access denied to this case');
    }

    const existingSelection = asRecord(caseEntity.structuredData?.['patientHospitalSelection']);

    // No-op if already submitted
    if (existingSelection?.['medicalFormStatus'] === 'SUBMITTED') {
      return;
    }

    const now = new Date();
    caseEntity.structuredData = {
      ...(caseEntity.structuredData ?? {}),
      patientHospitalSelection: {
        ...existingSelection,
        medicalFormStatus: 'SKIPPED',
        medicalFormSkippedAt: now.toISOString(),
      },
    };
    await this.caseRepo.save(caseEntity);
  }
}
