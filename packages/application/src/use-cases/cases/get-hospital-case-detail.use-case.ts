import type {
  Attachment,
  Conversation,
  Document,
  ICaseRepository,
  ICaseProgressRepository,
  IDocumentRepository,
  IStorageService,
  IPatientRepository,
  IConversationRepository,
  IMessageRepository,
  ICHCRepository,
  Message,
} from '@medical-crm/domain';
import { NotFoundError } from '@medical-crm/utils';
import type {
  HospitalCaseDetailDTO,
  HospitalCaseMessageSectionDTO,
} from '../../dtos/case.dto.js';
import type { DocumentWithUrlDTO } from '../../dtos/document.dto.js';
import type { Actor } from '../../types/actor.js';
import { toHospitalCaseDetailDTO } from '../../mappers/case.mapper.js';
import { toDocumentDTO } from '../../mappers/document.mapper.js';
import { toMessageDTO } from '../../mappers/conversation.mapper.js';
import { assertHospitalCaseAccess } from './hospital-case-access.js';
import { isDefaultExcludedPatientEmail } from '../../access/patient-email-domain-exclusions.js';

const MESSAGE_PAGE_LIMIT = 100;

const SECTION_CONFIG: Array<{
  id: HospitalCaseMessageSectionDTO['id'];
  title: string;
  conversationCategory: HospitalCaseMessageSectionDTO['conversationCategory'];
}> = [
  {
    id: 'admin-patient',
    title: 'Admin / AI & Patient',
    conversationCategory: 'ADMIN_PATIENT',
  },
  {
    id: 'hospital-patient',
    title: 'Hospital & Patient',
    conversationCategory: 'HOSPITAL_PATIENT',
  },
];

export class GetHospitalCaseDetailUseCase {
  constructor(
    private readonly caseRepo: ICaseRepository,
    private readonly progressRepo: ICaseProgressRepository,
    private readonly documentRepo: IDocumentRepository,
    private readonly storageService: IStorageService,
    private readonly patientRepo: IPatientRepository,
    private readonly conversationRepo: IConversationRepository,
    private readonly messageRepo: IMessageRepository,
    private readonly chcRepo?: ICHCRepository,
  ) {}

  async execute(caseId: string, actor: Actor): Promise<HospitalCaseDetailDTO> {
    const entity = await this.caseRepo.findById(caseId);
    if (!entity) throw new NotFoundError(`Case ${caseId} not found`);

    if (actor.role === 'HOSPITAL') {
      await assertHospitalCaseAccess(entity, actor.hospitalId, this.chcRepo);
    }

    const [progress, documents, patientInfo, scopedConversations, adminPatientConversation] = await Promise.all([
      this.progressRepo.findByCaseId(caseId),
      this.documentRepo.findByCaseId(caseId),
      this.patientRepo.findById(entity.patientId),
      this.conversationRepo.findMany(
        { page: 1, limit: 100, caseId },
        actor.role === 'HOSPITAL' ? (actor.hospitalId ?? undefined) : undefined,
      ),
      this.conversationRepo.findAdminPatientByCaseId?.(caseId) ?? Promise.resolve(null),
    ]);

    if (isDefaultExcludedPatientEmail(patientInfo?.email)) {
      throw new NotFoundError(`Case ${caseId} not found`);
    }

    const sectionConversationMap: Record<HospitalCaseMessageSectionDTO['id'], Conversation | null> = {
      'admin-patient': adminPatientConversation?.category === 'ADMIN_PATIENT'
        ? adminPatientConversation
        : null,
      'hospital-patient': scopedConversations.data.find(
        (conversation) => conversation.category === 'HOSPITAL_PATIENT',
      ) ?? null,
    };

    const sectionMessages = await Promise.all(
      SECTION_CONFIG.map(async (section) => ({
        ...section,
        conversation: sectionConversationMap[section.id],
        messages: sectionConversationMap[section.id]
          ? await this.listAllMessages(sectionConversationMap[section.id]!.id)
          : [],
      })),
    );

    const signedUrls = await this.signStorageKeys([
      ...documents.map((document) => document.storageKey),
      ...sectionMessages.flatMap((section) =>
        section.messages.flatMap((message) =>
          message.attachments.map((attachment) => attachment.storageKey),
        ),
      ),
    ]);

    const messageSections = sectionMessages.map((section): HospitalCaseMessageSectionDTO => ({
      id: section.id,
      title: section.title,
      conversationCategory: section.conversationCategory,
      conversationId: section.conversation?.id ?? null,
      messages: section.messages.map((message) => toMessageDTO(message, signedUrls)),
      totalMessages: section.messages.length,
    }));

    const mergedDocuments = this.mergeCaseDocumentsWithMessageAttachments(
      documents,
      sectionMessages.flatMap((section) => section.messages),
      signedUrls,
      entity.patientLanguage,
    );

    const totalMessages = messageSections.reduce((sum, section) => sum + section.totalMessages, 0);

    return toHospitalCaseDetailDTO(
      entity,
      progress,
      mergedDocuments,
      {
        id: entity.patientId,
        code: patientInfo?.patientCode ?? '',
        preferredLanguage: patientInfo?.preferredLanguage,
        site: patientInfo?.site ?? null,
        age: null,
        gender: null,
      },
      messageSections,
      totalMessages,
    );
  }

  private async listAllMessages(conversationId: string): Promise<Message[]> {
    const messages: Message[] = [];
    let page = 1;

    while (true) {
      const result = await this.messageRepo.findByConversationId(
        conversationId,
        { page, limit: MESSAGE_PAGE_LIMIT },
      );
      messages.push(...result.data);

      if (!result.hasMore) {
        break;
      }

      page += 1;
    }

    return messages;
  }

  private async signStorageKeys(storageKeys: string[]): Promise<Record<string, string>> {
    const uniqueKeys = Array.from(new Set(
      storageKeys.filter((storageKey) =>
        storageKey
        && !storageKey.startsWith('http://')
        && !storageKey.startsWith('https://')
        && !storageKey.startsWith('data:'),
      ),
    ));

    if (uniqueKeys.length === 0) {
      return {};
    }

    try {
      return await this.storageService.getSignedUrls(uniqueKeys);
    } catch (error) {
      console.warn('[GetHospitalCaseDetailUseCase] Failed to sign document URLs:', error);
      return {};
    }
  }

  private mergeCaseDocumentsWithMessageAttachments(
    documents: Document[],
    messages: Message[],
    signedUrls: Record<string, string>,
    fallbackLanguage: string,
  ): DocumentWithUrlDTO[] {
    const mergedDocuments = documents.map((document) =>
      toDocumentDTO(document, signedUrls[document.storageKey] ?? ''),
    );
    const seenAttachmentIdentifiers = new Set(documents.map((document) => document.storageKey));

    for (const message of messages) {
      message.attachments.forEach((attachment, index) => {
        const downloadUrl = this.resolveAttachmentUrl(attachment, signedUrls);
        const attachmentIdentifier = attachment.storageKey;
        if (seenAttachmentIdentifiers.has(attachmentIdentifier)) {
          return;
        }

        mergedDocuments.push({
          id: `message-attachment:${message.id}:${index}`,
          fileName: attachment.fileName,
          fileSize: attachment.fileSize,
          mimeType: attachment.mimeType,
          documentType: 'MESSAGE_ATTACHMENT',
          sensitivity: 'PHI_HIGH',
          language: message.originalLanguage ?? fallbackLanguage,
          isTranslated: false,
          stageTag: null,
          downloadUrl,
          createdAt: message.createdAt.toISOString(),
        });

        seenAttachmentIdentifiers.add(attachmentIdentifier);
      });
    }

    return mergedDocuments;
  }

  private resolveAttachmentUrl(
    attachment: Attachment,
    signedUrls: Record<string, string>,
  ): string {
    if (
      attachment.storageKey.startsWith('http://')
      || attachment.storageKey.startsWith('https://')
      || attachment.storageKey.startsWith('data:')
    ) {
      return attachment.storageKey;
    }

    return signedUrls[attachment.storageKey] ?? '';
  }
}
