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
  riskLevel: AiChatRiskLevel | null;
  canAnswer: boolean | null;
  nextAction: AiChatNextAction | null;
  citations: AiChatCitation[];
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export class AiChatMessage {
  readonly id: string;
  sessionId: string;
  role: AiChatRole;
  content: string;
  intent: AiChatIntent | null;
  riskLevel: AiChatRiskLevel | null;
  canAnswer: boolean | null;
  nextAction: AiChatNextAction | null;
  citations: AiChatCitation[];
  metadata: Record<string, unknown>;
  createdAt: Date;

  constructor(props: AiChatMessageProps) {
    this.id = props.id;
    this.sessionId = props.sessionId;
    this.role = props.role;
    this.content = props.content;
    this.intent = props.intent;
    this.riskLevel = props.riskLevel;
    this.canAnswer = props.canAnswer;
    this.nextAction = props.nextAction;
    this.citations = props.citations;
    this.metadata = props.metadata;
    this.createdAt = props.createdAt;
  }
}
