export interface PatientBasicInfo {
  id: string;
  patientCode: string | null;
  preferredLanguage: string;
}

export interface PatientAuthInfo extends PatientBasicInfo {
  passwordHash: string | null;
}

export interface IPatientRepository {
  findById(id: string): Promise<PatientBasicInfo | null>;
  findByEmail(email: string): Promise<PatientBasicInfo | null>;
  findAuthByEmail(email: string): Promise<PatientAuthInfo | null>;
  createTempPatient(input: {
    email: string;
    name: string;
    phone?: string;
    preferredLanguage: string;
  }): Promise<PatientBasicInfo>;
  updatePasswordHash(userId: string, hash: string): Promise<void>;
}
