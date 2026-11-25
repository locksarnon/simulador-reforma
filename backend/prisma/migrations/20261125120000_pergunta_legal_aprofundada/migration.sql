-- Pesquisa aprofundada do assistente: guarda se usou fontes da web, as ressalvas e as fontes citadas (para o relatório por e-mail).
ALTER TABLE "PerguntaLegal" ADD COLUMN IF NOT EXISTS "aprofundada" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PerguntaLegal" ADD COLUMN IF NOT EXISTS "ressalvas" TEXT;
ALTER TABLE "PerguntaLegal" ADD COLUMN IF NOT EXISTS "fontes_externas" JSONB;
