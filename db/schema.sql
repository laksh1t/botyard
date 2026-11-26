CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bots (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(39) NOT NULL,
  runtime VARCHAR(20),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'stopped')),
  container_id VARCHAR(100),
  current_deployment_id INTEGER,
  github_url VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS deployments (
  id SERIAL PRIMARY KEY,
  bot_id INTEGER NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'building', 'succeeded', 'failed')),
  "trigger" VARCHAR(20) NOT NULL DEFAULT 'manual' CHECK ("trigger" IN ('manual', 'env_change', 'webhook', 'rollback')),
  source_type VARCHAR(10) NOT NULL CHECK (source_type IN ('zip', 'github')),
  source_ref VARCHAR(255),
  image_tag VARCHAR(100),
  error TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (bot_id, version)
);

CREATE TABLE IF NOT EXISTS env_vars (
  bot_id INTEGER NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  key VARCHAR(100) NOT NULL,
  value_enc TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (bot_id, key)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_bots_current_deployment'
  ) THEN
    ALTER TABLE bots
      ADD CONSTRAINT fk_bots_current_deployment
      FOREIGN KEY (current_deployment_id) REFERENCES deployments(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bots_user ON bots(user_id);
CREATE INDEX IF NOT EXISTS idx_deployments_bot ON deployments(bot_id, created_at DESC);
