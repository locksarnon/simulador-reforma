-- Ambiente da nota (tpAmb): as notas de homologação do ERP passam a ser conferidas e entram no laudo da homologação.
ALTER TABLE "AuditoriaIbsCbs" ADD COLUMN IF NOT EXISTS "ambiente" TEXT NOT NULL DEFAULT 'PRODUCAO';
