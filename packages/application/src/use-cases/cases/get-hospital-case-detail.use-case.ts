import type {
  ICaseRepository,
  ICaseProgressRepository,
  IDocumentRepository,
  IStorageService,
  IPatientRepository,
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
  ) {}

  async execute(caseId: string, actor: Actor): Promise<HospitalCaseDetailDTO> {
    const entity = await this.caseRepo.findById(caseId);
    if (!entity) throw new NotFoundError(`Case ${caseId} not found`);

    if (actor.role === 'HOSPITAL' && entity.assignedHospitalId !== actor.hospitalId) {
      throw new ForbiddenError('Access denied to this case');
    }

    const [progress, documents, patientInfo] = await Promise.all([
      this.progressRepo.findByCaseId(caseId),
      this.documentRepo.findByCaseId(caseId),
      this.patientRepo.findById(entity.patientId),
    ]);

    const storageKeys = documents.map((d) => d.storageKey);
    const signedUrls = storageKeys.length > 0
      ? await this.storageService.getSignedUrls(storageKeys)
      : {};

    return toHospitalCaseDetailDTO(entity, progress, documents, signedUrls, {
      id: entity.patientId,
      code: patientInfo?.patientCode ?? '',
      age: null,
      gender: null,
    });
  }
}
