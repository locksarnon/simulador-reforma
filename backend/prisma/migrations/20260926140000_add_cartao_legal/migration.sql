-- CreateTable
CREATE TABLE "CartaoLegal" (
    "id" TEXT NOT NULL,
    "tema" TEXT NOT NULL,
    "pergunta" TEXT NOT NULL,
    "sinonimos" TEXT,
    "resposta" TEXT NOT NULL,
    "ressalvas" TEXT,
    "fundamentos" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'rascunho',
    "revisado_por" TEXT,
    "revisado_em" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CartaoLegal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CartaoLegal_pergunta_key" ON "CartaoLegal"("pergunta");
CREATE INDEX "CartaoLegal_status_idx" ON "CartaoLegal"("status");
CREATE INDEX "CartaoLegal_tema_idx" ON "CartaoLegal"("tema");
