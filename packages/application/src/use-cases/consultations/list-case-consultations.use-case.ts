import type { IConsultationRepository, ICaseRepository, ICHCRepository } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import type { ConsultationDTO } from '../../dtos/consultation.dto.js';
import { toConsultationDTO } from '../../mappers/consultation.mapper.js';
import { assertHospitalCaseAccess } from '../cases/hospital-case-access.js';

export class ListCaseConsultationsUseCase {
  constructor(
    private readonly consultationRepo: IConsultationRepository,
    private readonly caseRepo: ICaseRepository,
    private readonly chcRepo?: ICHCRepository,
  ) {}

  async execute(caseId: string, actor: Actor): Promise<ConsultationDTO[]> {
    if (actor.role !== 'ADMIN' && actor.role !== 'HOSPITAL') {
      throw new ForbiddenError('Only admin and hospital users can list case consultations');
    }

    const caseEntity = await this.caseRepo.findById(caseId);
    if (!caseEntity) {
      throw new NotFoundError(`Case ${caseId} not found`);
    }

    // Hospital users can only see consultations for cases assigned to their hospital
    if (actor.role === 'HOSPITAL') {
      await assertHospitalCaseAccess(caseEntity, actor.hospitalId, this.chcRepo, 'Case is not assigned to your hospital');
    }

    const consultations = await this.consultationRepo.findByCaseId(caseId);
    const visibleConsultations = actor.role === 'HOSPITAL'
      ? consultations.filter((consultation) => consultation.hospitalId === actor.hospitalId)
      : consultations;

    return visibleConsultations.map(toConsultationDTO);
  }
}
