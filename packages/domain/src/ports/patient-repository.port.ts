export type PatientSite = 'beauty' | 'china';

export interface PatientBasicInfo {
  id: string;
  patientCode: string | null;
  preferredLanguage: string;
  site?: PatientSite | null;
}

export interface PatientAuthInfo extends PatientBasicInfo {
  passwordHash: string | null;
}

export interface IPatientRepository {
  findById(id: string, site?: PatientSite): Promise<PatientBasicInfo | null>;
  findByEmail(email: string, site: PatientSite): Promise<PatientBasicInfo | null>;
  findAuthByEmail(email: string, site: PatientSite): Promise<PatientAuthInfo | null>;
  createTempPatient(input: {
    email: string;
    name: string;
    phone?: string;
    preferredLanguage: string;
    site: PatientSite;
  }): Promise<PatientBasicInfo>;
  updatePasswordHash(userId: string, hash: string): Promise<void>;
}
