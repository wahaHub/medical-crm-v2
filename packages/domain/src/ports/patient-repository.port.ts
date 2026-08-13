export type PatientSite = 'beauty' | 'china';

export interface PatientBasicInfo {
  id: string;
  email?: string | null;
  patientCode: string | null;
  preferredLanguage: string;
  site?: PatientSite | null;
  phone?: string | null;
  country?: string | null;
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
    preferredLanguage: string;
    site: PatientSite;
  }): Promise<PatientBasicInfo>;
  updatePasswordHash(userId: string, hash: string): Promise<void>;
}
