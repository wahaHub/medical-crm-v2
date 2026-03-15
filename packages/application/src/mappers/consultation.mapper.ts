import type { Consultation, ConsultationTranscript } from '@medical-crm/domain';
import type { ConsultationDTO, ConsultationTranscriptDTO } from '../dtos/consultation.dto.js';

export function toConsultationDTO(entity: Consultation): ConsultationDTO {
  return {
    id: entity.id,
    caseId: entity.caseId,
    hospitalId: entity.hospitalId,
    patientId: entity.patientId,
    doctorId: entity.doctorId,
    status: entity.status,
    scheduledAt: entity.scheduledAt.toISOString(),
    startedAt: entity.startedAt ? entity.startedAt.toISOString() : null,
    endedAt: entity.endedAt ? entity.endedAt.toISOString() : null,
    durationMinutes: entity.durationMinutes,
    actualDuration: entity.actualDuration,
    consultationLink: entity.consultationLink,
    aiTranslation: entity.aiTranslation,
    patientLanguage: entity.patientLanguage,
    notes: entity.notes,
    videoStorageKey: entity.videoStorageKey,
    videoSize: entity.videoSize,
    videoDuration: entity.videoDuration,
    videoThumbnail: entity.videoThumbnail,
    videoUploadedAt: entity.videoUploadedAt ? entity.videoUploadedAt.toISOString() : null,
    aiSummary: entity.aiSummary,
    aiSummaryCreatedAt: entity.aiSummaryCreatedAt ? entity.aiSummaryCreatedAt.toISOString() : null,
    aiSummaryStatus: entity.aiSummaryStatus,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}

export function toConsultationTranscriptDTO(entity: ConsultationTranscript): ConsultationTranscriptDTO {
  return {
    id: entity.id,
    consultationId: entity.consultationId,
    originalLang: entity.originalLang,
    translatedLang: entity.translatedLang,
    entries: entity.entries,
    status: entity.status,
    generatedAt: entity.generatedAt ? entity.generatedAt.toISOString() : null,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}
