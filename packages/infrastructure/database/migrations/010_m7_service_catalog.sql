-- Module 7: ServiceCatalog + QuoteTemplates
-- Enum
CREATE TYPE "ServiceCatalogCategory" AS ENUM (
  'COSMETIC_SURGERY', 'DENTAL', 'DERMATOLOGY', 'ORTHOPEDIC',
  'CARDIAC', 'OPHTHALMIC', 'FERTILITY', 'WEIGHT_LOSS',
  'HAIR_RESTORATION', 'WELLNESS', 'OTHER'
);

-- service_catalog_items
CREATE TABLE service_catalog_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES hospitals(id),
  name_en VARCHAR(200) NOT NULL,
  name_zh VARCHAR(200),
  category "ServiceCatalogCategory" NOT NULL,
  price_min DECIMAL(12,2) NOT NULL,
  price_max DECIMAL(12,2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  estimated_stay_days INT,
  estimated_recovery_days INT,
  inclusions JSONB,
  is_public BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- quote_templates
CREATE TABLE quote_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES hospitals(id),
  name VARCHAR(200) NOT NULL,
  condition_category VARCHAR(100),
  line_items_template JSONB NOT NULL,
  default_valid_days INT NOT NULL DEFAULT 30,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_sci_hospital_active ON service_catalog_items(hospital_id, is_active, category);
CREATE INDEX idx_sci_hospital_public ON service_catalog_items(hospital_id, is_public) WHERE is_public = true;
CREATE INDEX idx_qt_hospital_active ON quote_templates(hospital_id, is_active);
