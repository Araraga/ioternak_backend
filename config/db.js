require("dotenv").config();
const { Pool } = require("pg");

let pool;

if (process.env.DATABASE_URL) {
  const isLocal = process.env.DATABASE_URL.includes("localhost") || process.env.DATABASE_URL.includes("127.0.0.1");
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isLocal || process.env.DB_SSL === "false" ? false : { rejectUnauthorized: false },
  });
} else {
  pool = new Pool({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || process.env.DB_PASS || "",
    database: process.env.DB_NAME || "ioternak_db",
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432,
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
  });
}

module.exports = pool;
