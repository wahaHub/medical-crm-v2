-- Module 9: BookingRequest + Patient Auth
-- Enums
CREATE TYPE "BookingRequestStatus" AS ENUM ('PENDING', 'HOSPITALS_MATCHED', 'SELECTIONS_SAVED', 'COMPLETED', 'EXPIRED');
CREATE TYPE "BookingConditionType" AS ENUM ('COSMETIC', 'MEDICAL', 'DENTAL', 'WELLNESS', 'OTHER');

-- booking_requests
CREATE TABLE booking_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  request_number VARCHAR(50) NOT NULL UNIQUE,
  condition_type "BookingConditionType" NOT NULL,
  condition_category VARCHAR(100) NOT NULL,
  condition_description TEXT,
  destination_preference JSONB,
  preferred_language VARCHAR(10) NOT NULL DEFAULT 'en',
  status "BookingRequestStatus" NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- booking_request_hospitals
CREATE TABLE booking_request_hospitals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_request_id UUID NOT NULL REFERENCES booking_requests(id) ON DELETE CASCADE,
  hospital_id UUID NOT NULL REFERENCES hospitals(id),
  is_recommended BOOLEAN NOT NULL DEFAULT false,
  match_score INT,
  recommendation_reason TEXT,
  selected_by_patient BOOLEAN NOT NULL DEFAULT false,
  selected_at TIMESTAMPTZ,
  UNIQUE(booking_request_id, hospital_id)
);

-- Indexes
CREATE INDEX idx_booking_requests_user ON booking_requests(user_id, created_at DESC);
CREATE INDEX idx_booking_requests_status ON booking_requests(status, created_at DESC);
CREATE INDEX idx_booking_request_hospitals_br ON booking_request_hospitals(booking_request_id);

-- TODO: Add booking_request_id column to cases table in a future migration.
-- ALTER TABLE cases ADD COLUMN booking_request_id UUID REFERENCES booking_requests(id);
-- This is deferred because the cases table is managed by earlier migrations.
