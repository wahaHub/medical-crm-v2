import { Conversation, type IConversationRepository, type ConversationCategory, type ICaseRepository, type IHospitalRepository } from '@medical-crm/domain';
import { generateId, ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import type { ConversationDTO } from '../../dtos/conversation.dto.js';
import { toConversationDTO } from '../../mappers/conversation.mapper.js';

export interface CreateConversationInput {
  category: ConversationCategory;
  caseId?: string;
  hospitalId?: string;
  title?: string;
}

export class CreateConversationUseCase {
  constructor(
    private readonly conversationRepo: IConversationRepository,
    private readonly caseRepo?: ICaseRepository,
    private readonly hospitalRepo?: IHospitalRepository,
  ) {}

  async execute(input: CreateConversationInput, actor: Actor): Promise<ConversationDTO> {
    if (actor.role !== 'ADMIN' && actor.role !== 'HOSPITAL') {
      throw new ForbiddenError('Only admins and hospital staff can create conversations');
    }

    const now = new Date();
    const hospitalId = input.hospitalId ?? (actor.role === 'HOSPITAL' ? actor.hospitalId : null);

    // Auto-generate title if not provided
    const title = input.title ?? (await this.buildTitle(hospitalId, input.caseId));

    const entity = new Conversation({
      id: generateId(),
      category: input.category,
      caseId: input.caseId ?? null,
      hospitalId,
      title,
      lastMessageId: null,
      lastMessageAt: null,
      lastMessagePreview: null,
      lastSenderId: null,
      createdAt: now,
      updatedAt: now,
    });

    const saved = await this.conversationRepo.save(entity);
    return toConversationDTO(saved);
  }

  private async buildTitle(hospitalId: string | null, caseId?: string): Promise<string | null> {
    const parts: string[] = [];

    // Hospital name
    if (hospitalId && this.hospitalRepo) {
      try {
        const hospital = await this.hospitalRepo.findById(hospitalId);
        if (hospital) parts.push(hospital.name);
      } catch {
        // ignore lookup failures
      }
    }

    // Patient name + case number
    if (caseId && this.caseRepo) {
      try {
        const caseEntity = await this.caseRepo.findById(caseId);
        if (caseEntity) {
          parts.push(caseEntity.patientName);
          parts.push(String(caseEntity.caseNumber));
        }
      } catch {
        // ignore lookup failures
      }
    }

    return parts.length > 0 ? parts.join(' · ') : null;
  }
}
