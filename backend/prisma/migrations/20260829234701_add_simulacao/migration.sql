-- CreateTable
CREATE TABLE "Simulacao" (
    "id" TEXT NOT NULL,
    "grupo_id" TEXT,
    "empresa_id" TEXT,
    "nome" TEXT,
    "escopo" TEXT NOT NULL,
    "input_hash" TEXT NOT NULL,
    "versao_motor" TEXT NOT NULL,
    "versao_regras" TEXT NOT NULL,
    "entrada_json" TEXT NOT NULL,
    "resultado_json" TEXT NOT NULL,
    "criado_por" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Simulacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Simulacao_grupo_id_idx" ON "Simulacao"("grupo_id");

-- CreateIndex
CREATE INDEX "Simulacao_input_hash_idx" ON "Simulacao"("input_hash");
