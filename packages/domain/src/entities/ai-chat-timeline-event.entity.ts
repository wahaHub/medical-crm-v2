export interface AiChatTimelineEventProps {
  id: string;
  sessionId: string;
  patientId: string | null;
  eventType: string;
  summary: string;
  payload?: Record<string, unknown>;
  actor: string;
  confidence?: string | null;
  createdAt: Date;
}

export class AiChatTimelineEvent {
  readonly id: string;
  sessionId: string;
  patientId: string | null;
  eventType: string;
  summary: string;
  payload: Record<string, unknown>;
  actor: string;
  confidence: string | null;
  createdAt: Date;

  constructor(props: AiChatTimelineEventProps) {
    this.id = props.id;
    this.sessionId = props.sessionId;
    this.patientId = props.patientId;
    this.eventType = props.eventType;
    this.summary = props.summary;
    this.payload = props.payload ?? {};
    this.actor = props.actor;
    this.confidence = props.confidence ?? null;
    this.createdAt = props.createdAt;
  }
}
