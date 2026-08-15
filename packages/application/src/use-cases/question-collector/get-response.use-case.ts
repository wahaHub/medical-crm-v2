import type { IQuestionCollectorRepository, ICaseRepository, ICHCRepository } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { QCResponseDTO } from '../../dtos/question-collector.dto.js';
import type { Actor } from '../../types/actor.js';
import { toQCResponseDTO } from '../../mappers/question-collector.mapper.js';
import { assertHospitalCaseAccess } from '../cases/hospital-case-access.js';
import type { AdminPatientSiteAccessPolicy } from '../../access/admin-patient-site-access.js';

export class GetResponseUseCase {
  constructor(
    private readonly qcRepo: IQuestionCollectorRepository,
    private readonly caseRepo: ICaseRepository,
    private readonly chcRepo?: ICHCRepository,
    private readonly adminAccess?: AdminPatientSiteAccessPolicy,
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
      await this.adminAccess?.assertCaseNotExcludedByPatientEmail(caseEntity);
      await assertHospitalCaseAccess(caseEntity, actor.hospitalId, this.chcRepo, 'Hospital can only access responses for assigned cases');
    } else if (actor.role === 'ADMIN') {
      await this.adminAccess?.assertActorCanAccessCase(actor, caseId);
    }

    const entity = await this.qcRepo.findResponseByCaseId(caseId);
    if (!entity) return null;

    return toQCResponseDTO(entity);
  }
}
