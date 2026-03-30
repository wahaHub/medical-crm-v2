import type {
  AiChatIntent,
  AiChatNextAction,
  AiChatRiskLevel,
  AiChatRole,
} from '../enums/index.js';

export interface AiChatCitation {
  sourceTitle?: string;
  snippet?: string;
  sourceType?: string;
  documentId?: string;
  [key: string]: unknown;
}

export interface AiChatMessageProps {
  id: string;
  sessionId: string;
  role: AiChatRole;
  content: string;
  intent: AiChatIntent | null;
  resolvedIntent?: string | null;
  riskLevel: AiChatRiskLevel | null;
  canAnswer: boolean | null;
  nextAction: AiChatNextAction | null;
  secondaryAction?: string | null;
  responseMode?: string | null;
  citations: AiChatCitation[];
  reasonCodes?: string[];
  shortlist?: Array<Record<string, unknown>>;
  writebackStatus?: string;
  toolTrace?: Array<Record<string, unknown>>;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export class AiChatMessage {
  readonly id: string;
  sessionId: string;
  role: AiChatRole;
  content: string;
  intent: AiChatIntent | null;
  resolvedIntent: string | null;
  riskLevel: AiChatRiskLevel | null;
  canAnswer: boolean | null;
  nextAction: AiChatNextAction | null;
  secondaryAction: string | null;
  responseMode: string | null;
  citations: AiChatCitation[];
  reasonCodes: string[];
  shortlist: Array<Record<string, unknown>>;
  writebackStatus: string;
  toolTrace: Array<Record<string, unknown>>;
  metadata: Record<string, unknown>;
  createdAt: Date;

  constructor(props: AiChatMessageProps) {
    this.id = props.id;
    this.sessionId = props.sessionId;
    this.role = props.role;
    this.content = props.content;
    this.intent = props.intent;
    this.resolvedIntent = props.resolvedIntent ?? null;
    this.riskLevel = props.riskLevel;
    this.canAnswer = props.canAnswer;
    this.nextAction = props.nextAction;
    this.secondaryAction = props.secondaryAction ?? null;
    this.responseMode = props.responseMode ?? null;
    this.citations = props.citations;
    this.reasonCodes = props.reasonCodes ?? [];
    this.shortlist = props.shortlist ?? [];
    this.writebackStatus = props.writebackStatus ?? 'pending';
    this.toolTrace = props.toolTrace ?? [];
    this.metadata = props.metadata;
    this.createdAt = props.createdAt;
  }
}
