import type { PatientSite } from './patient-repository.port.js';

export type PatientSiteAccessScope =
  | { mode: 'ONLY'; site: 'beauty' }
  | { mode: 'EXCLUDE'; site: 'beauty' };

export type PatientSiteForAccess = PatientSite | null;
