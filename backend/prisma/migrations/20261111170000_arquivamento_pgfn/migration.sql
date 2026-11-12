-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN     "arquivado_em" TIMESTAMP(3),
ADD COLUMN     "arquivado_por" TEXT;

-- CreateTable
CREATE TABLE "ParcelamentoPgfn" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "modalidade" TEXT,
    "situacao" TEXT NOT NULL DEFAULT 'EM_DIA',
    "valor_consolidado" DOUBLE PRECISION,
    "parcelas_total" INTEGER,
    "parcelas_pagas" INTEGER,
    "valor_parcela" DOUBLE PRECISION,
    "proximo_vencimento" TIMESTAMP(3),
    "debito_automatico" BOOLEAN NOT NULL DEFAULT false,
    "observacao" TEXT,
    "atualizado_por" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParcelamentoPgfn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ParcelamentoPgfn_empresa_id_idx" ON "ParcelamentoPgfn"("empresa_id");

