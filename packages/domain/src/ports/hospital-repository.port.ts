export interface HospitalInfo {
  id: string;
  name: string;
  status: string;
}

export interface IHospitalRepository {
  findById(id: string): Promise<HospitalInfo | null>;
}
