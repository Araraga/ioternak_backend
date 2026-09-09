-- =====================================================
-- MIGRATION: Health Management Tables
-- Version: 002
-- Date: 2026-09-07
-- =====================================================

-- ============ HEALTH CHECKS ============
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
  checked_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============ DISEASES CATALOG ============
CREATE TABLE IF NOT EXISTS diseases (
  id SERIAL PRIMARY KEY,
  disease_name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  symptoms TEXT,
  treatment_protocol TEXT,
  prevention_measures TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============ DISEASE LOGS ============
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

-- ============ VACCINATIONS CATALOG ============
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

-- ============ VACCINATION RECORDS ============
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

-- ============ MEDICATION LOGS ============
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

-- ============ INDEXES ============
CREATE INDEX IF NOT EXISTS idx_health_batch ON health_checks(batch_id);
CREATE INDEX IF NOT EXISTS idx_health_date ON health_checks(check_date);
CREATE INDEX IF NOT EXISTS idx_disease_logs_batch ON disease_logs(batch_id);
CREATE INDEX IF NOT EXISTS idx_vaccination_batch ON vaccination_records(batch_id);

-- ============ SEED DATA: Vaccinations ============
INSERT INTO vaccinations (name, disease_target, recommended_age_days, bird_type, administration_method, booster_required, booster_interval_days) VALUES
('Marek Disease', 'Marek Disease', 1, 'all', 'injection', false, NULL),
('Newcastle Disease (ND)', 'Newcastle Disease', 4, 'all', 'drinking_water', true, 17),
('Infectious Bronchitis (IB)', 'Infectious Bronchitis', 7, 'all', 'spray', true, 21),
('Gumboro (IBD)', 'Infectious Bursal Disease', 14, 'all', 'drinking_water', false, NULL),
('ND Booster', 'Newcastle Disease', 21, 'all', 'drinking_water', false, NULL),
('Fowl Pox', 'Fowl Pox', 28, 'all', 'wing_web', false, NULL),
('Avian Influenza (AI)', 'Avian Influenza', 35, 'all', 'injection', true, 60)
ON CONFLICT DO NOTHING;

-- ============ SEED DATA: Diseases ============
INSERT INTO diseases (disease_name, symptoms, treatment_protocol, prevention_measures) VALUES
('Newcastle Disease', 'Respiratory distress, nervous signs, green diarrhea', 'Supportive care and isolation', 'Vaccination, biosecurity'),
('Infectious Bronchitis', 'Coughing, sneezing, nasal discharge', 'Supportive care', 'Vaccination, ventilation'),
('Avian Influenza', 'Sudden death, respiratory signs, swollen head', 'Culling, disinfection', 'Biosecurity, vaccination'),
('Gumboro', 'Depression, ruffled feathers, watery diarrhea', 'Supportive care', 'Vaccination at 14-21 days'),
('Coccidiosis', 'Bloody diarrhea, reduced growth', 'Anticoccidial drugs', 'Hygiene, anticoccidial programs'),
('Fowl Pox', 'Scabs on comb and wattles', 'Remove scabs carefully', 'Vaccination, mosquito control')
ON CONFLICT (disease_name) DO NOTHING;
