#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"
web_image_tag="${ZHIXIAN_WEB_IMAGE_TAG:-}"

if [[ -z "$web_image_tag" ]]; then
  total_memory_kib="$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)"
  if (( total_memory_kib < 3145728 )); then
    echo "This server has less than 3 GiB RAM. Use scripts/deploy-production.sh from a development machine so the Web image is built locally." >&2
    exit 1
  fi
fi

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

if [[ -n "$web_image_tag" ]]; then
  web_image="zhixian-web:${web_image_tag}"
  image_arch="$(docker image inspect "$web_image" --format '{{.Architecture}}')"
  if [[ "$image_arch" != "amd64" ]]; then
    echo "Prebuilt Web image must use the amd64 architecture." >&2
    exit 1
  fi
  docker tag "$web_image" zhixian-web:latest
else
  docker compose build web
fi

docker compose up -d --wait
docker compose ps
docker compose exec -T api alembic current

echo "Production update completed."
