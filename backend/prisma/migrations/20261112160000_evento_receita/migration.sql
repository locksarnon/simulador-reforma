-- CreateTable
CREATE TABLE "EventoReceita" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "evento" TEXT NOT NULL,
    "data_evento" TIMESTAMP(3) NOT NULL,
    "consultado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atendido_em" TIMESTAMP(3),

    CONSTRAINT "EventoReceita_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventoReceita_empresa_id_idx" ON "EventoReceita"("empresa_id");

-- CreateIndex
CREATE UNIQUE INDEX "EventoReceita_empresa_id_evento_key" ON "EventoReceita"("empresa_id", "evento");
