-- CreateTable
CREATE TABLE "ContratoIntegraContador" (
    "id" TEXT NOT NULL,
    "titular" TEXT NOT NULL,
    "documento" TEXT NOT NULL,
    "valido_ate" TIMESTAMP(3) NOT NULL,
    "segredo_cifrado" BYTEA NOT NULL,
    "segredo_iv" BYTEA NOT NULL,
    "segredo_tag" BYTEA NOT NULL,
    "chave_id" TEXT NOT NULL,
    "atualizado_por" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContratoIntegraContador_pkey" PRIMARY KEY ("id")
);

