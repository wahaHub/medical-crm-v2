export type PatientSite = 'beauty' | 'china';

import type { PatientSiteAccessScope } from './patient-site-scope.port.js';

export interface PatientBasicInfo {
  id: string;
  email?: string | null;
  patientCode: string | null;
  preferredLanguage: string;
  site?: PatientSite | null;
  phone?: string | null;
  country?: string | null;
  /** Case Lifecycle Phase 2: set when this patient profile was merged into another one */
  mergedIntoUserId?: string | null;
}

/** Case Lifecycle Phase 2: patient directory search result (merge target picker) */
export interface PatientSearchResult {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  patientCode: string | null;
  site: PatientSite | null;
}

export interface PatientAuthInfo extends PatientBasicInfo {
  passwordHash: string | null;
}

export interface IPatientRepository {
  findById(id: string, site?: PatientSite): Promise<PatientBasicInfo | null>;
  findByIds?(ids: string[]): Promise<PatientBasicInfo[]>;
  findByEmail(email: string, site: PatientSite): Promise<PatientBasicInfo | null>;
  findAuthByEmail(email: string, site: PatientSite): Promise<PatientAuthInfo | null>;
  createTempPatient(input: {
    email: string;
    name: string;
    phone?: string;
    whatsapp?: string;
    preferredLanguage: string;
    site: PatientSite;
  }): Promise<PatientBasicInfo>;
  /**
   * Case Lifecycle Phase 1: create a patient record without an email address
   * (offline channels: phone / WhatsApp / referral). No password, no Keycloak account.
   */
  createOfflinePatient(input: {
    name: string;
    phone?: string;
    whatsapp?: string;
    preferredLanguage: string;
    site: PatientSite;
  }): Promise<PatientBasicInfo>;
  updatePasswordHash(userId: string, hash: string): Promise<void>;
  /**
   * Case Lifecycle Phase 2: search patient profiles by name / email / phone /
   * whatsapp (merge target picker). Excludes already-merged profiles.
   */
  searchPatients?(query: string, limit?: number, siteScope?: PatientSiteAccessScope): Promise<PatientSearchResult[]>;
}
