-- =============================================================================
-- Redutor das compras governamentais de 2027: 44,16% (cálculo do TCU, processo TC 006.529/2026-7)
-- LC 214/2025, arts. 349, III, 370 e 472. AINDA SEM a resolução do Senado: é estimativa, como a CBS de 2027.
--
-- Só altera a linha de 2027 de "TransicaoAno" (coluna redutor_compra_gov, criada pela migração
-- 20261029010000_reforma_redutor_is_combustiveis) e só se o redutor ainda for 0. Os demais anos ficam em 0:
-- o redutor de 2028 a 2033 só sai no ano anterior (art. 349, §1º) e o InTAX repete o último cadastrado
-- (premissa visível na tela Transição), sem gravar número que nenhum ato fixou.
--
-- PRÉ-REQUISITO: o deploy com a migração 20261029010000 já aplicada (a coluna precisa existir).
-- ANTES: backup da tabela (dentro do container reforma-postgres):
--   pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t '"TransicaoAno"' --clean --if-exists > /tmp/pre-redutor.sql
-- RODAR no PowerShell (de qualquer pasta; lê o arquivo que está no servidor, depois do git pull). O "<" precisa ficar
-- DENTRO das aspas, porque o PowerShell 5.1 não aceita redirecionamento de entrada:
--   ssh -i "$HOME/.ssh/fal_hostinger" -o IdentitiesOnly=yes root@148.230.78.251 'cd /var/www/html/simulador-reforma && docker exec -i reforma-postgres sh -c ''psql -U $POSTGRES_USER -d $POSTGRES_DB -v ON_ERROR_STOP=1'' < backend/scripts/sql/2026-10-29-redutor-compras-governamentais.sql'
-- RODAR no Git Bash (na raiz do projeto):
--   ssh -i ~/.ssh/fal_hostinger -o IdentitiesOnly=yes root@148.230.78.251 'docker exec -i reforma-postgres sh -c "psql -U \$POSTGRES_USER -d \$POSTGRES_DB -v ON_ERROR_STOP=1"' < backend/scripts/sql/2026-10-29-redutor-compras-governamentais.sql
-- STATUS: aplicado no banco local em 29/10/2026; produção aguardando o deploy da migração.
-- CONFERIR (somente leitura): select ano, redutor_compra_gov from "TransicaoAno" order by ano;  (esperado: 2027 = 0.4416; demais 0)
-- REVERTER: update "TransicaoAno" set redutor_compra_gov = 0 where ano = 2027;
-- =============================================================================

\set ON_ERROR_STOP on
BEGIN;

DO $trava$
DECLARE n int; ruim text := '';
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns WHERE table_name = 'TransicaoAno' AND column_name = 'redutor_compra_gov';
  IF n <> 1 THEN ruim := ruim || ' coluna_redutor_ausente(rode o deploy com a migracao antes)'; END IF;
  IF ruim = '' THEN
    SELECT count(*) INTO n FROM "TransicaoAno" WHERE ano = 2027; IF n <> 1 THEN ruim := ruim || ' linha_2027=' || n; END IF;
    SELECT count(*) INTO n FROM "TransicaoAno" WHERE redutor_compra_gov <> 0; IF n <> 0 THEN ruim := ruim || ' ja_ha_redutor_cadastrado=' || n; END IF;
  END IF;
  IF ruim <> '' THEN RAISE EXCEPTION 'TRAVA: nada foi gravado.%', ruim; END IF;
END
$trava$;

UPDATE "TransicaoAno"
   SET redutor_compra_gov = 0.4416,
       observacao = coalesce(observacao, '') || ' Redutor das compras governamentais: 44,16% é o cálculo do TCU para 2027 (TC 006.529/2026-7), pendente de resolução do Senado (LC 214, arts. 349, III, e 472).',
       "updatedAt" = now()
 WHERE ano = 2027 AND redutor_compra_gov = 0;

DO $confere$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM "TransicaoAno" WHERE ano = 2027 AND abs(redutor_compra_gov - 0.4416) < 1e-9;
  IF n <> 1 THEN RAISE EXCEPTION 'CONFERENCIA FALHOU: redutor de 2027 nao ficou em 0,4416'; END IF;
  SELECT count(*) INTO n FROM "TransicaoAno" WHERE ano <> 2027 AND redutor_compra_gov <> 0;
  IF n <> 0 THEN RAISE EXCEPTION 'CONFERENCIA FALHOU: outro ano foi alterado'; END IF;
END
$confere$;

COMMIT;
\echo 'APLICADO: transacao confirmada.'
