
-- CreateTable
CREATE TABLE "SpedDownload" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "escrituracao" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "servico" TEXT NOT NULL,
    "arquivo_receita" TEXT NOT NULL,
    "recibo" TEXT,
    "retificadora" BOOLEAN NOT NULL DEFAULT false,
    "id_pedido" TEXT,
    "situacao" TEXT NOT NULL DEFAULT 'SOLICITADO',
    "mensagem" TEXT,
    "arquivo_id" TEXT,
    "solicitado_por" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpedDownload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SpedDownload_empresa_id_idx" ON "SpedDownload"("empresa_id");

-- CreateIndex
CREATE INDEX "SpedDownload_situacao_idx" ON "SpedDownload"("situacao");

