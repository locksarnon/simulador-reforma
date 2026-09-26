-- CreateTable
CREATE TABLE "ValidacaoCadastro" (
    "id" TEXT NOT NULL,
    "criado_por" TEXT NOT NULL,
    "nome_arquivo" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL DEFAULT 0,
    "mapeamento_json" TEXT,
    "total" INTEGER NOT NULL DEFAULT 0,
    "itens_ok" INTEGER NOT NULL DEFAULT 0,
    "itens_alerta" INTEGER NOT NULL DEFAULT 0,
    "itens_erro" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValidacaoCadastro_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ValidacaoCadastro_createdAt_idx" ON "ValidacaoCadastro"("createdAt");
CREATE INDEX "ValidacaoCadastro_criado_por_idx" ON "ValidacaoCadastro"("criado_por");
