/**
 * TypeScript interfaces for the China Medical Supabase database.
 * Mirrors v1's lib/chinaMedicalSupabase.ts types.
 * Used for regular hospitals (REGULAR type).
 */

// --- Supporting types ---

export interface GalleryImage {
  url: string;
  alt: string;
  type: 'facade' | 'interior' | 'department' | 'equipment' | 'room';
}

export interface Equipment {
  name: string;
  image_url?: string;
  description?: string;
}

export interface Certification {
  name: string;
  nameEn?: string;
  year?: number;
  isActive: boolean;
}

export interface CoreSpecialty {
  name: string;
  slug: string;
  image_url?: string;
  description: string;
  technologies: string[];
}

export interface ClinicalCapabilitiesDescription {
  icu?: string;
  emergency?: string;
  mdt?: string;
  imaging_center?: string;
  lab?: string;
  complex_case?: string;
}

// --- Main table types ---

export interface ChinaMedicalHospital {
  id: string;
  slug: string;
  city: string;
  district?: string;
  province?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  established_year?: number;
  bed_count?: number;
  patients_served_annually?: number;
  international_patients_annually?: number;
  staff_count?: number;
  hero_image_url?: string;
  gallery?: GalleryImage[];
  supported_languages?: string[];
  airport_services?: string[];
  followup_care?: string[];
  amenities?: string[];
  payment_methods?: string[];
  clinical_capabilities?: string[];
  equipment?: Equipment[];
  certifications?: Certification[];
  phone?: string;
  official_website?: string;
  wiki_link?: string;
  data_source?: string;
  credibility?: Record<string, unknown>;
  is_active: boolean;
  keycloak_user_id?: string;
  admin_email?: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at?: string;
  updated_at?: string;
}

export interface ChinaMedicalHospitalI18n {
  hospital_id: string;
  locale: string;
  name: string;
  display_name?: string;
  hospital_type?: string;
  tier?: string;
  ownership_type?: string;
  city_translated?: string;
  value_proposition?: string;
  overview?: string;
  short_description?: string;
  full_description?: string;
  core_specialties?: CoreSpecialty[];
  clinical_capabilities_description?: ClinicalCapabilitiesDescription;
  departments_info?: Record<string, unknown>[];
  facilities_info?: Record<string, unknown>;
  seo_title?: string;
  seo_description?: string;
  seo_keywords?: string;
  /** AI-translated equipment list. Array of {idx, name, description}. */
  equipment_translated?: Array<{ idx: number; name: string; description?: string }>;
  /** AI-translated video testimonial metadata. */
  video_testimonials_translated?: Array<{ id: string; procedure_name?: string; patient_country?: string }>;
}
