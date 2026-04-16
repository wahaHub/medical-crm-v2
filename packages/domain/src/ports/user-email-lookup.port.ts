import type { PatientSite } from './patient-repository.port.js';

export type UserEmailState =
  | { state: 'NONE' }
  | { state: 'PATIENT'; userId: string; site: PatientSite }
  | { state: 'HOSPITAL'; userId: string }
  | { state: 'ADMIN'; userId: string };

export interface IUserEmailLookupRepository {
  findEmailState(email: string, site: PatientSite): Promise<UserEmailState>;
}
