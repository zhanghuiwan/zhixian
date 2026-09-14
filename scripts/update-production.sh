#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"

if [[ "$(git branch --show-current)" != "main" ]]; then
  echo "Production checkout must be on main." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Production checkout has local changes; refusing to update." >&2
  exit 1
fi

docker compose up -d --wait db
ZHIXIAN_BACKUP_DIR="${ZHIXIAN_BACKUP_DIR:-/data/zhixian/backups}" \
  bash scripts/backup.sh

previous_sha="$(git rev-parse HEAD)"
git fetch origin main
git merge --ff-only origin/main

echo "Updating ${previous_sha} -> $(git rev-parse HEAD)"
docker compose build api
docker compose build web
docker compose up -d --wait
docker compose ps
docker compose exec -T api alembic current

echo "Production update completed."
