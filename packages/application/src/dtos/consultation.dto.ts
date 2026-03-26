import type { ConsultationStatus, AISummaryStatus, TranscriptStatus, TranscriptEntry } from '@medical-crm/domain';

export interface ConsultationDTO {
  id: string;
  caseId: string;
  hospitalId: string;
  patientId: string;
  doctorId: string | null;
  status: ConsultationStatus;
  scheduledAt: string;
  startedAt: string | null;
  endedAt: string | null;
  durationMinutes: number;
  actualDuration: number | null;
  consultationLink: string | null;
  aiTranslation: boolean;
  patientLanguage: string;
  notes: string | null;
  videoStorageKey: string | null;
  videoSize: number | null;
  videoDuration: number | null;
  videoThumbnail: string | null;
  videoUploadedAt: string | null;
  aiSummary: unknown | null;
  aiSummaryCreatedAt: string | null;
  aiSummaryStatus: AISummaryStatus;
  translations: Record<string, Record<string, unknown>>;
  createdAt: string;
  updatedAt: string;
}

export interface ConsultationTranscriptDTO {
  id: string;
  consultationId: string;
  originalLang: string;
  translatedLang: string;
  entries: TranscriptEntry[];
  status: TranscriptStatus;
  generatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
