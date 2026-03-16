import type { IQuestionCollectorRepository, ICaseRepository } from '@medical-crm/domain';
import { QCResponse } from '@medical-crm/domain';
import { generateId, ForbiddenError, NotFoundError } from '@medical-crm/utils';
import type { QCResponseDTO } from '../../dtos/question-collector.dto.js';
import type { Actor } from '../../types/actor.js';
import { toQCResponseDTO } from '../../mappers/question-collector.mapper.js';

export interface SubmitResponseInput {
  templateId: string;
  responses: unknown;
  riskFlags?: string[];
  extractedData?: unknown;
}

export class SubmitResponseUseCase {
  constructor(
    private readonly qcRepo: IQuestionCollectorRepository,
    private readonly caseRepo: ICaseRepository,
  ) {}

  async execute(caseId: string, input: SubmitResponseInput, actor: Actor): Promise<QCResponseDTO> {
    if (actor.role !== 'PATIENT') {
      throw new ForbiddenError('Only patients can submit questionnaire responses');
    }

    // Verify case exists and belongs to actor
    const caseEntity = await this.caseRepo.findById(caseId);
    if (!caseEntity) {
      throw new NotFoundError(`Case ${caseId} not found`);
    }
    if (caseEntity.patientId !== actor.userId) {
      throw new ForbiddenError('Patient can only submit responses for their own cases');
    }

    // Verify template exists
    const template = await this.qcRepo.findTemplateById(input.templateId);
    if (!template) {
      throw new NotFoundError(`Template ${input.templateId} not found`);
    }

    // Check for existing response
    let entity = await this.qcRepo.findResponseByCaseId(caseId);

    if (entity) {
      entity.submit(input.responses, input.riskFlags, input.extractedData);
    } else {
      entity = new QCResponse({
        id: generateId(),
        caseId,
        templateId: input.templateId,
        userId: actor.userId,
        responses: input.responses,
        extractedData: input.extractedData ?? null,
        riskFlags: input.riskFlags ?? [],
        completionStatus: 'COMPLETED',
        submittedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    const saved = await this.qcRepo.saveResponse(entity);
    return toQCResponseDTO(saved);
  }
}
