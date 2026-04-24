import type { MessageAttachmentDTO } from './conversation.dto.js';

export interface PatientSessionSummaryDTO {
  sessionId: string;
  caseId: string | null;
  type: 'CARE_TEAM' | 'HOSPITAL';
  title: string;
  hospitalId: string | null;
  hospitalName: string | null;
  isAiAvailable: boolean;
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
  createdAt: string;
}

export interface PatientSessionDetailDTO {
  sessionId: string;
  caseId: string | null;
  type: 'CARE_TEAM' | 'HOSPITAL';
  title: string;
  hospitalId: string | null;
  hospitalName: string | null;
  isAiAvailable: boolean;
  chatAuthority: 'AI_ACTIVE' | 'HUMAN_TAKEOVER' | null;
  data: PatientSessionMessageDTO[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
}
