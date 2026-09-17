-- CreateTable
CREATE TABLE "RadarReformaItem" (
    "id" TEXT NOT NULL,
    "semana_referencia" TEXT NOT NULL,
    "data_publicacao" TIMESTAMP(3),
    "data_publicacao_txt" TEXT,
    "fonte_nome" TEXT,
    "fonte_url" TEXT,
    "categoria" TEXT NOT NULL,
    "resumo" TEXT NOT NULL,
    "impacto_pratico" TEXT,
    "prazo_vigencia" TEXT,
    "status_normativo" TEXT,
    "acao_recomendada" TEXT,
    "prioridade" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RadarReformaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RadarReformaExecucao" (
    "id" TEXT NOT NULL,
    "semana_referencia" TEXT NOT NULL,
    "resumo_executivo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OK',
    "erro" TEXT,
    "itens_gerados" INTEGER NOT NULL DEFAULT 0,
    "disparo" TEXT NOT NULL DEFAULT 'MANUAL',
    "executado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RadarReformaExecucao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RadarReformaItem_semana_referencia_idx" ON "RadarReformaItem"("semana_referencia");

-- CreateIndex
CREATE INDEX "RadarReformaItem_prioridade_idx" ON "RadarReformaItem"("prioridade");

-- CreateIndex
CREATE UNIQUE INDEX "RadarReformaExecucao_semana_referencia_key" ON "RadarReformaExecucao"("semana_referencia");
