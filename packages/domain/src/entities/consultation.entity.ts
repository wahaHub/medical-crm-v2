import type { ConsultationStatus, AISummaryStatus } from '../enums/index.js';
import { ValidationError } from '@medical-crm/utils';
import { CONSULTATION_STATUS_TRANSITIONS } from '../state-machine/consultation-status-transitions.js';

export interface ConsultationProps {
  id: string;
  caseId: string;
  hospitalId: string;
  patientId: string;
  doctorId: string | null;
  status: ConsultationStatus;
  scheduledAt: Date;
  startedAt: Date | null;
  endedAt: Date | null;
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
  videoUploadedAt: Date | null;
  aiSummary: unknown | null;
  aiSummaryCreatedAt: Date | null;
  aiSummaryStatus: AISummaryStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface VideoInfo {
  videoStorageKey: string;
  videoSize: number;
  videoDuration: number;
  videoThumbnail: string;
  videoUploadedAt: Date;
}

export class Consultation {
  readonly id: string;
  caseId: string;
  hospitalId: string;
  patientId: string;
  doctorId: string | null;
  status: ConsultationStatus;
  scheduledAt: Date;
  startedAt: Date | null;
  endedAt: Date | null;
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
  videoUploadedAt: Date | null;
  aiSummary: unknown | null;
  aiSummaryCreatedAt: Date | null;
  aiSummaryStatus: AISummaryStatus;
  createdAt: Date;
  updatedAt: Date;

  constructor(props: ConsultationProps) {
    this.id = props.id;
    this.caseId = props.caseId;
    this.hospitalId = props.hospitalId;
    this.patientId = props.patientId;
    this.doctorId = props.doctorId;
    this.status = props.status;
    this.scheduledAt = props.scheduledAt;
    this.startedAt = props.startedAt;
    this.endedAt = props.endedAt;
    this.durationMinutes = props.durationMinutes;
    this.actualDuration = props.actualDuration;
    this.consultationLink = props.consultationLink;
    this.aiTranslation = props.aiTranslation;
    this.patientLanguage = props.patientLanguage;
    this.notes = props.notes;
    this.videoStorageKey = props.videoStorageKey;
    this.videoSize = props.videoSize;
    this.videoDuration = props.videoDuration;
    this.videoThumbnail = props.videoThumbnail;
    this.videoUploadedAt = props.videoUploadedAt;
    this.aiSummary = props.aiSummary;
    this.aiSummaryCreatedAt = props.aiSummaryCreatedAt;
    this.aiSummaryStatus = props.aiSummaryStatus;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  start(): void {
    if (!CONSULTATION_STATUS_TRANSITIONS[this.status].includes('IN_PROGRESS')) {
      throw new ValidationError(
        `Cannot start consultation from status ${this.status}`,
      );
    }
    this.status = 'IN_PROGRESS';
    this.startedAt = new Date();
    this.updatedAt = new Date();
  }

  complete(): void {
    if (!CONSULTATION_STATUS_TRANSITIONS[this.status].includes('COMPLETED')) {
      throw new ValidationError(
        `Cannot complete consultation from status ${this.status}`,
      );
    }
    const now = new Date();
    this.status = 'COMPLETED';
    this.endedAt = now;
    if (this.startedAt !== null) {
      this.actualDuration = Math.round((now.getTime() - this.startedAt.getTime()) / 60000);
    }
    this.updatedAt = now;
  }

  cancel(): void {
    if (!CONSULTATION_STATUS_TRANSITIONS[this.status].includes('CANCELLED')) {
      throw new ValidationError(
        `Cannot cancel consultation from status ${this.status}`,
      );
    }
    this.status = 'CANCELLED';
    this.updatedAt = new Date();
  }

  noShow(): void {
    if (!CONSULTATION_STATUS_TRANSITIONS[this.status].includes('NO_SHOW')) {
      throw new ValidationError(
        `Cannot mark consultation as no-show from status ${this.status}`,
      );
    }
    this.status = 'NO_SHOW';
    this.updatedAt = new Date();
  }

  setVideoInfo(info: VideoInfo): void {
    this.videoStorageKey = info.videoStorageKey;
    this.videoSize = info.videoSize;
    this.videoDuration = info.videoDuration;
    this.videoThumbnail = info.videoThumbnail;
    this.videoUploadedAt = info.videoUploadedAt;
    this.updatedAt = new Date();
  }

  setAiSummary(summary: unknown): void {
    this.aiSummary = summary;
    this.aiSummaryCreatedAt = new Date();
    this.aiSummaryStatus = 'COMPLETED';
    this.updatedAt = new Date();
  }
}
