-- Conferência do IBS/CBS das notas do Repositório de XML com a calculadora oficial da Receita.
CREATE TABLE "AuditoriaIbsCbs" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "documento_id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "modelo" TEXT,
    "data_emissao" TIMESTAMP(3),
    "emitente_doc" TEXT,
    "emitente_nome" TEXT,
    "papel" TEXT NOT NULL,
    "situacao" TEXT NOT NULL,
    "itens" INTEGER NOT NULL DEFAULT 0,
    "itens_divergentes" INTEGER NOT NULL DEFAULT 0,
    "vbc_nota" DOUBLE PRECISION,
    "vbc_oficial" DOUBLE PRECISION,
    "ibs_nota" DOUBLE PRECISION,
    "ibs_oficial" DOUBLE PRECISION,
    "cbs_nota" DOUBLE PRECISION,
    "cbs_oficial" DOUBLE PRECISION,
    "detalhes" JSONB NOT NULL,
    "versao_db" TEXT NOT NULL,
    "conferido_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditoriaIbsCbs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AuditoriaIbsCbs_documento_id_key" ON "AuditoriaIbsCbs"("documento_id");
CREATE INDEX "AuditoriaIbsCbs_empresa_id_data_emissao_idx" ON "AuditoriaIbsCbs"("empresa_id", "data_emissao");
CREATE INDEX "AuditoriaIbsCbs_empresa_id_situacao_idx" ON "AuditoriaIbsCbs"("empresa_id", "situacao");
