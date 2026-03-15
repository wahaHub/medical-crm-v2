import type { ICaseRepository, IDocumentRepository, IStorageService } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { DocumentDTO } from '../../dtos/document.dto.js';
import type { Actor } from '../../types/actor.js';
import { toDocumentDTO } from '../../mappers/document.mapper.js';

export class ListDocumentsUseCase {
  constructor(
    private readonly documentRepo: IDocumentRepository,
    private readonly caseRepo: ICaseRepository,
    private readonly storageService: IStorageService,
  ) {}

  async execute(caseId: string, actor: Actor): Promise<DocumentDTO[]> {
    const caze = await this.caseRepo.findById(caseId);
    if (!caze) throw new NotFoundError(`Case ${caseId} not found`);
    if (actor.role === 'HOSPITAL' && caze.assignedHospitalId !== actor.hospitalId) {
      throw new ForbiddenError('Access denied to this case');
    }

    const docs = await this.documentRepo.findByCaseId(caseId);
    if (docs.length === 0) return [];

    const keys = docs.map((d) => d.storageKey);
    const signedUrls = await this.storageService.getSignedUrls(keys);
    return docs.map((d) => toDocumentDTO(d, signedUrls[d.storageKey] ?? ''));
  }
}
