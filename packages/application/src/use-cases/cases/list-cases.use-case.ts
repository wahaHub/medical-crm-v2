import type { ICaseRepository, CaseListQuery, IPatientRepository } from '@medical-crm/domain';
import type { PaginatedResult } from '@medical-crm/utils';
import { ForbiddenError } from '@medical-crm/utils';
import type { CaseDTO } from '../../dtos/case.dto.js';
import type { Actor } from '../../types/actor.js';
import { toCaseDTO } from '../../mappers/case.mapper.js';
import { getAdminPatientSiteScope } from '../../access/admin-patient-site-access.js';
import { withDefaultPatientEmailExclusions } from '../../access/patient-email-domain-exclusions.js';

export class ListCasesUseCase {
  constructor(
    private readonly caseRepo: ICaseRepository,
    private readonly patientRepo?: IPatientRepository,
  ) {}

  async execute(query: CaseListQuery, actor: Actor): Promise<PaginatedResult<CaseDTO>> {
    let hospitalId: string | undefined;
    if (actor.role === 'HOSPITAL') {
      if (!actor.hospitalId) throw new ForbiddenError('Hospital actor missing hospitalId');
      hospitalId = actor.hospitalId;
    }
    const patientSiteScope = getAdminPatientSiteScope(actor);
    const scopedQuery = withDefaultPatientEmailExclusions(
      patientSiteScope ? { ...query, patientSiteScope } : query,
    );
    const result = await this.caseRepo.findMany(scopedQuery, hospitalId);
    return {
      ...result,
      data: await this.mapCases(result.data),
    };
  }

  private async mapCases(entities: Awaited<ReturnType<ICaseRepository['findMany']>>['data']) {
    const patients = this.patientRepo?.findByIds
      ? await this.patientRepo.findByIds(entities.map((entity) => entity.patientId))
      : [];
    const patientById = new Map(patients.map((patient) => [patient.id, patient]));
    return entities.map((entity) => {
      const patient = patientById.get(entity.patientId);
      return toCaseDTO(entity, undefined, {
        email: patient?.email,
        phone: patient?.phone,
        country: patient?.country,
        patientSite: patient?.site,
      });
    });
  }
}
