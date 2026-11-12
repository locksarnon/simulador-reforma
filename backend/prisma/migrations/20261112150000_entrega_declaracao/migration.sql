-- CreateTable
CREATE TABLE "EntregaDeclaracao" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "obrigacao" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "recibo" TEXT,
    "transmitida_em" TIMESTAMP(3),
    "arquivo_id" TEXT,
    "observacao" TEXT,
    "criado_por" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntregaDeclaracao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EntregaDeclaracao_empresa_id_idx" ON "EntregaDeclaracao"("empresa_id");

-- CreateIndex
CREATE UNIQUE INDEX "EntregaDeclaracao_empresa_id_obrigacao_competencia_key" ON "EntregaDeclaracao"("empresa_id", "obrigacao", "competencia");
