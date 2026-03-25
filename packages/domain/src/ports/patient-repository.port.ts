export interface PatientBasicInfo {
  id: string;
  patientCode: string | null;
  preferredLanguage: string;
}

export interface IPatientRepository {
  findById(id: string): Promise<PatientBasicInfo | null>;
  findByEmail(email: string): Promise<PatientBasicInfo | null>;
  createTempPatient(input: {
    email: string;
    name: string;
    phone?: string;
    preferredLanguage: string;
  }): Promise<PatientBasicInfo>;
  updatePasswordHash(userId: string, hash: string): Promise<void>;
}
