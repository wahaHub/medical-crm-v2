import type { CaseEventType, ActorType } from '../enums/index.js';

export interface CaseEventProps {
  id: string;
  caseId: string;
  eventType: CaseEventType;
  actorType: ActorType;
  actorId: string | null;
  eventData: Record<string, unknown> | null;
  isVisibleToPatient: boolean;
  createdAt: Date;
}

export class CaseEvent {
  readonly id: string;
  readonly caseId: string;
  readonly eventType: CaseEventType;
  readonly actorType: ActorType;
  readonly actorId: string | null;
  readonly eventData: Record<string, unknown> | null;
  readonly isVisibleToPatient: boolean;
  readonly createdAt: Date;

  constructor(props: CaseEventProps) {
    this.id = props.id;
    this.caseId = props.caseId;
    this.eventType = props.eventType;
    this.actorType = props.actorType;
    this.actorId = props.actorId;
    this.eventData = props.eventData;
    this.isVisibleToPatient = props.isVisibleToPatient;
    this.createdAt = props.createdAt;
  }
}
