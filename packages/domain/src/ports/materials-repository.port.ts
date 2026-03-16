/**
 * Materials Repository Port
 *
 * Defines interfaces for hospital marketing materials:
 * hospital info, procedures, surgeons, and before/after cases.
 *
 * "MaterialsHospitalInfo" avoids name collision with existing HospitalInfo
 * in hospital-repository.port.ts.
 */

export interface MaterialsHospitalInfo {
  id: string;
  name: string;
  slug: string;
  heroImage: string | null;
  photos: string[];
  highlights: Array<{ icon: string; text: string }>;
}

export interface MaterialsProcedure {
  id: string;
  hospitalId: string;
  procedureName: string;
  description: string | null;
  priceMin: number | null;
  priceMax: number | null;
  priceRange: string | null;
  isPopular: boolean;
  sortOrder: number;
}

export interface MaterialsSurgeon {
  id: string;
  hospitalId: string;
  name: string;
  title: string | null;
  imageUrl: string | null;
  experienceYears: number | null;
  specialties: string[];
  languages: string[];
}

export interface MaterialsBeforeAfterCase {
  id: string;
  hospitalId: string;
  procedureName: string;
  surgeonName: string | null;
  description: string | null;
  images: Array<{ url: string; type: 'before' | 'after' | 'combined' }>;
}

export interface IMaterialsRepository {
  getHospitalInfo(hospitalId: string): Promise<MaterialsHospitalInfo | null>;
  updateHospitalInfo(hospitalId: string, data: Partial<MaterialsHospitalInfo>): Promise<MaterialsHospitalInfo>;

  listProcedures(hospitalId: string): Promise<MaterialsProcedure[]>;
  createProcedure(data: Omit<MaterialsProcedure, 'id'>): Promise<MaterialsProcedure>;
  updateProcedure(id: string, data: Partial<MaterialsProcedure>): Promise<MaterialsProcedure>;
  deleteProcedure(id: string): Promise<void>;

  listSurgeons(hospitalId: string): Promise<MaterialsSurgeon[]>;
  createSurgeon(data: Omit<MaterialsSurgeon, 'id'>): Promise<MaterialsSurgeon>;
  updateSurgeon(id: string, data: Partial<MaterialsSurgeon>): Promise<MaterialsSurgeon>;
  deleteSurgeon(id: string): Promise<void>;

  listBeforeAfterCases(hospitalId: string): Promise<MaterialsBeforeAfterCase[]>;
  createBeforeAfterCase(data: Omit<MaterialsBeforeAfterCase, 'id'>): Promise<MaterialsBeforeAfterCase>;
  updateBeforeAfterCase(id: string, data: Partial<MaterialsBeforeAfterCase>): Promise<MaterialsBeforeAfterCase>;
  deleteBeforeAfterCase(id: string): Promise<void>;
}
