import type { IConversationRepository, IHospitalRepository } from '@medical-crm/domain';
import type { PatientConversationSummaryDTO } from '../../dtos/patient-conversation.dto.js';

export interface GetPatientConversationsInput {
  patientId: string;
}

export class GetPatientConversationsUseCase {
  constructor(
    private readonly conversationRepo: IConversationRepository,
    private readonly hospitalRepo?: IHospitalRepository,
  ) {}

  async execute(input: GetPatientConversationsInput): Promise<PatientConversationSummaryDTO[]> {
    const conversations = await this.conversationRepo.findByPatientId(input.patientId);
    const patientConversations = conversations
      .filter((conversation) => conversation.category !== 'ADMIN_HOSPITAL')
      .filter((conversation): conversation is typeof conversation & { category: 'ADMIN_PATIENT' | 'HOSPITAL_PATIENT' } =>
        conversation.category === 'ADMIN_PATIENT' || conversation.category === 'HOSPITAL_PATIENT',
      );
    const hospitalNameById = await this.loadHospitalNames(patientConversations);

    return patientConversations.map((conversation) => ({
      id: conversation.id,
      caseId: conversation.caseId,
      category: conversation.category,
      type: conversation.category === 'ADMIN_PATIENT' ? 'patient-admin' : 'patient-hospital',
      title: conversation.title,
      hospitalId: conversation.hospitalId,
      hospitalName: conversation.hospitalId ? hospitalNameById.get(conversation.hospitalId) ?? null : null,
      assistantMode: conversation.assistantMode,
      unreadCount: 0,
      lastMessage: conversation.lastMessagePreview && conversation.lastMessageAt
        ? {
            content: conversation.lastMessagePreview,
            createdAt: conversation.lastMessageAt.toISOString(),
          }
        : null,
      lastMessagePreview: conversation.lastMessagePreview,
      updatedAt: conversation.updatedAt.toISOString(),
    }));
  }

  private async loadHospitalNames(
    conversations: Array<{ hospitalId: string | null }>,
  ): Promise<Map<string, string>> {
    const names = new Map<string, string>();

    if (!this.hospitalRepo) {
      return names;
    }

    const hospitalIds = [...new Set(
      conversations
        .map((conversation) => conversation.hospitalId)
        .filter((hospitalId): hospitalId is string => typeof hospitalId === 'string' && hospitalId.length > 0),
    )];
    await Promise.all(hospitalIds.map(async (hospitalId) => {
      const hospital = await this.hospitalRepo?.findById(hospitalId);
      if (hospital?.name) {
        names.set(hospitalId, hospital.name);
      }
    }));

    return names;
  }
}
