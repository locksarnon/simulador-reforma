-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "empresa" TEXT,
    "cargo" TEXT,
    "telefone" TEXT,
    "porte" TEXT,
    "segmento" TEXT,
    "perfil" TEXT,
    "origem" TEXT NOT NULL,
    "consentimento_email" BOOLEAN NOT NULL DEFAULT false,
    "consentimento_em" TIMESTAMP(3),
    "score" INTEGER NOT NULL DEFAULT 0,
    "destino" TEXT,
    "dados_json" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Novo',
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsletterInscrito" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nome" TEXT,
    "segmento" TEXT,
    "perfil" TEXT,
    "origem" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "token" TEXT NOT NULL,
    "consentimento_em" TIMESTAMP(3),
    "descadastrado_em" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsletterInscrito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsletterEdicao" (
    "id" TEXT NOT NULL,
    "assunto" TEXT NOT NULL,
    "semana_referencia" TEXT,
    "corpo_html" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Rascunho',
    "aprovada_por" TEXT,
    "aprovada_em" TIMESTAMP(3),
    "enviada_em" TIMESTAMP(3),
    "destinatarios" INTEGER NOT NULL DEFAULT 0,
    "falhas" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsletterEdicao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lead_email_idx" ON "Lead"("email");

-- CreateIndex
CREATE INDEX "Lead_status_idx" ON "Lead"("status");

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterInscrito_email_key" ON "NewsletterInscrito"("email");

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterInscrito_token_key" ON "NewsletterInscrito"("token");

-- CreateIndex
CREATE INDEX "NewsletterEdicao_status_idx" ON "NewsletterEdicao"("status");
