-- Saneamento de estoques e cadastro de produtos: só tabelas novas (aditiva; pode ser reaplicada).

CREATE TABLE IF NOT EXISTS "SanProjeto" (
    "id" TEXT NOT NULL,
    "diagnostico_id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "data_base" TIMESTAMP(3) NOT NULL,
    "erp" TEXT,
    "erp_versao" TEXT,
    "estabelecimentos" JSONB NOT NULL DEFAULT '[]',
    "responsavel" TEXT,
    "modulos" JSONB NOT NULL DEFAULT '{"conciliacao":false,"blocosKG":false,"arquivoErp":false}',
    "parametros" JSONB NOT NULL DEFAULT '{}',
    "atividades_confirmadas_por" TEXT,
    "atividades_confirmadas_em" TIMESTAMP(3),
    "cnpj_versao" TEXT,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "criado_por" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SanProjeto_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SanAtividade" (
    "id" TEXT NOT NULL,
    "projeto_id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "mantida" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SanAtividade_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SanImportacao" (
    "id" TEXT NOT NULL,
    "projeto_id" TEXT NOT NULL,
    "arquivo" TEXT NOT NULL,
    "usuario" TEXT NOT NULL,
    "mapeamento" JSONB NOT NULL DEFAULT '{}',
    "aceitas" INTEGER NOT NULL DEFAULT 0,
    "rejeitadas" INTEGER NOT NULL DEFAULT 0,
    "pendentes" INTEGER NOT NULL DEFAULT 0,
    "relatorio" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SanImportacao_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SanItem" (
    "id" TEXT NOT NULL,
    "projeto_id" TEXT NOT NULL,
    "estabelecimento" TEXT NOT NULL DEFAULT '',
    "codigo" TEXT NOT NULL,
    "linha" INTEGER NOT NULL,
    "importacao_id" TEXT NOT NULL,
    "descricao" TEXT NOT NULL DEFAULT '',
    "original" JSONB NOT NULL,
    "lido" JSONB,
    "trabalho" JSONB NOT NULL,
    "grupo" TEXT,
    "finalidade" TEXT,
    "tambem_usado_como" JSONB NOT NULL DEFAULT '[]',
    "conjunto_chave" TEXT,
    "ativo" BOOLEAN,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SanItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SanCelula" (
    "id" TEXT NOT NULL,
    "projeto_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "camada" TEXT NOT NULL,
    "grupo" TEXT NOT NULL DEFAULT '',
    "situacao" TEXT NOT NULL DEFAULT 'PENDENTE',
    "revisar" BOOLEAN NOT NULL DEFAULT false,
    "revisar_causa" TEXT,
    "caso_id" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SanCelula_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SanCaso" (
    "id" TEXT NOT NULL,
    "projeto_id" TEXT NOT NULL,
    "camada" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "itens" TEXT[],
    "problema" TEXT NOT NULL,
    "evidencia" JSONB NOT NULL DEFAULT '[]',
    "atual" JSONB NOT NULL DEFAULT '{}',
    "proposta" JSONB NOT NULL DEFAULT '{}',
    "justificativa" TEXT NOT NULL,
    "fundamento" TEXT,
    "impactos" JSONB NOT NULL DEFAULT '[]',
    "origem" TEXT NOT NULL,
    "situacao" TEXT NOT NULL DEFAULT 'PROPOSTO',
    "responsavel" TEXT,
    "parecer_ia" JSONB,
    "afeta" JSONB NOT NULL DEFAULT '[]',
    "motivo" TEXT,
    "decidido_por" TEXT,
    "decidido_em" TIMESTAMP(3),
    "versao" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SanCaso_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SanDecisao" (
    "id" TEXT NOT NULL,
    "projeto_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "caso_id" TEXT,
    "campo" TEXT NOT NULL,
    "antes" JSONB,
    "depois" JSONB,
    "fundamento" TEXT,
    "usuario" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "quando" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SanDecisao_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SanVersao" (
    "id" TEXT NOT NULL,
    "projeto_id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "rotulo" TEXT NOT NULL,
    "usuario" TEXT NOT NULL,
    "resumo" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SanVersao_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SanVersaoSnapshot" (
    "versao_id" TEXT NOT NULL,
    "dados" BYTEA NOT NULL,
    "itens" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SanVersaoSnapshot_pkey" PRIMARY KEY ("versao_id")
);

CREATE TABLE IF NOT EXISTS "SanImpactoSped" (
    "id" TEXT NOT NULL,
    "projeto_id" TEXT NOT NULL,
    "caso_id" TEXT,
    "obrigacao" TEXT NOT NULL,
    "competencia" TEXT,
    "versao_leiaute" TEXT,
    "registro" TEXT NOT NULL,
    "campo" TEXT,
    "valor_original" TEXT,
    "valor_proposto" TEXT,
    "motivo" TEXT NOT NULL,
    "evidencia" TEXT,
    "inicio" TIMESTAMP(3),
    "avaliar_anteriores" BOOLEAN NOT NULL DEFAULT false,
    "responsavel" TEXT,
    "tipo_ajuste" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SanImpactoSped_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SanVinculoCodigo" (
    "id" TEXT NOT NULL,
    "projeto_id" TEXT NOT NULL,
    "de" TEXT NOT NULL,
    "para" TEXT NOT NULL,
    "inicio" TIMESTAMP(3),
    "justificativa" TEXT NOT NULL,
    "criado_por" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SanVinculoCodigo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SanProjeto_diagnostico_id_key" ON "SanProjeto"("diagnostico_id");

CREATE INDEX IF NOT EXISTS "SanProjeto_empresa_id_idx" ON "SanProjeto"("empresa_id");

CREATE UNIQUE INDEX IF NOT EXISTS "SanAtividade_projeto_id_codigo_key" ON "SanAtividade"("projeto_id", "codigo");

CREATE INDEX IF NOT EXISTS "SanImportacao_projeto_id_createdAt_idx" ON "SanImportacao"("projeto_id", "createdAt");

CREATE INDEX IF NOT EXISTS "SanItem_projeto_id_codigo_idx" ON "SanItem"("projeto_id", "codigo");

CREATE INDEX IF NOT EXISTS "SanItem_projeto_id_grupo_idx" ON "SanItem"("projeto_id", "grupo");

CREATE INDEX IF NOT EXISTS "SanItem_projeto_id_conjunto_chave_idx" ON "SanItem"("projeto_id", "conjunto_chave");

CREATE INDEX IF NOT EXISTS "SanItem_importacao_id_idx" ON "SanItem"("importacao_id");

CREATE UNIQUE INDEX IF NOT EXISTS "SanItem_projeto_id_estabelecimento_codigo_key" ON "SanItem"("projeto_id", "estabelecimento", "codigo");

CREATE INDEX IF NOT EXISTS "SanCelula_projeto_id_camada_situacao_idx" ON "SanCelula"("projeto_id", "camada", "situacao");

CREATE INDEX IF NOT EXISTS "SanCelula_projeto_id_grupo_camada_idx" ON "SanCelula"("projeto_id", "grupo", "camada");

CREATE INDEX IF NOT EXISTS "SanCelula_caso_id_idx" ON "SanCelula"("caso_id");

CREATE UNIQUE INDEX IF NOT EXISTS "SanCelula_item_id_camada_key" ON "SanCelula"("item_id", "camada");

CREATE INDEX IF NOT EXISTS "SanCaso_projeto_id_camada_situacao_idx" ON "SanCaso"("projeto_id", "camada", "situacao");

CREATE INDEX IF NOT EXISTS "SanCaso_projeto_id_situacao_idx" ON "SanCaso"("projeto_id", "situacao");

CREATE INDEX IF NOT EXISTS "SanCaso_itens_idx" ON "SanCaso" USING GIN ("itens");

CREATE UNIQUE INDEX IF NOT EXISTS "SanCaso_projeto_id_chave_key" ON "SanCaso"("projeto_id", "chave");

CREATE INDEX IF NOT EXISTS "SanDecisao_projeto_id_item_id_campo_quando_idx" ON "SanDecisao"("projeto_id", "item_id", "campo", "quando");

CREATE INDEX IF NOT EXISTS "SanDecisao_caso_id_idx" ON "SanDecisao"("caso_id");

CREATE UNIQUE INDEX IF NOT EXISTS "SanVersao_projeto_id_numero_key" ON "SanVersao"("projeto_id", "numero");

CREATE INDEX IF NOT EXISTS "SanImpactoSped_projeto_id_obrigacao_idx" ON "SanImpactoSped"("projeto_id", "obrigacao");

CREATE INDEX IF NOT EXISTS "SanImpactoSped_caso_id_idx" ON "SanImpactoSped"("caso_id");

CREATE INDEX IF NOT EXISTS "SanVinculoCodigo_projeto_id_de_idx" ON "SanVinculoCodigo"("projeto_id", "de");

DO $$ BEGIN
ALTER TABLE "SanAtividade" ADD CONSTRAINT "SanAtividade_projeto_id_fkey" FOREIGN KEY ("projeto_id") REFERENCES "SanProjeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
ALTER TABLE "SanCelula" ADD CONSTRAINT "SanCelula_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "SanItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
ALTER TABLE "SanVersaoSnapshot" ADD CONSTRAINT "SanVersaoSnapshot_versao_id_fkey" FOREIGN KEY ("versao_id") REFERENCES "SanVersao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
