import { HOSPITAL_CASE_READ_CHC_STATUSES, type Case, type ICHCRepository, type CHCSubStatus } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';

const READABLE_CHC_STATUSES = new Set<CHCSubStatus>(HOSPITAL_CASE_READ_CHC_STATUSES);

export async function hasHospitalCaseAccess(
  entity: Case,
  hospitalId: string | null | undefined,
  chcRepo?: ICHCRepository,
): Promise<boolean> {
  if (!hospitalId) return false;
  if (entity.assignedHospitalId === hospitalId) return true;
  if (!chcRepo) return false;

  const contact = await chcRepo.findByCaseAndHospital(entity.id, hospitalId);
  return Boolean(contact && !contact.removedAt && READABLE_CHC_STATUSES.has(contact.subStatus));
}

export async function assertHospitalCaseAccess(
  entity: Case,
  hospitalId: string | null | undefined,
  chcRepo?: ICHCRepository,
  message = 'Access denied to this case',
): Promise<void> {
  const allowed = await hasHospitalCaseAccess(entity, hospitalId, chcRepo);
  if (!allowed) {
    throw new ForbiddenError(message);
  }
}

export function assertAssignedHospitalCaseAccess(
  entity: Case,
  hospitalId: string | null | undefined,
  message = 'Access denied to this case',
): void {
  if (!hospitalId || entity.assignedHospitalId !== hospitalId) {
    throw new ForbiddenError(message);
  }
}
