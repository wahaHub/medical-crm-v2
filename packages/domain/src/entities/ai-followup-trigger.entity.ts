export interface AiFollowupTriggerProps {
  id: string;
  sessionId: string;
  patientId: string | null;
  triggerType: string;
  status?: string;
  dueAt: Date;
  channel?: string;
  reason: string;
  payload?: Record<string, unknown>;
  createdAt: Date;
  resolvedAt?: Date | null;
}

export class AiFollowupTrigger {
  readonly id: string;
  sessionId: string;
  patientId: string | null;
  triggerType: string;
  status: string;
  dueAt: Date;
  channel: string;
  reason: string;
  payload: Record<string, unknown>;
  createdAt: Date;
  resolvedAt: Date | null;

  constructor(props: AiFollowupTriggerProps) {
    this.id = props.id;
    this.sessionId = props.sessionId;
    this.patientId = props.patientId;
    this.triggerType = props.triggerType;
    this.status = props.status ?? 'pending';
    this.dueAt = props.dueAt;
    this.channel = props.channel ?? 'crm_queue';
    this.reason = props.reason;
    this.payload = props.payload ?? {};
    this.createdAt = props.createdAt;
    this.resolvedAt = props.resolvedAt ?? null;
  }
}
