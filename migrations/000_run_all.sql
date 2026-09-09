-- =====================================================
-- RUN ALL MIGRATIONS
-- Execute this file to create all tables at once
-- =====================================================

\i 001_batch_core_tables.sql
\i 002_health_tables.sql
\i 003_financial_task_tables.sql

-- ============ SUMMARY VIEW ============
CREATE OR REPLACE VIEW batch_summary AS
SELECT 
  b.id,
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

COMMENT ON VIEW batch_summary IS 'Quick summary of all batches with key metrics';
COMMENT ON VIEW batch_profitability IS 'Financial performance per batch';
