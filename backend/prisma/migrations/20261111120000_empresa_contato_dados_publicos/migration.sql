-- Empresa: contato (e-mail e WhatsApp) e dados públicos do CNPJ para o Painel da carteira.
-- Só acrescenta colunas que aceitam vazio: nenhum dado existente muda.
ALTER TABLE "Empresa" ADD COLUMN IF NOT EXISTS "email_contato" TEXT;
ALTER TABLE "Empresa" ADD COLUMN IF NOT EXISTS "whatsapp_contato" TEXT;
ALTER TABLE "Empresa" ADD COLUMN IF NOT EXISTS "cnae_principal" TEXT;
ALTER TABLE "Empresa" ADD COLUMN IF NOT EXISTS "cnae_descricao" TEXT;
ALTER TABLE "Empresa" ADD COLUMN IF NOT EXISTS "porte" TEXT;
ALTER TABLE "Empresa" ADD COLUMN IF NOT EXISTS "natureza_juridica" TEXT;
ALTER TABLE "Empresa" ADD COLUMN IF NOT EXISTS "codigo_municipio_ibge" TEXT;
ALTER TABLE "Empresa" ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION;
ALTER TABLE "Empresa" ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;
ALTER TABLE "Empresa" ADD COLUMN IF NOT EXISTS "dados_publicos_em" TIMESTAMP(3);
