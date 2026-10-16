ALTER TABLE "ValidacaoCadastro" ADD COLUMN "empresa_id" TEXT, ADD COLUMN "opcoes_json" TEXT, ADD COLUMN "resultado_json" TEXT;
CREATE INDEX "ValidacaoCadastro_empresa_id_idx" ON "ValidacaoCadastro"("empresa_id");
CREATE TABLE "AnaliseEmpresa" (
 "id" TEXT NOT NULL, "empresa_id" TEXT NOT NULL, "servico" TEXT NOT NULL, "titulo" TEXT NOT NULL,
 "dados" JSONB NOT NULL, "criado_por" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "AnaliseEmpresa_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AnaliseEmpresa_empresa_id_createdAt_idx" ON "AnaliseEmpresa"("empresa_id", "createdAt");
