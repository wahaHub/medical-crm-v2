import type { IQuestionCollectorRepository, ICaseRepository } from '@medical-crm/domain';
import { ForbiddenError, NotFoundError } from '@medical-crm/utils';
import type { QCResponseDTO } from '../../dtos/question-collector.dto.js';
import { toQCResponseDTO } from '../../mappers/question-collector.mapper.js';

export interface PatientSafeQCResponseDTO {
  id: string;
  caseId: string;
  templateId: string;
  responses: unknown;
  completionStatus: string;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GetPatientQCResponseInput {
  caseId: string;
  patientId: string;
}

export class GetPatientQCResponseUseCase {
  constructor(
    private readonly qcRepo: IQuestionCollectorRepository,
    private readonly caseRepo: ICaseRepository,
  ) {}

  async execute(input: GetPatientQCResponseInput): Promise<PatientSafeQCResponseDTO | null> {
    const caseEntity = await this.caseRepo.findById(input.caseId);
    if (!caseEntity) {
      throw new NotFoundError(`Case ${input.caseId} not found`);
    }
    if (caseEntity.patientId !== input.patientId) {
      throw new ForbiddenError('Access denied to this case');
    }

    const entity = await this.qcRepo.findResponseByCaseId(input.caseId);
    if (!entity) return null;

    const dto: QCResponseDTO = toQCResponseDTO(entity);

    // Return patient-safe shape: omit admin-only fields (extractedData, riskFlags, translations, userId)
    return {
      id: dto.id,
      caseId: dto.caseId,
      templateId: dto.templateId,
      responses: dto.responses,
      completionStatus: dto.completionStatus,
      submittedAt: dto.submittedAt,
      createdAt: dto.createdAt,
      updatedAt: dto.updatedAt,
    };
  }
}
