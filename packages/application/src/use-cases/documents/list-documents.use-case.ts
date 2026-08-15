import type { ICaseRepository, IDocumentRepository, IStorageService, ICHCRepository } from '@medical-crm/domain';
import { NotFoundError } from '@medical-crm/utils';
import type { DocumentDTO } from '../../dtos/document.dto.js';
import type { Actor } from '../../types/actor.js';
import { toDocumentDTO } from '../../mappers/document.mapper.js';
import { assertHospitalCaseAccess } from '../cases/hospital-case-access.js';
import type { AdminPatientSiteAccessPolicy } from '../../access/admin-patient-site-access.js';

export class ListDocumentsUseCase {
  constructor(
    private readonly documentRepo: IDocumentRepository,
    private readonly caseRepo: ICaseRepository,
    private readonly storageService: IStorageService,
    private readonly chcRepo?: ICHCRepository,
    private readonly adminAccess?: AdminPatientSiteAccessPolicy,
  ) {}

  async execute(caseId: string, actor: Actor): Promise<DocumentDTO[]> {
    const caze = await this.caseRepo.findById(caseId);
    if (!caze) throw new NotFoundError(`Case ${caseId} not found`);
    await this.adminAccess?.assertStaffCaseNotExcludedByPatientEmail(actor, caze);
    if (actor.role === 'HOSPITAL') {
      await assertHospitalCaseAccess(caze, actor.hospitalId, this.chcRepo);
    } else {
      await this.adminAccess?.assertActorCanAccessCaseEntity(actor, caze);
    }

    const docs = await this.documentRepo.findByCaseId(caseId);
    if (docs.length === 0) return [];

    const keys = docs.map((d) => d.storageKey);
    const signedUrls = await this.storageService.getSignedUrls(keys);
    return docs.map((d) => toDocumentDTO(d, signedUrls[d.storageKey] ?? ''));
  }
}
