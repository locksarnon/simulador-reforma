-- AlterTable
-- CreateTable
CREATE TABLE "DividaAtivaCarga" (
    "id" TEXT NOT NULL,
    "trimestre" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROCESSANDO',
    "linhas" INTEGER NOT NULL DEFAULT 0,
    "mensagem" TEXT,
    "iniciado_por" TEXT,
    "iniciado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluido_em" TIMESTAMP(3),

    CONSTRAINT "DividaAtivaCarga_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DividaAtivaInscricao" (
    "id" BIGSERIAL NOT NULL,
    "carga_id" TEXT NOT NULL,
    "raiz" CHAR(8) NOT NULL,
    "cnpj" CHAR(14) NOT NULL,
    "origem" TEXT NOT NULL,
    "tipo_devedor" TEXT,
    "nome" TEXT,
    "uf" TEXT,
    "numero_inscricao" TEXT NOT NULL,
    "tipo_situacao" TEXT,
    "situacao" TEXT,
    "receita" TEXT,
    "data_inscricao" TEXT,
    "ajuizado" BOOLEAN NOT NULL DEFAULT false,
    "valor" DECIMAL(16,2),

    CONSTRAINT "DividaAtivaInscricao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegracaoSegredo" (
    "id" TEXT NOT NULL,
    "segredo_cifrado" BYTEA NOT NULL,
    "segredo_iv" BYTEA NOT NULL,
    "segredo_tag" BYTEA NOT NULL,
    "chave_id" TEXT NOT NULL,
    "atualizado_por" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegracaoSegredo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DividaAtivaInscricao_raiz_carga_id_idx" ON "DividaAtivaInscricao"("raiz", "carga_id");

