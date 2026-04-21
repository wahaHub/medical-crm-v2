import type { HospitalType } from '@medical-crm/domain';

export type PatientSite = 'beauty' | 'china' | null | undefined;

export function deriveHospitalTypeFromPatientSite(patientSite: PatientSite): HospitalType | null {
  if (patientSite === 'beauty') return 'COSMETIC';
  if (patientSite === 'china') return 'REGULAR';
  return null;
}
