-- A conferência do IBS/CBS acompanha o documento: se o XML for apagado do repositório, a linha da auditoria sai junto.
DELETE FROM "AuditoriaIbsCbs" a WHERE NOT EXISTS (SELECT 1 FROM "DocumentoXml" d WHERE d.id = a.documento_id);
ALTER TABLE "AuditoriaIbsCbs" ADD CONSTRAINT "AuditoriaIbsCbs_documento_id_fkey" FOREIGN KEY ("documento_id") REFERENCES "DocumentoXml"("id") ON DELETE CASCADE ON UPDATE CASCADE;
