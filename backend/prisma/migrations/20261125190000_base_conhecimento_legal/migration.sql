-- AlterTable
ALTER TABLE "NormaLegal" ADD COLUMN     "atos_modificadores" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "atualizada_em" TIMESTAMP(3),
ADD COLUMN     "formato" TEXT NOT NULL DEFAULT 'html',
ADD COLUMN     "grupo" TEXT,
ADD COLUMN     "leitor_versao" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "monitorar" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "origem" TEXT NOT NULL DEFAULT 'manifesto',
ADD COLUMN     "revogada_em" TIMESTAMP(3),
ADD COLUMN     "revogada_por" TEXT;

-- AlterTable
ALTER TABLE "DispositivoLegal" ADD COLUMN     "alteracoes" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "alterado_em" TIMESTAMP(3),
ADD COLUMN     "parcialmente_revogado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "redacoes_anteriores" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "revogado_por" TEXT,
ADD COLUMN     "temas" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "ReferenciaLegal" (
    "id" TEXT NOT NULL,
    "norma_id" TEXT NOT NULL,
    "caminho" TEXT NOT NULL,
    "rotulo" TEXT NOT NULL,
    "destino_ref" TEXT NOT NULL,
    "destino_caminho" TEXT NOT NULL,
    "trecho" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferenciaLegal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NovidadeLegal" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "norma_chave" TEXT,
    "norma_numero" TEXT,
    "caminho" TEXT,
    "rotulo" TEXT,
    "titulo" TEXT NOT NULL,
    "resumo" TEXT,
    "detalhes" JSONB NOT NULL DEFAULT '[]',
    "ato" TEXT,
    "ato_ref" TEXT,
    "url" TEXT,
    "oficial" BOOLEAN NOT NULL DEFAULT true,
    "confirmada" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'nova',
    "execucao_id" TEXT,
    "data_ato" DATE,
    "detectada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvida_por" TEXT,
    "resolvida_em" TIMESTAMP(3),

    CONSTRAINT "NovidadeLegal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevisaoSemanal" (
    "id" TEXT NOT NULL,
    "semana" TEXT NOT NULL,
    "disparo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'executando',
    "iniciado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluido_em" TIMESTAMP(3),
    "normas_verificadas" INTEGER NOT NULL DEFAULT 0,
    "normas_atualizadas" INTEGER NOT NULL DEFAULT 0,
    "dispositivos_alterados" INTEGER NOT NULL DEFAULT 0,
    "dispositivos_revogados" INTEGER NOT NULL DEFAULT 0,
    "normas_novas" INTEGER NOT NULL DEFAULT 0,
    "atos_relacionados" INTEGER NOT NULL DEFAULT 0,
    "fontes_verificadas" INTEGER NOT NULL DEFAULT 0,
    "fontes_alteradas" INTEGER NOT NULL DEFAULT 0,
    "erros" JSONB NOT NULL DEFAULT '[]',
    "resumo" TEXT,

    CONSTRAINT "RevisaoSemanal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FonteMonitorada" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "grupo" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "hash_atual" TEXT,
    "itens" JSONB NOT NULL DEFAULT '[]',
    "verificada_em" TIMESTAMP(3),
    "alterada_em" TIMESTAMP(3),
    "erro" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FonteMonitorada_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReferenciaLegal_destino_ref_destino_caminho_idx" ON "ReferenciaLegal"("destino_ref", "destino_caminho");

-- CreateIndex
CREATE INDEX "ReferenciaLegal_norma_id_caminho_idx" ON "ReferenciaLegal"("norma_id", "caminho");

-- CreateIndex
CREATE INDEX "NovidadeLegal_detectada_em_idx" ON "NovidadeLegal"("detectada_em");

-- CreateIndex
CREATE INDEX "NovidadeLegal_norma_chave_caminho_idx" ON "NovidadeLegal"("norma_chave", "caminho");

-- CreateIndex
CREATE INDEX "NovidadeLegal_tipo_status_idx" ON "NovidadeLegal"("tipo", "status");

-- CreateIndex
CREATE INDEX "NovidadeLegal_execucao_id_idx" ON "NovidadeLegal"("execucao_id");

-- CreateIndex
CREATE INDEX "RevisaoSemanal_iniciado_em_idx" ON "RevisaoSemanal"("iniciado_em");

-- CreateIndex
CREATE UNIQUE INDEX "FonteMonitorada_chave_key" ON "FonteMonitorada"("chave");

-- AddForeignKey
ALTER TABLE "ReferenciaLegal" ADD CONSTRAINT "ReferenciaLegal_norma_id_fkey" FOREIGN KEY ("norma_id") REFERENCES "NormaLegal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

