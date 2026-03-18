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
      const messageCounts = await Promise.all(
        conversations.data.map((conv) =>
          this.messageRepo.findByConversationId(conv.id, { page: 1, limit: 1 }),
        ),
      );
      totalMessages = messageCounts.reduce((sum, result) => sum + result.total, 0);
    }

    const storageKeys = documents.map((d) => d.storageKey);
    const signedUrls = storageKeys.length > 0
      ? await this.storageService.getSignedUrls(storageKeys)
      : {};

    return toHospitalCaseDetailDTO(entity, progress, documents, signedUrls, {
      id: entity.patientId,
      code: patientInfo?.patientCode ?? '',
      age: null,
      gender: null,
    }, totalMessages);
  }
}
