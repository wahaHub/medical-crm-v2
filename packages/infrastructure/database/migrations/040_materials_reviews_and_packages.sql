CREATE TABLE IF NOT EXISTS hospital_material_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  patient_name TEXT NOT NULL,
  patient_country TEXT,
  patient_avatar_url TEXT,
  treatment_name TEXT,
  review_title TEXT,
  review_comment TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_date DATE,
  media JSONB NOT NULL DEFAULT '[]'::jsonb,
  translations JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hospital_material_reviews_hospital_sort_idx
  ON hospital_material_reviews (hospital_id, sort_order, created_at);

CREATE TABLE IF NOT EXISTS hospital_material_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  title TEXT NOT NULL,
  subtitle TEXT,
  cover_image_url TEXT NOT NULL,
  gallery JSONB NOT NULL DEFAULT '[]'::jsonb,
  price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
  currency TEXT NOT NULL,
  duration TEXT,
  summary TEXT NOT NULL,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  includes JSONB NOT NULL DEFAULT '[]'::jsonb,
  process JSONB NOT NULL DEFAULT '[]'::jsonb,
  cases JSONB NOT NULL DEFAULT '[]'::jsonb,
  reviews JSONB NOT NULL DEFAULT '[]'::jsonb,
  translations JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS hospital_material_packages_hospital_id_slug_unique
  ON hospital_material_packages (hospital_id, slug);

CREATE INDEX IF NOT EXISTS hospital_material_packages_hospital_sort_idx
  ON hospital_material_packages (hospital_id, sort_order, created_at);
