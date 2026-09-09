const pool = require('./config/db');
const fs = require('fs');
const path = require('path');

async function runMigrations() {
  try {
    const dir = path.join(__dirname, 'migrations');
    const f1 = fs.readFileSync(path.join(dir, '001_batch_core_tables.sql'), 'utf-8');
    const f2 = fs.readFileSync(path.join(dir, '002_health_tables.sql'), 'utf-8');
    const f3 = fs.readFileSync(path.join(dir, '003_financial_task_tables.sql'), 'utf-8');
    const f4 = fs.readFileSync(path.join(dir, '000_run_all.sql'), 'utf-8').split('-- ============ SUMMARY VIEW ============')[1];

    console.log('Running 001_batch_core_tables.sql...');
    await pool.query(f1);
    
    console.log('Running 002_health_tables.sql...');
    await pool.query(f2);
    
    console.log('Running 003_financial_task_tables.sql...');
    await pool.query(f3);
    
    const f5 = fs.readFileSync(path.join(dir, '004_barn_coordinates_and_dashboard.sql'), 'utf-8');
    console.log('Running 004_barn_coordinates_and_dashboard.sql...');
    await pool.query(f5);

    console.log('Running Views...');
    await pool.query('-- ============ SUMMARY VIEW ============' + f4);
    
    console.log('All migrations completed successfully!');
    process.exit(0);
  } catch (e) {
    console.error('Migration failed:', e);
    process.exit(1);
  }
}

runMigrations();
