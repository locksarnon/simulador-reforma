-- CreateTable
CREATE TABLE "NormaLegal" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "ementa" TEXT,
    "orgao" TEXT,
    "data_publicacao" TIMESTAMP(3),
    "url_oficial" TEXT NOT NULL,
    "prioridade" INTEGER NOT NULL DEFAULT 1,
    "fonte_primaria" BOOLEAN NOT NULL DEFAULT true,
    "situacao" TEXT NOT NULL DEFAULT 'vigente',
    "hash_atual" TEXT,
    "capturada_em" TIMESTAMP(3),
    "total_dispositivos" INTEGER NOT NULL DEFAULT 0,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NormaLegal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispositivoLegal" (
    "id" TEXT NOT NULL,
    "norma_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "rotulo" TEXT NOT NULL,
    "caminho" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "secao" TEXT,
    "texto" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "revogado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DispositivoLegal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispositivoLegalVersao" (
    "id" TEXT NOT NULL,
    "dispositivo_id" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "capturada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DispositivoLegalVersao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NormaLegal_chave_key" ON "NormaLegal"("chave");
CREATE UNIQUE INDEX "DispositivoLegal_norma_id_caminho_key" ON "DispositivoLegal"("norma_id", "caminho");
CREATE INDEX "DispositivoLegal_norma_id_ordem_idx" ON "DispositivoLegal"("norma_id", "ordem");
CREATE INDEX "DispositivoLegalVersao_dispositivo_id_idx" ON "DispositivoLegalVersao"("dispositivo_id");

-- Busca textual em português (índice de expressão; não é gerenciado pelo Prisma)
CREATE INDEX "DispositivoLegal_texto_fts" ON "DispositivoLegal" USING GIN (to_tsvector('portuguese', left("texto", 200000)));

-- AddForeignKey
ALTER TABLE "DispositivoLegal" ADD CONSTRAINT "DispositivoLegal_norma_id_fkey" FOREIGN KEY ("norma_id") REFERENCES "NormaLegal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DispositivoLegalVersao" ADD CONSTRAINT "DispositivoLegalVersao_dispositivo_id_fkey" FOREIGN KEY ("dispositivo_id") REFERENCES "DispositivoLegal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
