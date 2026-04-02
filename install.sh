#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${1:-https://github.com/ImTheLeviDR/SmartClaw}"
TARGET_DIR="${2:-$(basename "${REPO_URL}")}"
TARGET_DIR="${TARGET_DIR%.git}"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "$1 is required but was not found in PATH." >&2
    if command -v apt-get >/dev/null 2>&1; then
      echo "On Debian/Ubuntu you can usually install prerequisites with:" >&2
      echo "  sudo apt-get update && sudo apt-get install -y git curl build-essential nodejs npm" >&2
    fi
    exit 1
  }
}

install_node_if_possible() {
  if command -v node >/dev/null 2>&1; then
    return
  fi

  if ! command -v apt-get >/dev/null 2>&1; then
    return
  fi

  echo "Node.js was not found."

  if [ "$(id -u)" -eq 0 ]; then
    echo "Installing nodejs and npm with apt-get..."
    apt-get update
    apt-get install -y nodejs npm
  else
    echo "Please install Node.js first:" >&2
    echo "  sudo apt-get update && sudo apt-get install -y nodejs npm" >&2
    exit 1
  fi
}

require_cmd git
install_node_if_possible
require_cmd node

if [ -f "./package.json" ] && [ -d "./src" ]; then
  TARGET_DIR="."
elif [ ! -d "$TARGET_DIR" ]; then
  git clone "$REPO_URL" "$TARGET_DIR"
fi

cd "$TARGET_DIR"

if ! command -v pnpm >/dev/null 2>&1; then
  if command -v corepack >/dev/null 2>&1; then
    corepack enable
    corepack prepare pnpm@latest --activate
  else
    echo "pnpm was not found and corepack is unavailable." >&2
    exit 1
  fi
fi

pnpm install
pnpm run setup:wizard
