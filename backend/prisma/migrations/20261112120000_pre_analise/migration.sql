-- CreateTable
CREATE TABLE "PreAnalise" (
    "id" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "razao_social" TEXT,
    "uf" TEXT,
    "empresa_id" TEXT,
    "processos" JSONB NOT NULL,
    "criado_por" TEXT,
    "concluida_em" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreAnalise_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PreAnalise_cnpj_idx" ON "PreAnalise"("cnpj");

-- CreateIndex
CREATE INDEX "PreAnalise_createdAt_idx" ON "PreAnalise"("createdAt");

