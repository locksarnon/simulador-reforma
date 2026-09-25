-- CreateTable
CREATE TABLE "PerguntaLegal" (
    "id" TEXT NOT NULL,
    "user_email" TEXT NOT NULL,
    "pergunta" TEXT NOT NULL,
    "resposta" TEXT,
    "fundamentos" JSONB,
    "suficiente" BOOLEAN NOT NULL DEFAULT false,
    "modelo" TEXT,
    "util" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerguntaLegal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PerguntaLegal_createdAt_idx" ON "PerguntaLegal"("createdAt");
CREATE INDEX "PerguntaLegal_user_email_idx" ON "PerguntaLegal"("user_email");
