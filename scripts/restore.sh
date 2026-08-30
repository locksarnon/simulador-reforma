#!/usr/bin/env bash
# Restaura um backup gerado por backup.sh.
# Uso: bash scripts/restore.sh backups/20260829_120000
set -euo pipefail
cd "$(dirname "$0")/.."

DIR="${1:-}"
if [ -z "$DIR" ] || [ ! -d "$DIR" ]; then
  echo "Uso: bash scripts/restore.sh <pasta-do-backup>" >&2
  echo "Exemplo: bash scripts/restore.sh backups/20260829_120000" >&2
  exit 1
fi

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

echo "!! Isso vai SOBRESCREVER o banco de dados atual (${POSTGRES_DB:-reforma}). Ctrl+C para cancelar."
sleep 5

echo "==> Restaurando Postgres de $DIR/postgres.dump ..."
docker compose exec -T postgres pg_restore -U "${POSTGRES_USER:-reforma}" -d "${POSTGRES_DB:-reforma}" --clean --if-exists < "$DIR/postgres.dump"

if [ -d "$DIR/xml-uploads" ]; then
  echo "==> Restaurando arquivos do MinIO de $DIR/xml-uploads ..."
  docker cp "$DIR/xml-uploads" reforma-minio:/data/xml-uploads
fi

echo "==> Restauração concluída."
