-- =====================================================
-- MIGRATION: Barn Coordinates & Dashboard Enhancements
-- Version: 004
-- Date: 2026-09-08
-- =====================================================

ALTER TABLE barns ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7);
ALTER TABLE barns ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7);

CREATE INDEX IF NOT EXISTS idx_barns_owner_id ON barns(owner_id);
CREATE INDEX IF NOT EXISTS idx_barns_coords ON barns(latitude, longitude);
