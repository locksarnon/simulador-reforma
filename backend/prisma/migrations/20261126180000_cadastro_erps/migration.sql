-- Cadastro de ERPs (Administração > Configuração e ERPs): o conhecimento de cada ERP, usado por todas as telas.
-- Aditiva e idempotente (pode ser reaplicada). Nenhum dado existente muda: o texto antigo de "erp" fica em Empresa e SanProjeto; o vínculo
-- novo (erp_id) é preenchido pela aplicação quando o nome casa sem ambiguidade. A carga inicial (SAP Business One, Aliare Siagri,
-- TOTVS Protheus e "Outro ERP (sem perfil)") roda na inicialização do servidor, sem duplicar (backend/src/erps/carga.ts).

CREATE TABLE IF NOT EXISTS "Erp" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "fabricante" TEXT NOT NULL,
    "produto" TEXT,
    "versoes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "situacao" TEXT NOT NULL DEFAULT 'A_DESENVOLVER',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Erp_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Erp_nome_key" ON "Erp"("nome");

CREATE TABLE IF NOT EXISTS "ErpConhecimento" (
    "id" TEXT NOT NULL,
    "erp_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "tipo_ajuste" TEXT,
    "chave" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "campo_erp" TEXT,
    "fonte_url" TEXT,
    "grau" TEXT NOT NULL DEFAULT 'NAO_CONFIRMADO',
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErpConhecimento_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ErpConhecimento_erp_id_tipo_idx" ON "ErpConhecimento"("erp_id", "tipo");

DO $$ BEGIN
    ALTER TABLE "ErpConhecimento" ADD CONSTRAINT "ErpConhecimento_erp_id_fkey" FOREIGN KEY ("erp_id") REFERENCES "Erp"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ErpHistorico" (
    "id" TEXT NOT NULL,
    "erp_id" TEXT NOT NULL,
    "conhecimento_id" TEXT,
    "acao" TEXT NOT NULL,
    "usuario" TEXT NOT NULL,
    "antes" JSONB,
    "depois" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErpHistorico_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ErpHistorico_erp_id_createdAt_idx" ON "ErpHistorico"("erp_id", "createdAt");

-- Vínculo ao ERP do cadastro, ao lado do texto antigo (que não muda).
ALTER TABLE "Empresa" ADD COLUMN IF NOT EXISTS "erp_id" TEXT;
ALTER TABLE "SanProjeto" ADD COLUMN IF NOT EXISTS "erp_id" TEXT;
