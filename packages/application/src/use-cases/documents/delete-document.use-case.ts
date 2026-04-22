import type { ICaseRepository, IDocumentRepository, ICHCRepository } from '@medical-crm/domain';
import { NotFoundError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import { assertHospitalCaseAccess } from '../cases/hospital-case-access.js';

export class DeleteDocumentUseCase {
  constructor(
    private readonly documentRepo: IDocumentRepository,
    private readonly caseRepo: ICaseRepository,
    private readonly chcRepo?: ICHCRepository,
  ) {}

  async execute(caseId: string, docId: string, actor: Actor): Promise<void> {
    const caze = await this.caseRepo.findById(caseId);
    if (!caze) throw new NotFoundError(`Case ${caseId} not found`);
    if (actor.role === 'HOSPITAL') {
      await assertHospitalCaseAccess(caze, actor.hospitalId, this.chcRepo);
    }

    const doc = await this.documentRepo.findById(docId);
    if (!doc || doc.caseId !== caseId) {
      throw new NotFoundError(`Document ${docId} not found`);
    }

    await this.documentRepo.softDelete(docId);
  }
}
