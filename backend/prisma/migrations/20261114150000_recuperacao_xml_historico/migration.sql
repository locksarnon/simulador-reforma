CREATE TABLE "RecuperacaoXmlHistorico" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "solicitado_por" TEXT NOT NULL,
    "de" TEXT NOT NULL,
    "ate" TEXT NOT NULL,
    "situacao" TEXT NOT NULL DEFAULT 'PREVIA',
    "preco_unitario" DOUBLE PRECISION,
    "chaves" JSONB NOT NULL,
    "cobertura" JSONB NOT NULL,
    "total" INTEGER NOT NULL,
    "cursor" INTEGER NOT NULL DEFAULT 0,
    "recuperadas" INTEGER NOT NULL DEFAULT 0,
    "indisponiveis" INTEGER NOT NULL DEFAULT 0,
    "reaproveitadas" INTEGER NOT NULL DEFAULT 0,
    "falhas" INTEGER NOT NULL DEFAULT 0,
    "cobradas" INTEGER NOT NULL DEFAULT 0,
    "mensagem" TEXT,
    "ocupado_ate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecuperacaoXmlHistorico_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RecuperacaoXmlHistorico_empresa_id_createdAt_idx" ON "RecuperacaoXmlHistorico"("empresa_id", "createdAt");
CREATE INDEX "RecuperacaoXmlHistorico_situacao_ocupado_ate_idx" ON "RecuperacaoXmlHistorico"("situacao", "ocupado_ate");
CREATE UNIQUE INDEX "RecuperacaoXmlHistorico_empresa_lote_ativo_idx" ON "RecuperacaoXmlHistorico"("empresa_id") WHERE "situacao" = 'EM_FILA';
