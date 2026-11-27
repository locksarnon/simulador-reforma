-- Busca da Base legal mais rápida: com os regulamentos estaduais a base passou de ~3 mil para ~19 mil dispositivos (33 MB de texto).

-- 1) As palavras de cada dispositivo ficam gravadas numa coluna gerada pelo banco (recalculada sozinha quando o texto muda).
--    Antes, a busca usava um índice de expressão só para filtrar e recalculava as palavras do texto inteiro de cada achado para
--    ordenar por relevância (2,4 s para "icms", que casa com ~4 mil dispositivos).
ALTER TABLE "DispositivoLegal"
  ADD COLUMN "busca" tsvector GENERATED ALWAYS AS (to_tsvector('portuguese'::regconfig, left("texto", 200000))) STORED;

-- Índices fora do controle do Prisma (como o anterior): GIN da coluna gerada no lugar do índice de expressão.
CREATE INDEX "DispositivoLegal_busca_idx" ON "DispositivoLegal" USING GIN ("busca");
DROP INDEX IF EXISTS "DispositivoLegal_texto_fts";

-- 2) Busca literal de códigos (NCM nos anexos estaduais, "1201.90.00"), que a busca por palavras não acha: índice de trigramas para
--    o ILIKE, que antes lia a tabela inteira (2 s por consulta).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "DispositivoLegal_texto_trgm_idx" ON "DispositivoLegal" USING GIN ("texto" gin_trgm_ops);
