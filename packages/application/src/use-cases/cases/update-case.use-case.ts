import type { ICaseRepository, ICHCRepository } from '@medical-crm/domain';
import { NotFoundError } from '@medical-crm/utils';
import type { CaseDTO } from '../../dtos/case.dto.js';
import type { Actor } from '../../types/actor.js';
import { toCaseDTO } from '../../mappers/case.mapper.js';
import { assertHospitalCaseAccess } from './hospital-case-access.js';
import type { AdminPatientSiteAccessPolicy } from '../../access/admin-patient-site-access.js';

export interface UpdateCaseInput {
  primaryDiagnosis?: string;
  diagnosisCode?: string;
  symptoms?: string[];
  medicalHistory?: string;
  patientCountry?: string;
  patientLanguage?: string;
}

export class UpdateCaseUseCase {
  constructor(
    private readonly caseRepo: ICaseRepository,
    private readonly chcRepo?: ICHCRepository,
    private readonly adminAccess?: AdminPatientSiteAccessPolicy,
  ) {}

  async execute(caseId: string, input: UpdateCaseInput, actor: Actor): Promise<CaseDTO> {
    const entity = await this.caseRepo.findById(caseId);
    if (!entity) throw new NotFoundError(`Case ${caseId} not found`);
    if (actor.role === 'HOSPITAL') {
      await assertHospitalCaseAccess(entity, actor.hospitalId, this.chcRepo);
    } else {
      await this.adminAccess?.assertActorCanAccessCaseEntity(actor, entity);
    }

    if (input.primaryDiagnosis !== undefined) entity.primaryDiagnosis = input.primaryDiagnosis;
    if (input.diagnosisCode !== undefined) entity.diagnosisCode = input.diagnosisCode;
    if (input.symptoms !== undefined) entity.symptoms = input.symptoms;
    if (input.medicalHistory !== undefined) entity.medicalHistory = input.medicalHistory;
    if (input.patientCountry !== undefined) entity.patientCountry = input.patientCountry;
    if (input.patientLanguage !== undefined) entity.patientLanguage = input.patientLanguage;
    entity.updatedAt = new Date();

    const saved = await this.caseRepo.save(entity);
    return toCaseDTO(saved);
  }
}
