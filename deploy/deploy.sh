#!/usr/bin/env bash
#
# Manual deploy of the Auto DCA demo to workollab-02.
# Builds the engine + static site and rsyncs it to the server.
#
# Usage:
#   SSH_USER=deploy SSH_HOST=workollab-02 DEPLOY_PATH=/var/www/auto-dca ./deploy/deploy.sh
#
# Optional: SSH_PORT (default 22), SSH_KEY (path to private key).
set -euo pipefail

: "${SSH_USER:?set SSH_USER}"
: "${SSH_HOST:?set SSH_HOST}"
: "${DEPLOY_PATH:?set DEPLOY_PATH}"
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

echo "==> Done. Live once DNS + Caddy are configured (see docs/DEPLOY.md)."
