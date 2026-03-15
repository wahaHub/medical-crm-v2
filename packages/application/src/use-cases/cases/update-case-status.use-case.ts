import type { ICaseRepository, ICaseProgressRepository, CaseStatus } from '@medical-crm/domain';
import { CaseProgress } from '@medical-crm/domain';
import { generateId, NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { CaseDTO } from '../../dtos/case.dto.js';
import type { Actor } from '../../types/actor.js';
import { toCaseDTO } from '../../mappers/case.mapper.js';

export class UpdateCaseStatusUseCase {
  constructor(
    private readonly caseRepo: ICaseRepository,
    private readonly progressRepo: ICaseProgressRepository,
  ) {}

  async execute(caseId: string, status: CaseStatus, actor: Actor): Promise<CaseDTO> {
    const entity = await this.caseRepo.findById(caseId);
    if (!entity) throw new NotFoundError(`Case ${caseId} not found`);
    if (actor.role === 'HOSPITAL' && entity.assignedHospitalId !== actor.hospitalId) {
      throw new ForbiddenError('Access denied to this case');
    }

    const oldStatus = entity.status;
    entity.transitionStatus(status);
    const saved = await this.caseRepo.save(entity);

    await this.progressRepo.save(new CaseProgress({
      id: generateId(),
      caseId,
      title: `Status changed from ${oldStatus} to ${status}`,
      description: null,
      progressType: 'STATUS_CHANGE',
      metadata: { from: oldStatus, to: status },
      recordedAt: new Date(),
      recordedById: actor.userId,
    }));

    return toCaseDTO(saved);
  }
}
