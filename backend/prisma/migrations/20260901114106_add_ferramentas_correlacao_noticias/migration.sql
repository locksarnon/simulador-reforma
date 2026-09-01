-- CreateTable
CREATE TABLE "CorrelacaoServico" (
    "id" TEXT NOT NULL,
    "item_lc116" TEXT,
    "descricao_item" TEXT,
    "nbs" TEXT,
    "descricao_nbs" TEXT,
    "ps_onerosa" TEXT,
    "adq_exterior" TEXT,
    "ind_op" TEXT,
    "local_incidencia_ibs" TEXT,
    "c_class_trib" TEXT,
    "nome_class_trib" TEXT,
    "fonte" TEXT NOT NULL DEFAULT 'Anexo VIII RTC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CorrelacaoServico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoticiaReforma" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "resumo" TEXT,
    "url" TEXT,
    "fonte" TEXT,
    "publicado_em" TIMESTAMP(3),
    "tags" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Publicada',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NoticiaReforma_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CorrelacaoServico_item_lc116_idx" ON "CorrelacaoServico"("item_lc116");

-- CreateIndex
CREATE INDEX "CorrelacaoServico_nbs_idx" ON "CorrelacaoServico"("nbs");

-- CreateIndex
CREATE INDEX "CorrelacaoServico_ind_op_idx" ON "CorrelacaoServico"("ind_op");

-- CreateIndex
CREATE INDEX "CorrelacaoServico_c_class_trib_idx" ON "CorrelacaoServico"("c_class_trib");

-- CreateIndex
CREATE INDEX "NoticiaReforma_publicado_em_idx" ON "NoticiaReforma"("publicado_em");
