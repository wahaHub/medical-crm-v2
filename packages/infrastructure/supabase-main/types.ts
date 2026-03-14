/**
 * TypeScript interfaces for the Main Supabase database tables.
 * Complete copy from v1's lib/mainSupabase.ts.
 * The Main Supabase is used for beauty hospitals (COSMETIC type).
 */

export interface SupabaseSurgeon {
  id: string;
  surgeon_id: string;
  name: string;
  title: string | null;
  experience_years: number | null;
  image_url: string | null;
  image_prompt: string | null;
  specialties: string[];
  languages: string[];
  education: string[];
  certifications: string[];
  procedures_count: Record<string, number>;
  bio: {
    intro?: string;
    expertise?: string;
    philosophy?: string;
    achievements?: string[];
  };
  images: {
    hero?: string;
    office?: string;
    surgery?: string;
  };
  translations: Record<string, {
    title?: string;
    bio?: { intro?: string; expertise?: string; philosophy?: string; achievements?: string[] };
    education?: string[];
    languages?: string[];
    specialties?: string[];
    certifications?: string[];
  }>;
  hospital_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CRMMetadata {
  bedCount?: number;
  patientCapacity?: number;
  multilingualStaff?: string[];
  airportServices?: string[];
  followUpCare?: string[];
  amenities?: string[];
  certifications?: Array<{
    id: string;
    name: string;
    nameEn: string;
    year?: number;
    isActive: boolean;
  }>;
  videoTestimonials?: Array<{
    id: string;
    title: string;
    thumbnailUrl: string;
    videoUrl: string;
    patientName?: string;
    procedureType?: string;
  }>;
}

export interface SupabaseHospital {
  id: string;
  slug: string;
  name: string;
  year_established: number | null;
  rating: number | null;
  review_count: number | null;
  hero_image: string | null;
  total_patients: number | null;
  recommend_rate: number | null;
  photos: string[];
  payment_methods: string[];
  highlights: Array<{ icon: string; text: string }>;
  crm_metadata: CRMMetadata | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface SupabaseHospitalTranslation {
  id: string;
  hospital_id: string;
  language_code: string;
  tagline: string | null;
  description: string | null;
  highlights: Array<{ icon: string; text: string }> | null;
  nearby_attractions: Array<{ id: string; name: string; distance?: string; sort_order: number }> | null;
  created_at: string;
  updated_at: string;
}

export interface SupabaseHospitalLocation {
  id: string;
  hospital_id: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  hours: string | null;
  map_embed: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  updated_at: string;
}

export interface SupabaseHospitalProcedure {
  id: string;
  hospital_id: string;
  procedure_id: string;
  price_range: string | null;
  price_min: number | null;
  price_max: number | null;
  currency: string | null;
  is_popular: boolean;
  sort_order: number;
  created_at: string;
}

export interface SupabaseProcedure {
  id: string;
  procedure_name: string;
  name_zh?: string | null;
  slug: string;
  category_id: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupabaseProcedureCase {
  id: string;
  procedure_id: string | null;
  case_number: string;
  procedure_name: string | null;
  description: string | null;
  provider_name: string | null;
  patient_age: string | null;
  patient_gender: string | null;
  image_count: number;
  sort_order: number;
  surgeon_id: string | null;
  hospital_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupabaseCaseImage {
  id: string;
  case_id: string;
  image_type: 'before' | 'after' | 'combined';
  image_url: string;
  sort_order: number;
  created_at: string;
}

export interface SupabaseNearbyAttraction {
  id: string;
  hospital_id: string;
  name: string;
  name_zh: string | null;
  distance: string;
  sort_order: number;
  created_at: string;
}
