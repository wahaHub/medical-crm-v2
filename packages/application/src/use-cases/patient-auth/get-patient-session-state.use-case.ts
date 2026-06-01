import type {
  IAiChatMessageRepository,
  IAiChatSessionRepository,
  ICaseRepository,
  ICHCRepository,
  IConversationRepository,
  IPatientRepository,
  PatientSite,
  IUserRepository,
} from '@medical-crm/domain';
import { AiChatSession, Conversation } from '@medical-crm/domain';
import { generateId } from '@medical-crm/utils';
import { asRecord, asNullableString, asNullableDate } from '../../utils/structured-data.js';
import type { MedicalFormStatus } from '../../utils/structured-data.js';
import type { JourneySnapshot } from '../../services/chatbot-v2/types.js';
import { resolvePrimaryJourneySnapshot } from '../../services/chatbot-v2/journey-snapshot-restore.service.js';

export interface PatientSessionState {
  id: string;
  patientId: string;
  name: string;
  email: string;
  phone: string | null;
  age: string | null;
  gender: string | null;
  country: string | null;
  whatsapp: string | null;
  messenger: string | null;
  department: string | null;
  departmentCode: string | null;
  disease: string | null;
  destination: string | null;
  treatmentTime: string | null;
  patientCode: string | null;
  preferredLanguage: string;
  caseId: string | null;
  nextStep: 'select-hospitals' | 'messages-ready';
  selectedHospitalId: string | null;
  selectedHospitalIds: string[];
  customHospitalRequest: string | null;
  medicalFormStatus: MedicalFormStatus;
  medicalFormSkippedAt: Date | null;
  medicalFormSubmittedAt: Date | null;
  medicalFormResponseId: string | null;
  profileSubmitted: true;
  chatUnlocked: true;
  widgetChatTarget: {
    kind: 'CHATBOT_SESSION';
    sessionId: string;
  };
  formalConversationState: {
    activeConversationId: string | null;
    conversationIds: string[];
    activeAssistantMode: 'AI_ACTIVE' | 'HUMAN_TAKEOVER' | null;
  };
  journeySnapshot: JourneySnapshot;
  chatbotOrchestrationState: {
    conversationSummary: string;
    processExplained: boolean;
  };
}

export class GetPatientSessionStateUseCase {
  constructor(
    private readonly patientRepo: IPatientRepository,
    private readonly userRepo: IUserRepository,
    private readonly caseRepo: ICaseRepository,
    private readonly chcRepo: ICHCRepository,
    private readonly conversationRepo: IConversationRepository,
    private readonly aiChatMessageRepo: IAiChatMessageRepository,
    private readonly aiChatSessionRepo: IAiChatSessionRepository,
  ) {}

  async execute(input: { patientId: string; site: PatientSite }): Promise<PatientSessionState> {
    const [patient, userProfile, cases] = await Promise.all([
      this.patientRepo.findById(input.patientId, input.site),
      this.userRepo.findById(input.patientId),
      this.caseRepo.findByPatientId(input.patientId),
    ]);

    if (!patient || !userProfile) {
      throw new Error('Patient not found');
    }

    const latestCase = [...cases].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
    const entryProfile = getEntryProfile(latestCase?.structuredData ?? null);
    const customHospitalRequest = getCustomHospitalRequest(latestCase?.structuredData ?? null);
    const medicalFormMetadata = getMedicalFormMetadata(latestCase?.structuredData ?? null);
    const chcs = latestCase ? await this.chcRepo.findByCaseId(latestCase.id) : [];
    const conversationState = latestCase
      ? await this.ensureAdminConversation(input.patientId, latestCase.id)
      : { activeConversationId: null, conversationIds: [], activeAssistantMode: null };
    const selectedHospitalIds = chcs
      .filter((contact) => !contact.removedAt)
      .map((contact) => contact.hospitalId);
    const widgetSessionId = `widget-chat:${patient.id}:${latestCase?.id ?? 'pending'}`;
    let aiChatSession = await this.aiChatSessionRepo.findBySessionId(widgetSessionId, input.site);
    if (!aiChatSession && latestCase) {
      aiChatSession = await this.aiChatSessionRepo.save(new AiChatSession({
        id: generateId(),
        sessionId: widgetSessionId,
        site: patient.site ?? 'china',
        sessionSecretHash: null,
        difyConversationId: null,
        patientId: patient.id,
        hospitalType: 'REGULAR',
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
    }
    const recentMessages = aiChatSession?.id
      ? await this.aiChatMessageRepo.listRecentBySession(aiChatSession.id, 12)
      : [];
    const selectedHospitalId = selectedHospitalIds.length === 1 ? selectedHospitalIds[0] ?? null : null;
    const nextStep = selectedHospitalIds.length > 0 ? 'messages-ready' : 'select-hospitals';
    const journeySnapshot = resolvePrimaryJourneySnapshot({
      statusSnapshot: aiChatSession?.statusSnapshot ?? null,
      recentMessages,
    });

    return {
      id: patient.id,
      patientId: patient.id,
      name: entryProfile?.name ?? latestCase?.patientName ?? userProfile.name,
      email: entryProfile?.email ?? userProfile.email,
      phone: entryProfile?.phone ?? userProfile.phone ?? null,
      age: entryProfile?.age ?? null,
      gender: entryProfile?.gender ?? null,
      country: entryProfile?.country ?? latestCase?.patientCountry ?? null,
      whatsapp: entryProfile?.whatsapp ?? null,
      messenger: entryProfile?.messenger ?? null,
      department: entryProfile?.department ?? null,
      departmentCode: entryProfile?.departmentCode ?? null,
      disease: entryProfile?.disease ?? null,
      destination: entryProfile?.destination ?? null,
      treatmentTime: entryProfile?.treatmentTime ?? null,
      patientCode: patient.patientCode,
      preferredLanguage: patient.preferredLanguage,
      caseId: latestCase?.id ?? null,
      nextStep,
      selectedHospitalId,
      selectedHospitalIds,
      customHospitalRequest,
      medicalFormStatus: medicalFormMetadata.medicalFormStatus,
      medicalFormSkippedAt: medicalFormMetadata.medicalFormSkippedAt,
      medicalFormSubmittedAt: medicalFormMetadata.medicalFormSubmittedAt,
      medicalFormResponseId: medicalFormMetadata.medicalFormResponseId,
      profileSubmitted: true,
      chatUnlocked: true,
      widgetChatTarget: {
        kind: 'CHATBOT_SESSION',
        sessionId: widgetSessionId,
      },
      formalConversationState: conversationState,
      journeySnapshot,
      chatbotOrchestrationState: {
        conversationSummary: aiChatSession?.statusSnapshot.conversationSummary ?? '',
        processExplained: aiChatSession?.statusSnapshot.processExplained === true,
      },
    };
  }

  private async ensureAdminConversation(
    patientId: string,
    caseId: string,
  ): Promise<{
    activeConversationId: string;
    conversationIds: string[];
    activeAssistantMode: 'AI_ACTIVE' | 'HUMAN_TAKEOVER';
  }> {
    const conversations = await this.conversationRepo.findByPatientId(patientId);
    const currentCaseConversations = conversations.filter((conversation) =>
      conversation.caseId === caseId
      && (conversation.category === 'ADMIN_PATIENT' || conversation.category === 'HOSPITAL_PATIENT'),
    );
    const existingAdminConversation = currentCaseConversations.find((conversation) =>
      conversation.caseId === caseId && conversation.category === 'ADMIN_PATIENT',
    );
    const hospitalConversationIds = currentCaseConversations
      .filter((conversation) => conversation.category === 'HOSPITAL_PATIENT')
      .filter((conversation) => Boolean(conversation.hospitalId))
      .map((conversation) => toHospitalSessionId(caseId, conversation.hospitalId));
    const caseAuthority = currentCaseConversations.some((conversation) => conversation.assistantMode === 'HUMAN_TAKEOVER')
      ? 'HUMAN_TAKEOVER'
      : 'AI_ACTIVE';

    if (existingAdminConversation) {
      return {
        activeConversationId: toCareTeamSessionId(patientId, caseId),
        conversationIds: [toCareTeamSessionId(patientId, caseId), ...hospitalConversationIds],
        activeAssistantMode: existingAdminConversation.assistantMode ?? caseAuthority,
      };
    }

    const now = new Date();
    const conversation = new Conversation({
      id: generateId(),
      caseId,
      hospitalId: null,
      category: 'ADMIN_PATIENT',
      assistantMode: caseAuthority,
      title: null,
      lastMessageId: null,
      lastMessageAt: null,
      lastMessagePreview: null,
      lastSenderId: null,
      createdAt: now,
      updatedAt: now,
    });
    const savedConversation = await this.conversationRepo.findOrCreateAdminPatientConversation(conversation);
    return {
      activeConversationId: toCareTeamSessionId(patientId, caseId),
      conversationIds: [toCareTeamSessionId(patientId, caseId), ...hospitalConversationIds],
      activeAssistantMode: savedConversation.assistantMode ?? caseAuthority,
    };
  }
}

function toCareTeamSessionId(patientId: string, caseId: string): string {
  return `widget-chat:${patientId}:${caseId}`;
}

function toHospitalSessionId(caseId: string, hospitalId: string | null): string {
  return `hospital:${hospitalId}:${caseId}`;
}

type EntryProfile = {
  name: string | null;
  email: string | null;
  phone: string | null;
  age: string | null;
  gender: string | null;
  country: string | null;
  whatsapp: string | null;
  messenger: string | null;
  department: string | null;
  departmentCode: string | null;
  disease: string | null;
  destination: string | null;
  treatmentTime: string | null;
};

function getEntryProfile(structuredData: Record<string, unknown> | null): EntryProfile | null {
  const entryProfile = asRecord(structuredData?.['entryProfile']);
  if (!entryProfile) {
    return null;
  }

  return {
    name: asNullableString(entryProfile['name']),
    email: asNullableString(entryProfile['email']),
    phone: asNullableString(entryProfile['phone']),
    age: asNullableString(entryProfile['age']),
    gender: asNullableString(entryProfile['gender']),
    country: asNullableString(entryProfile['country']),
    whatsapp: asNullableString(entryProfile['whatsapp']),
    messenger: asNullableString(entryProfile['messenger']),
    department: asNullableString(entryProfile['department']),
    departmentCode: asNullableString(entryProfile['departmentCode']),
    disease: asNullableString(entryProfile['disease']),
    destination: asNullableString(entryProfile['destination']),
    treatmentTime: asNullableString(entryProfile['treatmentTime']),
  };
}

function getCustomHospitalRequest(structuredData: Record<string, unknown> | null): string | null {
  const patientHospitalSelection = asRecord(structuredData?.['patientHospitalSelection']);
  return asNullableString(patientHospitalSelection?.['customHospitalRequest']);
}

type MedicalFormMetadata = {
  medicalFormStatus: MedicalFormStatus;
  medicalFormSkippedAt: Date | null;
  medicalFormSubmittedAt: Date | null;
  medicalFormResponseId: string | null;
};

function getMedicalFormMetadata(structuredData: Record<string, unknown> | null): MedicalFormMetadata {
  const patientHospitalSelection = asRecord(structuredData?.['patientHospitalSelection']);
  const rawStatus = patientHospitalSelection?.['medicalFormStatus'];
  const medicalFormStatus: MedicalFormStatus =
    rawStatus === 'SKIPPED' || rawStatus === 'SUBMITTED' ? rawStatus : 'NOT_STARTED';

  return {
    medicalFormStatus,
    medicalFormSkippedAt: asNullableDate(patientHospitalSelection?.['medicalFormSkippedAt']),
    medicalFormSubmittedAt: asNullableDate(patientHospitalSelection?.['medicalFormSubmittedAt']),
    medicalFormResponseId: asNullableString(patientHospitalSelection?.['medicalFormResponseId']),
  };
}
