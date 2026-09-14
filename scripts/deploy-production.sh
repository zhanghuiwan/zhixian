#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"

deploy_host="${ZHIXIAN_DEPLOY_HOST:-aliyun}"
npm_registry="${NPM_CONFIG_REGISTRY:-https://registry.npmmirror.com/}"

if [[ "$(git branch --show-current)" != "main" ]]; then
  echo "Local checkout must be on main." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Local checkout has changes; refusing to deploy." >&2
  exit 1
fi

git fetch origin main
revision="$(git rev-parse HEAD)"
if [[ "$revision" != "$(git rev-parse origin/main)" ]]; then
  echo "Local main must exactly match origin/main." >&2
  exit 1
fi

web_image="zhixian-web:${revision}"
docker buildx build \
  --platform linux/amd64 \
  --load \
  --tag "$web_image" \
  --build-arg "NPM_CONFIG_REGISTRY=$npm_registry" \
  --build-arg NEXT_PUBLIC_API_URL=/api/v1 \
  --build-arg NEXT_PUBLIC_DEMO_MODE=false \
  apps/web

docker image save --platform linux/amd64 "$web_image" | gzip -1 | \
  ssh "$deploy_host" 'gzip -d | docker load'

ssh "$deploy_host" "bash -s -- '$revision'" <<'REMOTE'
set -euo pipefail
revision="$1"
cd /opt/zhixian
git fetch origin main
git merge --ff-only origin/main
if [[ "$(git rev-parse HEAD)" != "$revision" ]]; then
  echo "Server main does not match the locally verified GitHub revision." >&2
  exit 1
fi
ZHIXIAN_WEB_IMAGE_TAG="$revision" \
  ZHIXIAN_BACKUP_DIR=/data/zhixian/backups \
  bash scripts/update-production.sh
curl --fail --silent --show-error http://127.0.0.1:8080/api/v1/health
REMOTE

echo "Deployed GitHub main revision ${revision} to ${deploy_host}."
