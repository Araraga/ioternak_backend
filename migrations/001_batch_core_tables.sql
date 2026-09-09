-- =====================================================
-- MIGRATION: Batch Management Core Tables
-- Version: 001_part1
-- Date: 2026-09-07
-- =====================================================

-- ============ BIRD BATCHES ============
CREATE TABLE IF NOT EXISTS bird_batches (
  id SERIAL PRIMARY KEY,
  barn_id INTEGER REFERENCES barns(id) ON DELETE CASCADE,
  batch_name VARCHAR(100) NOT NULL,
  batch_code VARCHAR(50) UNIQUE,
  bird_type VARCHAR(20) NOT NULL CHECK (bird_type IN ('layer', 'broiler', 'breeder')),
  breed VARCHAR(50),
  supplier VARCHAR(100),
  initial_count INTEGER NOT NULL CHECK (initial_count > 0),
  current_count INTEGER NOT NULL CHECK (current_count >= 0),
  start_date DATE NOT NULL,
  target_harvest_date DATE,
  actual_harvest_date DATE,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'terminated')),
  notes TEXT,
  created_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============ POPULATION LOGS ============
CREATE TABLE IF NOT EXISTS population_logs (
  id SERIAL PRIMARY KEY,
  batch_id INTEGER REFERENCES bird_batches(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  bird_count INTEGER NOT NULL CHECK (bird_count >= 0),
  mortality_count INTEGER DEFAULT 0 CHECK (mortality_count >= 0),
  mortality_cause VARCHAR(100),
  culling_count INTEGER DEFAULT 0 CHECK (culling_count >= 0),
  culling_reason VARCHAR(100),
  sold_count INTEGER DEFAULT 0 CHECK (sold_count >= 0),
  notes TEXT,
  logged_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(batch_id, log_date)
);

-- ============ PRODUCTION LOGS ============
CREATE TABLE IF NOT EXISTS production_logs (
  id SERIAL PRIMARY KEY,
  batch_id INTEGER REFERENCES bird_batches(id) ON DELETE CASCADE,
  barn_id INTEGER REFERENCES barns(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  eggs_collected INTEGER CHECK (eggs_collected >= 0),
  egg_weight_avg DECIMAL(5,2) CHECK (egg_weight_avg >= 0),
  broken_eggs INTEGER DEFAULT 0 CHECK (broken_eggs >= 0),
  sample_count INTEGER CHECK (sample_count >= 0),
  average_weight DECIMAL(8,2) CHECK (average_weight >= 0),
  feed_consumed_kg DECIMAL(10,2) CHECK (feed_consumed_kg >= 0),
  water_consumed_liters DECIMAL(10,2) CHECK (water_consumed_liters >= 0),
  bird_count INTEGER CHECK (bird_count > 0),
  fcr DECIMAL(5,2),
  production_rate DECIMAL(5,2),
  notes TEXT,
  logged_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(batch_id, log_date)
);

-- ============ INDEXES ============
CREATE INDEX IF NOT EXISTS idx_batches_barn ON bird_batches(barn_id);
CREATE INDEX IF NOT EXISTS idx_batches_status ON bird_batches(status);
CREATE INDEX IF NOT EXISTS idx_population_batch ON population_logs(batch_id);
CREATE INDEX IF NOT EXISTS idx_production_batch ON production_logs(batch_id);
