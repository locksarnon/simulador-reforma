-- CreateTable
CREATE TABLE "XmlEmpresaConfig" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "consentimento_em" TIMESTAMP(3),
    "consentimento_por" TEXT,
    "consentimento_ref" TEXT,
    "ambiente" TEXT NOT NULL DEFAULT 'PRODUCAO',
    "uf_autor" TEXT,
    "manifestar_ciencia" BOOLEAN NOT NULL DEFAULT false,
    "manifestacao_consentida_em" TIMESTAMP(3),
    "manifestacao_consentida_por" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "XmlEmpresaConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertificadoDigital" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "titular" TEXT NOT NULL,
    "emissor" TEXT,
    "documento" TEXT NOT NULL,
    "serie_hex" TEXT,
    "impressao_sha256" TEXT NOT NULL,
    "valido_de" TIMESTAMP(3) NOT NULL,
    "valido_ate" TIMESTAMP(3) NOT NULL,
    "segredo_cifrado" BYTEA,
    "segredo_iv" BYTEA,
    "segredo_tag" BYTEA,
    "chave_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "enviado_por" TEXT NOT NULL,
    "revogado_em" TIMESTAMP(3),
    "revogado_por" TEXT,
    "aviso_vencimento_dias" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CertificadoDigital_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditoriaCertificado" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "certificado_id" TEXT,
    "acao" TEXT NOT NULL,
    "usuario" TEXT NOT NULL,
    "detalhe" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditoriaCertificado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapturaXmlConfig" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "ultimo_nsu" TEXT NOT NULL DEFAULT '000000000000000',
    "max_nsu" TEXT,
    "proxima_consulta_em" TIMESTAMP(3),
    "bloqueado_ate" TIMESTAMP(3),
    "ultima_consulta_em" TIMESTAMP(3),
    "ultimo_cstat" TEXT,
    "ultimo_motivo" TEXT,
    "em_execucao_ate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CapturaXmlConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapturaXmlExecucao" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "usuario" TEXT,
    "iniciado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizado_em" TIMESTAMP(3),
    "consultas" INTEGER NOT NULL DEFAULT 0,
    "docs_recebidos" INTEGER NOT NULL DEFAULT 0,
    "docs_novos" INTEGER NOT NULL DEFAULT 0,
    "ultimo_cstat" TEXT,
    "mensagem" TEXT,

    CONSTRAINT "CapturaXmlExecucao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentoXml" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "evento_tipo" TEXT NOT NULL DEFAULT '',
    "sequencia" INTEGER NOT NULL DEFAULT 0,
    "modelo" TEXT,
    "numero" TEXT,
    "serie" TEXT,
    "data_emissao" TIMESTAMP(3),
    "emitente_doc" TEXT,
    "emitente_nome" TEXT,
    "destinatario_doc" TEXT,
    "valor_total" DOUBLE PRECISION,
    "conteudo" TEXT NOT NULL DEFAULT 'COMPLETO',
    "situacao" TEXT,
    "origem" TEXT NOT NULL,
    "nsu" TEXT,
    "storage_key" TEXT,
    "sha256" TEXT,
    "tamanho_bytes" INTEGER NOT NULL DEFAULT 0,
    "nome_original" TEXT,
    "enviado_por" TEXT,
    "lote_importacao_id" TEXT,
    "importado_em" TIMESTAMP(3),
    "recebido_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentoXml_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "XmlEmpresaConfig_empresa_id_key" ON "XmlEmpresaConfig"("empresa_id");

-- CreateIndex
CREATE INDEX "CertificadoDigital_empresa_id_status_idx" ON "CertificadoDigital"("empresa_id", "status");

-- CreateIndex
CREATE INDEX "AuditoriaCertificado_empresa_id_createdAt_idx" ON "AuditoriaCertificado"("empresa_id", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CapturaXmlConfig_empresa_id_tipo_key" ON "CapturaXmlConfig"("empresa_id", "tipo");

-- CreateIndex
CREATE INDEX "CapturaXmlExecucao_empresa_id_iniciado_em_idx" ON "CapturaXmlExecucao"("empresa_id", "iniciado_em");

-- CreateIndex
CREATE INDEX "DocumentoXml_empresa_id_data_emissao_idx" ON "DocumentoXml"("empresa_id", "data_emissao");

-- CreateIndex
CREATE INDEX "DocumentoXml_empresa_id_origem_idx" ON "DocumentoXml"("empresa_id", "origem");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentoXml_empresa_id_tipo_chave_evento_tipo_sequencia_key" ON "DocumentoXml"("empresa_id", "tipo", "chave", "evento_tipo", "sequencia");

