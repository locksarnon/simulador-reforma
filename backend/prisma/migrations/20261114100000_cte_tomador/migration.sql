-- CT-e: CNPJ/CPF do tomador do serviço (filtro "tomados pelo cliente" e envio ao importador).
ALTER TABLE "DocumentoXml" ADD COLUMN IF NOT EXISTS "tomador_doc" TEXT;
CREATE INDEX IF NOT EXISTS "DocumentoXml_empresa_id_tipo_tomador_doc_idx" ON "DocumentoXml"("empresa_id", "tipo", "tomador_doc");
