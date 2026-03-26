import type { IChatbotFaqRepository } from '@medical-crm/domain';
import { ForbiddenError, NotFoundError } from '@medical-crm/utils';
import type { ChatbotFaqItemDTO } from '../../dtos/chatbot-faq.dto.js';
import type { Actor } from '../../types/actor.js';
import { toChatbotFaqItemDTO } from '../../mappers/chatbot-faq.mapper.js';
import type { TranslationTaskService } from '../../services/translation-task.service.js';
import type { AiSyncTaskService } from '../../services/ai-sync-task.service.js';

export interface UpdateFaqItemInput {
  category?: string;
  question?: string;
  answer?: string;
  hospitalType?: 'REGULAR' | 'COSMETIC';
  keywords?: string[];
  sortOrder?: number;
  isActive?: boolean;
  attachments?: Array<{ storageKey: string; fileName: string; mimeType: string; fileSize: number }>;
}

export class UpdateFaqItemUseCase {
  constructor(
    private readonly faqRepo: IChatbotFaqRepository,
    private readonly translationTaskService: TranslationTaskService,
    private readonly aiSyncTaskService: AiSyncTaskService,
  ) {}

  async execute(id: string, input: UpdateFaqItemInput, actor: Actor): Promise<ChatbotFaqItemDTO> {
    if (actor.role !== 'ADMIN' && actor.role !== 'HOSPITAL') {
      throw new ForbiddenError('Forbidden');
    }

    const entity = await this.faqRepo.findById(id);
    if (!entity) {
      throw new NotFoundError(`ChatbotFaqItem not found: ${id}`);
    }

    // HOSPITAL actors can only update FAQs belonging to their hospital
    if (actor.role === 'HOSPITAL' && entity.hospitalId !== actor.hospitalId) {
      throw new ForbiddenError('Forbidden');
    }

    if (input.category !== undefined) entity.category = input.category;
    if (input.question !== undefined) entity.question = input.question;
    if (input.answer !== undefined) entity.answer = input.answer;
    if (input.hospitalType !== undefined) entity.hospitalType = input.hospitalType;
    if (input.keywords !== undefined) entity.keywords = input.keywords;
    if (input.sortOrder !== undefined) entity.sortOrder = input.sortOrder;
    if (input.isActive !== undefined) entity.isActive = input.isActive;
    if (input.attachments !== undefined) entity.attachments = input.attachments;
    entity.updatedAt = new Date();

    const saved = await this.faqRepo.save(entity);

    const fieldsToTranslate: Record<string, string> = {};
    if (input.question !== undefined) fieldsToTranslate.question = input.question;
    if (input.answer !== undefined) fieldsToTranslate.answer = input.answer;
    if (Object.keys(fieldsToTranslate).length > 0) {
      await this.translationTaskService.enqueue({
        sourceDb: 'crm',
        entityType: 'chatbot_faq_item',
        entityId: saved.id,
        fieldsToTranslate,
      });
    }

    await this.aiSyncTaskService.enqueueFaqUpsert({
      faqId: saved.id,
      category: saved.category,
      question: saved.question,
      answer: saved.answer,
      hospitalType: saved.hospitalType,
      hospitalId: saved.hospitalId,
      keywords: saved.keywords,
      attachments: saved.attachments.map((attachment) => ({
        fileName: attachment.fileName,
        storageKey: attachment.storageKey,
      })),
      isActive: saved.isActive,
    });

    return toChatbotFaqItemDTO(saved);
  }
}
