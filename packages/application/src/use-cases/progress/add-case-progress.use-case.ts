import type { ICaseProgressRepository, ICaseRepository } from '@medical-crm/domain';
import { CaseProgress } from '@medical-crm/domain';
import { generateId, NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import type { CaseProgressDTO } from '../../dtos/progress.dto.js';
import { toProgressDTO } from '../../mappers/progress.mapper.js';

export type AddProgressInput =
  | { type: 'DIAGNOSIS'; caseId: string; icdCode?: string; severity?: string;
      treatmentRecommendation?: string; suggestedTests?: string;
      costEstimate?: string; treatmentDuration?: string; }
  | { type: 'PHONE_CALL'; caseId: string; callResult?: string;
      summary?: string; duration?: number; nextFollowUp?: string; }
  | { type: 'STATUS_CHANGE'; caseId: string; reason?: string; }
  | { type: 'DOCUMENT_UPLOAD'; caseId: string; documentId: string; };

export class AddCaseProgressUseCase {
  constructor(
    private readonly progressRepo: ICaseProgressRepository,
    private readonly caseRepo: ICaseRepository,
  ) {}

  async execute(input: AddProgressInput, actor: Actor): Promise<CaseProgressDTO> {
    const caze = await this.caseRepo.findById(input.caseId);
    if (!caze) throw new NotFoundError(`Case ${input.caseId} not found`);
    if (actor.role === 'HOSPITAL' && caze.assignedHospitalId !== actor.hospitalId) {
      throw new ForbiddenError('Access denied to this case');
    }

    const { progressType, title, metadata } = this.mapInput(input);
    const progress = new CaseProgress({
      id: generateId(),
      caseId: input.caseId,
      title,
      description: null,
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
          title: 'Diagnosis recorded',
          metadata: {
            kind: 'diagnosis', icdCode: input.icdCode, severity: input.severity,
            treatmentRecommendation: input.treatmentRecommendation,
            suggestedTests: input.suggestedTests, costEstimate: input.costEstimate,
            treatmentDuration: input.treatmentDuration,
          },
        };
      case 'PHONE_CALL':
        return {
          progressType: 'APPOINTMENT' as const,
          title: 'Phone follow-up',
          metadata: {
            kind: 'phone_call', callResult: input.callResult, summary: input.summary,
            duration: input.duration, nextFollowUp: input.nextFollowUp,
          },
        };
      case 'STATUS_CHANGE':
        return {
          progressType: 'STATUS_CHANGE' as const,
          title: 'Status changed',
          metadata: { kind: 'status_change', reason: input.reason },
        };
      case 'DOCUMENT_UPLOAD':
        return {
          progressType: 'DOCUMENT_UPLOAD' as const,
          title: 'Document uploaded',
          metadata: { documentId: input.documentId },
        };
    }
  }
}
