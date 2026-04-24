import { generateId, ForbiddenError, NotFoundError } from '@medical-crm/utils';
import { Message } from '@medical-crm/domain';
import type {
  IConversationRepository,
  IMessageRepository,
  ITranslationService,
  IMessageTaskQueue,
  IPatientRepository,
  IUserRepository,
  ICaseRepository,
  MessageType,
  ModerationStatus,
  Attachment,
  Conversation,
  TransactionRunner,
  Transaction,
} from '@medical-crm/domain';
import type { Actor } from '../../types/actor.js';
import type { MessageDTO } from '../../dtos/conversation.dto.js';
import { toMessageDTO } from '../../mappers/conversation.mapper.js';

export interface SendMessageInput {
  content: string;
  messageType?: MessageType;
  attachments?: Attachment[];
}

export interface SendMessageResult {
  message: MessageDTO;
  sideEffectMessages: MessageDTO[];
}

type TxConversationRepository = IConversationRepository & {
  findById(id: string, tx?: Transaction): Promise<Conversation | null>;
  save(entity: Conversation, tx?: Transaction): Promise<Conversation>;
  findAdminPatientByCaseId?(caseId: string, tx?: Transaction): Promise<Conversation | null>;
  compareAndSetAssistantMode?(
    id: string,
    fromMode: 'AI_ACTIVE' | 'HUMAN_TAKEOVER',
    toMode: 'AI_ACTIVE' | 'HUMAN_TAKEOVER',
    tx?: Transaction,
  ): Promise<Conversation | null>;
};

type TxMessageRepository = IMessageRepository & {
  save(entity: Message, tx?: Transaction): Promise<Message>;
};

const HANDOFF_NOTICE = 'Medora AI 已转人工，现由顾问接手';

export class SendMessageUseCase {
  constructor(
    private readonly conversationRepo: IConversationRepository,
    private readonly messageRepo: IMessageRepository,
    private readonly translationService: ITranslationService,
    private readonly messageTaskQueue: IMessageTaskQueue,
    private readonly patientRepo: IPatientRepository,
    private readonly userRepo: IUserRepository,
    private readonly caseRepo: ICaseRepository,
    private readonly txRunner: TransactionRunner,
  ) {}

  async execute(
    conversationId: string,
    input: SendMessageInput,
    actor: Actor,
  ): Promise<SendMessageResult> {
    // 1. Validate access
    const conversation = await this.conversationRepo.findById(conversationId);
    if (!conversation) throw new NotFoundError('Conversation not found');
    await this.checkAccess(conversation, actor);

    // 2. Determine recipientLang
    const recipientLang = await this.deriveRecipientLang(conversation, actor);

    // 3. Determine moderationStatus
    const moderationStatus = this.determineModerationStatus(conversation, actor);

    // 4. Create message entity
    const messageType = input.messageType ?? 'TEXT';
    const message = new Message({
      id: generateId(),
      conversationId,
      senderId: actor.userId,
      senderRole: actor.role,
      content: input.content,
      originalLanguage: this.detectLanguage(input.content),
      translatedContent: null,
      messageType,
      moderationStatus,
      attachments: input.attachments ?? [],
      aiSummary: null,
      createdAt: new Date(),
    });

    // 5. TEXT: inline translation
    if (messageType === 'TEXT') {
      const translated = await this.translationService.translate(
        input.content,
        recipientLang,
      );
      message.setTranslation(translated);
    }

    // 6. Save message (before enqueue!)
    const isHumanTakeoverCandidate =
      (actor.role === 'ADMIN' && conversation.category === 'ADMIN_PATIENT')
      || (actor.role === 'HOSPITAL' && conversation.category === 'HOSPITAL_PATIENT');

    const result = isHumanTakeoverCandidate
      ? await this.txRunner.run(async (tx) => this.persistHumanTakeoverMessage(tx, conversationId, message))
      : await this.persistStandardMessage(conversation, message);

    // 7. IMAGE/FILE: async enqueue
    if (messageType === 'IMAGE' || messageType === 'FILE') {
      await this.messageTaskQueue.enqueueSummarization(result.message.id);
      await this.messageTaskQueue.enqueueTranslation(result.message.id, recipientLang);
    }

    return result;
  }

  private async persistStandardMessage(
    conversation: Conversation,
    message: Message,
  ): Promise<SendMessageResult> {
    const saved = await this.messageRepo.save(message);
    conversation.updateLastMessage({
      id: saved.id,
      content: saved.content,
      senderId: saved.senderId,
      createdAt: saved.createdAt,
    });
    await this.conversationRepo.save(conversation);

    return {
      message: toMessageDTO(saved),
      sideEffectMessages: [],
    };
  }

  private async persistHumanTakeoverMessage(
    tx: Transaction,
    conversationId: string,
    message: Message,
  ): Promise<SendMessageResult> {
    const conversationRepo = this.conversationRepo as TxConversationRepository;
    const messageRepo = this.messageRepo as TxMessageRepository;
    const conversation = await conversationRepo.findById(conversationId, tx);
    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }

    const saved = await messageRepo.save(message, tx);
    const sideEffectMessages: MessageDTO[] = [];

    const transitionedConversation = conversationRepo.compareAndSetAssistantMode
      ? await conversationRepo.compareAndSetAssistantMode(
          conversationId,
          'AI_ACTIVE',
          'HUMAN_TAKEOVER',
          tx,
        )
      : (conversation.assistantMode === 'AI_ACTIVE'
          ? (() => {
              conversation.assistantMode = 'HUMAN_TAKEOVER';
              return conversation;
            })()
          : null);

    if (transitionedConversation) {
      conversation.assistantMode = 'HUMAN_TAKEOVER';
      await this.syncCaseAuthorityToHumanTakeover(conversation, conversationRepo, tx);
      const handoffNotice = await messageRepo.save(new Message({
        id: generateId(),
        conversationId,
        senderId: null,
        senderRoleOverride: 'SYSTEM',
        senderNameOverride: 'System',
        senderRole: 'SYSTEM',
        senderName: 'System',
        content: HANDOFF_NOTICE,
        originalLanguage: 'zh',
        translatedContent: null,
        messageType: 'SYSTEM',
        moderationStatus: 'ALLOWED',
        attachments: [],
        aiSummary: null,
        createdAt: new Date(),
      }), tx);

      transitionedConversation.updateLastMessage({
        id: handoffNotice.id,
        content: handoffNotice.content,
        senderId: handoffNotice.senderId,
        createdAt: handoffNotice.createdAt,
      });
      sideEffectMessages.push(toMessageDTO(handoffNotice));
      await conversationRepo.save(transitionedConversation, tx);
    } else {
      conversation.assistantMode = 'HUMAN_TAKEOVER';
      await this.syncCaseAuthorityToHumanTakeover(conversation, conversationRepo, tx);
      conversation.updateLastMessage({
        id: saved.id,
        content: saved.content,
        senderId: saved.senderId,
        createdAt: saved.createdAt,
      });
      await conversationRepo.save(conversation, tx);
    }

    return {
      message: toMessageDTO(saved),
      sideEffectMessages,
    };
  }

  private async syncCaseAuthorityToHumanTakeover(
    conversation: Conversation,
    conversationRepo: TxConversationRepository,
    tx: Transaction,
  ): Promise<void> {
    if (conversation.category !== 'HOSPITAL_PATIENT' || !conversation.caseId) {
      return;
    }

    const adminConversation = conversationRepo.findAdminPatientByCaseId
      ? await conversationRepo.findAdminPatientByCaseId(conversation.caseId, tx)
      : null;

    if (!adminConversation || adminConversation.assistantMode !== 'AI_ACTIVE') {
      return;
    }

    if (conversationRepo.compareAndSetAssistantMode) {
      await conversationRepo.compareAndSetAssistantMode(
        adminConversation.id,
        'AI_ACTIVE',
        'HUMAN_TAKEOVER',
        tx,
      );
      return;
    }

    adminConversation.assistantMode = 'HUMAN_TAKEOVER';
    await conversationRepo.save(adminConversation, tx);
  }

  private async deriveRecipientLang(
    conversation: Conversation,
    actor: Actor,
  ): Promise<string> {
    if (conversation.category === 'ADMIN_HOSPITAL') {
      if (actor.role === 'ADMIN') {
        const lang = await this.userRepo.findPreferredLanguage(
          conversation.hospitalId!,
        );
        return lang ?? 'zh';
      }
      return 'zh'; // recipient is admin
    }

    if (conversation.category === 'HOSPITAL_PATIENT') {
      if (actor.role === 'HOSPITAL') {
        const patientLang = await this.resolvePatientLang(conversation.caseId);
        return patientLang;
      }
      // Sender is patient, recipient is hospital user
      const lang = await this.userRepo.findPreferredLanguage(
        conversation.hospitalId!,
      );
      return lang ?? 'zh';
    }

    if (conversation.category === 'ADMIN_PATIENT') {
      if (actor.role === 'ADMIN') {
        const patientLang = await this.resolvePatientLang(conversation.caseId);
        return patientLang;
      }
      return 'zh'; // recipient is admin
    }

    return 'zh'; // fallback
  }

  private async resolvePatientLang(caseId: string | null): Promise<string> {
    if (!caseId) return 'en';
    const caseEntity = await this.caseRepo.findById(caseId);
    if (!caseEntity) return 'en';
    const patient = await this.patientRepo.findById(caseEntity.patientId);
    return patient?.preferredLanguage ?? 'en';
  }

  private determineModerationStatus(
    conversation: Conversation,
    actor: Actor,
  ): ModerationStatus {
    if (actor.role === 'ADMIN') return 'ALLOWED';
    if (
      actor.role === 'HOSPITAL' &&
      conversation.category === 'HOSPITAL_PATIENT'
    )
      return 'REVIEW';
    return 'ALLOWED';
  }

  private detectLanguage(content: string): string {
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(content)) return 'zh';
    if (/[\u3040-\u309f\u30a0-\u30ff]/.test(content)) return 'jp';
    if (/[\uac00-\ud7af\u1100-\u11ff]/.test(content)) return 'kr';
    if (/[\u0e01-\u0e5b]/.test(content)) return 'th';
    if (/[\u0600-\u06ff\u0750-\u077f]/.test(content)) return 'ar';
    if (/[\u0400-\u04ff]/.test(content)) return 'ru';
    return 'en';
  }

  private async checkAccess(conversation: Conversation, actor: Actor): Promise<void> {
    if (actor.role === 'ADMIN') return;
    if (actor.role === 'HOSPITAL') {
      if (conversation.hospitalId !== actor.hospitalId) {
        throw new ForbiddenError('No access to this conversation');
      }
      if (conversation.category === 'ADMIN_PATIENT') {
        throw new ForbiddenError(
          'Hospital cannot access admin-patient conversations',
        );
      }
      return;
    }
    if (actor.role === 'PATIENT') {
      if (conversation.category === 'ADMIN_HOSPITAL') {
        throw new ForbiddenError('No access to this conversation');
      }
      if (!conversation.caseId) {
        throw new ForbiddenError('No access to this conversation');
      }
      const caseEntity = await this.caseRepo.findById(conversation.caseId);
      if (!caseEntity || caseEntity.patientId !== actor.userId) {
        throw new ForbiddenError('No access to this conversation');
      }
      return;
    }
    throw new ForbiddenError('Insufficient permissions');
  }
}
