import type { CaseProgress } from '@medical-crm/domain';
import type {
  CaseProgressDTO, DiagnosisDTO, PhoneCallDTO, ConsultationHistoryDTO,
} from '../dtos/progress.dto.js';

export function toProgressDTO(entity: CaseProgress): CaseProgressDTO {
  return {
    id: entity.id,
    title: entity.title,
    description: entity.description,
    progressType: entity.progressType,
    metadata: entity.metadata,
    recordedAt: entity.recordedAt.toISOString(),
    recordedById: entity.recordedById,
  };
}

export function splitProgressByType(progress: CaseProgress[]): {
  diagnoses: DiagnosisDTO[];
  phoneCalls: PhoneCallDTO[];
  consultations: ConsultationHistoryDTO[];
} {
  const diagnoses: DiagnosisDTO[] = [];
  const phoneCalls: PhoneCallDTO[] = [];
  const consultations: ConsultationHistoryDTO[] = [];

  for (const p of progress) {
    const meta = (p.metadata ?? {}) as Record<string, unknown>;
    const kind = meta['kind'] as string | undefined;
    const hasLegacyDiagnosisFields = [
      'type',
      'icdCode',
      'severity',
      'treatmentRecommendation',
      'suggestedTests',
      'costEstimate',
      'treatmentDuration',
      'documentKey',
      'documentId',
    ].some((key) => meta[key] != null);

    if (kind === 'diagnosis' || (p.progressType === 'STATUS_CHANGE' && kind !== 'phone_call' && hasLegacyDiagnosisFields)) {
      diagnoses.push({
        id: p.id,
        title: p.title,
        type: (meta['type'] as string) ?? null,
        icdCode: (meta['icdCode'] as string) ?? null,
        severity: (meta['severity'] as string) ?? null,
        treatmentRecommendation: (meta['treatmentRecommendation'] as string) ?? null,
        suggestedTests: (meta['suggestedTests'] as string) ?? null,
        costEstimate: (meta['costEstimate'] as string) ?? null,
        treatmentDuration: (meta['treatmentDuration'] as string) ?? null,
        condition: p.title,
        notes: p.description,
        documentKey: (meta['documentKey'] as string) ?? null,
        documentId: (meta['documentId'] as string) ?? null,
        documentName: (meta['documentName'] as string) ?? null,
        doctorName: (meta['doctorName'] as string) ?? null,
        recordedAt: p.recordedAt.toISOString(),
      });
    } else if (kind === 'phone_call') {
      phoneCalls.push({
        id: p.id,
        title: p.title,
        callResult: (meta['callResult'] as string) ?? null,
        summary: (meta['summary'] as string) ?? null,
        duration: (meta['duration'] as number) ?? null,
        nextFollowUp: (meta['nextFollowUp'] as string) ?? null,
        recordedAt: p.recordedAt.toISOString(),
      });
    } else if (p.progressType === 'VIDEO_CONSULTATION') {
      consultations.push({
        id: p.id,
        title: p.title,
        description: p.description,
        recordedAt: p.recordedAt.toISOString(),
      });
    }
  }

  return { diagnoses, phoneCalls, consultations };
}
