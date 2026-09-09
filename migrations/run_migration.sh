#!/usr/bin/env bash
# ==============================================================================
# Script Migrasi Database PostgreSQL untuk IoTernak / Maggenzim di VPS
# ==============================================================================

set -e

# Load .env jika ada
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
elif [ -f ../.env ]; then
  export $(grep -v '^#' ../.env | xargs)
fi

DB_USER=${DB_USER:-"postgres"}
DB_NAME=${DB_NAME:-"ioternak_db"}
DB_HOST=${DB_HOST:-"127.0.0.1"}
DB_PORT=${DB_PORT:-"5432"}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL_FILE="$SCRIPT_DIR/vps_master_migration.sql"

echo "🐘 Menjalankan migrasi PostgreSQL ke database: $DB_NAME di $DB_HOST:$DB_PORT..."

if [ -n "$DATABASE_URL" ]; then
  psql "$DATABASE_URL" -f "$SQL_FILE"
else
  PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$SQL_FILE"
fi

echo "✅ Migrasi PostgreSQL selesai dengan sukses!"