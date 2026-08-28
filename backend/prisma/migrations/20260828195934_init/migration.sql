-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'user');

-- CreateEnum
CREATE TYPE "Direcao" AS ENUM ('Saida', 'Entrada');

-- CreateEnum
CREATE TYPE "TipoOperacao" AS ENUM ('Mercadoria', 'Servico', 'Outro');

-- CreateEnum
CREATE TYPE "SituacaoOperacao" AS ENUM ('ATIVA', 'CANCELADA', 'ESTORNADA');

-- CreateEnum
CREATE TYPE "StatusDiagnostico" AS ENUM ('rascunho', 'em_progresso', 'em_validacao', 'finalizado');

-- CreateEnum
CREATE TYPE "StatusLoteXML" AS ENUM ('RECEBIDO', 'PROCESSANDO', 'AGUARDANDO_CONFIRMACAO', 'PROCESSADO', 'PROCESSADO_COM_FALHAS', 'FALHOU');

-- CreateEnum
CREATE TYPE "TipoXml" AS ENUM ('NFE_PROC', 'NFE', 'EVENTO_CANCELAMENTO', 'EVENTO_CARTA_CORRECAO', 'EVENTO_OUTRO', 'XML_DESCONHECIDO');

-- CreateEnum
CREATE TYPE "SituacaoFiscalXML" AS ENUM ('AUTORIZADO', 'AUTORIZADO_FORA_PRAZO', 'CANCELADO', 'HOMOLOGACAO', 'SEM_PROTOCOLO', 'DUPLICADO_HASH', 'DUPLICADO_CHAVE', 'INVALIDO', 'EVENTO_PROCESSADO', 'EVENTO_PENDENTE', 'IGNORADO', 'ERRO_PROCESSAMENTO');

-- CreateEnum
CREATE TYPE "StatusTecnico" AS ENUM ('PENDENTE', 'PROCESSANDO', 'CONCLUIDO', 'FALHOU');

-- CreateEnum
CREATE TYPE "Perspectiva" AS ENUM ('EMITENTE', 'DESTINATARIO', 'PENDENTE');

-- CreateEnum
CREATE TYPE "TipoRelacionamento" AS ENUM ('TERCEIRO', 'INTERCOMPANY', 'TRANSFERENCIA_INTERNA');

-- CreateEnum
CREATE TYPE "ResultadoFinalXML" AS ENUM ('IMPORTAVEL', 'IMPORTAVEL_COM_ALERTA', 'BLOQUEADO', 'CANCELADO', 'DUPLICADO', 'CONFIRMADO', 'ESTORNADO');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "role" "Role" NOT NULL DEFAULT 'user',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Grupo" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'Grupo familiar',
    "ifme_consolidado" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ifme_meta" DOUBLE PRECISION NOT NULL DEFAULT 3,
    "status_ifme" TEXT NOT NULL DEFAULT 'Pendente',
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Grupo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Empresa" (
    "id" TEXT NOT NULL,
    "id_empresa" TEXT NOT NULL,
    "grupo" TEXT,
    "razao_social" TEXT NOT NULL,
    "cnpj_cpf" TEXT,
    "regime_atual" TEXT,
    "setor" TEXT,
    "uf" TEXT,
    "municipio" TEXT,
    "contribuinte_ibs_cbs" TEXT,
    "produtor_rural" TEXT,
    "cooperativa" TEXT,
    "erp" TEXT,
    "responsavel_fiscal" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Ativa',
    "data_inicio" TIMESTAMP(3),
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Operacao" (
    "id" TEXT NOT NULL,
    "id_operacao" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "data" TIMESTAMP(3),
    "ano" INTEGER,
    "direcao" "Direcao" NOT NULL,
    "tipo" "TipoOperacao",
    "descricao" TEXT,
    "quantidade" DOUBLE PRECISION,
    "preco_unitario" DOUBLE PRECISION,
    "desconto_incondicional" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "frete" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "seguro" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "outras_despesas" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valor_bruto" DOUBLE PRECISION NOT NULL,
    "ncm" TEXT,
    "nbs" TEXT,
    "cfop_servico" TEXT,
    "uf_origem" TEXT,
    "uf_destino" TEXT,
    "municipio_destino" TEXT,
    "documento" TEXT,
    "regime_atual" TEXT,
    "c_class_trib" TEXT,
    "cst_ibs_cbs" TEXT,
    "pis_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cofins_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "icms_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fcp_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "mva_st_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "iss_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ipi_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "credito_elegivel_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "split_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "c_cred_pres" TEXT,
    "credito_presumido_ibs_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "credito_presumido_cbs_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grupo_rtc" TEXT,
    "reducao_informada" TEXT,
    "diferimento_informado" TEXT,
    "tributacao_regular_informada" TEXT,
    "credito_presumido_informado" TEXT,
    "compra_governamental_informado" TEXT,
    "finalidade_dfe" TEXT,
    "crt_emitente" TEXT,
    "ambiente" TEXT,
    "custo_base_pct" DOUBLE PRECISION NOT NULL DEFAULT 0.65,
    "margem_meta_pct" DOUBLE PRECISION NOT NULL DEFAULT 0.18,
    "observacao_dfe" TEXT,
    "situacao" "SituacaoOperacao" NOT NULL DEFAULT 'ATIVA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Operacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cenario" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "fator_volume" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "fator_preco" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "fator_custo" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "fator_credito_aproveitado" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransicaoAno" (
    "id" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "pis_cofins_fator" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "ipi_fator_geral" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "icms_fator" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "iss_fator" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "ibs_efetivo" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ibs_uf_aliquota" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ibs_mun_aliquota" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cbs_efetiva" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "efeito_financeiro" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "carater" TEXT,
    "fonte" TEXT,
    "status" TEXT,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransicaoAno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassTrib" (
    "id" TEXT NOT NULL,
    "c_class_trib" TEXT NOT NULL,
    "cst" TEXT,
    "descricao_oficial" TEXT,
    "grupo_operacional" TEXT,
    "pct_reducao_ibs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pct_reducao_cbs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tributacao_regular" TEXT,
    "credito_presumido" TEXT,
    "estorno_credito" TEXT,
    "receita_bruta" TEXT,
    "dfe_relacionados" TEXT,
    "fonte" TEXT,
    "publicacao" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'Ativo',
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassTrib_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CstIbsCbs" (
    "id" TEXT NOT NULL,
    "cst" TEXT NOT NULL,
    "descricao_oficial" TEXT,
    "exige_tributacao" TEXT,
    "reducao_bc" TEXT,
    "reducao_aliquota" TEXT,
    "transferencia_credito" TEXT,
    "diferimento" TEXT,
    "monofasica" TEXT,
    "credito_presumido_ibs_zfm" TEXT,
    "ajuste_competencia" TEXT,
    "origem" TEXT,
    "publicacao_referencia" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'Ativo',
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CstIbsCbs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CredPres" (
    "id" TEXT NOT NULL,
    "c_cred_pres" TEXT NOT NULL,
    "descricao_oficial" TEXT,
    "apropria_dfe" TEXT,
    "apropria_evento" TEXT,
    "deduz_credito_presumido" TEXT,
    "ibs_aplicavel" TEXT,
    "inicio_ibs" TIMESTAMP(3),
    "fim_ibs" TEXT,
    "cbs_aplicavel" TEXT,
    "inicio_cbs" TIMESTAMP(3),
    "fim_cbs" TEXT,
    "percentual_oficial" TEXT,
    "metodo_calculo" TEXT,
    "base_legal_metodo" TEXT,
    "fonte" TEXT,
    "publicacao" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'Ativo',
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CredPres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Configuracao" (
    "id" TEXT NOT NULL,
    "versao_simulador" TEXT NOT NULL DEFAULT 'v0.18',
    "data_base_normativa" TIMESTAMP(3),
    "cenario_ativo" TEXT NOT NULL DEFAULT 'Base',
    "margem_meta_pct" DOUBLE PRECISION NOT NULL DEFAULT 0.18,
    "prazo_realizacao_credito_dias" DOUBLE PRECISION NOT NULL DEFAULT 60,
    "taxa_custo_financeiro_pct" DOUBLE PRECISION NOT NULL DEFAULT 0.015,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Configuracao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Diagnostico" (
    "id" TEXT NOT NULL,
    "grupo_id" TEXT NOT NULL,
    "nome" TEXT,
    "etapa_atual" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "status" "StatusDiagnostico" NOT NULL DEFAULT 'rascunho',
    "data_criacao" TIMESTAMP(3),
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Diagnostico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportacaoXMLLote" (
    "id" TEXT NOT NULL,
    "grupo_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "status" "StatusLoteXML" NOT NULL DEFAULT 'RECEBIDO',
    "total_arquivos" INTEGER NOT NULL DEFAULT 0,
    "arquivos_validos" INTEGER NOT NULL DEFAULT 0,
    "arquivos_invalidos" INTEGER NOT NULL DEFAULT 0,
    "total_itens" INTEGER NOT NULL DEFAULT 0,
    "itens_importaveis" INTEGER NOT NULL DEFAULT 0,
    "itens_importaveis_com_alerta" INTEGER NOT NULL DEFAULT 0,
    "itens_bloqueados" INTEGER NOT NULL DEFAULT 0,
    "itens_duplicados" INTEGER NOT NULL DEFAULT 0,
    "itens_cancelados" INTEGER NOT NULL DEFAULT 0,
    "itens_confirmados" INTEGER NOT NULL DEFAULT 0,
    "versao_regras" TEXT NOT NULL DEFAULT 'v0.18',
    "processado_em" TIMESTAMP(3),
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportacaoXMLLote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportacaoXMLArquivo" (
    "id" TEXT NOT NULL,
    "lote_id" TEXT NOT NULL,
    "grupo_id" TEXT NOT NULL,
    "nome_original" TEXT NOT NULL,
    "storage_key" TEXT,
    "hash_sha256" TEXT,
    "tamanho_bytes" INTEGER NOT NULL DEFAULT 0,
    "tipo_xml" "TipoXml",
    "situacao_fiscal" "SituacaoFiscalXML",
    "status_tecnico" "StatusTecnico" NOT NULL DEFAULT 'PENDENTE',
    "chave_nfe" TEXT,
    "numero_nf" TEXT,
    "serie" TEXT,
    "data_emissao" TIMESTAMP(3),
    "cstat" TEXT,
    "xmotivo" TEXT,
    "ambiente" TEXT,
    "qtd_itens" INTEGER NOT NULL DEFAULT 0,
    "motivo_duplicidade" TEXT,
    "conteudo_extraido_json" TEXT,
    "erro_processamento" TEXT,
    "processado_em" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportacaoXMLArquivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportacaoXMLItem" (
    "id" TEXT NOT NULL,
    "lote_id" TEXT NOT NULL,
    "arquivo_id" TEXT,
    "grupo_id" TEXT NOT NULL,
    "chave_nfe" TEXT NOT NULL,
    "numero_item" INTEGER NOT NULL,
    "empresa_id" TEXT,
    "perspectiva" "Perspectiva",
    "direcao" "Direcao",
    "tipo_relacionamento" "TipoRelacionamento",
    "status_mapeamento" TEXT,
    "resultado_final" "ResultadoFinalXML",
    "validacao_documental_json" TEXT,
    "validacao_cadastral_json" TEXT,
    "validacao_tributaria_json" TEXT,
    "validacao_operacional_json" TEXT,
    "snapshot_versoes_json" TEXT,
    "vinculo_item_id" TEXT,
    "confirmado_em" TIMESTAMP(3),
    "operacao_id" TEXT,
    "descricao" TEXT,
    "ncm" TEXT,
    "nbs" TEXT,
    "cfop_servico" TEXT,
    "uf_origem" TEXT,
    "uf_destino" TEXT,
    "municipio_destino" TEXT,
    "quantidade" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "preco_unitario" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "desconto_incondicional" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "frete" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "seguro" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "outras_despesas" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valor_bruto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cst_original" TEXT,
    "cst_normalizado" TEXT,
    "c_class_trib_original" TEXT,
    "c_class_trib_normalizado" TEXT,
    "c_cred_pres_original" TEXT,
    "c_cred_pres_normalizado" TEXT,
    "pis_pct_original" TEXT,
    "pis_pct_normalizado" DOUBLE PRECISION,
    "cofins_pct_original" TEXT,
    "cofins_pct_normalizado" DOUBLE PRECISION,
    "icms_pct_original" TEXT,
    "icms_pct_normalizado" DOUBLE PRECISION,
    "fcp_pct_original" TEXT,
    "fcp_pct_normalizado" DOUBLE PRECISION,
    "ipi_pct_original" TEXT,
    "ipi_pct_normalizado" DOUBLE PRECISION,
    "iss_pct_original" TEXT,
    "iss_pct_normalizado" DOUBLE PRECISION,
    "credito_presumido_ibs_pct_original" TEXT,
    "credito_presumido_ibs_pct_normalizado" DOUBLE PRECISION,
    "credito_presumido_cbs_pct_original" TEXT,
    "credito_presumido_cbs_pct_normalizado" DOUBLE PRECISION,
    "grupo_rtc" TEXT,
    "finalidade_dfe" TEXT,
    "crt_emitente" TEXT,
    "ambiente" TEXT,
    "data_emissao" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportacaoXMLItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricoXML" (
    "id" TEXT NOT NULL,
    "grupo_id" TEXT NOT NULL,
    "empresa_id" TEXT,
    "chave_nfe" TEXT NOT NULL,
    "numero_item" INTEGER NOT NULL,
    "perspectiva" "Perspectiva" NOT NULL,
    "operacao_id" TEXT,
    "lote_id" TEXT,
    "importado_em" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistoricoXML_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "Empresa_grupo_idx" ON "Empresa"("grupo");

-- CreateIndex
CREATE INDEX "Operacao_empresa_id_idx" ON "Operacao"("empresa_id");

-- CreateIndex
CREATE INDEX "Operacao_ano_idx" ON "Operacao"("ano");

-- CreateIndex
CREATE INDEX "TransicaoAno_ano_idx" ON "TransicaoAno"("ano");

-- CreateIndex
CREATE INDEX "ClassTrib_c_class_trib_idx" ON "ClassTrib"("c_class_trib");

-- CreateIndex
CREATE INDEX "CstIbsCbs_cst_idx" ON "CstIbsCbs"("cst");

-- CreateIndex
CREATE INDEX "CredPres_c_cred_pres_idx" ON "CredPres"("c_cred_pres");

-- CreateIndex
CREATE INDEX "Diagnostico_grupo_id_idx" ON "Diagnostico"("grupo_id");

-- CreateIndex
CREATE UNIQUE INDEX "ImportacaoXMLLote_grupo_id_idempotency_key_key" ON "ImportacaoXMLLote"("grupo_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "ImportacaoXMLArquivo_lote_id_idx" ON "ImportacaoXMLArquivo"("lote_id");

-- CreateIndex
CREATE INDEX "ImportacaoXMLItem_lote_id_idx" ON "ImportacaoXMLItem"("lote_id");

-- CreateIndex
CREATE INDEX "ImportacaoXMLItem_grupo_id_chave_nfe_idx" ON "ImportacaoXMLItem"("grupo_id", "chave_nfe");

-- CreateIndex
CREATE INDEX "HistoricoXML_grupo_id_idx" ON "HistoricoXML"("grupo_id");

-- CreateIndex
CREATE INDEX "HistoricoXML_chave_nfe_numero_item_perspectiva_idx" ON "HistoricoXML"("chave_nfe", "numero_item", "perspectiva");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
