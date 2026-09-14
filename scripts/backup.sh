#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
backup_dir="${ZHIXIAN_BACKUP_DIR:-/data/zhixian/backups}"
upload_dir="${ZHIXIAN_UPLOAD_DIR:-$project_dir/data/uploads}"
timestamp="$(date +%Y%m%d_%H%M%S)"
db_backup="$backup_dir/db_${timestamp}.sql.gz"
db_backup_tmp="${db_backup}.tmp"

cleanup() {
  rm -f "$db_backup_tmp"
}
trap cleanup EXIT

mkdir -p "$backup_dir"
cd "$project_dir"

docker compose exec -T db sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' | gzip > "$db_backup_tmp"

gzip -t "$db_backup_tmp"
[[ -s "$db_backup_tmp" ]]
mv "$db_backup_tmp" "$db_backup"

if [[ -d "$upload_dir" ]]; then
  tar -czf "$backup_dir/uploads_${timestamp}.tar.gz" -C "$upload_dir" .
fi

find "$backup_dir" -type f -mtime +"${BACKUP_RETENTION_DAYS:-14}" -delete
echo "Backup completed: $timestamp"
