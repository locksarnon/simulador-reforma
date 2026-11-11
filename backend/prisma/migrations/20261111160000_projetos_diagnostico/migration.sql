-- CreateTable
CREATE TABLE "ProjetoDiagnostico" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "grupo_numero" TEXT,
    "empresa_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "escopo" TEXT,
    "situacao" TEXT NOT NULL DEFAULT 'EM_ANDAMENTO',
    "inicio" TIMESTAMP(3),
    "prazo" TIMESTAMP(3),
    "responsavel" TEXT,
    "observacao" TEXT,
    "criado_por" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjetoDiagnostico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjetoDiagnostico_situacao_idx" ON "ProjetoDiagnostico"("situacao");

