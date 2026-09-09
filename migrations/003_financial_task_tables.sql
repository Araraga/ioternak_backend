-- =====================================================
-- MIGRATION: Financial & Task Management Tables
-- Version: 003
-- Date: 2026-09-07
-- =====================================================

-- ============ INCOME RECORDS ============
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

-- ============ EXPENSE RECORDS (Enhanced) ============
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

-- ============ TASKS ============
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

-- ============ INDEXES ============
CREATE INDEX IF NOT EXISTS idx_income_barn ON income_records(barn_id);
CREATE INDEX IF NOT EXISTS idx_income_batch ON income_records(batch_id);
CREATE INDEX IF NOT EXISTS idx_income_date ON income_records(income_date);

CREATE INDEX IF NOT EXISTS idx_expense_barn ON expense_records(barn_id);
CREATE INDEX IF NOT EXISTS idx_expense_batch ON expense_records(batch_id);
CREATE INDEX IF NOT EXISTS idx_expense_date ON expense_records(expense_date);

CREATE INDEX IF NOT EXISTS idx_tasks_barn ON tasks(barn_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);

-- ============ VIEWS ============
CREATE OR REPLACE VIEW batch_profitability AS
SELECT 
  b.id AS batch_id,
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
GROUP BY b.id, b.batch_name, b.bird_type, b.start_date, b.current_count;

-- ============ TRIGGERS ============
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
