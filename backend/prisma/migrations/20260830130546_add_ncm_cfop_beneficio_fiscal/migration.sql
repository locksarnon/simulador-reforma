-- CreateTable
CREATE TABLE "Ncm" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Ativo',
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ncm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cfop" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT,
    "tipo_operacao" TEXT,
    "aplicavel_a" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Ativo',
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cfop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BeneficioFiscal" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT,
    "uf" TEXT,
    "fundamento_legal" TEXT,
    "vigencia_inicio" TIMESTAMP(3),
    "vigencia_fim" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'Ativo',
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BeneficioFiscal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Ncm_codigo_idx" ON "Ncm"("codigo");

-- CreateIndex
CREATE INDEX "Cfop_codigo_idx" ON "Cfop"("codigo");

-- CreateIndex
CREATE INDEX "BeneficioFiscal_codigo_idx" ON "BeneficioFiscal"("codigo");
