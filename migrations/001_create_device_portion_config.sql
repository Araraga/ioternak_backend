-- Migration: Create device_portion_config table
-- Description: Store custom rotation configuration per device
-- Created: 2026-09-07

CREATE TABLE IF NOT EXISTS device_portion_config (
  id SERIAL PRIMARY KEY,
  device_id VARCHAR(50) UNIQUE NOT NULL,
  sedikit INTEGER NOT NULL DEFAULT 3,
  sedang INTEGER NOT NULL DEFAULT 6,
  banyak INTEGER NOT NULL DEFAULT 10,
  updated_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT fk_device 
    FOREIGN KEY (device_id) 
    REFERENCES devices(device_id) 
    ON DELETE CASCADE
);

-- Create index for faster lookups
CREATE INDEX idx_device_portion_config_device_id ON device_portion_config(device_id);

-- Add comment
COMMENT ON TABLE device_portion_config IS 'Stores custom portion rotation configuration for each device';
COMMENT ON COLUMN device_portion_config.sedikit IS 'Number of rotations for small portion';
COMMENT ON COLUMN device_portion_config.sedang IS 'Number of rotations for medium portion';
COMMENT ON COLUMN device_portion_config.banyak IS 'Number of rotations for large portion';
