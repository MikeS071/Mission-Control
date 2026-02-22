---
title: "Self-Hosting Mission Control"
description: "Deploy Mission Control on your own server with Docker, Coolify, and a Cloudflare tunnel."
---

# Self-Hosting Mission Control

Run Mission Control on your own infrastructure. Requires Docker, PostgreSQL, and a Node.js environment.

## Requirements

- Docker and Docker Compose
- PostgreSQL 15+ (or use the bundled Docker Compose service)
- A domain with HTTPS (required for NextAuth cookie security)
- Google OAuth credentials for sign-in
- Minimum 1 GB RAM, 1 vCPU

## Quick start with Docker Compose

```bash
git clone https://github.com/MikeS071/Mission-Control.git
cd Mission-Control
cp .env.example .env.local
```

Edit `.env.local` with your values (see [Configuration →](/docs/guides/self-hosting)), then:

```bash
docker compose up -d
```

The dashboard is available at `http://localhost:3000`.

## Environment variables

See the full reference at [Configuration →](/docs/guides/self-hosting). Minimum required:

```bash
# NextAuth
NEXTAUTH_URL=https://your-domain.com
NEXTAUTH_SECRET=<32+ char random string>

# Google OAuth
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>

# Database
DATABASE_URL=postgresql://user:password@host:5432/mission_control

# Mission Control API secret (used by agents)
API_SECRET=<32+ char random string>
```

## Database setup

Create the database and run migrations:

```bash
# Create database
psql -U postgres -c "CREATE DATABASE mission_control;"

# Run migrations (handled automatically on first start)
docker compose run --rm app npm run db:migrate
```

## Google OAuth setup

1. Go to [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials
2. Create an OAuth 2.0 client ID (Web application)
3. Add authorised redirect URI: `https://your-domain.com/api/auth/callback/google`
4. Copy client ID and secret to `.env.local`

## Running behind a reverse proxy

Mission Control works behind nginx, Caddy, or Cloudflare Tunnel. The app must see HTTPS at the `NEXTAUTH_URL` level.

**Recommended:** Cloudflare Tunnel, zero-config TLS, no open inbound ports:

```bash
cloudflared tunnel --url http://localhost:3000
```

Point the tunnel to `https://your-domain.com` in the Cloudflare dashboard.

## AiPipe (optional)

AiPipe is a separate Go binary that handles AI routing. It runs alongside the dashboard.

```bash
# Download the latest binary
curl -L https://github.com/MikeS071/AiPipe/releases/latest/download/aipipe-linux-amd64 \
  -o /usr/local/bin/aipipe && chmod +x /usr/local/bin/aipipe

# Create config
mkdir -p ~/.config/aipipe
cat > ~/.config/aipipe/env << 'EOF'
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
AIPIPE_ADMIN_SECRET=<32+ char random string>
EOF

# Run as systemd service
aipipe --install-service
systemctl --user enable aipipe
systemctl --user start aipipe
```

Set `AIPIPE_URL=http://127.0.0.1:8082` in your `.env.local` to connect.

## Updating

```bash
git pull origin main
docker compose down
docker compose up -d --build
```

Migrations run automatically on startup.

## Backup

Back up the PostgreSQL database:

```bash
pg_dump mission_control > backup_$(date +%Y%m%d).sql
```

No file system state beyond the database is required, all data lives in Postgres.

## Troubleshooting

**Login redirects loop:**
- Verify `NEXTAUTH_URL` matches the exact URL you're accessing (including https)
- Check that the Google OAuth redirect URI matches exactly

**Dashboard loads but shows "Unauthorized":**
- Confirm `API_SECRET` matches in both `.env.local` and anywhere agents send `Authorization: Bearer`

**AiPipe not routing:**
- Check `aipipe healthz`: `curl http://127.0.0.1:8082/healthz`
- Verify `AIPIPE_URL` is set in `.env.local`
- Confirm `AIPIPE_ADMIN_SECRET` is set and matches in both services
