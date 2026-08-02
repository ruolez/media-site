CREATE TABLE content_blocks (
  id         serial PRIMARY KEY,
  title      text NOT NULL,
  show_title boolean NOT NULL DEFAULT true,
  body_html  text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  published  boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
