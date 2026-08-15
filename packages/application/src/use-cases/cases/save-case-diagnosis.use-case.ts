import type { ICaseProgressRepository, ICaseRepository, ICHCRepository } from '@medical-crm/domain';
import { CaseProgress } from '@medical-crm/domain';
import { generateId, NotFoundError } from '@medical-crm/utils';
import type { CaseProgressDTO } from '../../dtos/progress.dto.js';
import { toProgressDTO } from '../../mappers/progress.mapper.js';
import type { Actor } from '../../types/actor.js';
import { assertHospitalCaseAccess } from './hospital-case-access.js';
import type { AdminPatientSiteAccessPolicy } from '../../access/admin-patient-site-access.js';

export interface SaveCaseDiagnosisInput {
  title: string;
  diagnosisType?: string;
  icdCode?: string;
  severity?: string;
  description?: string;
  treatmentRecommendation?: string;
  suggestedTests?: string;
  costEstimate?: string;
  treatmentDuration?: string;
}

function trimToNull(value?: string): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export class SaveCaseDiagnosisUseCase {
  constructor(
    private readonly caseRepo: ICaseRepository,
    private readonly progressRepo: ICaseProgressRepository,
    private readonly chcRepo?: ICHCRepository,
    private readonly adminAccess?: AdminPatientSiteAccessPolicy,
  ) {}

  async execute(caseId: string, input: SaveCaseDiagnosisInput, actor: Actor): Promise<CaseProgressDTO> {
    const caze = await this.caseRepo.findById(caseId);
    if (!caze) {
      throw new NotFoundError(`Case ${caseId} not found`);
    }
    if (actor.role === 'HOSPITAL') {
      await this.adminAccess?.assertStaffCaseNotExcludedByPatientEmail(actor, caze);
      await assertHospitalCaseAccess(caze, actor.hospitalId, this.chcRepo);
    } else {
      await this.adminAccess?.assertActorCanAccessCaseEntity(actor, caze);
    }

    const previousDiagnosis = caze.primaryDiagnosis;
    const previousDiagnosisCode = caze.diagnosisCode;

    caze.primaryDiagnosis = input.title.trim();
    caze.diagnosisCode = trimToNull(input.icdCode);
    caze.updatedAt = new Date();

    await this.caseRepo.save(caze);

    try {
      const progress = new CaseProgress({
        id: generateId(),
        caseId,
        title: input.title.trim(),
        description: trimToNull(input.description),
        progressType: 'STATUS_CHANGE',
        metadata: {
          kind: 'diagnosis',
          type: trimToNull(input.diagnosisType),
          icdCode: trimToNull(input.icdCode),
          severity: trimToNull(input.severity),
          treatmentRecommendation: trimToNull(input.treatmentRecommendation),
          suggestedTests: trimToNull(input.suggestedTests),
          costEstimate: trimToNull(input.costEstimate),
          treatmentDuration: trimToNull(input.treatmentDuration),
        },
        recordedAt: new Date(),
        recordedById: actor.userId,
      });

      const saved = await this.progressRepo.save(progress);
      return toProgressDTO(saved);
    } catch (error) {
      caze.primaryDiagnosis = previousDiagnosis;
      caze.diagnosisCode = previousDiagnosisCode;
      caze.updatedAt = new Date();
      await this.caseRepo.save(caze);
      throw error;
    }
  }
}
