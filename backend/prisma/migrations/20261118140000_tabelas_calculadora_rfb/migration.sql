-- Tabelas oficiais da calculadora da Receita (cópia por versão; só leitura para conferência).
CREATE TABLE "RfbClassTrib" (
    "id" TEXT NOT NULL,
    "versao_db" TEXT NOT NULL,
    "c_class_trib" TEXT NOT NULL,
    "cst" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "tipo_aliquota" TEXT,
    "nomenclatura" TEXT,
    "anexo" TEXT,
    "pct_reducao_cbs" DOUBLE PRECISION,
    "pct_reducao_ibs" DOUBLE PRECISION,
    "credito_adquirente" BOOLEAN NOT NULL DEFAULT false,
    "cred_pres_fornecedor" BOOLEAN NOT NULL DEFAULT false,
    "cred_pres_adquirente" BOOLEAN NOT NULL DEFAULT false,
    "documentos" TEXT[],
    "fundamento_curto" TEXT,
    "fundamento_texto" TEXT,
    "inicio_vigencia" TEXT NOT NULL,
    "fim_vigencia" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RfbClassTrib_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RfbClassTrib_c_class_trib_idx" ON "RfbClassTrib"("c_class_trib");

CREATE TABLE "RfbNomenclaturaVinculo" (
    "id" TEXT NOT NULL,
    "versao_db" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "c_class_trib" TEXT NOT NULL,
    "anexo" TEXT,
    "item" TEXT,
    "excecoes" TEXT[],
    "inicio_vigencia" TEXT NOT NULL,
    "fim_vigencia" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RfbNomenclaturaVinculo_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RfbNomenclaturaVinculo_tipo_codigo_idx" ON "RfbNomenclaturaVinculo"("tipo", "codigo");
CREATE INDEX "RfbNomenclaturaVinculo_c_class_trib_idx" ON "RfbNomenclaturaVinculo"("c_class_trib");
