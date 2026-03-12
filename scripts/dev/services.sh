#!/usr/bin/env bash
set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="$REPO_ROOT/editor/.env.local"

echo ""
echo -e "${CYAN}${BOLD}"
echo "   ____      _     _       "
echo "  / ___|_ __(_) __| | __ _ "
echo " | |  _| '__| |/ _\` |/ _\` |"
echo " | |_| | |  | | (_| | (_| |"
echo "  \____|_|  |_|\__,_|\__,_|"
echo -e "${NC}"
echo -e "${DIM}  Development Services${NC}"
echo ""

# 1. Check prerequisites
echo -e "${BLUE}${BOLD}[1/4]${NC} Checking prerequisites..."

if ! command -v docker &>/dev/null; then
  echo -e "  ${RED}x${NC} Docker is not installed"
  exit 1
fi

if ! docker info &>/dev/null 2>&1; then
  echo -e "  ${RED}x${NC} Docker is not running - please start Docker Desktop"
  exit 1
fi
echo -e "  ${GREEN}+${NC} Docker is running"

if ! command -v supabase &>/dev/null; then
  echo -e "  ${RED}x${NC} Supabase CLI not found"
  echo -e "  ${DIM}  Install: brew install supabase/tap/supabase${NC}"
  echo -e "  ${DIM}  Or:      mise install${NC}"
  exit 1
fi
echo -e "  ${GREEN}+${NC} Supabase CLI"

if [ ! -f "$ENV_FILE" ]; then
  echo -e "  ${RED}x${NC} editor/.env.local not found - run ${BOLD}pnpm dev:init${NC} first"
  exit 1
fi
echo -e "  ${GREEN}+${NC} editor/.env.local"

echo ""

# 2. Generate signing keys if missing
SIGNING_KEYS="$REPO_ROOT/supabase/signing_keys.json"
if [ ! -f "$SIGNING_KEYS" ] || [ "$(cat "$SIGNING_KEYS")" = "[]" ]; then
  echo -e "${BLUE}${BOLD}[2/4]${NC} Generating Supabase signing keys..."
  node -e "
    const crypto = require('crypto');
    const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const jwk = privateKey.export({ format: 'jwk' });
    jwk.kid = crypto.randomUUID();
    jwk.use = 'sig';
    jwk.key_ops = ['sign', 'verify'];
    jwk.alg = 'ES256';
    jwk.ext = true;
    console.log(JSON.stringify([jwk], null, 2));
  " > "$SIGNING_KEYS"
  echo -e "  ${GREEN}+${NC} Created supabase/signing_keys.json"
else
  echo -e "${BLUE}${BOLD}[2/4]${NC} Signing keys exist, skipping"
fi

echo ""

# 3. Start Supabase
echo -e "${BLUE}${BOLD}[3/4]${NC} Starting Supabase..."
echo ""
cd "$REPO_ROOT"
supabase start || true
echo ""

# 4. Inject local Supabase keys into .env.local
echo -e "${BLUE}${BOLD}[4/4]${NC} Configuring environment..."

SUPABASE_OUTPUT=$(supabase status -o env 2>/dev/null || true)

API_URL=$(echo "$SUPABASE_OUTPUT" | grep '^API_URL=' | cut -d= -f2- | tr -d '"' || true)
PUBLISHABLE_KEY=$(echo "$SUPABASE_OUTPUT" | grep '^PUBLISHABLE_KEY=' | cut -d= -f2- | tr -d '"' || true)
SECRET_KEY=$(echo "$SUPABASE_OUTPUT" | grep '^SECRET_KEY=' | cut -d= -f2- | tr -d '"' || true)

UPDATED=0

if [ -n "$API_URL" ]; then
  sed -i.bak "s|^SUPABASE_URL=.*|SUPABASE_URL=\"$API_URL\"|" "$ENV_FILE"
  sed -i.bak "s|^NEXT_PUBLIC_SUPABASE_URL=.*|NEXT_PUBLIC_SUPABASE_URL=\"$API_URL\"|" "$ENV_FILE"
  echo -e "  ${GREEN}+${NC} SUPABASE_URL ${DIM}${API_URL}${NC}"
  UPDATED=1
fi

if [ -n "$PUBLISHABLE_KEY" ]; then
  sed -i.bak "s|^NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=.*|NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=\"$PUBLISHABLE_KEY\"|" "$ENV_FILE"
  echo -e "  ${GREEN}+${NC} NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ${DIM}${PUBLISHABLE_KEY:0:20}...${NC}"
  UPDATED=1
fi

if [ -n "$SECRET_KEY" ]; then
  sed -i.bak "s|^SUPABASE_SECRET_KEY=.*|SUPABASE_SECRET_KEY=\"$SECRET_KEY\"|" "$ENV_FILE"
  echo -e "  ${GREEN}+${NC} SUPABASE_SECRET_KEY ${DIM}${SECRET_KEY:0:20}...${NC}"
  UPDATED=1
fi

rm -f "$ENV_FILE.bak"

if [ "$UPDATED" -eq 0 ]; then
  echo -e "  ${YELLOW}~${NC} Could not read Supabase keys - update .env.local manually"
fi

echo ""
echo -e "${GREEN}${BOLD}Services running!${NC}"
echo ""
echo -e "  Next step:"
echo -e "  ${DIM}$${NC} pnpm dev  ${DIM}# start the editor${NC}"
echo ""
