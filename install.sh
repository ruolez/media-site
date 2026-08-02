#!/usr/bin/env bash
#
# Vova Media site — all-in-one installer for a fresh Ubuntu 24.04 server.
#
#   curl -fsSL https://raw.githubusercontent.com/ruolez/media-site/main/install.sh | sudo bash
#
# Menu:
#   1) Install          — Docker, app, Let's Encrypt SSL with auto-renewal
#   2) Update           — pull latest code from GitHub, rebuild, keep data & SSL
#   3) Install/renew SSL — (re)issue the certificate without touching the app
#   4) Remove           — take everything down (with optional final backup)
#
set -euo pipefail

REPO_URL="https://github.com/ruolez/media-site.git"
APP_DIR="/opt/media-site"
BACKUP_DIR="/opt/media-site-backups"
COMPOSE="docker compose"

# ---------------------------------------------------------------- helpers ---

C_GREEN='\033[0;32m'; C_YELLOW='\033[1;33m'; C_RED='\033[0;31m'; C_OFF='\033[0m'
say()  { echo -e "${C_GREEN}==>${C_OFF} $*"; }
warn() { echo -e "${C_YELLOW}[!]${C_OFF} $*"; }
die()  { echo -e "${C_RED}[x]${C_OFF} $*" >&2; exit 1; }

need_root() { [ "$(id -u)" -eq 0 ] || die "Run as root:  sudo bash install.sh"; }

check_ubuntu() {
    . /etc/os-release 2>/dev/null || true
    if [ "${ID:-}" != "ubuntu" ]; then
        warn "This script targets Ubuntu 24.04 — detected: ${PRETTY_NAME:-unknown}."
        confirm "Continue anyway?" || exit 1
    fi
}

confirm() {
    local reply
    read -r -p "$1 [y/N] " reply < /dev/tty
    [[ "$reply" =~ ^[Yy]$ ]]
}

ask() { # ask "Prompt" varname [default]
    local reply
    read -r -p "$1${3:+ [$3]}: " reply < /dev/tty
    printf -v "$2" '%s' "${reply:-${3:-}}"
}

server_ip() {
    curl -fsS --max-time 10 https://api.ipify.org 2>/dev/null \
        || curl -fsS --max-time 10 https://ifconfig.me 2>/dev/null || true
}

domain_ip() { getent ahostsv4 "$1" 2>/dev/null | awk '{print $1; exit}'; }

env_get() { grep -E "^$1=" "$APP_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2-; }

app_domain() { env_get PUBLIC_BASE_URL | sed -E 's~https?://~~; s~/.*$~~'; }

# ----------------------------------------------------------- dependencies ---

install_packages() {
    say "Installing system packages (git, curl, certbot)…"
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y -qq ca-certificates curl git gnupg certbot > /dev/null
}

install_docker() {
    if command -v docker > /dev/null && docker compose version > /dev/null 2>&1; then
        say "Docker with compose plugin already installed."
        return
    fi
    say "Installing Docker CE from the official repository…"
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    . /etc/os-release
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
        > /etc/apt/sources.list.d/docker.list
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io \
        docker-buildx-plugin docker-compose-plugin > /dev/null
    systemctl enable --now docker
    say "Docker installed."
}

open_firewall() {
    if command -v ufw > /dev/null && ufw status | grep -q "Status: active"; then
        say "ufw is active — allowing ports 80 and 443."
        ufw allow 80/tcp > /dev/null || true
        ufw allow 443/tcp > /dev/null || true
    fi
}

# ------------------------------------------------------------------- SSL ---

check_dns() { # check_dns <domain>
    local domain="$1" srv_ip dom_ip
    say "Checking DNS for ${domain}…"
    srv_ip=$(server_ip)
    dom_ip=$(domain_ip "$domain")
    if [ -z "$dom_ip" ]; then
        warn "«${domain}» does not resolve to any IP address."
        warn "Create an A record for ${domain} pointing to this server (${srv_ip:-unknown IP})"
        warn "at your DNS provider, wait for propagation (usually minutes), then re-run."
        confirm "Try to continue anyway?" || exit 1
    elif [ -n "$srv_ip" ] && [ "$dom_ip" != "$srv_ip" ]; then
        warn "«${domain}» resolves to ${dom_ip}, but this server's public IP is ${srv_ip}."
        warn "Let's Encrypt validation will fail unless the A record points here."
        confirm "Continue anyway (e.g. behind a proxy/NAT you know about)?" || exit 1
    else
        say "DNS OK — ${domain} → ${dom_ip}"
    fi
}

issue_cert() { # issue_cert <domain> <email>
    local domain="$1" email="$2" email_args
    say "Requesting Let's Encrypt certificate for ${domain}…"
    if [ -n "$email" ]; then
        email_args="-m $email"
    else
        email_args="--register-unsafely-without-email"
    fi
    # Standalone issuance; hooks stop/start the app's nginx container so
    # port 80 is free during every (re)issue and renewal. The certbot apt
    # package ships a systemd timer, so auto-renewal needs no extra setup.
    certbot certonly --standalone --non-interactive --agree-tos $email_args \
        -d "$domain" \
        --pre-hook  "cd $APP_DIR 2>/dev/null && $COMPOSE stop nginx || true" \
        --post-hook "cd $APP_DIR 2>/dev/null && $COMPOSE start nginx || true" \
        || die "Certificate issuance failed. Check DNS and that port 80 is reachable from the internet."
    say "Certificate issued. Auto-renewal is handled by certbot.timer:"
    systemctl list-timers certbot.timer --no-pager 2>/dev/null | head -3 || true
}

write_production_conf() { # write_production_conf <domain>
    local domain="$1"
    say "Writing production nginx config (HTTPS + redirect)…"
    cat > "$APP_DIR/nginx/production.conf" <<EOF
server {
    listen 80;
    server_name ${domain};
    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl;
    http2 on;
    server_name ${domain};

    ssl_certificate     /etc/letsencrypt/live/${domain}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${domain}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;

    add_header Strict-Transport-Security "max-age=31536000" always;

    include /etc/nginx/snippets/app.conf;
}
EOF
    cat > "$APP_DIR/docker-compose.override.yml" <<EOF
# Generated by install.sh — production TLS setup. Not tracked by git.
services:
  nginx:
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/production.conf:/etc/nginx/conf.d/default.conf:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
EOF
}

# --------------------------------------------------------------- install ---

do_install() {
    if [ -d "$APP_DIR/.git" ]; then
        warn "$APP_DIR already exists."
        confirm "Run an UPDATE instead (keeps data and SSL)?" && { do_update; return; }
        die "Aborted. Use the Remove option first for a truly clean install."
    fi

    install_packages
    install_docker
    open_firewall

    local domain email
    echo
    echo "The site needs a domain name with an A record already pointing at this"
    echo "server (e.g. vovamedia.com or site.vovamedia.com)."
    ask "Domain name" domain
    [ -n "$domain" ] || die "A domain name is required."
    domain=${domain,,}; domain=${domain#http://}; domain=${domain#https://}; domain=${domain%%/*}
    ask "Email for Let's Encrypt expiry notices (blank to skip)" email ""
    check_dns "$domain"

    say "Cloning ${REPO_URL} → ${APP_DIR}…"
    git clone --depth 1 "$REPO_URL" "$APP_DIR"

    say "Generating .env with fresh secrets…"
    local pg_pw secret admin_pw
    pg_pw=$(openssl rand -hex 16)
    secret=$(openssl rand -hex 32)
    admin_pw=$(openssl rand -base64 12 | tr -d '=+/' | cut -c1-14)
    cat > "$APP_DIR/.env" <<EOF
HTTP_PORT=80
POSTGRES_DB=vova
POSTGRES_USER=vova
POSTGRES_PASSWORD=${pg_pw}
DATABASE_URL=postgresql://vova:${pg_pw}@db:5432/vova
SECRET_KEY=${secret}
ADMIN_INITIAL_PASSWORD=${admin_pw}
PUBLIC_BASE_URL=https://${domain}
COOKIE_SECURE=true
EOF
    chmod 600 "$APP_DIR/.env"

    issue_cert "$domain" "$email"
    write_production_conf "$domain"

    say "Building and starting the stack (first build takes a few minutes)…"
    cd "$APP_DIR"
    $COMPOSE up -d --build
    docker image prune -f > /dev/null

    say "Waiting for the app to come up…"
    local i
    for i in $(seq 1 30); do
        curl -fsk "https://${domain}/api/health" > /dev/null 2>&1 && break
        sleep 2
    done
    curl -fsk "https://${domain}/api/health" > /dev/null 2>&1 \
        || warn "Health check not green yet — inspect with:  cd $APP_DIR && $COMPOSE logs"

    echo
    echo "=============================================================="
    echo -e "  ${C_GREEN}Vova Media is installed.${C_OFF}"
    echo
    echo "  Site:   https://${domain}"
    echo "  Admin:  https://${domain}/admin/"
    echo "  Admin password:  ${admin_pw}"
    echo "     (also stored in ${APP_DIR}/.env — change it in Settings)"
    echo
    echo "  App dir:   ${APP_DIR}"
    echo "  Backups:   ${BACKUP_DIR}"
    echo "  SSL:       auto-renews via certbot.timer (~seconds of downtime)"
    echo "=============================================================="
}

# ---------------------------------------------------------------- update ---

backup_data() {
    mkdir -p "$BACKUP_DIR"
    local stamp file
    stamp=$(date +%Y%m%d-%H%M%S)
    file="$BACKUP_DIR/db-${stamp}.sql.gz"
    say "Backing up database → ${file}"
    cd "$APP_DIR"
    if $COMPOSE ps db --status running 2>/dev/null | grep -q db; then
        $COMPOSE exec -T db pg_dump -U "$(env_get POSTGRES_USER)" "$(env_get POSTGRES_DB)" \
            | gzip > "$file" || warn "Database backup failed — continuing."
    else
        warn "Database container not running — skipping SQL dump."
    fi
    cp -a "$APP_DIR/.env" "$BACKUP_DIR/env-${stamp}" 2>/dev/null || true
    # keep the 10 most recent backups of each kind
    ls -1t "$BACKUP_DIR"/db-*.sql.gz 2>/dev/null | tail -n +11 | xargs -r rm -f
    ls -1t "$BACKUP_DIR"/env-* 2>/dev/null | tail -n +11 | xargs -r rm -f
}

do_update() {
    [ -d "$APP_DIR/.git" ] || die "No installation found at $APP_DIR — run Install first."
    cd "$APP_DIR"

    backup_data

    say "Fetching latest code from GitHub…"
    git fetch origin main
    git reset --hard origin/main
    # .env, nginx/production.conf and docker-compose.override.yml are untracked
    # (gitignored), so SSL and configuration survive the reset untouched.

    say "Rebuilding and restarting containers…"
    $COMPOSE up -d --build --remove-orphans

    say "Cleaning up old Docker images…"
    docker image prune -f > /dev/null

    local domain
    domain=$(app_domain)
    say "Update complete — data and SSL untouched."
    [ -n "$domain" ] && echo "  Site: https://${domain}"
}

# ------------------------------------------------------------- ssl renew ---

do_ssl() {
    [ -f "$APP_DIR/.env" ] || die "No installation found at $APP_DIR — run Install first."
    command -v certbot > /dev/null || { install_packages; }

    local domain email
    domain=$(app_domain)
    ask "Domain for the certificate" domain "$domain"
    [ -n "$domain" ] || die "A domain name is required."
    ask "Email for Let's Encrypt (blank to skip)" email ""

    check_dns "$domain"
    issue_cert "$domain" "$email"
    write_production_conf "$domain"

    # keep PUBLIC_BASE_URL in sync if the domain changed
    sed -i "s|^PUBLIC_BASE_URL=.*|PUBLIC_BASE_URL=https://${domain}|" "$APP_DIR/.env"

    say "Restarting nginx with the (new) certificate…"
    cd "$APP_DIR"
    $COMPOSE up -d nginx
    curl -fsk "https://${domain}/api/health" > /dev/null 2>&1 \
        && say "SSL is working — https://${domain}" \
        || warn "Site not responding over HTTPS yet — check:  cd $APP_DIR && $COMPOSE logs nginx"
}

# ---------------------------------------------------------------- remove ---

do_remove() {
    [ -d "$APP_DIR" ] || die "Nothing to remove — $APP_DIR does not exist."

    warn "This removes the app, its containers AND ALL DATA (database, uploads)."
    confirm "Are you sure?" || exit 0
    if confirm "Make a final backup to $BACKUP_DIR first?"; then
        backup_data
        warn "Note: customer-uploaded files are inside the Docker volume and are"
        warn "NOT part of the SQL backup. Copy them first if you need them:"
        warn "  docker run --rm -v media-site_media_data:/data -v $BACKUP_DIR:/out alpine tar czf /out/media-\$(date +%s).tgz /data"
        confirm "Continue with removal?" || exit 0
    fi

    cd "$APP_DIR"
    say "Stopping containers and deleting volumes…"
    $COMPOSE down -v --rmi local 2>/dev/null || true
    cd /
    say "Deleting ${APP_DIR}…"
    rm -rf "$APP_DIR"

    local domain
    for domain in $(ls /etc/letsencrypt/live 2>/dev/null | grep -v README); do
        if confirm "Also delete the Let's Encrypt certificate for ${domain}?"; then
            certbot delete --cert-name "$domain" --non-interactive || true
        fi
    done

    docker image prune -f > /dev/null 2>&1 || true
    say "Removed. (Docker itself and ${BACKUP_DIR} were left in place.)"
}

# ------------------------------------------------------------------ menu ---

main() {
    need_root
    check_ubuntu
    echo
    echo "  Vova Media — server installer"
    echo "  ============================="
    echo "  1) Install (fresh server: Docker, app, SSL)"
    echo "  2) Update  (pull latest code, keep data & SSL)"
    echo "  3) Install / renew SSL certificate only"
    echo "  4) Remove completely"
    echo "  5) Quit"
    echo
    local choice
    read -r -p "Choose [1-5]: " choice < /dev/tty
    case "$choice" in
        1) do_install ;;
        2) do_update ;;
        3) do_ssl ;;
        4) do_remove ;;
        *) exit 0 ;;
    esac
}

main "$@"
