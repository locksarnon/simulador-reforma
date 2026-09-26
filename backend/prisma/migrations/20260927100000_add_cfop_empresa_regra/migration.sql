-- CreateTable
CREATE TABLE "CfopEmpresaRegra" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "cfop" TEXT NOT NULL,
    "tratamento" TEXT NOT NULL,
    "atualizado_por" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CfopEmpresaRegra_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CfopEmpresaRegra_empresa_id_cfop_key" ON "CfopEmpresaRegra"("empresa_id", "cfop");
