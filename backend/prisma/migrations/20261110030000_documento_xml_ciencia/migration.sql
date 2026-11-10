-- AlterTable
ALTER TABLE "DocumentoXml" ADD COLUMN     "autorizada_em" TIMESTAMP(3),
ADD COLUMN     "ciencia_em" TIMESTAMP(3),
ADD COLUMN     "ciencia_protocolo" TEXT,
ADD COLUMN     "ciencia_status" TEXT;

-- CreateIndex
CREATE INDEX "DocumentoXml_empresa_id_conteudo_ciencia_status_idx" ON "DocumentoXml"("empresa_id", "conteudo", "ciencia_status");
