import type { TranscriptStatus } from '../enums/index.js';

export type TranscriptEntry = {
  timestamp: number;
  speaker: string;
  text: string;
  translatedText?: string;
};

export interface ConsultationTranscriptProps {
  id: string;
  consultationId: string;
  originalLang: string;
  translatedLang: string;
  entries: TranscriptEntry[];
  status: TranscriptStatus;
  generatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class ConsultationTranscript {
  readonly id: string;
  consultationId: string;
  originalLang: string;
  translatedLang: string;
  entries: TranscriptEntry[];
  status: TranscriptStatus;
  generatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;

  constructor(props: ConsultationTranscriptProps) {
    this.id = props.id;
    this.consultationId = props.consultationId;
    this.originalLang = props.originalLang;
    this.translatedLang = props.translatedLang;
    this.entries = props.entries;
    this.status = props.status;
    this.generatedAt = props.generatedAt;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
