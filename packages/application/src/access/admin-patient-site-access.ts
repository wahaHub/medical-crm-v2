import type {
  Case,
  ICaseRepository,
  IUserRepository,
  PatientSiteAccessScope,
  PatientSiteForAccess,
} from '@medical-crm/domain';
import { ForbiddenError, NotFoundError } from '@medical-crm/utils';
import type { Actor } from '../types/actor.js';

const BEAUTY_ADMIN_DOMAIN = '@medorabeauty.com';

export function getAdminPatientSiteScope(actor: Actor): PatientSiteAccessScope | null {
  if (actor.role !== 'ADMIN') return null;
  const email = actor.email.trim().toLowerCase();
  return email.endsWith(BEAUTY_ADMIN_DOMAIN)
    ? { mode: 'ONLY', site: 'beauty' }
    : { mode: 'EXCLUDE', site: 'beauty' };
}

export function isPatientSiteAllowedByScope(
  scope: PatientSiteAccessScope | null,
  patientSite: PatientSiteForAccess,
): boolean {
  if (!scope) return true;
  if (scope.mode === 'ONLY') return patientSite === scope.site;
  return patientSite !== scope.site;
}

export function assertPatientSiteAllowedByScope(
  scope: PatientSiteAccessScope | null,
  patientSite: PatientSiteForAccess,
): void {
  if (!isPatientSiteAllowedByScope(scope, patientSite)) {
    throw new ForbiddenError('Access denied to this case scope');
  }
}

export class AdminPatientSiteAccessPolicy {
  constructor(
    private readonly caseRepo: Pick<ICaseRepository, 'findById'>,
    private readonly userRepo: Pick<IUserRepository, 'findById'>,
  ) {}

  async resolveCasePatientSite(caseEntity: Case): Promise<PatientSiteForAccess> {
    const patient = await this.userRepo.findById(caseEntity.patientId);
    return patient?.patientSite ?? null;
  }

  async assertActorCanAccessCaseEntity(actor: Actor, caseEntity: Case): Promise<void> {
    const scope = getAdminPatientSiteScope(actor);
    if (!scope) return;
    assertPatientSiteAllowedByScope(scope, await this.resolveCasePatientSite(caseEntity));
  }

  async assertActorCanAccessCase(actor: Actor, caseId: string): Promise<Case> {
    const caseEntity = await this.caseRepo.findById(caseId);
    if (!caseEntity) throw new NotFoundError(`Case ${caseId} not found`);
    await this.assertActorCanAccessCaseEntity(actor, caseEntity);
    return caseEntity;
  }

  async assertActorCanAccessPatient(actor: Actor, patientId: string): Promise<void> {
    const scope = getAdminPatientSiteScope(actor);
    if (!scope) return;
    const patient = await this.userRepo.findById(patientId);
    if (!patient) throw new NotFoundError(`Patient ${patientId} not found`);
    assertPatientSiteAllowedByScope(scope, patient.patientSite ?? null);
  }

  async assertActorCanAccessCaseOrPatient(
    actor: Actor,
    input: { caseId: string | null; patientId: string },
  ): Promise<void> {
    if (input.caseId) {
      await this.assertActorCanAccessCase(actor, input.caseId);
      return;
    }
    await this.assertActorCanAccessPatient(actor, input.patientId);
  }
}
