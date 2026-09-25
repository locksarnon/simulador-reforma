-- CreateTable
CREATE TABLE "AlertaBaseLegal" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "chave" TEXT,
    "referencia" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "detalhe" TEXT,
    "url" TEXT,
    "origem" TEXT NOT NULL DEFAULT 'verificacao',
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "resolvido_por" TEXT,
    "resolvido_em" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertaBaseLegal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AlertaBaseLegal_status_idx" ON "AlertaBaseLegal"("status");
CREATE INDEX "AlertaBaseLegal_tipo_referencia_idx" ON "AlertaBaseLegal"("tipo", "referencia");
