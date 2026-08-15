import { Message, type Conversation, type IConversationRepository, type IMessageRepository, type Transaction, type TransactionRunner } from '@medical-crm/domain';
import { ForbiddenError, NotFoundError, generateId } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import type { ConversationDTO, MessageDTO } from '../../dtos/conversation.dto.js';
import { toConversationDTO, toMessageDTO } from '../../mappers/conversation.mapper.js';
import type { AdminPatientSiteAccessPolicy } from '../../access/admin-patient-site-access.js';
import { assertStaffCanAccessConversationCase } from '../../access/admin-conversation-access.js';

type TxConversationRepository = IConversationRepository & {
  findById(id: string, tx?: Transaction): Promise<Conversation | null>;
  save(entity: Conversation, tx?: Transaction): Promise<Conversation>;
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

const RESUME_NOTICE = 'Medora AI 已重新接入，可继续为您提供初步协助';

export interface ResumeConversationAiResult {
  conversation: ConversationDTO;
  resumeNotice: MessageDTO | null;
}

export class ResumeConversationAiUseCase {
  constructor(
    private readonly conversationRepo: IConversationRepository,
    private readonly messageRepo: IMessageRepository,
    private readonly txRunner: TransactionRunner,
    private readonly adminAccess?: AdminPatientSiteAccessPolicy,
  ) {}

  async execute(id: string, actor: Actor): Promise<ResumeConversationAiResult> {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Only admins can restore Medora AI');
    }

    return this.txRunner.run(async (tx) => {
      const conversationRepo = this.conversationRepo as TxConversationRepository;
      const messageRepo = this.messageRepo as TxMessageRepository;
      const conversation = await conversationRepo.findById(id, tx);

      if (!conversation) {
        throw new NotFoundError(`Conversation ${id} not found`);
      }
      if (conversation.category !== 'ADMIN_PATIENT') {
        throw new ForbiddenError('Only admin-patient conversations support assistant resume');
      }
      await assertStaffCanAccessConversationCase(actor, conversation, this.adminAccess);
      if (conversation.assistantMode === 'AI_ACTIVE') {
        return {
          conversation: toConversationDTO(conversation),
          resumeNotice: null,
        };
      }

      const transitionedConversation = conversationRepo.compareAndSetAssistantMode
        ? await conversationRepo.compareAndSetAssistantMode(
            id,
            'HUMAN_TAKEOVER',
            'AI_ACTIVE',
            tx,
          )
        : (() => {
            conversation.assistantMode = 'AI_ACTIVE';
            return conversation;
          })();

      if (!transitionedConversation) {
        const latestConversation = await conversationRepo.findById(id, tx);
        return {
          conversation: toConversationDTO(latestConversation ?? conversation),
          resumeNotice: null,
        };
      }

      const resumeNotice = await messageRepo.save(new Message({
        id: generateId(),
        conversationId: transitionedConversation.id,
        senderId: null,
        senderRoleOverride: 'SYSTEM',
        senderNameOverride: 'System',
        senderRole: 'SYSTEM',
        senderName: 'System',
        content: RESUME_NOTICE,
        originalLanguage: 'zh',
        translatedContent: null,
        messageType: 'SYSTEM',
        moderationStatus: 'ALLOWED',
        attachments: [],
        aiSummary: null,
        createdAt: new Date(),
      }), tx);
      transitionedConversation.updateLastMessage({
        id: resumeNotice.id,
        content: resumeNotice.content,
        senderId: resumeNotice.senderId,
        createdAt: resumeNotice.createdAt,
      });

      const savedConversation = await conversationRepo.save(transitionedConversation, tx);
      return {
        conversation: toConversationDTO(savedConversation),
        resumeNotice: toMessageDTO(resumeNotice),
      };
    });
  }
}
