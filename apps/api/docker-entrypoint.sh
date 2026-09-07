#!/bin/sh
set -eu

alembic upgrade head
python -m app.db.seed
WORDLIST_MANIFEST_PATH="${WORDLIST_MANIFEST_PATH:-/app/data/wordlists/manifests/zhixian-core-en-v1.json}"
if [ ! -f "$WORDLIST_MANIFEST_PATH" ]; then
  echo "Core wordlist manifest is missing: $WORDLIST_MANIFEST_PATH" >&2
  exit 1
fi
python -m app.db.import_wordlist --manifest "$WORDLIST_MANIFEST_PATH" --apply
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers "${WEB_CONCURRENCY:-2}"
