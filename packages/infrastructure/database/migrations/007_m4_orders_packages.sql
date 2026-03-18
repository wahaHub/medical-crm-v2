-- Migration 007: Module 4 — Orders + Packages
-- Adds packages and orders tables with supporting enums and indexes.

-- Enums
CREATE TYPE "PackageType" AS ENUM ('CONSULTATION', 'HEALTH_CHECKUP', 'SECOND_OPINION', 'VISA_PACKAGE', 'INSURANCE', 'ACCOMMODATION', 'TREATMENT_DEPOSIT', 'TRANSLATION');
CREATE TYPE "PackageStatus" AS ENUM ('DRAFT', 'PUBLISHED');
CREATE TYPE "OrderType" AS ENUM ('CONSULTATION', 'HEALTH_CHECKUP', 'SECOND_OPINION', 'VISA_PACKAGE', 'INSURANCE', 'ACCOMMODATION', 'TREATMENT_DEPOSIT', 'TRANSLATION');
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REFUNDED');

-- packages table
CREATE TABLE packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en VARCHAR(200) NOT NULL,
  name_zh VARCHAR(200),
  type "PackageType" NOT NULL,
  price DECIMAL(12,2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  description_en TEXT,
  description_zh TEXT,
  inclusions JSONB,
  cover_image_url VARCHAR(500),
  sort_weight INT DEFAULT 0,
  status "PackageStatus" NOT NULL DEFAULT 'DRAFT',
  publish_at TIMESTAMPTZ,
  takedown_at TIMESTAMPTZ,
  config JSONB,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- orders table
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number VARCHAR(50) NOT NULL UNIQUE,
  patient_id UUID NOT NULL REFERENCES users(id),
  case_id UUID REFERENCES cases(id),
  package_id UUID REFERENCES packages(id),
  type "OrderType" NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  status "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
  payment_method VARCHAR(50),
  paid_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  refunded_amount DECIMAL(12,2),
  refund_reason TEXT,
  metadata JSONB,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_packages_status_type ON packages(status, type, publish_at DESC NULLS LAST);
CREATE INDEX idx_packages_created_by_status ON packages(created_by, status, created_at DESC);
CREATE INDEX idx_orders_patient_status ON orders(patient_id, status, created_at DESC);
CREATE INDEX idx_orders_status_type ON orders(status, type, created_at DESC);
CREATE INDEX idx_orders_case_created ON orders(case_id, created_at DESC) WHERE case_id IS NOT NULL;
