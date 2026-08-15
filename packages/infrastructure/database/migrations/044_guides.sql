CREATE TABLE IF NOT EXISTS guides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(220) NOT NULL UNIQUE,
  title VARCHAR(300) NOT NULL,
  subtitle TEXT,
  hero_image_url TEXT,
  category VARCHAR(80) NOT NULL CHECK (category IN (
    'china_healthcare', 'treatment', 'clinical_trials_advanced_treatments',
    'hospital', 'patient_journey', 'cost_insurance', 'patient_education_faq'
  )),
  reviewed_by VARCHAR(200),
  updated_date DATE NOT NULL DEFAULT CURRENT_DATE,
  key_takeaways JSONB NOT NULL DEFAULT '[]'::jsonb,
  content_sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  related_hospital_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  related_treatments JSONB NOT NULL DEFAULT '[]'::jsonb,
  related_guide_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  faqs JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS guides_category_idx ON guides (category);
CREATE INDEX IF NOT EXISTS guides_status_updated_at_idx ON guides (status, updated_at DESC);
