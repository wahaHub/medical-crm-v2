import type { ICaseRepository, ICaseProgressRepository, CaseStage } from '@medical-crm/domain';
import { CaseProgress } from '@medical-crm/domain';
import { generateId, NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { CaseDTO } from '../../dtos/case.dto.js';
import type { Actor } from '../../types/actor.js';
import { toCaseDTO } from '../../mappers/case.mapper.js';

export class AdvanceCaseStageUseCase {
  constructor(
    private readonly caseRepo: ICaseRepository,
    private readonly progressRepo: ICaseProgressRepository,
  ) {}

  async execute(caseId: string, stage: CaseStage, actor: Actor): Promise<CaseDTO> {
    const entity = await this.caseRepo.findById(caseId);
    if (!entity) throw new NotFoundError(`Case ${caseId} not found`);
    if (actor.role === 'HOSPITAL' && entity.assignedHospitalId !== actor.hospitalId) {
      throw new ForbiddenError('Access denied to this case');
    }

    const oldStage = entity.stage;
    entity.advanceStage(stage);
    const saved = await this.caseRepo.save(entity);

    await this.progressRepo.save(new CaseProgress({
      id: generateId(),
      caseId,
      title: `Stage advanced from ${oldStage} to ${stage}`,
      description: null,
      progressType: 'STATUS_CHANGE',
      metadata: { from: oldStage, to: stage },
      recordedAt: new Date(),
      recordedById: actor.userId,
    }));

    return toCaseDTO(saved);
  }
}
