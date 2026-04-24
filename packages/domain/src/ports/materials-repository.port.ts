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
  heroImageStorageKey?: string | null;
  photos: string[];
  photoStorageKeys?: Array<string | null>;
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
    videoStorageKey?: string | null;
    thumbnailUrl?: string;
    thumbnailStorageKey?: string | null;
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
  equipment?: Array<{ name: string; image_url?: string; imageStorageKey?: string | null; description?: string }>;
  gallery?: Array<{ url: string; alt: string; type: string }>;
  coreSpecialties?: Array<{ name: string; slug: string; image_url?: string; description: string; technologies: string[] }>;
  overview?: string;
  overviewEn?: string;
  fullDescription?: string;
  fullDescriptionEn?: string;
  departments?: string[];
  departmentDescriptions?: Record<string, string>;
  departmentImages?: Record<string, string>;
  departmentImageStorageKeys?: Record<string, string>;
  departmentKeyServices?: Record<string, string[]>;
  departmentStats?: Record<string, { specialists?: number; annualPatients?: number }>;
  operatingHours?: string;
  promotionalVideos?: string[];
  promotionalVideoStorageKeys?: Array<string | null>;
  translations?: Record<string, Record<string, unknown>>;
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
  translations?: Record<string, Record<string, unknown>>;
}

export interface MaterialsBeforeAfterCase {
  id: string;
  hospitalId: string;
  procedureName: string;
  surgeonName: string | null;
  description: string | null;
  images: Array<{ url: string }>;
  translations?: Record<string, Record<string, unknown>>;
}

export interface MaterialsReviewMedia {
  id: string;
  type: 'image' | 'video';
  url: string;
  storageKey?: string | null;
  thumbnailUrl: string | null;
  thumbnailStorageKey?: string | null;
  caption: string | null;
  sortOrder: number;
}

export interface MaterialsReview {
  id: string;
  hospitalId: string;
  sortOrder: number;
  isActive: boolean;
  featured: boolean;
  patientName: string;
  patientCountry: string | null;
  patientAvatarUrl: string | null;
  patientAvatarStorageKey?: string | null;
  treatmentName: string | null;
  reviewTitle: string | null;
  reviewComment: string;
  rating: number;
  reviewDate: string | null;
  media: MaterialsReviewMedia[];
  translations?: Record<string, Record<string, unknown>>;
}

export interface MaterialsPackageGalleryItem {
  id: string;
  imageUrl: string;
  storageKey?: string | null;
  sortOrder: number;
}

export type MaterialsPackageTagCategory =
  | 'treatment'
  | 'service'
  | 'audience'
  | 'city'
  | 'price'
  | 'style';

export interface MaterialsPackageTag {
  id: string;
  label: string;
  category: MaterialsPackageTagCategory | null;
}

export interface MaterialsPackageIncludeItem {
  id: string;
  text: string;
  sortOrder: number;
}

export interface MaterialsPackageProcessItem {
  id: string;
  stepTitle: string;
  description: string;
  sortOrder: number;
}

export interface MaterialsPackageCase {
  id: string;
  patientName: string;
  patientAge: number | null;
  patientCountry: string | null;
  story: string;
  result: string;
  sortOrder: number;
}

export interface MaterialsPackageReview {
  id: string;
  reviewerName: string;
  reviewerCountry: string | null;
  rating: number;
  reviewDate: string | null;
  comment: string;
  sortOrder: number;
  isActive: boolean;
}

export interface MaterialsPackage {
  id: string;
  hospitalId: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  title: string;
  subtitle: string | null;
  coverImageUrl: string;
  coverImageStorageKey?: string | null;
  gallery: MaterialsPackageGalleryItem[];
  price: string;
  currency: string;
  duration: string | null;
  summary: string;
  tags: MaterialsPackageTag[];
  includes: MaterialsPackageIncludeItem[];
  process: MaterialsPackageProcessItem[];
  cases: MaterialsPackageCase[];
  reviews: MaterialsPackageReview[];
  translations?: Record<string, Record<string, unknown>>;
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

  listReviews(hospitalId: string): Promise<MaterialsReview[]>;
  createReview(data: Omit<MaterialsReview, 'id'>): Promise<MaterialsReview>;
  updateReview(id: string, hospitalId: string, data: Partial<MaterialsReview>): Promise<MaterialsReview>;
  deleteReview(id: string, hospitalId: string): Promise<void>;

  listPackages(hospitalId: string): Promise<MaterialsPackage[]>;
  getPackage(id: string, hospitalId: string): Promise<MaterialsPackage | null>;
  createPackage(data: Omit<MaterialsPackage, 'id'>): Promise<MaterialsPackage>;
  updatePackage(id: string, hospitalId: string, data: Partial<MaterialsPackage>): Promise<MaterialsPackage>;
  deletePackage(id: string, hospitalId: string): Promise<void>;
}
