import type { MilestoneEventType } from '../enums/index.js';

export interface JourneyMilestoneProps {
  id: string;
  caseId: string;
  eventType: MilestoneEventType;
  eventDate: Date;
  note: string | null;
  isVisibleToPatient: boolean;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class JourneyMilestone {
  readonly id: string;
  readonly caseId: string;
  eventType: MilestoneEventType;
  eventDate: Date;
  note: string | null;
  isVisibleToPatient: boolean;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;

  constructor(props: JourneyMilestoneProps) {
    this.id = props.id;
    this.caseId = props.caseId;
    this.eventType = props.eventType;
    this.eventDate = props.eventDate;
    this.note = props.note;
    this.isVisibleToPatient = props.isVisibleToPatient;
    this.createdBy = props.createdBy;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  update(data: Partial<Pick<JourneyMilestoneProps, 'eventType' | 'eventDate' | 'note' | 'isVisibleToPatient'>>): void {
    if (data.eventType !== undefined) this.eventType = data.eventType;
    if (data.eventDate !== undefined) this.eventDate = data.eventDate;
    if (data.note !== undefined) this.note = data.note;
    if (data.isVisibleToPatient !== undefined) this.isVisibleToPatient = data.isVisibleToPatient;
    this.updatedAt = new Date();
  }
}
