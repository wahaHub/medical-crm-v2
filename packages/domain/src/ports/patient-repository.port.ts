export interface PatientBasicInfo {
  id: string;
  patientCode: string | null;
}

export interface IPatientRepository {
  findById(id: string): Promise<PatientBasicInfo | null>;
}
