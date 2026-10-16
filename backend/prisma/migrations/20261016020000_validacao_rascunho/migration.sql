-- Autosave do validador de cadastro: a análise passa a existir desde o upload (RASCUNHO) e vira PROCESSADA ao validar.
-- Linhas antigas ficam PROCESSADA (default) e updatedAt começa em "agora".
ALTER TABLE "ValidacaoCadastro" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'PROCESSADA', ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
