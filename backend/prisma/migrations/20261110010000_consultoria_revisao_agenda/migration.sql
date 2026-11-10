-- Consultoria: revisão pela lei (RevisaoLegal) e Agenda da Reforma (AgendaMarco, AgendaLembrete, AgendaLembreteEnvio).
-- Só cria tabelas novas; nenhuma tabela existente é alterada.

-- CreateTable
CREATE TABLE "RevisaoLegal" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "alvo_id" TEXT NOT NULL,
    "alvo_titulo" TEXT NOT NULL,
    "norma_chave" TEXT NOT NULL,
    "norma_numero" TEXT NOT NULL,
    "caminho" TEXT NOT NULL,
    "rotulo" TEXT NOT NULL,
    "mudanca" TEXT NOT NULL,
    "detalhe" TEXT,
    "critica" BOOLEAN NOT NULL DEFAULT false,
    "mudou_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "resolvida_por" TEXT,
    "resolvida_em" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevisaoLegal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgendaMarco" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'marco',
    "data" DATE NOT NULL,
    "data_fim" DATE,
    "regimes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ufs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fontes" JSONB NOT NULL DEFAULT '[]',
    "confirmado" BOOLEAN NOT NULL DEFAULT false,
    "lida_em" DATE,
    "observacao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgendaMarco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgendaLembrete" (
    "id" TEXT NOT NULL,
    "user_email" TEXT NOT NULL,
    "escopo" TEXT NOT NULL DEFAULT 'todas',
    "dias_antes" INTEGER[] DEFAULT ARRAY[30, 7, 1]::INTEGER[],
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgendaLembrete_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgendaLembreteEnvio" (
    "id" TEXT NOT NULL,
    "user_email" TEXT NOT NULL,
    "marco_id" TEXT NOT NULL,
    "dias_antes" INTEGER NOT NULL,
    "data_alvo" DATE NOT NULL,
    "enviado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgendaLembreteEnvio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RevisaoLegal_tipo_alvo_id_status_idx" ON "RevisaoLegal"("tipo", "alvo_id", "status");

-- CreateIndex
CREATE INDEX "RevisaoLegal_status_mudou_em_idx" ON "RevisaoLegal"("status", "mudou_em");

-- CreateIndex
CREATE UNIQUE INDEX "AgendaMarco_chave_key" ON "AgendaMarco"("chave");

-- CreateIndex
CREATE INDEX "AgendaMarco_data_idx" ON "AgendaMarco"("data");

-- CreateIndex
CREATE INDEX "AgendaMarco_categoria_idx" ON "AgendaMarco"("categoria");

-- CreateIndex
CREATE UNIQUE INDEX "AgendaLembrete_user_email_escopo_key" ON "AgendaLembrete"("user_email", "escopo");

-- CreateIndex
CREATE UNIQUE INDEX "AgendaLembreteEnvio_user_email_marco_id_dias_antes_data_alv_key" ON "AgendaLembreteEnvio"("user_email", "marco_id", "dias_antes", "data_alvo");

-- AddForeignKey
ALTER TABLE "AgendaLembreteEnvio" ADD CONSTRAINT "AgendaLembreteEnvio_marco_id_fkey" FOREIGN KEY ("marco_id") REFERENCES "AgendaMarco"("id") ON DELETE CASCADE ON UPDATE CASCADE;

