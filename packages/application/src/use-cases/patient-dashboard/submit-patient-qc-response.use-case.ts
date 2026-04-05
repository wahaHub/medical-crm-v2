import type { IQuestionCollectorRepository, ICaseRepository } from '@medical-crm/domain';
import { QCResponse } from '@medical-crm/domain';
import { generateId, ForbiddenError, NotFoundError } from '@medical-crm/utils';
import { asRecord } from '../../utils/structured-data.js';
import type { MedicalFormStatus } from '../../utils/structured-data.js';
import type { QCResponseDTO } from '../../dtos/question-collector.dto.js';
import { toQCResponseDTO } from '../../mappers/question-collector.mapper.js';

export interface SubmitPatientQCResponseInput {
  caseId: string;
  patientId: string;
  templateId: string;
  responses: unknown;
}

export class SubmitPatientQCResponseUseCase {
  constructor(
    private readonly qcRepo: IQuestionCollectorRepository,
    private readonly caseRepo: ICaseRepository,
  ) {}

  async execute(input: SubmitPatientQCResponseInput): Promise<QCResponseDTO> {
    const caseEntity = await this.caseRepo.findById(input.caseId);
    if (!caseEntity) {
      throw new NotFoundError(`Case ${input.caseId} not found`);
    }
    if (caseEntity.patientId !== input.patientId) {
      throw new ForbiddenError('Access denied to this case');
    }

    // Persist QC response
    let entity = await this.qcRepo.findResponseByCaseId(input.caseId);

    if (entity) {
      entity.submit(input.responses, undefined, undefined);
    } else {
      entity = new QCResponse({
        id: generateId(),
        caseId: input.caseId,
        templateId: input.templateId,
        userId: input.patientId,
        responses: input.responses,
        extractedData: null,
        riskFlags: [],
        completionStatus: 'COMPLETED',
        submittedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    const saved = await this.qcRepo.saveResponse(entity);

    // Update case structured data: medicalFormStatus = SUBMITTED
    const now = new Date();
    const newStatus: MedicalFormStatus = 'SUBMITTED';
    const existingSelection = asRecord(caseEntity.structuredData?.['patientHospitalSelection']);
    caseEntity.structuredData = {
      ...(caseEntity.structuredData ?? {}),
      patientHospitalSelection: {
        ...existingSelection,
        medicalFormStatus: newStatus,
        medicalFormSubmittedAt: now.toISOString(),
        medicalFormResponseId: saved.id,
        medicalFormSkippedAt: undefined,
      },
    };
    await this.caseRepo.save(caseEntity);

    return toQCResponseDTO(saved);
  }
}
