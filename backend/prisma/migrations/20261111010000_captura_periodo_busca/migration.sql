-- Período da busca automática da captura de XML, por empresa: NOTURNO (18:00 às 05:59) ou DIURNO (06:00 às 17:59).
-- AlterTable
ALTER TABLE "XmlEmpresaConfig" ADD COLUMN "periodo_busca" TEXT NOT NULL DEFAULT 'NOTURNO';
