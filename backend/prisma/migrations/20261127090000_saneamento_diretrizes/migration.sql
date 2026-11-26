-- Diretrizes do Saneamento de Estoques (docs/saneamento-diretrizes.md): regras por aspecto e grupo que comandam as análises e, aprovadas,
-- formam a política; biblioteca FAL de regras-modelo, versionada. Aditiva e idempotente (pode ser reaplicada): só cria tabelas e índices,
-- nenhum dado existente muda. Os parâmetros antigos de cada projeto (limites, abreviações, política de unidades, caixa alta) viram regras
-- equivalentes "Todos os grupos" pela aplicação, na primeira leitura das Diretrizes, sem mudar o resultado das análises. A carga inicial
-- da biblioteca roda na inicialização do servidor, sem duplicar nem sobrescrever o que um administrador editou.

CREATE TABLE IF NOT EXISTS "SanDiretrizes" (
    "id" TEXT NOT NULL,
    "projeto_id" TEXT NOT NULL,
    "vigencia" TEXT,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "convertido_em" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SanDiretrizes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SanDiretrizes_projeto_id_key" ON "SanDiretrizes"("projeto_id");

CREATE TABLE IF NOT EXISTS "SanDiretrizRegra" (
    "id" TEXT NOT NULL,
    "projeto_id" TEXT NOT NULL,
    "aspecto" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "abrangencia" JSONB NOT NULL,
    "observacao" TEXT,
    "biblioteca_id" TEXT,
    "biblioteca_versao" INTEGER,
    "alteracoes" JSONB,
    "situacao" TEXT NOT NULL DEFAULT 'RASCUNHO',
    "revisar" BOOLEAN NOT NULL DEFAULT false,
    "revisar_causa" TEXT,
    "aprovada_por" TEXT,
    "aprovada_em" TIMESTAMP(3),
    "aplicacao" JSONB,
    "aplicada_em" TIMESTAMP(3),
    "aplicada_por" TEXT,
    "legado" BOOLEAN NOT NULL DEFAULT false,
    "parametros_legados" JSONB,
    "criada_por" TEXT,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SanDiretrizRegra_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SanDiretrizRegra_projeto_id_codigo_key" ON "SanDiretrizRegra"("projeto_id", "codigo");

CREATE INDEX IF NOT EXISTS "SanDiretrizRegra_projeto_id_aspecto_idx" ON "SanDiretrizRegra"("projeto_id", "aspecto");

CREATE TABLE IF NOT EXISTS "SanDiretrizHistorico" (
    "id" TEXT NOT NULL,
    "projeto_id" TEXT NOT NULL,
    "regra_id" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "usuario" TEXT NOT NULL,
    "antes" JSONB,
    "depois" JSONB,
    "detalhe" TEXT,
    "quando" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SanDiretrizHistorico_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SanDiretrizHistorico_regra_id_quando_idx" ON "SanDiretrizHistorico"("regra_id", "quando");

CREATE INDEX IF NOT EXISTS "SanDiretrizHistorico_projeto_id_quando_idx" ON "SanDiretrizHistorico"("projeto_id", "quando");

CREATE TABLE IF NOT EXISTS "SanDiretrizBiblioteca" (
    "id" TEXT NOT NULL,
    "aspecto" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "indicada_para" TEXT,
    "observacao" TEXT,
    "conteudo" JSONB NOT NULL,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "editada" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SanDiretrizBiblioteca_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SanDiretrizBiblioteca_aspecto_idx" ON "SanDiretrizBiblioteca"("aspecto");

CREATE TABLE IF NOT EXISTS "SanDiretrizBibliotecaVersao" (
    "id" TEXT NOT NULL,
    "regra_id" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "indicada_para" TEXT,
    "observacao" TEXT,
    "conteudo" JSONB NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "acao" TEXT NOT NULL,
    "usuario" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SanDiretrizBibliotecaVersao_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SanDiretrizBibliotecaVersao_regra_id_versao_key" ON "SanDiretrizBibliotecaVersao"("regra_id", "versao");
