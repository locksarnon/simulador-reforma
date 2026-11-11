-- Fase 2 do núcleo (11/11/2026): pessoas físicas, tipos de documento, documentos com validade, arquivos, meus downloads,
-- modelos e propostas comerciais, comunicados, registro de e-mails enviados e lista de bloqueio.
-- Só cria tabelas novas: nada existente muda.

-- CreateTable
CREATE TABLE "PessoaFisica" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "email" TEXT,
    "telefone" TEXT,
    "empresa_id" TEXT,
    "grupo" TEXT,
    "observacao" TEXT,
    "certificado_tipo" TEXT,
    "certificado_validade" TIMESTAMP(3),
    "criado_por" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PessoaFisica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TipoDocumento" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "orgao" TEXT,
    "alerta_dias" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TipoDocumento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentoEmpresa" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT,
    "pessoa_fisica_id" TEXT,
    "tipo_id" TEXT,
    "descricao" TEXT,
    "numero" TEXT,
    "emissao" TIMESTAMP(3),
    "validade" TIMESTAMP(3),
    "arquivo_id" TEXT,
    "criado_por" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentoEmpresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArquivoEmpresa" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT,
    "pessoa_fisica_id" TEXT,
    "pasta" TEXT NOT NULL DEFAULT '',
    "nome" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "tipo_mime" TEXT,
    "storage_key" TEXT NOT NULL,
    "enviado_por" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArquivoEmpresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DownloadLote" (
    "id" TEXT NOT NULL,
    "dono" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PRONTO',
    "storage_key" TEXT,
    "tamanho" INTEGER,
    "arquivos" INTEGER NOT NULL DEFAULT 0,
    "erro" TEXT,
    "expira_em" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DownloadLote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModeloProposta" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "servico" TEXT NOT NULL,
    "escopo" TEXT,
    "itens" JSONB NOT NULL,
    "condicoes" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModeloProposta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proposta" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "empresa_id" TEXT,
    "lead_id" TEXT,
    "cliente_nome" TEXT NOT NULL,
    "cliente_documento" TEXT,
    "cliente_email" TEXT,
    "servico" TEXT NOT NULL,
    "modelo_id" TEXT,
    "escopo" TEXT,
    "itens" JSONB NOT NULL,
    "honorario_mensal" DOUBLE PRECISION,
    "valor_total" DOUBLE PRECISION NOT NULL,
    "validade" TIMESTAMP(3),
    "condicoes" TEXT,
    "observacoes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RASCUNHO',
    "calculo" JSONB,
    "criado_por" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Proposta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comunicado" (
    "id" TEXT NOT NULL,
    "assunto" TEXT NOT NULL,
    "corpo" TEXT NOT NULL,
    "filtro" JSONB NOT NULL,
    "anexos" JSONB,
    "status" TEXT NOT NULL DEFAULT 'RASCUNHO',
    "total" INTEGER NOT NULL DEFAULT 0,
    "enviados" INTEGER NOT NULL DEFAULT 0,
    "falhas" INTEGER NOT NULL DEFAULT 0,
    "criado_por" TEXT,
    "enviado_em" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comunicado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnvioEmail" (
    "id" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "origem_id" TEXT,
    "empresa_id" TEXT,
    "destinatario" TEXT NOT NULL,
    "assunto" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "erro" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnvioEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BloqueioEnvio" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "motivo" TEXT,
    "criado_por" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BloqueioEnvio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PessoaFisica_cpf_key" ON "PessoaFisica"("cpf");

-- CreateIndex
CREATE INDEX "PessoaFisica_empresa_id_idx" ON "PessoaFisica"("empresa_id");

-- CreateIndex
CREATE UNIQUE INDEX "TipoDocumento_nome_key" ON "TipoDocumento"("nome");

-- CreateIndex
CREATE INDEX "DocumentoEmpresa_empresa_id_idx" ON "DocumentoEmpresa"("empresa_id");

-- CreateIndex
CREATE INDEX "DocumentoEmpresa_pessoa_fisica_id_idx" ON "DocumentoEmpresa"("pessoa_fisica_id");

-- CreateIndex
CREATE INDEX "DocumentoEmpresa_validade_idx" ON "DocumentoEmpresa"("validade");

-- CreateIndex
CREATE INDEX "ArquivoEmpresa_empresa_id_pasta_idx" ON "ArquivoEmpresa"("empresa_id", "pasta");

-- CreateIndex
CREATE INDEX "ArquivoEmpresa_pessoa_fisica_id_idx" ON "ArquivoEmpresa"("pessoa_fisica_id");

-- CreateIndex
CREATE INDEX "DownloadLote_dono_idx" ON "DownloadLote"("dono");

-- CreateIndex
CREATE UNIQUE INDEX "ModeloProposta_nome_key" ON "ModeloProposta"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "Proposta_numero_key" ON "Proposta"("numero");

-- CreateIndex
CREATE INDEX "Proposta_status_idx" ON "Proposta"("status");

-- CreateIndex
CREATE INDEX "Proposta_empresa_id_idx" ON "Proposta"("empresa_id");

-- CreateIndex
CREATE INDEX "EnvioEmail_empresa_id_createdAt_idx" ON "EnvioEmail"("empresa_id", "createdAt");

-- CreateIndex
CREATE INDEX "EnvioEmail_createdAt_idx" ON "EnvioEmail"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BloqueioEnvio_email_key" ON "BloqueioEnvio"("email");

-- Tipos de documento iniciais (o administrador muda pela tela).
INSERT INTO "TipoDocumento" ("id", "nome", "orgao", "alerta_dias") VALUES
  (gen_random_uuid()::text, 'Alvará de funcionamento', 'Prefeitura', 30),
  (gen_random_uuid()::text, 'Licença ambiental', 'Órgão ambiental', 60),
  (gen_random_uuid()::text, 'Certidão negativa', NULL, 15),
  (gen_random_uuid()::text, 'Contrato social e alterações', 'Junta Comercial', 0),
  (gen_random_uuid()::text, 'Procuração', NULL, 30)
ON CONFLICT DO NOTHING;
