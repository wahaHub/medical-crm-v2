import type { ConsultationTranscript } from '../entities/consultation-transcript.entity.js';

export interface IConsultationTranscriptRepository {
  findByConsultationId(consultationId: string): Promise<ConsultationTranscript | null>;
  save(transcript: ConsultationTranscript): Promise<ConsultationTranscript>;
}
