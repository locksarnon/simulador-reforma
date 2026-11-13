-- Anexo VIII v1.02.00: código e descrição da atividade do Simples Nacional (COD_ATIV_SN).
ALTER TABLE "CorrelacaoServico" ADD COLUMN IF NOT EXISTS "cod_ativ_sn" TEXT;
ALTER TABLE "CorrelacaoServico" ADD COLUMN IF NOT EXISTS "descricao_ativ_sn" TEXT;
