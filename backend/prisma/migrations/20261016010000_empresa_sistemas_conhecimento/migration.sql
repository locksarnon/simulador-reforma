ALTER TABLE "Empresa" ADD COLUMN "erp_versao" TEXT, ADD COLUMN "addons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], ADD COLUMN "addons_versoes" JSONB;
