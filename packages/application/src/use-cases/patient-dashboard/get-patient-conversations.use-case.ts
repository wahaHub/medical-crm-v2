import type { IConversationRepository, IHospitalRepository } from '@medical-crm/domain';
import type {
  PatientConversationSummariesDTO,
  PatientSessionSummaryDTO,
} from '../../dtos/patient-conversation.dto.js';

export interface GetPatientConversationsInput {
  patientId: string;
  caseId?: string;
  locale?: 'en' | 'zh';
}

export class GetPatientConversationsUseCase {
  constructor(
    private readonly conversationRepo: IConversationRepository,
    private readonly hospitalRepo?: IHospitalRepository,
  ) {}

  async execute(input: GetPatientConversationsInput): Promise<PatientConversationSummariesDTO> {
    const conversations = await this.conversationRepo.findByPatientId(input.patientId);
    const patientConversations = conversations
      .filter((conversation) => conversation.category !== 'ADMIN_HOSPITAL')
      .filter((conversation): conversation is typeof conversation & { category: 'ADMIN_PATIENT' | 'HOSPITAL_PATIENT' } =>
        conversation.category === 'ADMIN_PATIENT' || conversation.category === 'HOSPITAL_PATIENT',
      )
      .filter((conversation) => !input.caseId || conversation.caseId === input.caseId)
      .filter((conversation) => conversation.category !== 'HOSPITAL_PATIENT' || Boolean(conversation.caseId))
      .filter((conversation) => conversation.category !== 'HOSPITAL_PATIENT' || Boolean(conversation.hospitalId));
    const hospitalNameById = await this.loadHospitalNames(patientConversations);
    const caseId = input.caseId ?? patientConversations[0]?.caseId ?? null;
    const chatAuthority = patientConversations.find((conversation) => conversation.category === 'ADMIN_PATIENT')?.assistantMode
      ?? patientConversations[0]?.assistantMode
      ?? null;

    return {
      sessions: patientConversations.map((conversation) =>
        this.toSessionSummary(conversation, hospitalNameById, input.patientId),
      ),
      meta: {
        caseId,
        chatAuthority,
      },
    };
  }

  private toSessionSummary(
    conversation: {
      id: string;
      caseId: string | null;
      category: 'ADMIN_PATIENT' | 'HOSPITAL_PATIENT';
      hospitalId: string | null;
      assistantMode: 'AI_ACTIVE' | 'HUMAN_TAKEOVER';
      lastMessagePreview: string | null;
      lastMessageAt: Date | null;
      updatedAt: Date;
    },
    hospitalNameById: Map<string, string>,
    patientId: string,
  ): PatientSessionSummaryDTO {
    const hospitalName = conversation.hospitalId ? hospitalNameById.get(conversation.hospitalId) ?? null : null;
    const isCareTeam = conversation.category === 'ADMIN_PATIENT';
    const canonicalCaseId = conversation.caseId ?? conversation.id;

    return {
      sessionId: isCareTeam
        ? `widget-chat:${patientId}:${canonicalCaseId}`
        : `hospital:${conversation.hospitalId}:${canonicalCaseId}`,
      caseId: conversation.caseId,
      type: isCareTeam ? 'CARE_TEAM' : 'HOSPITAL',
      title: isCareTeam ? 'Medora Care Team' : hospitalName ?? 'Hospital',
      hospitalId: conversation.hospitalId,
      hospitalName,
      isAiAvailable: isCareTeam ? conversation.assistantMode === 'AI_ACTIVE' : false,
      unreadCount: 0,
      lastMessagePreview: conversation.lastMessagePreview,
      lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
      updatedAt: conversation.updatedAt.toISOString(),
    };
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
