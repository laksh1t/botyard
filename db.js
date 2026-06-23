const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS bots (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        container_id VARCHAR(255) NOT NULL,
        runtime VARCHAR(50),
        github_url VARCHAR(255),
        status VARCHAR(50) DEFAULT 'running',
        deploys INTEGER DEFAULT 1,
        last_deployed_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      ALTER TABLE bots ADD COLUMN IF NOT EXISTS deploys INTEGER DEFAULT 1;
      ALTER TABLE bots ADD COLUMN IF NOT EXISTS last_deployed_at TIMESTAMPTZ DEFAULT NOW();
    `);
    console.log("[DB] Schema initialized securely.");
  } catch (err) {
    console.error("[DB] Database initialization failed:", err);
  }
}

initDB();

module.exports = pool;
