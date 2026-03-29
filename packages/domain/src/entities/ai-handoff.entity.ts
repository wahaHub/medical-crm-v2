export interface AiHandoffProps {
  id: string;
  sessionId: string;
  patientId: string | null;
  supportTicketId?: string | null;
  handoffType: string;
  priority: string;
  reasonCode: string;
  brief?: Record<string, unknown>;
  status?: string;
  assignedTo?: string | null;
  createdAt: Date;
  completedAt?: Date | null;
}

export class AiHandoff {
  readonly id: string;
  sessionId: string;
  patientId: string | null;
  supportTicketId: string | null;
  handoffType: string;
  priority: string;
  reasonCode: string;
  brief: Record<string, unknown>;
  status: string;
  assignedTo: string | null;
  createdAt: Date;
  completedAt: Date | null;

  constructor(props: AiHandoffProps) {
    this.id = props.id;
    this.sessionId = props.sessionId;
    this.patientId = props.patientId;
    this.supportTicketId = props.supportTicketId ?? null;
    this.handoffType = props.handoffType;
    this.priority = props.priority;
    this.reasonCode = props.reasonCode;
    this.brief = props.brief ?? {};
    this.status = props.status ?? 'requested';
    this.assignedTo = props.assignedTo ?? null;
    this.createdAt = props.createdAt;
    this.completedAt = props.completedAt ?? null;
  }
}
