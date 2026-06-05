#!/usr/bin/env bash
#
# Manual deploy of the Auto DCA demo to any static host over SSH.
# Builds the engine + static site and rsyncs app/dist to the server's web root.
#
# Usage:
#   SSH_USER=user SSH_HOST=your-server DEPLOY_PATH=/var/www/auto-dca ./deploy/deploy.sh
#
# Optional: SSH_PORT (default 22), SSH_KEY (path to private key).
set -euo pipefail

: "${SSH_USER:?set SSH_USER}"
: "${SSH_HOST:?set SSH_HOST (server hostname or IP)}"
: "${DEPLOY_PATH:?set DEPLOY_PATH (web root on the server)}"
SSH_PORT="${SSH_PORT:-22}"

HERE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$HERE"

SSH_OPTS="-p ${SSH_PORT}"
[ -n "${SSH_KEY:-}" ] && SSH_OPTS="${SSH_OPTS} -i ${SSH_KEY}"

echo "==> Installing and building"
npm ci
npm run build   # build:engine + build app -> app/dist

echo "==> Deploying app/dist -> ${SSH_USER}@${SSH_HOST}:${DEPLOY_PATH}"
rsync -az --delete -e "ssh ${SSH_OPTS}" app/dist/ "${SSH_USER}@${SSH_HOST}:${DEPLOY_PATH}/"

echo "==> Done. Live once DNS + your web server are configured (see docs/DEPLOY.md)."
