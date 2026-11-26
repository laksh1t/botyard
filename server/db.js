const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDB() {
  try {
    const schema = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
    await pool.query(schema);
    console.log("[DB] Schema initialized securely.");
  } catch (err) {
    console.error("[DB] Database initialization failed:", err);
  }
}

initDB();

module.exports = pool;
