INSERT INTO categories (name, slug, sort_order) VALUES
  ('Films', 'films', 1),
  ('Social', 'social', 2),
  ('YouTube', 'youtube', 3),
  ('Commercial', 'commercial', 4)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO settings (key, value) VALUES
  ('site_title', 'Vova Media'),
  ('tagline', 'Films, social & YouTube content with a cinematic eye.'),
  ('manifesto', ''),
  ('meta_description', 'Vova Media is a media production agency crafting short films, social media video and YouTube content.'),
  ('showreel_url', ''),
  ('hero_loop_path', ''),
  ('contact_email', ''),
  ('social_instagram', ''),
  ('social_youtube', ''),
  ('social_vimeo', ''),
  ('smtp_host', ''),
  ('smtp_port', '587'),
  ('smtp_user', ''),
  ('smtp_password', ''),
  ('smtp_tls', 'true'),
  ('smtp_from', '')
ON CONFLICT (key) DO NOTHING;
