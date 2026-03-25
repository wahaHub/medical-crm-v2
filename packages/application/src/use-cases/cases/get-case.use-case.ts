import type { ICaseRepository, IUserRepository, IHospitalRepository } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { CaseDTO } from '../../dtos/case.dto.js';
import type { Actor } from '../../types/actor.js';
import { toCaseDTO } from '../../mappers/case.mapper.js';

export class GetCaseUseCase {
  constructor(
    private readonly caseRepo: ICaseRepository,
    private readonly userRepo?: IUserRepository,
    private readonly hospitalRepo?: IHospitalRepository,
  ) {}

  async execute(caseId: string, actor: Actor): Promise<CaseDTO> {
    const entity = await this.caseRepo.findById(caseId);
    if (!entity) {
      throw new NotFoundError(`Case ${caseId} not found`);
    }
    if (actor.role === 'HOSPITAL' && entity.assignedHospitalId !== actor.hospitalId) {
      throw new ForbiddenError('Access denied to this case');
    }

    // Look up hospital name
    let hospitalName: string | undefined;
    if (entity.assignedHospitalId && this.hospitalRepo) {
      try {
        const hospital = await this.hospitalRepo.findById(entity.assignedHospitalId);
        hospitalName = hospital?.name;
      } catch { /* ignore */ }
    }

    // Look up patient contact info
    let patientContact: { email?: string | null; phone?: string | null } | undefined;
    if (this.userRepo) {
      try {
        const patient = await this.userRepo.findById(entity.patientId);
        if (patient) {
          patientContact = { email: patient.email, phone: patient.phone };
        }
      } catch { /* ignore */ }
    }

    return toCaseDTO(entity, hospitalName, patientContact);
  }
}
