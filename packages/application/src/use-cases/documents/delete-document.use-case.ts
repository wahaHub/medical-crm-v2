import type { ICaseRepository, IDocumentRepository } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';

export class DeleteDocumentUseCase {
  constructor(
    private readonly documentRepo: IDocumentRepository,
    private readonly caseRepo: ICaseRepository,
  ) {}

  async execute(caseId: string, docId: string, actor: Actor): Promise<void> {
    const caze = await this.caseRepo.findById(caseId);
    if (!caze) throw new NotFoundError(`Case ${caseId} not found`);
    if (actor.role === 'HOSPITAL' && caze.assignedHospitalId !== actor.hospitalId) {
      throw new ForbiddenError('Access denied to this case');
    }

    const doc = await this.documentRepo.findById(docId);
    if (!doc || doc.caseId !== caseId) {
      throw new NotFoundError(`Document ${docId} not found`);
    }

    await this.documentRepo.softDelete(docId);
  }
}
