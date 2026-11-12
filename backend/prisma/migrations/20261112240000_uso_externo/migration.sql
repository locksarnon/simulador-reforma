-- CreateTable
CREATE TABLE "UsoExterno" (
    "id" TEXT NOT NULL,
    "servico" TEXT NOT NULL,
    "usuario" TEXT,
    "empresa_id" TEXT,
    "referencia" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsoExterno_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UsoExterno_createdAt_idx" ON "UsoExterno"("createdAt");

-- CreateIndex
CREATE INDEX "UsoExterno_usuario_createdAt_idx" ON "UsoExterno"("usuario", "createdAt");
