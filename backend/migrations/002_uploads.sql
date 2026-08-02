CREATE TABLE upload_links (
  id         serial PRIMARY KEY,
  token_hash text NOT NULL UNIQUE,
  label      text NOT NULL,
  max_bytes  bigint NOT NULL,
  max_files  integer NOT NULL DEFAULT 100,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE upload_files (
  id             serial PRIMARY KEY,
  link_id        integer NOT NULL REFERENCES upload_links(id) ON DELETE CASCADE,
  client_name    text NOT NULL,
  storage_name   text NOT NULL UNIQUE,
  total_bytes    bigint NOT NULL CHECK (total_bytes >= 0),
  bytes_received bigint NOT NULL DEFAULT 0,
  fingerprint    text NOT NULL,
  sha256         text,
  status         text NOT NULL DEFAULT 'uploading'
                 CHECK (status IN ('uploading','complete')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  completed_at   timestamptz,
  UNIQUE (link_id, fingerprint)
);
CREATE INDEX idx_upload_files_link ON upload_files (link_id, created_at);
