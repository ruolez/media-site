# Vova Media — Production Agency Website

Dark, cinematic portfolio site for the Vova Media video production agency, with a
full admin dashboard and a resumable large-file upload system for customers.

## Stack

- **nginx** (only exposed port) — serves the static frontend, proxies `/api/` to the
  backend, serves uploaded media, and handles protected file downloads via
  `X-Accel-Redirect` (with free HTTP Range support).
- **backend** — Python 3.12 + Flask + gunicorn. Plain SQL migrations applied at
  startup under a Postgres advisory lock.
- **db** — PostgreSQL 16.
- **frontend** — hand-written HTML/CSS/vanilla JS. No build step; edits are live on
  browser refresh (the `frontend/` dir is bind-mounted read-only into nginx).

Volumes: `db_data` (Postgres), `media_data` (`/data/assets` public media,
`/data/uploads` customer files — mounted read-only in nginx).

## Production install (Ubuntu 24.04)

Point your domain's A record at the server first, then:

```bash
curl -fsSL https://raw.githubusercontent.com/ruolez/media-site/main/install.sh | sudo bash
```

The menu offers:

1. **Install** — installs Docker CE + certbot, clones this repo to
   `/opt/media-site`, generates secrets, issues a Let's Encrypt certificate
   (with DNS pre-check and auto-renewal via `certbot.timer`), and starts the
   stack on ports 80/443 with an HTTP→HTTPS redirect and HSTS.
2. **Update** — dumps the database to `/opt/media-site-backups/`, pulls the
   latest code from GitHub, rebuilds containers, prunes old Docker images.
   Data volumes, `.env` and the SSL certificate are untouched.
3. **Install / renew SSL only** — re-issues the certificate (e.g. after a
   domain change or a broken cert) without touching the app or data.
4. **Remove** — deletes containers, volumes, app directory, and optionally the
   certificate, with an optional final backup first.

Renewals run automatically; the pre/post hooks stop/start only the nginx
container for a few seconds while certbot binds port 80.

## Quick start (local development)

```bash
cp .env.example .env        # then edit: passwords, SECRET_KEY, PUBLIC_BASE_URL
docker compose up -d --build
```

- Site: `http://localhost:8081` (port = `HTTP_PORT` in `.env`)
- Admin: `http://localhost:8081/admin/` — password = `ADMIN_INITIAL_PASSWORD`
  (seeded on first run only; change it later in Settings)

`PUBLIC_BASE_URL` is used for generated upload links and the sitemap — set it to
the real public origin in production.

## Admin dashboard

- **Projects** — CRUD, drag to reorder, publish/draft. Each project: title, client,
  category, year, YouTube/Vimeo URL (normalized server-side into a safe embed URL),
  description, credits, poster image, optional hover-preview MP4, stills.
- **Content** — services, clients, categories (drag to reorder), and **page
  sections**: rich-text blocks (headings, bold/italic, lists, quotes, links,
  rules, inline image uploads, raw-HTML mode) that render on the homepage after
  the About section with automatic section numbering. Section HTML is sanitized
  server-side against a strict allowlist (`backend/app/sanitize.py`) — scripts,
  event handlers, off-site image sources and unknown tags are stripped on save.
- **Inquiries** — contact-form submissions, unread badge, email delivery status.
- **Uploads** — create/revoke/delete customer upload links, browse and download
  received files.
- **Settings** — site texts, showreel URL, hero background loop MP4, social links,
  SMTP config (password stored in DB, masked in API responses), test-email button,
  admin password change.

## Customer uploads (resumable)

Admin creates a link (label, expiry days, size quota) → sends the one-time-shown
URL (`/u/<token>`) to the customer. The token is 256-bit random; only its SHA-256
is stored. The customer's browser uploads files in sequential 32 MB chunks:

- The server is the sole source of truth for the committed offset. Chunks are
  fsynced to disk **before** the offset advances in Postgres, so a crash at any
  point costs at most one chunk (the file is truncated back to the committed
  offset on the next write).
- Offset mismatches return `409 {offset}` and the client resynchronizes — a
  dropped connection resumes automatically with exponential backoff.
- After a page reload the customer re-selects the same file; registration is
  idempotent on a `name|size|lastModified` fingerprint and resumes at the server
  offset.
- On completion the server computes and stores the file's SHA-256.

Admin downloads go through Flask for auth only; nginx serves the bytes via the
internal `/protected-files/` location (`X-Accel-Redirect`), so downloads are
Range-resumable and never occupy a Python worker.

## SMTP

Configure in Settings. Contact-form submissions are always stored as inquiries;
the email is sent asynchronously and its status recorded (`email_sent` /
`email_error` visible in the Inquiries page). Port 465 uses implicit SSL,
otherwise STARTTLS when TLS is enabled. Test locally with MailHog/maildev:
host `host.docker.internal`, port `1025`, TLS off.

## Development notes

- Backend code is bind-mounted with gunicorn `--reload` — Python edits apply in
  ~1s without a rebuild.
- Migrations live in `backend/migrations/NNN_*.sql`; new files apply on restart.
- nginx body-size zones: 1 MB default, 64 MB on `/api/upload/` (chunks),
  210 MB on `/api/admin/media/` (poster ≤20 MB, video ≤200 MB enforced in Flask
  by magic-byte sniffing + streaming size checks).
- All user content is rendered with `textContent` (no innerHTML of user data).
- Admin session: signed cookie, HttpOnly, SameSite=Lax, plus an `X-CSRF: 1`
  header requirement on all mutating admin requests. Set `COOKIE_SECURE=true`
  behind HTTPS.

## Backup

Everything lives in the two Docker volumes:

```bash
docker compose exec db pg_dump -U vova vova > backup.sql
docker run --rm -v media-site_media_data:/data -v "$PWD":/out alpine \
  tar czf /out/media-backup.tgz /data
```

`docker compose down -v` destroys both volumes — data and uploads included.
