#!/usr/bin/env bash
# scripts/new-developer.sh
# First-time dev environment setup for Mission Control (ArchonHQ).
# Run this once after cloning. It checks prerequisites, wires up your .env.local,
# creates the dev database, runs migrations, and seeds a starter tenant.
#
# Usage:
#   bash scripts/new-developer.sh
#   bash scripts/new-developer.sh --non-interactive
#   bash scripts/new-developer.sh --reset
#   bash scripts/new-developer.sh --skip-db

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_NAME="mission_control_dev"
DB_USER="openclaw"
ENV_FILE="$REPO_ROOT/.env.local"
ENV_EXAMPLE="$REPO_ROOT/.env.example"

NON_INTERACTIVE=false
RESET_DB=false
SKIP_DB=false

for arg in "$@"; do
  case "$arg" in
    --non-interactive) NON_INTERACTIVE=true ;;
    --reset)           RESET_DB=true ;;
    --skip-db)         SKIP_DB=true ;;
    *) echo "Unknown flag: $arg. Supported: --non-interactive, --reset, --skip-db" && exit 1 ;;
  esac
done

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
RESET='\033[0m'

info()    { echo -e "${GREEN}[ok]${RESET} $*"; }
warn()    { echo -e "${YELLOW}[warn]${RESET} $*"; }
heading() { echo -e "\n${BOLD}$*${RESET}"; }

print_banner() {
  echo ""
  echo -e "${BOLD}╔══════════════════════════════════════════════╗${RESET}"
  echo -e "${BOLD}║      Welcome to ArchonHQ dev setup           ║${RESET}"
  echo -e "${BOLD}╚══════════════════════════════════════════════╝${RESET}"
  echo ""
}

check_prereqs() {
  heading "Checking prerequisites..."
  local missing=0

  if command -v node &>/dev/null; then
    NODE_VER=$(node -e "process.exit(parseInt(process.versions.node.split('.')[0]) < 22 ? 1 : 0)" 2>/dev/null && node --version || echo "old")
    if node -e "if(parseInt(process.versions.node.split('.')[0]) < 22) process.exit(1)" 2>/dev/null; then
      info "Node $(node --version)"
    else
      echo -e "${RED}[miss]${RESET} Node >= 22 required. Install: nvm install 22 && nvm use 22"
      missing=1
    fi
  else
    echo -e "${RED}[miss]${RESET} Node not found. Install: curl -fsSL https://fnm.vercel.app/install | bash, then: fnm install 22"
    missing=1
  fi

  if command -v pnpm &>/dev/null; then
    info "pnpm $(pnpm --version)"
  else
    echo -e "${RED}[miss]${RESET} pnpm not found. Install: npm install -g pnpm"
    missing=1
  fi

  if command -v psql &>/dev/null; then
    info "psql $(psql --version | head -1)"
  else
    echo -e "${RED}[miss]${RESET} psql not found. Install: sudo apt install postgresql-client  (or: brew install libpq)"
    missing=1
  fi

  if command -v go &>/dev/null; then
    GO_VER=$(go version | grep -oP '\d+\.\d+' | head -1)
    GO_MAJOR=$(echo "$GO_VER" | cut -d. -f1)
    GO_MINOR=$(echo "$GO_VER" | cut -d. -f2)
    if [ "$GO_MAJOR" -gt 1 ] || ([ "$GO_MAJOR" -eq 1 ] && [ "$GO_MINOR" -ge 21 ]); then
      info "Go $(go version)"
    else
      echo -e "${RED}[miss]${RESET} Go >= 1.21 required. Install: https://go.dev/dl/"
      missing=1
    fi
  else
    echo -e "${RED}[miss]${RESET} Go not found. Install: https://go.dev/dl/  (or: brew install go)"
    missing=1
  fi

  if [ "$missing" -eq 1 ]; then
    echo ""
    echo "Please install the missing tools above and run this script again."
    exit 1
  fi

  info "All prerequisites satisfied."
}

setup_env() {
  heading "Setting up .env.local..."

  if [ ! -f "$ENV_FILE" ]; then
    if [ -f "$ENV_EXAMPLE" ]; then
      cp "$ENV_EXAMPLE" "$ENV_FILE"
      info "Copied .env.example to .env.local."
    else
      cat > "$ENV_FILE" <<'ENVTEMPLATE'
NEXTAUTH_URL=http://localhost:3003
NEXTAUTH_SECRET=CHANGE_ME
DATABASE_URL=postgresql://openclaw@localhost/mission_control_dev
GOOGLE_CLIENT_ID=CHANGE_ME
GOOGLE_CLIENT_SECRET=CHANGE_ME
API_SECRET=CHANGE_ME
GATEWAY_URL=http://127.0.0.1:18789
WORKSPACE_PATH=/home/openclaw/.openclaw/workspace
TELEGRAM_BOT_TOKEN=CHANGE_ME
TELEGRAM_CHAT_ID=CHANGE_ME
STRIPE_SECRET_KEY=CHANGE_ME
STRIPE_WEBHOOK_SECRET=CHANGE_ME
STRIPE_PRO_PRICE_ID=CHANGE_ME
STRIPE_TEAM_PRICE_ID=CHANGE_ME
ENCRYPTION_KEY=CHANGE_ME
AUTH_SECRET=CHANGE_ME
ENVTEMPLATE
      info "Created minimal .env.local template."
    fi
  else
    info ".env.local already exists, leaving it alone."
  fi

  # Source the file so we can read existing values.
  set -o allexport
  source "$ENV_FILE"
  set +o allexport

  local needs_values=()

  if [ -z "${NEXTAUTH_SECRET:-}" ] || [ "${NEXTAUTH_SECRET:-}" = "CHANGE_ME" ]; then
    if [ "$NON_INTERACTIVE" = true ]; then
      NEXTAUTH_SECRET=$(openssl rand -base64 32)
      info "Generated NEXTAUTH_SECRET automatically."
    else
      echo ""
      echo "NEXTAUTH_SECRET is not set. Press Enter to generate one, or paste your own:"
      read -r user_secret
      if [ -z "$user_secret" ]; then
        NEXTAUTH_SECRET=$(openssl rand -base64 32)
        info "Generated NEXTAUTH_SECRET."
      else
        NEXTAUTH_SECRET="$user_secret"
      fi
    fi
    # Write back to .env.local using sed, or append if missing.
    if grep -q "^NEXTAUTH_SECRET=" "$ENV_FILE"; then
      sed -i "s|^NEXTAUTH_SECRET=.*|NEXTAUTH_SECRET=$NEXTAUTH_SECRET|" "$ENV_FILE"
    else
      echo "NEXTAUTH_SECRET=$NEXTAUTH_SECRET" >> "$ENV_FILE"
    fi
  else
    info "NEXTAUTH_SECRET already set."
  fi

  if [ -z "${DATABASE_URL:-}" ] || [ "${DATABASE_URL:-}" = "CHANGE_ME" ]; then
    local default_db_url="postgresql://${DB_USER}@localhost/${DB_NAME}"
    if [ "$NON_INTERACTIVE" = true ]; then
      DATABASE_URL="$default_db_url"
    else
      echo ""
      echo "DATABASE_URL is not set. Press Enter to use default ($default_db_url), or paste your own:"
      read -r user_db_url
      DATABASE_URL="${user_db_url:-$default_db_url}"
    fi
    if grep -q "^DATABASE_URL=" "$ENV_FILE"; then
      sed -i "s|^DATABASE_URL=.*|DATABASE_URL=$DATABASE_URL|" "$ENV_FILE"
    else
      echo "DATABASE_URL=$DATABASE_URL" >> "$ENV_FILE"
    fi
    info "DATABASE_URL set to: $DATABASE_URL"
  else
    info "DATABASE_URL already set."
  fi

  # Report keys that still need real values.
  local placeholder_keys=()
  while IFS= read -r line; do
    [[ "$line" =~ ^#.*$ || -z "$line" ]] && continue
    key="${line%%=*}"
    val="${line#*=}"
    if [[ "$val" == "CHANGE_ME" || "$val" == *"your_"* || "$val" == *"change_me"* ]]; then
      placeholder_keys+=("$key")
    fi
  done < "$ENV_FILE"

  if [ ${#placeholder_keys[@]} -gt 0 ]; then
    echo ""
    warn "These keys still need real values in .env.local:"
    for k in "${placeholder_keys[@]}"; do
      echo "    $k"
    done
  fi
}

setup_db() {
  if [ "$SKIP_DB" = true ]; then
    warn "Skipping database setup (--skip-db)."
    return
  fi

  heading "Setting up database..."

  if [ "$RESET_DB" = true ]; then
    warn "Dropping $DB_NAME (--reset)..."
    dropdb --if-exists -U "$DB_USER" "$DB_NAME" 2>/dev/null || true
    info "Dropped $DB_NAME."
  fi

  if psql -U "$DB_USER" -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
    info "Database $DB_NAME already exists."
  else
    createdb -U "$DB_USER" "$DB_NAME"
    info "Created database $DB_NAME."
  fi

  heading "Running migrations..."
  local migration_dir="$REPO_ROOT/drizzle/migrations"
  if [ ! -d "$migration_dir" ]; then
    warn "No migrations directory found at $migration_dir. Skipping."
    return
  fi

  # Check if the tenants table already exists as a proxy for whether migrations ran.
  local already_migrated
  already_migrated=$(psql -U "$DB_USER" -d "$DB_NAME" -tAc \
    "SELECT to_regclass('public.tenants');" 2>/dev/null || echo "")

  if [ "$already_migrated" != "" ] && [ "$already_migrated" != "NULL" ] && [ "$RESET_DB" = false ]; then
    info "Migrations already applied (tenants table exists). Use --reset to reapply."
  else
    for sql_file in $(ls "$migration_dir"/*.sql 2>/dev/null | sort -V); do
      info "Applying $(basename "$sql_file")..."
      psql -U "$DB_USER" -d "$DB_NAME" -f "$sql_file" -q
    done
    info "All migrations applied."
  fi
}

seed_db() {
  if [ "$SKIP_DB" = true ]; then
    return
  fi

  heading "Seeding dev tenant..."
  local tenant_id
  tenant_id=$(psql -U "$DB_USER" -d "$DB_NAME" -tAc \
    "INSERT INTO tenants (slug, name, plan) VALUES ('dev-workspace', 'Dev Workspace', 'free') \
     ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug \
     RETURNING id;" 2>/dev/null || echo "")

  if [ -n "$tenant_id" ]; then
    info "Dev tenant ready. ID: $tenant_id"
  else
    warn "Could not seed tenant. The tenants table may not exist yet (check migrations)."
  fi
}

print_summary() {
  heading "Setup complete."
  echo ""
  echo "What was done:"
  echo "  .env.local is ready at $ENV_FILE"
  [ "$SKIP_DB" = false ] && echo "  Database $DB_NAME is set up and migrated."
  echo ""
  echo "Next steps:"
  echo "  Run the dev server:    bash start-dev.sh"
  echo "  Dashboard URL:         http://localhost:3003"
  echo ""
  echo "  To get your own Navi clone:"
  echo "    See docs/guides/developer-onboarding.md, section 'Getting Your Own Navi Clone'"
  echo ""
  echo "  To run the test suite:  bash scripts/regression-test.sh"
  echo ""
  echo "Happy hacking. If something breaks, check RUNBOOK.md first."
  echo ""
}

print_banner
check_prereqs
setup_env
setup_db
seed_db
print_summary
