import type {
  AiChatMessage,
  AiChatSession,
  Attachment,
  IAiChatMessageRepository,
  IAiChatSessionRepository,
  IConversationRepository,
  IHospitalRepository,
  IMessageRepository,
  IStorageService,
  PatientSite,
} from '@medical-crm/domain';
import { NotFoundError } from '@medical-crm/utils';
import { toMessageAttachmentDTO } from '../../mappers/conversation.mapper.js';
import type {
  PatientSessionDetailDTO,
  PatientSessionMessageDTO,
} from '../../dtos/patient-conversation.dto.js';
import { resolvePatientChatState } from '../patient-chat/patient-chat-actions.js';

export interface GetPatientSessionDetailInput {
  patientId: string;
  sessionId: string;
  site: PatientSite;
  limit?: number;
  locale?: 'en' | 'zh';
}

function sortSessionMessages(
  left: PatientSessionMessageDTO,
  right: PatientSessionMessageDTO,
): number {
  const leftTime = new Date(left.createdAt).getTime();
  const rightTime = new Date(right.createdAt).getTime();
  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }
  return left.id.localeCompare(right.id);
}

export class GetPatientSessionDetailUseCase {
  constructor(
    private readonly conversationRepo: IConversationRepository,
    private readonly messageRepo: IMessageRepository,
    private readonly aiChatSessionRepo: IAiChatSessionRepository,
    private readonly aiChatMessageRepo: IAiChatMessageRepository,
    private readonly storageService: IStorageService,
    private readonly hospitalRepo?: IHospitalRepository,
  ) {}

  async execute(input: GetPatientSessionDetailInput): Promise<PatientSessionDetailDTO> {
    if (input.sessionId.startsWith('widget-chat:')) {
      return this.getCareTeamSessionDetail(input);
    }

    if (input.sessionId.startsWith('hospital:')) {
      return this.getHospitalSessionDetail(input);
    }

    throw new NotFoundError(`Patient session ${input.sessionId} not found`);
  }

  private async getCareTeamSessionDetail(
    input: GetPatientSessionDetailInput,
  ): Promise<PatientSessionDetailDTO> {
    const caseId = this.parseCareTeamCaseId(input.sessionId);
    const conversations = await this.conversationRepo.findByPatientId(input.patientId);
    const adminConversation = conversations.find((conversation) =>
      conversation.category === 'ADMIN_PATIENT' && conversation.caseId === caseId,
    ) ?? null;
    const aiSession = await this.aiChatSessionRepo.findBySessionId(input.sessionId, input.site);

    if (!adminConversation && !aiSession) {
      throw new NotFoundError(`Patient session ${input.sessionId} not found`);
    }

    const limit = input.limit ?? 100;
    const formalMessages = adminConversation
      ? await this.messageRepo.findByConversationId(adminConversation.id, { page: 1, limit })
      : {
          data: [],
          total: 0,
          page: 1,
          limit,
          totalPages: 1,
          hasMore: false,
        };
    const chatbotMessages = aiSession
      ? await this.aiChatMessageRepo.listBySession(aiSession.id, limit)
      : [];
    const signedUrls = await this.getSignedUrls([
      ...formalMessages.data.flatMap((message) => message.attachments),
      ...chatbotMessages.flatMap((message) => this.extractChatbotAttachments(message)),
    ]);
    const mergedMessages = [
      ...formalMessages.data.map((message) =>
        this.toFormalSessionMessage(input.sessionId, message, signedUrls),
      ),
      ...chatbotMessages.map((message) =>
        this.toChatbotSessionMessage(input.sessionId, message, signedUrls),
      ),
    ].sort(sortSessionMessages);

    return {
      sessionId: input.sessionId,
      caseId,
      type: 'CARE_TEAM',
      title: 'Medora Care Team',
      hospitalId: null,
      hospitalName: null,
      isAiAvailable: adminConversation?.assistantMode === 'AI_ACTIVE',
      chatState: resolvePatientChatState({
        sessionType: 'CARE_TEAM',
        assistantMode: adminConversation?.assistantMode ?? null,
        locale: input.locale,
        isWidgetSession: true,
        mechanicalFlowEnabled: true,
        automationMode: aiSession?.automationMode ?? null,
        processGuideConfirmed: aiSession?.statusSnapshot.processExplained === true,
        questionnaireSubmitted: isQuestionnaireSubmitted(aiSession),
        advisorRequested: adminConversation?.assistantMode === 'HUMAN_TAKEOVER' || aiSession?.automationMode === 'human',
        medicalRecordsUploaded: hasUploadedMedicalRecords(formalMessages.data, aiSession),
      }),
      chatAuthority: adminConversation?.assistantMode ?? null,
      data: mergedMessages,
      total: mergedMessages.length,
      page: 1,
      limit,
      totalPages: 1,
      hasMore: false,
    };
  }

  private async getHospitalSessionDetail(
    input: GetPatientSessionDetailInput,
  ): Promise<PatientSessionDetailDTO> {
    const { hospitalId, caseId } = this.parseHospitalSession(input.sessionId);
    const conversations = await this.conversationRepo.findByPatientId(input.patientId);
    const hospitalConversation = conversations.find((conversation) =>
      conversation.category === 'HOSPITAL_PATIENT'
      && conversation.caseId === caseId
      && conversation.hospitalId === hospitalId,
    ) ?? null;

    if (!hospitalConversation) {
      throw new NotFoundError(`Patient session ${input.sessionId} not found`);
    }

    const adminConversation = conversations.find((conversation) =>
      conversation.category === 'ADMIN_PATIENT' && conversation.caseId === caseId,
    ) ?? null;
    const limit = input.limit ?? 100;
    const formalMessages = await this.messageRepo.findByConversationId(hospitalConversation.id, { page: 1, limit });
    const signedUrls = await this.getSignedUrls(
      formalMessages.data.flatMap((message) => message.attachments),
    );
    const hospitalName = hospitalId && this.hospitalRepo
      ? (await this.hospitalRepo.findById(hospitalId))?.name ?? null
      : null;

    return {
      sessionId: input.sessionId,
      caseId,
      type: 'HOSPITAL',
      title: hospitalName ?? 'Hospital',
      hospitalId,
      hospitalName,
      isAiAvailable: false,
      chatState: resolvePatientChatState({
        sessionType: 'HOSPITAL',
        assistantMode: adminConversation?.assistantMode ?? null,
        locale: input.locale,
        isWidgetSession: false,
        mechanicalFlowEnabled: false,
        automationMode: null,
        processGuideConfirmed: false,
        questionnaireSubmitted: false,
        advisorRequested: true,
        medicalRecordsUploaded: false,
      }),
      chatAuthority: adminConversation?.assistantMode ?? null,
      data: formalMessages.data.map((message) =>
        this.toFormalSessionMessage(input.sessionId, message, signedUrls),
      ),
      total: formalMessages.total,
      page: formalMessages.page,
      limit: formalMessages.limit,
      totalPages: formalMessages.totalPages,
      hasMore: formalMessages.hasMore,
    };
  }

  private parseCareTeamCaseId(sessionId: string): string {
    const [, , ...rest] = sessionId.split(':');
    const caseId = rest.join(':').trim();
    if (!caseId) {
      throw new NotFoundError(`Patient session ${sessionId} not found`);
    }
    return caseId;
  }

  private parseHospitalSession(sessionId: string): { hospitalId: string; caseId: string } {
    const [, hospitalId, ...rest] = sessionId.split(':');
    const caseId = rest.join(':').trim();
    if (!hospitalId || !caseId) {
      throw new NotFoundError(`Patient session ${sessionId} not found`);
    }
    return { hospitalId, caseId };
  }

  private async getSignedUrls(attachments: Attachment[]): Promise<Record<string, string>> {
    const attachmentKeys = attachments
      .map((attachment) => attachment.storageKey)
      .filter((storageKey) =>
        storageKey &&
        !storageKey.startsWith('http://') &&
        !storageKey.startsWith('https://') &&
        !storageKey.startsWith('data:'),
      );

    if (attachmentKeys.length === 0) {
      return {};
    }

    try {
      return await this.storageService.getSignedUrls(Array.from(new Set(attachmentKeys)));
    } catch (error) {
      console.warn('[GetPatientSessionDetailUseCase] Failed to sign attachment URLs:', error);
      return {};
    }
  }

  private toFormalSessionMessage(
    sessionId: string,
    message: Awaited<ReturnType<IMessageRepository['findByConversationId']>>['data'][number],
    signedUrls: Record<string, string>,
  ): PatientSessionMessageDTO {
    return {
      id: message.id,
      sessionId,
      clientMessageId: message.clientMessageId,
      source: 'FORMAL',
      conversationId: message.conversationId,
      senderRole: message.senderRole,
      senderName: message.senderName,
      content: message.content,
      messageType: message.messageType,
      moderationStatus: message.moderationStatus,
      attachments: message.attachments.map((attachment) => toMessageAttachmentDTO(attachment, signedUrls)),
      metadata: message.metadata,
      deliveryStatus: message.deliveryStatus,
      createdAt: message.createdAt.toISOString(),
    };
  }

  private toChatbotSessionMessage(
    sessionId: string,
    message: AiChatMessage,
    signedUrls: Record<string, string>,
  ): PatientSessionMessageDTO {
    return {
      id: message.id,
      sessionId,
      source: 'CHATBOT',
      conversationId: null,
      senderRole: message.role === 'USER'
        ? 'PATIENT'
        : message.role === 'ASSISTANT'
          ? 'AI'
          : 'SYSTEM',
      senderName: message.role === 'ASSISTANT' ? 'Medora AI' : null,
      content: message.content,
      messageType: message.role === 'SYSTEM' ? 'SYSTEM' : 'TEXT',
      moderationStatus: null,
      attachments: this.extractChatbotAttachments(message).map((attachment) =>
        toMessageAttachmentDTO(attachment, signedUrls),
      ),
      citations: message.citations as Array<Record<string, unknown>>,
      metadata: message.metadata,
      deliveryStatus: null,
      createdAt: message.createdAt.toISOString(),
    };
  }

  private extractChatbotAttachments(message: AiChatMessage): Attachment[] {
    if (message.role !== 'USER') {
      return [];
    }

    const rawAttachments = Array.isArray(message.metadata.attachments)
      ? message.metadata.attachments
      : [];

    return rawAttachments.flatMap((attachment) => {
      if (!attachment || typeof attachment !== 'object') {
        return [];
      }

      const candidate = attachment as Record<string, unknown>;
      const fileName = typeof candidate.fileName === 'string' ? candidate.fileName : null;
      const mimeType = typeof candidate.mimeType === 'string' ? candidate.mimeType : null;
      const storageKey = typeof candidate.storageKey === 'string' ? candidate.storageKey : null;
      const fileSize = typeof candidate.fileSize === 'number'
        ? candidate.fileSize
        : (typeof candidate.size === 'number' ? candidate.size : null);

      if (!fileName || !mimeType || !storageKey || typeof fileSize !== 'number') {
        return [];
      }

      return [{
        fileName,
        mimeType,
        fileSize,
        storageKey,
      }];
    });
  }
}

function hasUploadedMedicalRecords(
  formalMessages: Awaited<ReturnType<IMessageRepository['findByConversationId']>>['data'],
  aiSession: AiChatSession | null,
): boolean {
  if (formalMessages.some((message) =>
    message.messageType === 'FILE'
    && message.attachments.length > 0
    && message.deliveryStatus !== 'uploading'
    && message.deliveryStatus !== 'pending'
    && message.deliveryStatus !== 'failed'
  )) {
    return true;
  }

  return (aiSession?.statusSnapshot.supportingDocuments.length ?? 0) > 0;
}

function isQuestionnaireSubmitted(aiSession: AiChatSession | null): boolean {
  const formStatus = aiSession?.statusSnapshot.formStatus?.toLowerCase();
  return formStatus === 'completed' || formStatus === 'complete' || formStatus === 'submitted';
}
