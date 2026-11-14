-- Lotes do monitoramento gravados (retomam depois de reinício do servidor).
CREATE TABLE IF NOT EXISTS "LoteMonitoramento" (
    "id" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "por" TEXT,
    "tarefas" JSONB NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,
    "feitas" INTEGER NOT NULL DEFAULT 0,
    "erros" INTEGER NOT NULL DEFAULT 0,
    "iniciado" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fim" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LoteMonitoramento_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "LoteMonitoramento_fim_idx" ON "LoteMonitoramento"("fim");
