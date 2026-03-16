import type { IQuestionCollectorRepository, ICaseRepository } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { QCResponseDTO } from '../../dtos/question-collector.dto.js';
import type { Actor } from '../../types/actor.js';
import { toQCResponseDTO } from '../../mappers/question-collector.mapper.js';

export class GetResponseUseCase {
  constructor(
    private readonly qcRepo: IQuestionCollectorRepository,
    private readonly caseRepo: ICaseRepository,
  ) {}

  async execute(caseId: string, actor: Actor): Promise<QCResponseDTO | null> {
    // Verify case exists
    const caseEntity = await this.caseRepo.findById(caseId);
    if (!caseEntity) {
      throw new NotFoundError(`Case ${caseId} not found`);
    }

    // AuthZ
    if (actor.role === 'PATIENT') {
      if (caseEntity.patientId !== actor.userId) {
        throw new ForbiddenError('Patient can only access their own case responses');
      }
    } else if (actor.role === 'HOSPITAL') {
      if (caseEntity.assignedHospitalId !== actor.hospitalId) {
        throw new ForbiddenError('Hospital can only access responses for assigned cases');
      }
    }
    // ADMIN can access all

    const entity = await this.qcRepo.findResponseByCaseId(caseId);
    if (!entity) return null;

    return toQCResponseDTO(entity);
  }
}
