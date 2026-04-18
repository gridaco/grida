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

echo ""
echo -e "${CYAN}${BOLD}"
echo "   ____      _     _       "
echo "  / ___|_ __(_) __| | __ _ "
echo " | |  _| '__| |/ _\` |/ _\` |"
echo " | |_| | |  | | (_| | (_| |"
echo "  \____|_|  |_|\__,_|\__,_|"
echo -e "${NC}"
echo -e "${DIM}  Development Environment Init${NC}"
echo ""

# 1. Check prerequisites
echo -e "${BLUE}${BOLD}[1/3]${NC} Checking prerequisites..."

if command -v node &>/dev/null; then
  NODE_V=$(node --version)
  echo -e "  ${GREEN}+${NC} node ${DIM}${NODE_V}${NC}"
else
  echo -e "  ${RED}x${NC} node not found - install Node.js 22+"
  exit 1
fi

if command -v pnpm &>/dev/null; then
  PNPM_V=$(pnpm --version)
  echo -e "  ${GREEN}+${NC} pnpm ${DIM}v${PNPM_V}${NC}"
else
  echo -e "  ${RED}x${NC} pnpm not found - install pnpm 10+"
  exit 1
fi

if command -v docker &>/dev/null; then
  echo -e "  ${GREEN}+${NC} docker"
else
  echo -e "  ${YELLOW}~${NC} docker not found ${DIM}(needed for pnpm dev:services)${NC}"
fi

if command -v supabase &>/dev/null; then
  SB_V=$(supabase --version 2>/dev/null || echo "unknown")
  echo -e "  ${GREEN}+${NC} supabase ${DIM}${SB_V}${NC}"
else
  echo -e "  ${YELLOW}~${NC} supabase CLI not found ${DIM}(needed for pnpm dev:services)${NC}"
fi

echo ""

# 2. Create .env.local
echo -e "${BLUE}${BOLD}[2/3]${NC} Setting up environment..."

ENV_FILE="$REPO_ROOT/editor/.env.local"
ENV_EXAMPLE="$REPO_ROOT/editor/.env.example"

if [ -f "$ENV_FILE" ]; then
  echo -e "  ${YELLOW}~${NC} editor/.env.local already exists, skipping"
else
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  echo -e "  ${GREEN}+${NC} Created editor/.env.local from .env.example"
fi

echo ""

# 3. Install dependencies
echo -e "${BLUE}${BOLD}[3/3]${NC} Installing dependencies..."
echo ""
pnpm install
echo ""

# Done
echo -e "${GREEN}${BOLD}Init complete!${NC}"
echo ""
echo -e "  Next steps:"
echo -e "  ${DIM}1.${NC} pnpm dev:services  ${DIM}# start Supabase${NC}"
echo -e "  ${DIM}2.${NC} pnpm dev           ${DIM}# start the editor${NC}"
echo ""
