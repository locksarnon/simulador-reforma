ALTER TABLE "ProjetoDiagnostico"
  ADD COLUMN "servico_consultoria" TEXT,
  ADD COLUMN "periodo_inicio" TIMESTAMP(3),
  ADD COLUMN "periodo_fim" TIMESTAMP(3);

CREATE TABLE "VinculoConsultoria" (
    "id" TEXT NOT NULL,
    "publico" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "servico" TEXT NOT NULL,
    "criado_por" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VinculoConsultoria_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VinculoConsultoria_publico_cliente_id_servico_key" ON "VinculoConsultoria"("publico", "cliente_id", "servico");
CREATE INDEX "VinculoConsultoria_servico_idx" ON "VinculoConsultoria"("servico");

CREATE TABLE "ControleDocumentoConsultoria" (
  "id" TEXT PRIMARY KEY,
  "publico" TEXT NOT NULL,
  "cliente_id" TEXT NOT NULL,
  "servico" TEXT NOT NULL,
  "item" TEXT NOT NULL,
  "periodo" TEXT NOT NULL,
  "situacao" TEXT NOT NULL,
  "arquivo_id" TEXT,
  "atualizado_por" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "controle_documento_consultoria_chave"
  ON "ControleDocumentoConsultoria"("publico", "cliente_id", "servico", "item", "periodo");
