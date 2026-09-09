-- ==============================================================================
-- MASTER DATABASE MIGRATION SCRIPT (POSTGRESQL) - IOTERNAK / MAGGENZIM V2
-- Komprehensif, Idempoten, dan Aman dijalankan berulang kali di VPS
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. UPDATE TABEL BARNS (Koordinat GPS & Indeks)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'barns') THEN
        ALTER TABLE barns ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7);
        ALTER TABLE barns ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7);
        CREATE INDEX IF NOT EXISTS idx_barns_owner_id ON barns(owner_id);
        CREATE INDEX IF NOT EXISTS idx_barns_coords ON barns(latitude, longitude);
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. TABEL DEVICE PORTION CONFIG (IOPakan)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS device_portion_config (
  id SERIAL PRIMARY KEY,
  device_id VARCHAR(50) UNIQUE NOT NULL,
  sedikit INTEGER NOT NULL DEFAULT 3,
  sedang INTEGER NOT NULL DEFAULT 6,
  banyak INTEGER NOT NULL DEFAULT 10,
  updated_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_portion_config_device_id ON device_portion_config(device_id);

-- ------------------------------------------------------------------------------
-- 3. TABEL BIRD BATCHES (Manajemen Batch / Flock)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bird_batches (
  id SERIAL PRIMARY KEY,
  barn_id INTEGER REFERENCES barns(id) ON DELETE CASCADE,
  batch_name VARCHAR(100) NOT NULL,
  batch_code VARCHAR(50) UNIQUE,
  bird_type VARCHAR(20) NOT NULL CHECK (bird_type IN ('layer', 'broiler', 'breeder', 'duck', 'quail', 'other')),
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

CREATE INDEX IF NOT EXISTS idx_batches_barn ON bird_batches(barn_id);
CREATE INDEX IF NOT EXISTS idx_batches_status ON bird_batches(status);

-- ------------------------------------------------------------------------------
-- 4. TABEL POPULATION LOGS (Mortalitas, Culling, Penjualan)
-- ------------------------------------------------------------------------------
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

CREATE INDEX IF NOT EXISTS idx_population_batch ON population_logs(batch_id);

-- ------------------------------------------------------------------------------
-- 5. TABEL PRODUCTION LOGS (Produksi Telur / Bobot Harian / FCR)
-- ------------------------------------------------------------------------------
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

CREATE INDEX IF NOT EXISTS idx_production_batch ON production_logs(batch_id);

-- ------------------------------------------------------------------------------
-- 6. TABEL HEALTH CHECKS & KATALOG PENYAKIT
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS health_checks (
  id SERIAL PRIMARY KEY,
  batch_id INTEGER REFERENCES bird_batches(id) ON DELETE CASCADE,
  barn_id INTEGER REFERENCES barns(id) ON DELETE CASCADE,
  check_date DATE NOT NULL,
  overall_status VARCHAR(20) DEFAULT 'good' CHECK (overall_status IN ('good', 'warning', 'critical')),
  sick_birds_count INTEGER DEFAULT 0 CHECK (sick_birds_count >= 0),
  symptoms TEXT,
  behavioral_notes TEXT,
  environmental_issues TEXT,
  actions_taken TEXT,
  checked_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_health_batch ON health_checks(batch_id);
CREATE INDEX IF NOT EXISTS idx_health_date ON health_checks(check_date);

CREATE TABLE IF NOT EXISTS diseases (
  id SERIAL PRIMARY KEY,
  disease_name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  symptoms TEXT,
  treatment_protocol TEXT,
  prevention_measures TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS disease_logs (
  id SERIAL PRIMARY KEY,
  batch_id INTEGER REFERENCES bird_batches(id) ON DELETE CASCADE,
  disease_id INTEGER REFERENCES diseases(id),
  disease_name VARCHAR(100),
  onset_date DATE NOT NULL,
  affected_count INTEGER CHECK (affected_count >= 0),
  mortality_count INTEGER DEFAULT 0 CHECK (mortality_count >= 0),
  treatment_applied TEXT,
  treatment_start_date DATE,
  recovery_date DATE,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'recovering', 'resolved')),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_disease_logs_batch ON disease_logs(batch_id);

-- ------------------------------------------------------------------------------
-- 7. TABEL VAKSINASI & PENGOBATAN
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vaccinations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  disease_target VARCHAR(100),
  recommended_age_days INTEGER,
  booster_required BOOLEAN DEFAULT false,
  booster_interval_days INTEGER,
  bird_type VARCHAR(20) CHECK (bird_type IN ('layer', 'broiler', 'breeder', 'all')),
  administration_method VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_vaccinations_name'
  ) THEN
    ALTER TABLE vaccinations ADD CONSTRAINT uq_vaccinations_name UNIQUE (name);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS vaccination_records (
  id SERIAL PRIMARY KEY,
  batch_id INTEGER REFERENCES bird_batches(id) ON DELETE CASCADE,
  vaccination_id INTEGER REFERENCES vaccinations(id),
  vaccination_name VARCHAR(100),
  administration_date DATE NOT NULL,
  bird_age_days INTEGER,
  birds_vaccinated INTEGER,
  batch_number VARCHAR(50),
  expiry_date DATE,
  administered_by VARCHAR(100),
  method VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vaccination_batch ON vaccination_records(batch_id);

CREATE TABLE IF NOT EXISTS medication_logs (
  id SERIAL PRIMARY KEY,
  batch_id INTEGER REFERENCES bird_batches(id) ON DELETE CASCADE,
  medication_name VARCHAR(100),
  purpose TEXT,
  start_date DATE,
  end_date DATE,
  dosage VARCHAR(100),
  administration_method VARCHAR(50),
  withdrawal_period_days INTEGER DEFAULT 0,
  cost DECIMAL(12,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 8. TABEL KEUANGAN (INCOME & EXPENSE)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS income_records (
  id SERIAL PRIMARY KEY,
  barn_id INTEGER REFERENCES barns(id) ON DELETE CASCADE,
  batch_id INTEGER REFERENCES bird_batches(id) ON DELETE SET NULL,
  income_date DATE NOT NULL,
  income_type VARCHAR(50) CHECK (income_type IN ('egg_sales', 'bird_sales', 'culled_sales', 'manure', 'other')),
  quantity DECIMAL(10,2) CHECK (quantity > 0),
  unit_price DECIMAL(12,2) CHECK (unit_price >= 0),
  total_amount DECIMAL(14,2) CHECK (total_amount >= 0),
  buyer_name VARCHAR(100),
  notes TEXT,
  created_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_income_barn ON income_records(barn_id);
CREATE INDEX IF NOT EXISTS idx_income_batch ON income_records(batch_id);
CREATE INDEX IF NOT EXISTS idx_income_date ON income_records(income_date);

CREATE TABLE IF NOT EXISTS expense_records (
  id SERIAL PRIMARY KEY,
  barn_id INTEGER REFERENCES barns(id) ON DELETE CASCADE,
  batch_id INTEGER REFERENCES bird_batches(id) ON DELETE SET NULL,
  expense_date DATE NOT NULL,
  expense_category VARCHAR(50) CHECK (expense_category IN ('feed', 'doc', 'medicine', 'labor', 'utilities', 'maintenance', 'other')),
  item_name VARCHAR(100),
  quantity DECIMAL(10,2),
  unit_price DECIMAL(12,2),
  total_amount DECIMAL(14,2) CHECK (total_amount >= 0),
  supplier VARCHAR(100),
  notes TEXT,
  receipt_url VARCHAR(255),
  created_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expense_barn ON expense_records(barn_id);
CREATE INDEX IF NOT EXISTS idx_expense_batch ON expense_records(batch_id);
CREATE INDEX IF NOT EXISTS idx_expense_date ON expense_records(expense_date);

-- ------------------------------------------------------------------------------
-- 9. TABEL TUGAS HARIAN (TASKS)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  barn_id INTEGER REFERENCES barns(id) ON DELETE CASCADE,
  batch_id INTEGER REFERENCES bird_batches(id) ON DELETE SET NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  category VARCHAR(50) CHECK (category IN ('feeding', 'health', 'cleaning', 'maintenance', 'vaccination', 'production', 'other')),
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  due_date DATE NOT NULL,
  due_time TIME,
  assigned_to INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
  completed_at TIMESTAMP,
  completed_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
  completion_notes TEXT,
  time_spent_minutes INTEGER,
  is_recurring BOOLEAN DEFAULT false,
  recurring_pattern VARCHAR(50),
  parent_task_id INTEGER REFERENCES tasks(id),
  reminder_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_barn ON tasks(barn_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);

-- ------------------------------------------------------------------------------
-- 10. TRIGGER UPDATED_AT
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_task_updated_at ON tasks;
CREATE TRIGGER trg_task_updated_at
BEFORE UPDATE ON tasks
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------------------------
-- 11. VIEWS (RINGKASAN & PROFITABILITAS)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW batch_summary AS
SELECT 
  b.id,
  b.barn_id,
  barn.owner_id,
  b.batch_name,
  b.batch_code,
  b.bird_type,
  b.breed,
  b.initial_count,
  b.current_count,
  b.start_date,
  b.target_harvest_date,
  b.status,
  barn.barn_name,
  (CURRENT_DATE - b.start_date) AS age_days,
  ROUND(((b.initial_count - b.current_count)::NUMERIC / NULLIF(b.initial_count, 0)::NUMERIC * 100), 2) AS mortality_rate,
  (SELECT overall_status FROM health_checks hc WHERE hc.batch_id = b.id ORDER BY check_date DESC LIMIT 1) AS latest_health_status,
  (SELECT COUNT(*) FROM vaccination_records vr WHERE vr.batch_id = b.id) AS vaccinations_completed
FROM bird_batches b
LEFT JOIN barns barn ON barn.id = b.barn_id;

CREATE OR REPLACE VIEW batch_profitability AS
SELECT 
  b.id AS batch_id,
  b.barn_id,
  b.batch_name,
  b.bird_type,
  b.start_date,
  b.current_count,
  COALESCE(SUM(i.total_amount), 0) AS total_income,
  COALESCE(SUM(e.total_amount), 0) AS total_expense,
  COALESCE(SUM(i.total_amount), 0) - COALESCE(SUM(e.total_amount), 0) AS net_profit,
  CASE 
    WHEN SUM(e.total_amount) > 0 
    THEN ROUND(((COALESCE(SUM(i.total_amount), 0) - COALESCE(SUM(e.total_amount), 0)) / SUM(e.total_amount) * 100)::NUMERIC, 2)
    ELSE 0
  END AS roi_percentage,
  CASE 
    WHEN b.current_count > 0 
    THEN ROUND((COALESCE(SUM(e.total_amount), 0) / b.current_count)::NUMERIC, 2)
    ELSE 0
  END AS cost_per_bird
FROM bird_batches b
LEFT JOIN income_records i ON i.batch_id = b.id
LEFT JOIN expense_records e ON e.batch_id = b.id
GROUP BY b.id, b.barn_id, b.batch_name, b.bird_type, b.start_date, b.current_count;

-- ------------------------------------------------------------------------------
-- 12. SEED DATA (KATALOG DEFAULT VAKSINASI & PENYAKIT)
-- ------------------------------------------------------------------------------
INSERT INTO vaccinations (name, disease_target, recommended_age_days, bird_type, administration_method, booster_required, booster_interval_days) VALUES
('Marek Disease', 'Marek Disease', 1, 'all', 'injection', false, NULL),
('Newcastle Disease (ND)', 'Newcastle Disease', 4, 'all', 'drinking_water', true, 17),
('Infectious Bronchitis (IB)', 'Infectious Bronchitis', 7, 'all', 'spray', true, 21),
('Gumboro (IBD)', 'Infectious Bursal Disease', 14, 'all', 'drinking_water', false, NULL),
('ND Booster', 'Newcastle Disease', 21, 'all', 'drinking_water', false, NULL),
('Fowl Pox', 'Fowl Pox', 28, 'all', 'wing_web', false, NULL),
('Avian Influenza (AI)', 'Avian Influenza', 35, 'all', 'injection', true, 60)
ON CONFLICT (name) DO NOTHING;

INSERT INTO diseases (disease_name, symptoms, treatment_protocol, prevention_measures) VALUES
('Newcastle Disease', 'Respiratory distress, nervous signs, green diarrhea', 'Supportive care and isolation', 'Vaccination, biosecurity'),
('Infectious Bronchitis', 'Coughing, sneezing, nasal discharge', 'Supportive care', 'Vaccination, ventilation'),
('Avian Influenza', 'Sudden death, respiratory signs, swollen head', 'Culling, disinfection', 'Biosecurity, vaccination'),
('Gumboro', 'Depression, ruffled feathers, watery diarrhea', 'Supportive care', 'Vaccination at 14-21 days'),
('Coccidiosis', 'Bloody diarrhea, reduced growth', 'Anticoccidial drugs', 'Hygiene, anticoccidial programs'),
('Fowl Pox', 'Scabs on comb and wattles', 'Remove scabs carefully', 'Vaccination, mosquito control')
ON CONFLICT (disease_name) DO NOTHING;

COMMIT;