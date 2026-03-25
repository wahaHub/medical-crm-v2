-- Align enum values with admin portal CDE spec.
-- This migration intentionally removes legacy order/package enum members.

-- ---------------------------------------------------------------------------
-- PackageType
-- ---------------------------------------------------------------------------
ALTER TABLE packages
  ALTER COLUMN type DROP DEFAULT;

CREATE TYPE "PackageType_new" AS ENUM (
  'CONSULTATION',
  'HEALTH_CHECKUP',
  'SECOND_OPINION',
  'VISA_PACKAGE',
  'INSURANCE',
  'ACCOMMODATION',
  'TREATMENT_DEPOSIT',
  'TRANSLATION'
);

ALTER TABLE packages
  ALTER COLUMN type TYPE "PackageType_new"
  USING (
    CASE
      WHEN type::text = 'TREATMENT' THEN 'HEALTH_CHECKUP'
      WHEN type::text = 'BUNDLE' THEN 'CONSULTATION'
      WHEN type::text = 'ADD_ON' THEN 'TRANSLATION'
      ELSE type::text
    END::"PackageType_new"
  );

DROP TYPE "PackageType";
ALTER TYPE "PackageType_new" RENAME TO "PackageType";

-- ---------------------------------------------------------------------------
-- OrderType
-- ---------------------------------------------------------------------------
ALTER TABLE orders
  ALTER COLUMN type DROP DEFAULT;

CREATE TYPE "OrderType_new" AS ENUM (
  'CONSULTATION',
  'HEALTH_CHECKUP',
  'SECOND_OPINION',
  'VISA_PACKAGE',
  'INSURANCE',
  'ACCOMMODATION',
  'TREATMENT_DEPOSIT',
  'TRANSLATION'
);

ALTER TABLE orders
  ALTER COLUMN type TYPE "OrderType_new"
  USING (
    CASE
      WHEN type::text = 'PACKAGE' THEN 'CONSULTATION'
      WHEN type::text = 'CUSTOM' THEN 'TRANSLATION'
      ELSE type::text
    END::"OrderType_new"
  );

DROP TYPE "OrderType";
ALTER TYPE "OrderType_new" RENAME TO "OrderType";

-- ---------------------------------------------------------------------------
-- TicketStatus (adds IN_PROGRESS)
-- ---------------------------------------------------------------------------
ALTER TABLE support_tickets
  ALTER COLUMN status DROP DEFAULT;

CREATE TYPE "TicketStatus_new" AS ENUM (
  'OPEN',
  'ASSIGNED',
  'IN_PROGRESS',
  'PENDING_INFO',
  'RESOLVED',
  'CLOSED'
);

ALTER TABLE support_tickets
  ALTER COLUMN status TYPE "TicketStatus_new"
  USING (status::text::"TicketStatus_new");

DROP TYPE "TicketStatus";
ALTER TYPE "TicketStatus_new" RENAME TO "TicketStatus";

ALTER TABLE support_tickets
  ALTER COLUMN status SET DEFAULT 'OPEN';
