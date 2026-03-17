export interface HospitalInfo {
  id: string;
  name: string;
  status: string;
}

export interface MatchedHospital {
  id: string;
  name: string;
  nameEn: string | null;
  rating: number | null;
  logoUrl: string | null;
  tags: string[];
  procedureCount: number;
}

export interface FindMatchingHospitalsInput {
  procedureId?: string;
  destination?: string;
  category?: string;
}

export interface IHospitalRepository {
  findById(id: string): Promise<HospitalInfo | null>;
  findMatchingHospitals(input: FindMatchingHospitalsInput): Promise<MatchedHospital[]>;
}
