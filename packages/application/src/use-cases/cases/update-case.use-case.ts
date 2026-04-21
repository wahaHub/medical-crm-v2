import type { ICaseRepository } from '@medical-crm/domain';
import { NotFoundError } from '@medical-crm/utils';
import type { CaseDTO } from '../../dtos/case.dto.js';
import type { Actor } from '../../types/actor.js';
import { toCaseDTO } from '../../mappers/case.mapper.js';
import { assertAssignedHospitalCaseAccess } from './hospital-case-access.js';

export interface UpdateCaseInput {
  primaryDiagnosis?: string;
  diagnosisCode?: string;
  symptoms?: string[];
  medicalHistory?: string;
  patientCountry?: string;
  patientLanguage?: string;
}

export class UpdateCaseUseCase {
  constructor(private readonly caseRepo: ICaseRepository) {}

  async execute(caseId: string, input: UpdateCaseInput, actor: Actor): Promise<CaseDTO> {
    const entity = await this.caseRepo.findById(caseId);
    if (!entity) throw new NotFoundError(`Case ${caseId} not found`);
    if (actor.role === 'HOSPITAL') {
      assertAssignedHospitalCaseAccess(entity, actor.hospitalId);
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
