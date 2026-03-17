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
  // Extended fields — matches CRM v1 HospitalInfo shape
  nameEn?: string;
  yearEstablished?: number;
  totalPatients?: number;
  tagline?: string;
  taglineEn?: string;
  description?: string;
  descriptionEn?: string;
  status?: string;
  isActive?: boolean;
  paymentMethods?: string[];
  // Contact & Location
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  hours?: string;
  latitude?: number;
  longitude?: number;
  mapEmbed?: string;
  // CRM metadata fields
  certifications?: Array<{ id: string; name: string; nameEn?: string; year?: number; isActive: boolean }>;
  bedCount?: number;
  patientCapacity?: number;
  recommendRate?: number;
  multilingualStaff?: string[];
  airportServices?: string[];
  followUpCare?: string[];
  amenities?: string[];
  nearbyAttractions?: Array<{ id: string; name: string; nameEn?: string; distance: string }>;
  videoTestimonials?: Array<{
    id: string;
    patientName: string;
    patientCountry?: string;
    procedureName?: string;
    videoUrl: string;
    thumbnailUrl?: string;
    duration?: string;
    uploadedAt?: string;
  }>;
  // Regular hospital specific fields
  city?: string;
  district?: string;
  province?: string;
  hospitalType?: string;
  tier?: string;
  ownershipType?: string;
  clinicalCapabilities?: string[];
  equipment?: Array<{ name: string; image_url?: string; description?: string }>;
  gallery?: Array<{ url: string; alt: string; type: string }>;
  coreSpecialties?: Array<{ name: string; slug: string; image_url?: string; description: string; technologies: string[] }>;
  overview?: string;
  overviewEn?: string;
  fullDescription?: string;
  fullDescriptionEn?: string;
  departments?: string[];
  departmentDescriptions?: Record<string, string>;
  departmentImages?: Record<string, string>;
  departmentKeyServices?: Record<string, string[]>;
  departmentStats?: Record<string, { specialists?: number; annualPatients?: number }>;
  operatingHours?: string;
  promotionalVideos?: string[];
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
  education: string[];
  certifications: string[];
  intro: string | null;
  expertise: string | null;
  philosophy: string | null;
  achievements: string[];
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
  updateProcedure(id: string, hospitalId: string, data: Partial<MaterialsProcedure>): Promise<MaterialsProcedure>;
  deleteProcedure(id: string, hospitalId: string): Promise<void>;

  listSurgeons(hospitalId: string): Promise<MaterialsSurgeon[]>;
  createSurgeon(data: Omit<MaterialsSurgeon, 'id'>): Promise<MaterialsSurgeon>;
  updateSurgeon(id: string, hospitalId: string, data: Partial<MaterialsSurgeon>): Promise<MaterialsSurgeon>;
  deleteSurgeon(id: string, hospitalId: string): Promise<void>;

  listBeforeAfterCases(hospitalId: string): Promise<MaterialsBeforeAfterCase[]>;
  createBeforeAfterCase(data: Omit<MaterialsBeforeAfterCase, 'id'>): Promise<MaterialsBeforeAfterCase>;
  updateBeforeAfterCase(id: string, hospitalId: string, data: Partial<MaterialsBeforeAfterCase>): Promise<MaterialsBeforeAfterCase>;
  deleteBeforeAfterCase(id: string, hospitalId: string): Promise<void>;
}
