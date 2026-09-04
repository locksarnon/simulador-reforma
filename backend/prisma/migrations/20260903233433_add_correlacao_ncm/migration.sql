-- CreateTable
CREATE TABLE "CorrelacaoNcm" (
    "id" TEXT NOT NULL,
    "anexo" TEXT NOT NULL,
    "item_lei" INTEGER,
    "ncm" TEXT NOT NULL,
    "descricao_produto" TEXT,
    "c_class_trib" TEXT,
    "fonte" TEXT NOT NULL DEFAULT 'LC 214/2025',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CorrelacaoNcm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CorrelacaoNcm_ncm_idx" ON "CorrelacaoNcm"("ncm");

-- CreateIndex
CREATE INDEX "CorrelacaoNcm_c_class_trib_idx" ON "CorrelacaoNcm"("c_class_trib");
