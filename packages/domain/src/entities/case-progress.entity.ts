import type { ProgressType } from '../enums/index.js';

export interface CaseProgressProps {
  id: string;
  caseId: string;
  title: string;
  description: string | null;
  progressType: ProgressType;
  metadata: Record<string, unknown> | null;
  recordedAt: Date;
  recordedById: string | null;
}

export class CaseProgress {
  readonly id: string;
  caseId: string;
  title: string;
  description: string | null;
  progressType: ProgressType;
  metadata: Record<string, unknown> | null;
  recordedAt: Date;
  recordedById: string | null;

  constructor(props: CaseProgressProps) {
    this.id = props.id;
    this.caseId = props.caseId;
    this.title = props.title;
    this.description = props.description;
    this.progressType = props.progressType;
    this.metadata = props.metadata;
    this.recordedAt = props.recordedAt;
    this.recordedById = props.recordedById;
  }
}
