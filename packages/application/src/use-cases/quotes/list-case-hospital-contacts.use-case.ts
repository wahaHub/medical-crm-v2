import type { ICHCRepository, ICaseRepository, CHCListQuery } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { CaseHospitalContactDTO } from '../../dtos/case-hospital-contact.dto.js';
import type { Actor } from '../../types/actor.js';
import { toCaseHospitalContactDTO } from '../../mappers/case-hospital-contact.mapper.js';
import type { AdminPatientSiteAccessPolicy } from '../../access/admin-patient-site-access.js';
import { withDefaultPatientEmailExclusions } from '../../access/patient-email-domain-exclusions.js';

export class ListCaseHospitalContactsUseCase {
  constructor(
    private readonly chcRepo: ICHCRepository,
    private readonly caseRepo?: ICaseRepository,
    private readonly adminAccess?: AdminPatientSiteAccessPolicy,
  ) {}

  async execute(
    query: CHCListQuery,
    actor: Actor,
  ): Promise<{ data: CaseHospitalContactDTO[]; total: number; page: number; limit: number }> {
    const effectiveQuery = { ...query };

    if (actor.role === 'HOSPITAL') {
      if (!actor.hospitalId) throw new ForbiddenError('Hospital actor missing hospitalId');
      effectiveQuery.hospitalId = actor.hospitalId;
    }

    // PATIENT must provide caseId and can only see contacts for own cases
    if (actor.role === 'PATIENT') {
      if (!effectiveQuery.caseId) {
        return { data: [], total: 0, page: query.page, limit: query.limit };
      }
      const caseEntity = await this.caseRepo?.findById(effectiveQuery.caseId);
      if (!caseEntity || caseEntity.patientId !== actor.userId) {
        throw new ForbiddenError('Access denied to this case');
      }
    }

    if (actor.role === 'ADMIN' && effectiveQuery.caseId && this.caseRepo && this.adminAccess) {
      const caseEntity = await this.caseRepo.findById(effectiveQuery.caseId);
      if (!caseEntity) throw new ForbiddenError('Access denied to this case');
      await this.adminAccess.assertActorCanAccessCaseEntity(actor, caseEntity);
    }
    if (actor.role === 'HOSPITAL' && effectiveQuery.caseId && this.caseRepo && this.adminAccess) {
      const caseEntity = await this.caseRepo.findById(effectiveQuery.caseId);
      if (!caseEntity) throw new ForbiddenError('Access denied to this case');
      await this.adminAccess.assertCaseNotExcludedByPatientEmail(caseEntity);
      await this.adminAccess.assertActorCanAccessCaseEntity(actor, caseEntity);
    }

    // Use findByCaseId for case-scoped queries, scoped by hospital when applicable
    if (effectiveQuery.caseId) {
      let data = await this.chcRepo.findByCaseId(effectiveQuery.caseId);
      // Hospital actors should only see their own contacts for this case
      if (effectiveQuery.hospitalId) {
        data = data.filter((e) => e.hospitalId === effectiveQuery.hospitalId);
      }
      return {
        data: data.map((e) => toCaseHospitalContactDTO(e)),
        total: data.length,
        page: query.page,
        limit: query.limit,
      };
    }

    // Use findByHospitalId for hospital-scoped queries
    if (effectiveQuery.hospitalId) {
      const result = await this.chcRepo.findByHospitalId(
        effectiveQuery.hospitalId,
        actor.role === 'PATIENT' ? effectiveQuery : withDefaultPatientEmailExclusions(effectiveQuery),
      );
      return {
        data: result.data.map((e) => toCaseHospitalContactDTO(e)),
        total: result.total,
        page: query.page,
        limit: query.limit,
      };
    }

    // No filter — return empty for now (would need a findAll method)
    return { data: [], total: 0, page: query.page, limit: query.limit };
  }
}
