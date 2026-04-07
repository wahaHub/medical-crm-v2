import type { IQuestionCollectorRepository, ICaseRepository } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { QCTemplateDTO, QCCustomizationDTO } from '../../dtos/question-collector.dto.js';
import type { Actor } from '../../types/actor.js';
import { toQCTemplateDTO, toQCCustomizationDTO } from '../../mappers/question-collector.mapper.js';

export interface GetTemplateResult {
  template: QCTemplateDTO;
  customization?: QCCustomizationDTO;
}

export class GetTemplateUseCase {
  constructor(
    private readonly qcRepo: IQuestionCollectorRepository,
    private readonly caseRepo: ICaseRepository,
  ) {}

  async execute(id: string, actor: Actor, caseId?: string): Promise<GetTemplateResult> {
    const entity = await this.qcRepo.findTemplateById(id);
    if (!entity) {
      throw new NotFoundError(`Template ${id} not found`);
    }

    const result: GetTemplateResult = { template: toQCTemplateDTO(entity) };

    // For PATIENT role with a caseId, resolve customization if case is ASSIGNED
    if (actor.role === 'PATIENT' && caseId) {
      const caseEntity = await this.caseRepo.findById(caseId);
      if (!caseEntity) {
        throw new NotFoundError(`Case ${caseId} not found`);
      }
      if (caseEntity.patientId !== actor.userId) {
        throw new ForbiddenError('Access denied to this case');
      }
      if (caseEntity.assignmentStatus === 'ASSIGNED' && caseEntity.assignedHospitalId) {
        const customization = await this.qcRepo.findCustomization(id, caseEntity.assignedHospitalId);
        if (customization) {
          result.customization = toQCCustomizationDTO(customization);
        }
      }
    }

    return result;
  }
}
