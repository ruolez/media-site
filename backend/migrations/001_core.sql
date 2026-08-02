CREATE TABLE admin_account (
  id            smallint PRIMARY KEY CHECK (id = 1),
  password_hash text NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE settings (
  key   text PRIMARY KEY,
  value text NOT NULL DEFAULT ''
);

CREATE TABLE categories (
  id         serial PRIMARY KEY,
  name       text NOT NULL,
  slug       text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE projects (
  id              serial PRIMARY KEY,
  title           text NOT NULL,
  slug            text NOT NULL UNIQUE,
  client          text NOT NULL DEFAULT '',
  category_id     integer REFERENCES categories(id) ON DELETE SET NULL,
  year            integer,
  video_url       text NOT NULL DEFAULT '',
  video_embed_url text NOT NULL DEFAULT '',
  description     text NOT NULL DEFAULT '',
  credits         text NOT NULL DEFAULT '',
  poster_path     text,
  preview_path    text,
  sort_order      integer NOT NULL DEFAULT 0,
  published       boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_projects_pub ON projects (published, sort_order);

CREATE TABLE project_stills (
  id         serial PRIMARY KEY,
  project_id integer NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path       text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE services (
  id          serial PRIMARY KEY,
  title       text NOT NULL,
  description text NOT NULL DEFAULT '',
  sort_order  integer NOT NULL DEFAULT 0
);

CREATE TABLE clients (
  id         serial PRIMARY KEY,
  name       text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE inquiries (
  id          serial PRIMARY KEY,
  name        text NOT NULL,
  email       text NOT NULL,
  company     text NOT NULL DEFAULT '',
  message     text NOT NULL,
  is_read     boolean NOT NULL DEFAULT false,
  email_sent  boolean NOT NULL DEFAULT false,
  email_error text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
