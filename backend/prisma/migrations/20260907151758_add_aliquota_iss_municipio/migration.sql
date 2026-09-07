-- CreateTable
CREATE TABLE "AliquotaIssMunicipio" (
    "id" TEXT NOT NULL,
    "codigo_ibge" TEXT NOT NULL,
    "uf" TEXT NOT NULL,
    "nome_municipio" TEXT NOT NULL,
    "codigo_servico" TEXT NOT NULL,
    "aliquota" DOUBLE PRECISION NOT NULL,
    "dt_ini" TIMESTAMP(3),
    "dt_fim" TIMESTAMP(3),
    "fonte" TEXT NOT NULL DEFAULT 'Prefeituras — extração 2026-09-03',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AliquotaIssMunicipio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AliquotaIssMunicipio_codigo_ibge_codigo_servico_idx" ON "AliquotaIssMunicipio"("codigo_ibge", "codigo_servico");

-- CreateIndex
CREATE INDEX "AliquotaIssMunicipio_uf_idx" ON "AliquotaIssMunicipio"("uf");
