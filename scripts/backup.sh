#!/usr/bin/env bash
# Backup do Postgres (pg_dump) e dos arquivos do MinIO.
# Rode a partir da raiz do projeto: bash scripts/backup.sh
#
# Não há mais nenhum backup automático da Base44 por trás deste app — desde
# que o backend passou a ser self-hosted, este script é a única rede de
# segurança dos dados. Rode com frequência (ideal: agendado via cron/Task
# Scheduler) e guarde os arquivos gerados fora desta máquina também.
set -euo pipefail
cd "$(dirname "$0")/.."

# Carrega POSTGRES_USER/POSTGRES_DB do .env (não commitado) para este shell.
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

STAMP=$(date +%Y%m%d_%H%M%S)
OUT="backups/$STAMP"
mkdir -p "$OUT"

echo "==> Backup do Postgres..."
docker compose exec -T postgres pg_dump -U "${POSTGRES_USER:-reforma}" -d "${POSTGRES_DB:-reforma}" --format=custom > "$OUT/postgres.dump"

echo "==> Backup dos arquivos do MinIO (bucket xml-uploads)..."
# A imagem oficial do minio/minio não tem `tar` — usar `docker cp`, que copia
# via o daemon do Docker, não depende de binário nenhum dentro do container.
docker cp reforma-minio:/data/xml-uploads "$OUT/xml-uploads" 2>/dev/null || mkdir -p "$OUT/xml-uploads"

echo "==> Feito: $OUT"
echo "    Restaurar com: bash scripts/restore.sh $OUT"
