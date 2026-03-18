import type { IConversationRepository } from '@medical-crm/domain';
import type { ConversationDTO } from '../../dtos/conversation.dto.js';
import { toConversationDTO } from '../../mappers/conversation.mapper.js';

export interface GetPatientConversationsInput {
  patientId: string;
}

export class GetPatientConversationsUseCase {
  constructor(private readonly conversationRepo: IConversationRepository) {}

  async execute(input: GetPatientConversationsInput): Promise<ConversationDTO[]> {
    const conversations = await this.conversationRepo.findByPatientId(input.patientId);
    return conversations.map((c) => toConversationDTO(c));
  }
}
