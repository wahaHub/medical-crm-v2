import { Message } from '@medical-crm/domain';
import type {
  Attachment,
  IConversationRepository,
  IMessageRepository,
  MessageDeliveryStatus,
  Transaction,
} from '@medical-crm/domain';
import { generateId } from '@medical-crm/utils';

export class PatientChatMessageWriter {
  constructor(
    private readonly conversationRepo: IConversationRepository,
    private readonly messageRepo: IMessageRepository,
  ) {}

  async writePatientAction(input: {
    conversationId: string;
    patientId: string;
    clientMessageId?: string | null;
    content: string;
    locale: string;
    metadata: Record<string, unknown>;
  }, tx?: Transaction): Promise<Message> {
    return this.saveAndTouchConversation(new Message({
      id: generateId(),
      conversationId: input.conversationId,
      clientMessageId: input.clientMessageId ?? null,
      senderId: input.patientId,
      senderRole: 'PATIENT',
      senderName: null,
      content: input.content,
      originalLanguage: input.locale,
      translatedContent: null,
      messageType: 'TEXT',
      moderationStatus: 'ALLOWED',
      attachments: [],
      deliveryStatus: 'sent',
      metadata: {
        source: 'patient',
        contentType: 'action',
        ...input.metadata,
      },
      aiSummary: null,
      createdAt: new Date(),
    }), tx);
  }

  async writeMechanical(input: {
    conversationId: string;
    content: string;
    locale: string;
    metadata: Record<string, unknown>;
  }, tx?: Transaction): Promise<Message> {
    return this.saveAndTouchConversation(new Message({
      id: generateId(),
      conversationId: input.conversationId,
      senderId: null,
      senderRoleOverride: 'SYSTEM',
      senderNameOverride: 'Medora Health',
      senderRole: 'SYSTEM',
      senderName: 'Medora Health',
      content: input.content,
      originalLanguage: input.locale,
      translatedContent: null,
      messageType: 'SYSTEM',
      moderationStatus: 'ALLOWED',
      attachments: [],
      deliveryStatus: 'sent',
      metadata: {
        source: 'mechanical_bot',
        contentType: 'text',
        ...input.metadata,
      },
      aiSummary: null,
      createdAt: new Date(),
    }), tx);
  }

  async createPendingAttachment(input: {
    id?: string;
    conversationId: string;
    patientId: string;
    clientMessageId: string;
    content: string;
    locale: string;
    attachments: Attachment[];
    metadata: Record<string, unknown>;
  }, tx?: Transaction): Promise<Message> {
    const message = await this.messageRepo.createPendingAttachmentMessage({
      id: input.id ?? generateId(),
      conversationId: input.conversationId,
      patientId: input.patientId,
      clientMessageId: input.clientMessageId,
      content: input.content,
      locale: input.locale,
      attachments: input.attachments,
      metadata: {
        source: 'patient',
        contentType: 'attachment',
        ...input.metadata,
      },
      createdAt: new Date(),
    }, tx);
    await this.touchConversation(input.conversationId, message, tx);
    return message;
  }

  async updateAttachmentStatus(input: {
    messageId: string;
    status: MessageDeliveryStatus;
    metadataPatch?: Record<string, unknown>;
  }, tx?: Transaction): Promise<Message> {
    const message = await this.messageRepo.updateDeliveryStatus(input.messageId, input.status, input.metadataPatch, tx);
    await this.touchConversation(message.conversationId, message, tx);
    return message;
  }

  private async saveAndTouchConversation(message: Message, tx?: Transaction): Promise<Message> {
    const saved = await this.messageRepo.save(message, tx);
    await this.touchConversation(saved.conversationId, saved, tx);
    return saved;
  }

  private async touchConversation(conversationId: string, message: Message, tx?: Transaction): Promise<void> {
    const conversation = await this.conversationRepo.findById(conversationId, tx);
    if (!conversation) {
      return;
    }
    conversation.updateLastMessage({
      id: message.id,
      content: message.content,
      senderId: message.senderId,
      createdAt: message.createdAt,
    });
    await this.conversationRepo.save(conversation, tx);
  }
}
