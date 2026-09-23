#!/bin/sh
# Backup do Postgres do InTAX (pg_dump comprimido, com rotação).
#
# Uso manual no VPS:   /var/www/html/simulador-reforma/scripts/backup-db.sh
# Agendamento (cron):  0 3 * * * /var/www/html/simulador-reforma/scripts/backup-db.sh >> /var/log/intax-backup.log 2>&1
#
# Variáveis opcionais: BACKUP_DIR (padrão /var/backups/simulador-reforma), KEEP_DAYS (padrão 14).
# Para restaurar:  gunzip -c ARQUIVO.sql.gz | docker exec -i reforma-postgres psql -U reforma -d reforma
set -eu

DEST="${BACKUP_DIR:-/var/backups/simulador-reforma}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
ARQ="$DEST/reforma-$STAMP.sql.gz"

mkdir -p "$DEST"
chmod 700 "$DEST"

docker exec reforma-postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner' | gzip > "$ARQ.tmp"

# Só vale se o arquivo comprimido estiver íntegro e não for vazio.
gzip -t "$ARQ.tmp"
[ "$(wc -c < "$ARQ.tmp")" -gt 1000 ]
mv "$ARQ.tmp" "$ARQ"

find "$DEST" -name 'reforma-*.sql.gz' -mtime "+$KEEP_DAYS" -delete
echo "$(date -Iseconds) backup ok: $ARQ ($(du -h "$ARQ" | cut -f1))"
