import type { ICaseRepository, IUserRepository, IHospitalRepository, ICHCRepository } from '@medical-crm/domain';
import { NotFoundError } from '@medical-crm/utils';
import type { CaseDTO } from '../../dtos/case.dto.js';
import type { Actor } from '../../types/actor.js';
import { toCaseDTO } from '../../mappers/case.mapper.js';
import { assertHospitalCaseAccess } from './hospital-case-access.js';
import type { AdminPatientSiteAccessPolicy } from '../../access/admin-patient-site-access.js';

export class GetCaseUseCase {
  constructor(
    private readonly caseRepo: ICaseRepository,
    private readonly userRepo?: IUserRepository,
    private readonly hospitalRepo?: IHospitalRepository,
    private readonly chcRepo?: ICHCRepository,
    private readonly adminAccess?: AdminPatientSiteAccessPolicy,
  ) {}

  async execute(caseId: string, actor: Actor): Promise<CaseDTO> {
    const entity = await this.caseRepo.findById(caseId);
    if (!entity) {
      throw new NotFoundError(`Case ${caseId} not found`);
    }
    if (actor.role === 'HOSPITAL') {
      await assertHospitalCaseAccess(entity, actor.hospitalId, this.chcRepo);
    } else {
      await this.adminAccess?.assertActorCanAccessCaseEntity(actor, entity);
    }
    await this.adminAccess?.assertStaffCaseNotExcludedByPatientEmail(actor, entity);

    // Look up hospital name
    let hospitalName: string | undefined;
    if (entity.assignedHospitalId && this.hospitalRepo) {
      try {
        const hospital = await this.hospitalRepo.findById(entity.assignedHospitalId);
        hospitalName = hospital?.name;
      } catch (error) {
        if (error instanceof NotFoundError) throw error;
        /* ignore */
      }
    }

    // Look up patient contact info
  let patientContact: {
    email?: string | null;
    phone?: string | null;
    patientSite?: 'beauty' | 'china' | null;
    } | undefined;
    if (this.userRepo) {
      try {
        const patient = await this.userRepo.findById(entity.patientId);
        if (patient) {
          patientContact = {
            email: patient.email,
            phone: patient.phone,
            patientSite: patient.patientSite ?? null,
          };
        }
      } catch { /* ignore */ }
    }

    return toCaseDTO(entity, hospitalName, patientContact);
  }
}
