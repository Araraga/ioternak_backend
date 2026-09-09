const pool = require('./config/db');
const fs = require('fs');
const path = require('path');

async function runMigrations() {
  try {
    const dir = path.join(__dirname, 'migrations');
    const sqlFile = path.join(dir, 'vps_master_migration.sql');
    const sql = fs.readFileSync(sqlFile, 'utf-8');

    console.log('🚀 Menjalankan migrasi database master PostgreSQL...');
    await pool.query(sql);

    console.log('✅ Seluruh tabel, kolom, relasi, index, trigger, view, dan seed data berhasil di-update!');
    process.exit(0);
  } catch (e) {
    console.error('❌ Migrasi gagal:', e);
    process.exit(1);
  }
}

runMigrations();
