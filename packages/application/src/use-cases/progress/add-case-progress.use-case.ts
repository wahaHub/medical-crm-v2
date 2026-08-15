import type { ICaseProgressRepository, ICaseRepository, ICHCRepository } from '@medical-crm/domain';
import { CaseProgress } from '@medical-crm/domain';
import { generateId, NotFoundError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import type { CaseProgressDTO } from '../../dtos/progress.dto.js';
import { toProgressDTO } from '../../mappers/progress.mapper.js';
import { assertHospitalCaseAccess } from '../cases/hospital-case-access.js';
import type { AdminPatientSiteAccessPolicy } from '../../access/admin-patient-site-access.js';

export type AddProgressInput =
  | { type: 'DIAGNOSIS'; caseId: string; title?: string; description?: string;
      diagnosisType?: string; icdCode?: string; severity?: string;
      treatmentRecommendation?: string; suggestedTests?: string;
      costEstimate?: string; treatmentDuration?: string; }
  | { type: 'PHONE_CALL'; caseId: string; callResult?: string;
      summary?: string; duration?: number; nextFollowUp?: string; }
  | { type: 'STATUS_CHANGE'; caseId: string; reason?: string; }
  | { type: 'NOTE'; caseId: string; note?: string; attachmentNames?: string[]; documentIds?: string[]; }
  | { type: 'DOCUMENT_UPLOAD'; caseId: string; documentId: string; };

export class AddCaseProgressUseCase {
  constructor(
    private readonly progressRepo: ICaseProgressRepository,
    private readonly caseRepo: ICaseRepository,
    private readonly chcRepo?: ICHCRepository,
    private readonly adminAccess?: AdminPatientSiteAccessPolicy,
  ) {}

  async execute(input: AddProgressInput, actor: Actor): Promise<CaseProgressDTO> {
    const caze = await this.caseRepo.findById(input.caseId);
    if (!caze) throw new NotFoundError(`Case ${input.caseId} not found`);
    await this.adminAccess?.assertStaffCaseNotExcludedByPatientEmail(actor, caze);
    if (actor.role === 'HOSPITAL') {
      await assertHospitalCaseAccess(caze, actor.hospitalId, this.chcRepo);
    } else {
      await this.adminAccess?.assertActorCanAccessCaseEntity(actor, caze);
    }

    const { progressType, title, description, metadata } = this.mapInput(input);
    const progress = new CaseProgress({
      id: generateId(),
      caseId: input.caseId,
      title,
      description,
      progressType,
      metadata,
      recordedAt: new Date(),
      recordedById: actor.userId,
    });

    const saved = await this.progressRepo.save(progress);
    return toProgressDTO(saved);
  }

  private mapInput(input: AddProgressInput) {
    switch (input.type) {
      case 'DIAGNOSIS':
        return {
          progressType: 'STATUS_CHANGE' as const,
          title: input.title?.trim() || 'Diagnosis recorded',
          description: input.description?.trim() || null,
          metadata: {
            kind: 'diagnosis', type: input.diagnosisType,
            icdCode: input.icdCode, severity: input.severity,
            treatmentRecommendation: input.treatmentRecommendation,
            suggestedTests: input.suggestedTests, costEstimate: input.costEstimate,
            treatmentDuration: input.treatmentDuration,
          },
        };
      case 'PHONE_CALL':
        return {
          progressType: 'APPOINTMENT' as const,
          title: 'Phone follow-up',
          description: null,
          metadata: {
            kind: 'phone_call', callResult: input.callResult, summary: input.summary,
            duration: input.duration, nextFollowUp: input.nextFollowUp,
          },
        };
      case 'STATUS_CHANGE':
        return {
          progressType: 'STATUS_CHANGE' as const,
          title: 'Status changed',
          description: null,
          metadata: { kind: 'status_change', reason: input.reason },
        };
      case 'NOTE':
        return {
          progressType: 'MESSAGE' as const,
          title: (input.attachmentNames?.length ?? 0) > 0 ? 'Admin note with attachment' : 'Admin note',
          description: input.note?.trim() || null,
          metadata: {
            kind: 'admin_note',
            attachmentNames: input.attachmentNames ?? [],
            documentIds: input.documentIds ?? [],
          },
        };
      case 'DOCUMENT_UPLOAD':
        return {
          progressType: 'DOCUMENT_UPLOAD' as const,
          title: 'Document uploaded',
          description: null,
          metadata: { documentId: input.documentId },
        };
    }
  }
}
