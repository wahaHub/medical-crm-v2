ALTER TABLE hospitals
  ADD COLUMN IF NOT EXISTS site VARCHAR(20);

UPDATE hospitals
SET site = CASE
  WHEN name = 'Mongolian Spinal hospital' THEN 'global'
  WHEN type = 'COSMETIC' THEN 'cosmetic'
  WHEN type = 'REGULAR' THEN 'china'
  ELSE site
END
WHERE site IS NULL;

ALTER TABLE hospitals
  DROP CONSTRAINT IF EXISTS hospitals_site_check;

ALTER TABLE hospitals
  ADD CONSTRAINT hospitals_site_check CHECK (site IN ('cosmetic', 'china', 'global'));

CREATE INDEX IF NOT EXISTS hospitals_site_idx ON hospitals(site);
