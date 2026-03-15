export interface PatientBasicInfo {
  id: string;
  patientCode: string | null;
  preferredLanguage: string;
}

export interface IPatientRepository {
  findById(id: string): Promise<PatientBasicInfo | null>;
}
