import type {
  ChatAutomationMode,
  IAiChatSessionRepository,
  IConversationRepository,
  IMessageRepository,
  PatientSite,
  Conversation,
} from '@medical-crm/domain';
import { ForbiddenError, NotFoundError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import type { PatientSessionDetailDTO } from '../../dtos/patient-conversation.dto.js';
import type { GetPatientSessionDetailUseCase } from '../patient-dashboard/get-patient-session-detail.use-case.js';
import { patientChatCopy, type PatientChatLocale } from './patient-chat-i18n.js';
import { PatientChatMessageWriter } from './patient-chat-message-writer.js';
import type { PatientChatActionKey } from './patient-chat-actions.js';

export type PatientChatEventType =
  | 'ACTION_SELECTED'
  | 'PROCESS_GUIDE_CONFIRMED'
  | 'PROCESS_GUIDE_DISMISSED'
  | 'ADVISOR_HANDOFF_REQUESTED'
  | 'QUESTIONNAIRE_OPENED'
  | 'QUESTIONNAIRE_SUBMITTED'
  | 'ATTACHMENT_UPLOAD_STARTED'
  | 'ATTACHMENT_UPLOAD_COMPLETED'
  | 'ATTACHMENT_UPLOAD_FAILED'
  | 'TEXT_MESSAGE_SUBMITTED'
  | 'BOT_MODE_CHANGED'
  | 'ADMIN_TAKEOVER_STARTED';

export interface HandlePatientChatEventInput {
  patientId: string;
  sessionId: string;
  site: PatientSite;
  eventType: PatientChatEventType;
  actionKey?: PatientChatActionKey;
  clientMessageId?: string;
  serverMessageId?: string;
  locale: PatientChatLocale;
  payload?: Record<string, unknown>;
}

interface UploadDocumentPort {
  execute(input: {
    caseId: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    documentType: string;
    sensitivity: string;
    language: string;
    storageKey: string;
  }, actor: Actor): Promise<{ documentId: string }>;
}

export class HandlePatientChatEventUseCase {
  private readonly writer: PatientChatMessageWriter;

  constructor(
    private readonly conversationRepo: IConversationRepository,
    private readonly messageRepo: IMessageRepository,
    private readonly aiChatSessionRepo: IAiChatSessionRepository,
    private readonly getPatientSessionDetail: GetPatientSessionDetailUseCase,
    private readonly uploadDocument: UploadDocumentPort,
  ) {
    this.writer = new PatientChatMessageWriter(conversationRepo, messageRepo);
  }

  async execute(input: HandlePatientChatEventInput): Promise<PatientSessionDetailDTO> {
    const parsed = parseCareTeamSessionId(input.patientId, input.sessionId);
    const conversation = await this.resolveConversation(input.patientId, parsed.caseId);
    const aiSession = await this.aiChatSessionRepo.findBySessionId(input.sessionId, input.site);

    switch (input.eventType) {
      case 'ACTION_SELECTED':
        await this.handleActionSelected(input, conversation);
        break;
      case 'PROCESS_GUIDE_CONFIRMED':
        await this.aiChatSessionRepo.patchStatus(input.sessionId, input.site, { processExplained: true });
        await this.writer.writeMechanical({
          conversationId: conversation.id,
          content: patientChatCopy(input.locale, 'process.confirmed'),
          locale: input.locale,
          metadata: { eventType: input.eventType, source: 'mechanical_bot' },
        });
        break;
      case 'PROCESS_GUIDE_DISMISSED':
        await this.writer.writeMechanical({
          conversationId: conversation.id,
          content: patientChatCopy(input.locale, 'process.dismissed'),
          locale: input.locale,
          metadata: { eventType: input.eventType, source: 'mechanical_bot' },
        });
        break;
      case 'ADVISOR_HANDOFF_REQUESTED':
        await this.handleAdvisorHandoff(input, conversation);
        break;
      case 'QUESTIONNAIRE_OPENED':
        await this.writer.writeMechanical({
          conversationId: conversation.id,
          content: patientChatCopy(input.locale, 'questionnaire.opened'),
          locale: input.locale,
          metadata: { eventType: input.eventType, source: 'mechanical_bot' },
        });
        break;
      case 'QUESTIONNAIRE_SUBMITTED':
        await this.writer.writeMechanical({
          conversationId: conversation.id,
          content: patientChatCopy(input.locale, 'questionnaire.submitted'),
          locale: input.locale,
          metadata: { eventType: input.eventType, source: 'mechanical_bot' },
        });
        break;
      case 'ATTACHMENT_UPLOAD_STARTED':
        await this.handleAttachmentStarted(input, conversation.id);
        break;
      case 'ATTACHMENT_UPLOAD_COMPLETED':
        await this.handleAttachmentCompleted(input, conversation.id, parsed.caseId);
        break;
      case 'ATTACHMENT_UPLOAD_FAILED':
        await this.handleAttachmentFailed(input, conversation.id);
        break;
      case 'TEXT_MESSAGE_SUBMITTED':
        await this.handleTextMessageSubmitted(input, conversation.id);
        break;
      case 'BOT_MODE_CHANGED':
        await this.handleBotModeChanged(input, conversation.id, aiSession?.automationMode ?? null);
        break;
      case 'ADMIN_TAKEOVER_STARTED':
        await this.setHumanMode(input, conversation);
        break;
      default:
        throw new ForbiddenError(`Unsupported patient chat event ${input.eventType}`);
    }

    return this.getPatientSessionDetail.execute({
      patientId: input.patientId,
      sessionId: input.sessionId,
      site: input.site,
      limit: 100,
      locale: input.locale,
    });
  }

  private async handleActionSelected(input: HandlePatientChatEventInput, conversation: Conversation): Promise<void> {
    const actionKey = input.actionKey;
    if (!actionKey) {
      throw new ForbiddenError('actionKey is required for ACTION_SELECTED');
    }
    const isDuplicateAction = input.clientMessageId
      ? Boolean(await this.messageRepo.findByConversationClientMessageId(conversation.id, input.clientMessageId))
      : false;

    if (isDuplicateAction && actionKey === 'CONTACT_ADVISOR') {
      await this.handleAdvisorHandoff(input, conversation, { writeMessage: false });
      return;
    }
    if (isDuplicateAction) {
      return;
    }

    await this.writer.writePatientAction({
      conversationId: conversation.id,
      patientId: input.patientId,
      clientMessageId: input.clientMessageId,
      content: `${patientChatCopy(input.locale, 'action.selected')}: ${getActionLabel(input.locale, actionKey)}`,
      locale: input.locale,
      metadata: { eventType: input.eventType, actionKey },
    });

    if (actionKey === 'CONTACT_ADVISOR') {
      const alreadyHuman = conversation.assistantMode === 'HUMAN_TAKEOVER';
      await this.handleAdvisorHandoff(input, conversation, { writeMessage: !alreadyHuman });
      return;
    }

    const replyKey = actionKey === 'VIEW_PROCESS'
      ? 'process.prompt'
      : actionKey === 'UPLOAD_RECORDS'
        ? 'upload.prompt'
        : 'questionnaire.opened';

    await this.writer.writeMechanical({
      conversationId: conversation.id,
      content: patientChatCopy(input.locale, replyKey),
      locale: input.locale,
      metadata: { eventType: input.eventType, actionKey, source: 'mechanical_bot' },
    });
  }

  private async handleTextMessageSubmitted(input: HandlePatientChatEventInput, conversationId: string): Promise<void> {
    const content = typeof input.payload?.['content'] === 'string' ? input.payload['content'].trim() : '';
    if (!content) {
      throw new ForbiddenError('Message content is required');
    }

    await this.writer.writePatientAction({
      conversationId,
      patientId: input.patientId,
      clientMessageId: input.clientMessageId,
      content,
      locale: input.locale,
      metadata: { eventType: input.eventType, contentType: 'text' },
    });
  }

  private async handleAttachmentStarted(input: HandlePatientChatEventInput, conversationId: string): Promise<void> {
    if (!input.clientMessageId) {
      throw new ForbiddenError('clientMessageId is required for ATTACHMENT_UPLOAD_STARTED');
    }
    const attachment = readFirstAttachment(input.payload);
    if (!attachment) {
      throw new ForbiddenError('Attachment payload is required');
    }

    await this.writer.createPendingAttachment({
      conversationId,
      patientId: input.patientId,
      clientMessageId: input.clientMessageId,
      content: input.locale === 'zh' ? '正在上传医疗资料...' : 'Uploading medical records...',
      locale: input.locale,
      attachments: [attachment],
      metadata: {
        eventType: input.eventType,
        uploadStatus: 'uploading',
      },
    });
  }

  private async handleAdvisorHandoff(
    input: HandlePatientChatEventInput,
    conversation: Awaited<ReturnType<IConversationRepository['findById']>> & {},
    options: { writeMessage: boolean } = { writeMessage: true },
  ): Promise<void> {
    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }
    conversation.assistantMode = 'HUMAN_TAKEOVER';
    await this.conversationRepo.save(conversation);
    if (this.aiChatSessionRepo.updateAutomationMode) {
      await this.aiChatSessionRepo.updateAutomationMode(input.sessionId, input.site, 'human');
    }
    if (options.writeMessage) {
      await this.writer.writeMechanical({
        conversationId: conversation.id,
        content: patientChatCopy(input.locale, 'advisor.handoff'),
        locale: input.locale,
        metadata: { eventType: input.eventType, source: 'mechanical_bot', botMode: 'human' },
      });
    }
  }

  private async handleAttachmentCompleted(
    input: HandlePatientChatEventInput,
    conversationId: string,
    caseId: string,
  ): Promise<void> {
    const message = await this.resolveUploadMessage(conversationId, input);
    if (message.deliveryStatus === 'sent' || message.metadata.uploadStatus === 'uploaded') {
      return;
    }
    if (message.deliveryStatus === 'failed') {
      return;
    }
    const claimed = await this.messageRepo.claimDeliveryStatus(
      message.id,
      ['uploading', 'pending'],
      'pending',
      {
        eventType: input.eventType,
        uploadStatus: 'processing',
      },
    );
    if (!claimed) {
      return;
    }

    const attachment = readFirstAttachment(input.payload);
    if (!attachment) {
      throw new ForbiddenError('Attachment payload is required');
    }

    let documentId: string;
    try {
      const result = await this.uploadDocument.execute({
        caseId,
        fileName: attachment.fileName,
        fileSize: attachment.fileSize,
        mimeType: attachment.mimeType,
        documentType: 'OTHER',
        sensitivity: 'PHI_HIGH',
        language: input.locale,
        storageKey: attachment.storageKey,
      }, { role: 'PATIENT', userId: input.patientId, email: '', hospitalId: null });
      documentId = result.documentId;
    } catch (error) {
      await this.writer.updateAttachmentStatus({
        messageId: claimed.id,
        status: 'failed',
        metadataPatch: {
          eventType: input.eventType,
          errorCode: 'DOCUMENT_WRITE_FAILED',
          uploadStatus: 'failed',
        },
      });
      await this.writer.writeMechanical({
        conversationId,
        content: patientChatCopy(input.locale, 'upload.failed'),
        locale: input.locale,
        metadata: { eventType: input.eventType, source: 'mechanical_bot' },
      });
      return;
    }

    await this.writer.updateAttachmentStatus({
      messageId: claimed.id,
      status: 'sent',
      metadataPatch: {
        eventType: input.eventType,
        documentId,
        storageKey: attachment.storageKey,
        uploadStatus: 'uploaded',
      },
    });

    await this.writer.writeMechanical({
      conversationId,
      content: patientChatCopy(input.locale, 'upload.succeeded'),
      locale: input.locale,
      metadata: { eventType: input.eventType, source: 'mechanical_bot', documentId },
    });
  }

  private async handleAttachmentFailed(input: HandlePatientChatEventInput, conversationId: string): Promise<void> {
    const message = await this.resolveUploadMessage(conversationId, input);
    if (message.deliveryStatus === 'failed' || message.metadata.uploadStatus === 'failed') {
      return;
    }
    if (message.deliveryStatus === 'sent' || message.metadata.uploadStatus === 'uploaded') {
      return;
    }

    await this.writer.updateAttachmentStatus({
      messageId: message.id,
      status: 'failed',
      metadataPatch: {
        eventType: input.eventType,
        errorCode: input.payload?.['errorCode'] ?? 'UPLOAD_FAILED',
        uploadStatus: 'failed',
      },
    });
    await this.writer.writeMechanical({
      conversationId,
      content: patientChatCopy(input.locale, 'upload.failed'),
      locale: input.locale,
      metadata: { eventType: input.eventType, source: 'mechanical_bot' },
    });
  }

  private async handleBotModeChanged(
    input: HandlePatientChatEventInput,
    conversationId: string,
    previousMode: ChatAutomationMode | null,
  ): Promise<void> {
    const nextMode = normalizeMode(input.payload?.['mode']);
    if (!nextMode || !this.aiChatSessionRepo.updateAutomationMode) {
      throw new ForbiddenError('Valid bot mode is required');
    }
    await this.aiChatSessionRepo.updateAutomationMode(input.sessionId, input.site, nextMode);
    await this.writer.writeMechanical({
      conversationId,
      content: `Automation mode changed: ${previousMode ?? 'unknown'} -> ${nextMode}`,
      locale: input.locale,
      metadata: { eventType: input.eventType, previousMode, nextMode, source: 'system' },
    });
  }

  private async setHumanMode(
    input: HandlePatientChatEventInput,
    conversation: Awaited<ReturnType<IConversationRepository['findById']>> & {},
  ): Promise<void> {
    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }
    conversation.assistantMode = 'HUMAN_TAKEOVER';
    await this.conversationRepo.save(conversation);
    if (this.aiChatSessionRepo.updateAutomationMode) {
      await this.aiChatSessionRepo.updateAutomationMode(input.sessionId, input.site, 'human');
    }
  }

  private async resolveConversation(patientId: string, caseId: string) {
    const conversations = await this.conversationRepo.findByPatientId(patientId);
    const conversation = conversations.find((item) =>
      item.category === 'ADMIN_PATIENT' && item.caseId === caseId,
    );
    if (!conversation) {
      throw new NotFoundError(`Patient care-team session for case ${caseId} not found`);
    }
    return conversation;
  }

  private async resolveUploadMessage(conversationId: string, input: HandlePatientChatEventInput) {
    if (input.serverMessageId) {
      const message = await this.messageRepo.findById(input.serverMessageId);
      if (message && message.conversationId === conversationId) {
        return message;
      }
    }

    if (input.clientMessageId) {
      const message = await this.messageRepo.findByConversationClientMessageId(conversationId, input.clientMessageId);
      if (message) {
        return message;
      }
    }

    throw new NotFoundError('Upload message not found');
  }
}

function getActionLabel(locale: PatientChatLocale, actionKey: PatientChatActionKey): string {
  switch (actionKey) {
    case 'VIEW_PROCESS':
      return patientChatCopy(locale, 'action.viewProcess');
    case 'UPLOAD_RECORDS':
      return patientChatCopy(locale, 'action.uploadRecords');
    case 'CONTACT_ADVISOR':
      return patientChatCopy(locale, 'action.contactAdvisor');
    case 'OPEN_QUESTIONNAIRE':
      return patientChatCopy(locale, 'action.openQuestionnaire');
  }
}

function parseCareTeamSessionId(patientId: string, sessionId: string): { caseId: string } {
  if (!sessionId.startsWith(`widget-chat:${patientId}:`)) {
    throw new NotFoundError(`Patient session ${sessionId} not found`);
  }
  const caseId = sessionId.slice(`widget-chat:${patientId}:`.length).trim();
  if (!caseId) {
    throw new NotFoundError(`Patient session ${sessionId} not found`);
  }
  return { caseId };
}

function normalizeMode(value: unknown): ChatAutomationMode | null {
  return value === 'mechanical' || value === 'ai' || value === 'human' ? value : null;
}

function readFirstAttachment(payload: Record<string, unknown> | undefined): {
  fileName: string;
  fileSize: number;
  mimeType: string;
  storageKey: string;
} | null {
  const attachments = payload?.['attachments'];
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return null;
  }

  const candidate = attachments[0];
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const record = candidate as Record<string, unknown>;
  const fileName = typeof record['fileName'] === 'string' ? record['fileName'] : null;
  const mimeType = typeof record['mimeType'] === 'string' ? record['mimeType'] : null;
  const storageKey = typeof record['storageKey'] === 'string' ? record['storageKey'] : null;
  const fileSize = typeof record['fileSize'] === 'number'
    ? record['fileSize']
    : (typeof record['size'] === 'number' ? record['size'] : null);

  if (!fileName || !mimeType || !storageKey || typeof fileSize !== 'number') {
    return null;
  }

  return { fileName, mimeType, storageKey, fileSize };
}
