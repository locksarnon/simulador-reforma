
-- CreateTable
CREATE TABLE "ConsultaFiscal" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT,
    "pessoa_fisica_id" TEXT,
    "chave" TEXT NOT NULL,
    "sistema" TEXT NOT NULL,
    "servico" TEXT NOT NULL,
    "parametros" JSONB,
    "sucesso" BOOLEAN NOT NULL,
    "status" INTEGER,
    "nivel" TEXT NOT NULL DEFAULT 'INFO',
    "resumo" JSONB,
    "dados" JSONB,
    "mensagens" JSONB,
    "arquivos" JSONB,
    "simulado" BOOLEAN NOT NULL DEFAULT false,
    "origem" TEXT NOT NULL DEFAULT 'MANUAL',
    "solicitado_por" TEXT,
    "duracao_ms" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsultaFiscal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObrigacaoDispensada" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "obrigacao" TEXT NOT NULL,
    "motivo" TEXT,
    "criado_por" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ObrigacaoDispensada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenIntegraContador" (
    "documento" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expira_em" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenIntegraContador_pkey" PRIMARY KEY ("documento")
);

-- CreateIndex
CREATE INDEX "ConsultaFiscal_empresa_id_chave_createdAt_idx" ON "ConsultaFiscal"("empresa_id", "chave", "createdAt");

-- CreateIndex
CREATE INDEX "ConsultaFiscal_pessoa_fisica_id_chave_createdAt_idx" ON "ConsultaFiscal"("pessoa_fisica_id", "chave", "createdAt");

-- CreateIndex
CREATE INDEX "ConsultaFiscal_createdAt_idx" ON "ConsultaFiscal"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ObrigacaoDispensada_empresa_id_obrigacao_key" ON "ObrigacaoDispensada"("empresa_id", "obrigacao");

