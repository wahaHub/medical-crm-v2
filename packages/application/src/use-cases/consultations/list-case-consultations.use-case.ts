import type { IConsultationRepository, ICaseRepository, ICHCRepository } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import type { ConsultationDTO } from '../../dtos/consultation.dto.js';
import { toConsultationDTO } from '../../mappers/consultation.mapper.js';
import { assertHospitalCaseAccess } from '../cases/hospital-case-access.js';
import type { AdminPatientSiteAccessPolicy } from '../../access/admin-patient-site-access.js';

export class ListCaseConsultationsUseCase {
  constructor(
    private readonly consultationRepo: IConsultationRepository,
    private readonly caseRepo: ICaseRepository,
    private readonly chcRepo?: ICHCRepository,
    private readonly adminAccess?: AdminPatientSiteAccessPolicy,
  ) {}

  async execute(caseId: string, actor: Actor): Promise<ConsultationDTO[]> {
    if (actor.role !== 'ADMIN' && actor.role !== 'HOSPITAL') {
      throw new ForbiddenError('Only admin and hospital users can list case consultations');
    }

    const caseEntity = await this.caseRepo.findById(caseId);
    if (!caseEntity) {
      throw new NotFoundError(`Case ${caseId} not found`);
    }
    await this.adminAccess?.assertStaffCaseNotExcludedByPatientEmail(actor, caseEntity);

    // Hospital users can only see consultations for cases assigned to their hospital
    if (actor.role === 'HOSPITAL') {
      await assertHospitalCaseAccess(caseEntity, actor.hospitalId, this.chcRepo, 'Case is not assigned to your hospital');
    }
    if (actor.role === 'ADMIN') {
      await this.adminAccess?.assertActorCanAccessCase(actor, caseId);
    }

    const consultations = await this.consultationRepo.findByCaseId(caseId);
    const visibleConsultations = actor.role === 'HOSPITAL'
      ? consultations.filter((consultation) => consultation.hospitalId === actor.hospitalId)
      : consultations;

    return visibleConsultations.map(toConsultationDTO);
  }
}
