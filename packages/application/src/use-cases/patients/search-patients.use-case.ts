import type { IPatientRepository, PatientSearchResult } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import { getAdminPatientSiteScope } from '../../access/admin-patient-site-access.js';

export const PATIENT_SEARCH_MAX_LIMIT = 20;

/**
 * Case Lifecycle Phase 2: read-only patient directory search used by the
 * merge-target picker. Matches name / email / phone / whatsapp; already-merged
 * profiles are excluded.
 */
export class SearchPatientsUseCase {
  constructor(private readonly patientRepo: IPatientRepository) {}

  async execute(query: string, limit: number | undefined, actor: Actor): Promise<PatientSearchResult[]> {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Only admins can search patients');
    }
    if (!this.patientRepo.searchPatients) {
      return [];
    }
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      return [];
    }
    const scope = getAdminPatientSiteScope(actor) ?? undefined;
    return this.patientRepo.searchPatients(trimmed, Math.min(limit ?? 10, PATIENT_SEARCH_MAX_LIMIT), scope);
  }
}
