import type { ICaseRepository, IHospitalRepository, ICaseProgressRepository } from '@medical-crm/domain';
import { CaseAssignmentService, CaseProgress } from '@medical-crm/domain';
import { generateId, NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { CaseDTO } from '../../dtos/case.dto.js';
import type { Actor } from '../../types/actor.js';
import { toCaseDTO } from '../../mappers/case.mapper.js';
import type { AdminPatientSiteAccessPolicy } from '../../access/admin-patient-site-access.js';

export class AssignCaseUseCase {
  constructor(
    private readonly caseRepo: ICaseRepository,
    private readonly hospitalRepo: IHospitalRepository,
    private readonly assignmentService: CaseAssignmentService,
    private readonly progressRepo: ICaseProgressRepository,
    private readonly adminAccess?: AdminPatientSiteAccessPolicy,
  ) {}

  async execute(caseId: string, hospitalId: string, actor: Actor): Promise<CaseDTO> {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Only admins can assign cases');
    }

    const entity = await this.caseRepo.findById(caseId);
    if (!entity) throw new NotFoundError(`Case ${caseId} not found`);
    await this.adminAccess?.assertActorCanAccessCaseEntity(actor, entity);

    const hospital = await this.hospitalRepo.findById(hospitalId);
    if (!hospital) throw new NotFoundError(`Hospital ${hospitalId} not found`);

    this.assignmentService.validateAssignment(entity, hospitalId, hospital.status);
    entity.assign(hospitalId);

    const saved = await this.caseRepo.save(entity);

    await this.progressRepo.save(new CaseProgress({
      id: generateId(),
      caseId,
      title: `Case assigned to ${hospital.name}`,
      description: null,
      progressType: 'STATUS_CHANGE',
      metadata: { hospitalId, hospitalName: hospital.name },
      recordedAt: new Date(),
      recordedById: actor.userId,
    }));

    return toCaseDTO(saved);
  }
}
