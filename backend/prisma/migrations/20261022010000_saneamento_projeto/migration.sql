-- Projeto de saneamento de estoques (passo a passo). Tabela nova, sem alterar nenhuma existente.
CREATE TABLE "SaneamentoProjeto" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "criado_por" TEXT NOT NULL,
    "validacao_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ANDAMENTO',
    "estado_json" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SaneamentoProjeto_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SaneamentoProjeto_empresa_id_idx" ON "SaneamentoProjeto"("empresa_id");
