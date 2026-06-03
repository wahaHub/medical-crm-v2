import type { MessageAttachmentDTO } from './conversation.dto.js';

export interface PatientSessionSummaryDTO {
  sessionId: string;
  caseId: string | null;
  type: 'CARE_TEAM' | 'HOSPITAL';
  title: string;
  hospitalId: string | null;
  hospitalName: string | null;
  isAiAvailable: boolean;
  chatState?: PatientChatStateDTO;
  unreadCount: number;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  updatedAt: string;
}

export interface PatientCaseChatMetaDTO {
  caseId: string | null;
  chatAuthority: 'AI_ACTIVE' | 'HUMAN_TAKEOVER' | null;
}

export interface PatientConversationSummariesDTO {
  sessions: PatientSessionSummaryDTO[];
  meta: PatientCaseChatMetaDTO;
}

export interface PatientSessionMessageDTO {
  id: string;
  sessionId: string;
  clientMessageId?: string | null;
  source: 'FORMAL' | 'CHATBOT';
  conversationId: string | null;
  senderRole: string | null;
  senderName: string | null;
  content: string;
  messageType: string;
  moderationStatus: string | null;
  attachments: MessageAttachmentDTO[];
  citations?: Array<Record<string, unknown>>;
  metadata?: Record<string, unknown>;
  deliveryStatus?: string | null;
  createdAt: string;
}

export type PatientBotMode = 'mechanical' | 'ai' | 'human';

export interface PatientChatActionDTO {
  id: 'VIEW_PROCESS' | 'UPLOAD_RECORDS' | 'CONTACT_ADVISOR' | 'OPEN_QUESTIONNAIRE';
  label: string;
  icon?: string;
  disabled?: boolean;
}

export interface PatientComposerPolicyDTO {
  textEnabled: boolean;
  attachmentsEnabled: boolean;
  sendEnabledWhen: 'text_or_attachment' | 'attachment_only' | 'disabled';
  placeholder: string;
}

export interface PatientChatStateDTO {
  botMode: PatientBotMode;
  availableActions: PatientChatActionDTO[];
  composerPolicy: PatientComposerPolicyDTO;
}

export interface PatientSessionDetailDTO {
  sessionId: string;
  caseId: string | null;
  type: 'CARE_TEAM' | 'HOSPITAL';
  title: string;
  hospitalId: string | null;
  hospitalName: string | null;
  isAiAvailable: boolean;
  chatState?: PatientChatStateDTO;
  chatAuthority: 'AI_ACTIVE' | 'HUMAN_TAKEOVER' | null;
  data: PatientSessionMessageDTO[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
}
