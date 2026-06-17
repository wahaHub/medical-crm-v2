import type { ICHCRepository, ICaseRepository, IHospitalRepository, IUserRepository } from '@medical-crm/domain';
import { CaseHospitalContact } from '@medical-crm/domain';
import { generateId, ForbiddenError, ConflictError, NotFoundError, ValidationError } from '@medical-crm/utils';
import type { CaseHospitalContactDTO } from '../../dtos/case-hospital-contact.dto.js';
import type { Actor } from '../../types/actor.js';
import { toCaseHospitalContactDTO } from '../../mappers/case-hospital-contact.mapper.js';
import { deriveHospitalTypeFromPatientSite } from '../../utils/hospital-type.js';
import type { AdminPatientSiteAccessPolicy } from '../../access/admin-patient-site-access.js';

export class AddHospitalToCaseUseCase {
  constructor(
    private readonly chcRepo: ICHCRepository,
    private readonly caseRepo: ICaseRepository,
    private readonly hospitalRepo: IHospitalRepository,
    private readonly userRepo: IUserRepository,
    private readonly adminAccess?: AdminPatientSiteAccessPolicy,
  ) {}

  async execute(caseId: string, hospitalId: string, actor: Actor): Promise<CaseHospitalContactDTO> {
    if (actor.role !== 'ADMIN') throw new ForbiddenError('Only admins can add hospitals to cases');

    const [caseEntity, hospital] = await Promise.all([
      this.caseRepo.findById(caseId),
      this.hospitalRepo.findById(hospitalId),
    ]);
    if (!caseEntity) throw new NotFoundError(`Case ${caseId} not found`);
    if (!hospital) throw new NotFoundError(`Hospital ${hospitalId} not found`);
    await this.adminAccess?.assertActorCanAccessCaseEntity(actor, caseEntity);
    if (hospital.status !== 'ACTIVE') {
      throw new ValidationError('Only active hospitals can be added to cases');
    }

    const patient = await this.userRepo.findById(caseEntity.patientId);
    const caseHospitalType = deriveHospitalTypeFromPatientSite(patient?.patientSite);
    if (!caseHospitalType) {
      throw new ValidationError('Case patient site is missing, so hospital type cannot be determined');
    }
    if (hospital.type !== caseHospitalType) {
      throw new ValidationError(`Hospital type mismatch: expected ${caseHospitalType}, got ${hospital.type}`);
    }

    const existing = await this.chcRepo.findByCaseAndHospital(caseId, hospitalId);
    if (existing && !existing.removedAt) throw new ConflictError('Hospital already added to this case');

    if (existing?.removedAt) {
      const now = new Date();
      existing.subStatus = 'DISTRIBUTED';
      existing.selectedByPatientAt = null;
      existing.distributedAt = now;
      existing.firstReplyAt = null;
      existing.quoteId = null;
      existing.patientViewedQuoteAt = null;
      existing.patientAcceptedAt = null;
      existing.patientRejectedAt = null;
      existing.reminderSentAt = null;
      existing.removedAt = null;
      existing.removedReason = null;
      existing.updatedAt = now;

      const restored = await this.chcRepo.save(existing);
      return toCaseHospitalContactDTO(restored);
    }

    const entity = new CaseHospitalContact({
      id: generateId(),
      caseId,
      hospitalId,
      subStatus: 'DISTRIBUTED',
      selectedByPatientAt: null,
      distributedAt: new Date(),
      firstReplyAt: null,
      quoteId: null,
      patientViewedQuoteAt: null,
      patientAcceptedAt: null,
      patientRejectedAt: null,
      reminderSentAt: null,
      removedAt: null,
      removedReason: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const saved = await this.chcRepo.save(entity);
    return toCaseHospitalContactDTO(saved);
  }
}
