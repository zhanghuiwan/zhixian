#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
backup_dir="${ZHIXIAN_BACKUP_DIR:-/data/zhixian/backups}"
upload_dir="${ZHIXIAN_UPLOAD_DIR:-/data/zhixian/uploads}"
timestamp="$(date +%Y%m%d_%H%M%S)"

mkdir -p "$backup_dir"
cd "$project_dir"

docker compose exec -T db pg_dump \
  -U "${POSTGRES_USER:-zhixian}" \
  -d "${POSTGRES_DB:-zhixian}" | gzip > "$backup_dir/db_${timestamp}.sql.gz"

if [[ -d "$upload_dir" ]]; then
  tar -czf "$backup_dir/uploads_${timestamp}.tar.gz" -C "$upload_dir" .
fi

find "$backup_dir" -type f -mtime +"${BACKUP_RETENTION_DAYS:-14}" -delete
echo "Backup completed: $timestamp"

