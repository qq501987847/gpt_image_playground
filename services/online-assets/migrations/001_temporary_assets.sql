CREATE TABLE IF NOT EXISTS temporary_assets (
  id uuid PRIMARY KEY,
  source_origin text NOT NULL,
  user_id text NOT NULL,
  task_id text NOT NULL,
  original_key text NOT NULL UNIQUE,
  original_bytes bigint NOT NULL,
  original_media_type text NOT NULL,
  thumbnail_key text,
  thumbnail_bytes bigint,
  thumbnail_media_type text,
  status text NOT NULL CHECK (status IN ('initialized', 'available')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  confirmed_at timestamptz,
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS temporary_assets_owner_expiry
  ON temporary_assets (source_origin, user_id, expires_at);
