import type {
  ICaseRepository,
  ICaseProgressRepository,
  IDocumentRepository,
  IStorageService,
  IPatientRepository,
  IConversationRepository,
  IMessageRepository,
} from '@medical-crm/domain';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { HospitalCaseDetailDTO } from '../../dtos/case.dto.js';
import type { Actor } from '../../types/actor.js';
import { toHospitalCaseDetailDTO } from '../../mappers/case.mapper.js';

type BatchedMessageCountRepository = IMessageRepository & {
  countByConversationIds?: (conversationIds: string[]) => Promise<Record<string, number>>;
};

export class GetHospitalCaseDetailUseCase {
  constructor(
    private readonly caseRepo: ICaseRepository,
    private readonly progressRepo: ICaseProgressRepository,
    private readonly documentRepo: IDocumentRepository,
    private readonly storageService: IStorageService,
    private readonly patientRepo: IPatientRepository,
    private readonly conversationRepo: IConversationRepository,
    private readonly messageRepo: IMessageRepository,
  ) {}

  async execute(caseId: string, actor: Actor): Promise<HospitalCaseDetailDTO> {
    const entity = await this.caseRepo.findById(caseId);
    if (!entity) throw new NotFoundError(`Case ${caseId} not found`);

    if (actor.role === 'HOSPITAL' && entity.assignedHospitalId !== actor.hospitalId) {
      throw new ForbiddenError('Access denied to this case');
    }

    const [progress, documents, patientInfo, conversations] = await Promise.all([
      this.progressRepo.findByCaseId(caseId),
      this.documentRepo.findByCaseId(caseId),
      this.patientRepo.findById(entity.patientId),
      this.conversationRepo.findMany(
        { page: 1, limit: 100, caseId },
        actor.role === 'HOSPITAL' ? (actor.hospitalId ?? undefined) : undefined,
      ),
    ]);

    // Compute total messages across all conversations for this case
    let totalMessages = 0;
    if (conversations.data.length > 0) {
      const conversationIds = conversations.data.map((conversation) => conversation.id);
      const batchedMessageRepo = this.messageRepo as BatchedMessageCountRepository;

      if (typeof batchedMessageRepo.countByConversationIds === 'function') {
        const countsByConversationId = await batchedMessageRepo.countByConversationIds(conversationIds);
        totalMessages = Object.values(countsByConversationId)
          .reduce((sum, count) => sum + count, 0);
      } else {
        const messageCounts = await Promise.all(
          conversationIds.map((conversationId) =>
            this.messageRepo.findByConversationId(conversationId, { page: 1, limit: 1 }),
          ),
        );
        totalMessages = messageCounts.reduce((sum, result) => sum + result.total, 0);
      }
    }

    const storageKeys = documents.map((d) => d.storageKey);
    let signedUrls: Record<string, string> = {};
    if (storageKeys.length > 0) {
      try {
        signedUrls = await this.storageService.getSignedUrls(storageKeys);
      } catch (error) {
        console.warn('[GetHospitalCaseDetailUseCase] Failed to sign document URLs:', error);
      }
    }

    return toHospitalCaseDetailDTO(entity, progress, documents, signedUrls, {
      id: entity.patientId,
      code: patientInfo?.patientCode ?? '',
      preferredLanguage: patientInfo?.preferredLanguage,
      age: null,
      gender: null,
    }, totalMessages);
  }
}
