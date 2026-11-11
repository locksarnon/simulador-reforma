-- Serviços contratados por empresa: separa a carteira do BPO fiscal e a do diagnóstico pontual sem duplicar o cadastro.
-- Só acrescenta; nada existente é alterado.

CREATE TABLE "ServicoContratado" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "situacao" TEXT NOT NULL DEFAULT 'ATIVO',
    "nome" TEXT,
    "inicio" TIMESTAMP(3),
    "fim" TIMESTAMP(3),
    "responsavel" TEXT,
    "modulos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "observacao" TEXT,
    "atualizado_por" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServicoContratado_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ServicoContratado_empresa_id_idx" ON "ServicoContratado"("empresa_id");
CREATE INDEX "ServicoContratado_tipo_situacao_idx" ON "ServicoContratado"("tipo", "situacao");

-- Dados de hoje: toda empresa já cadastrada começa com diagnóstico pontual ativo (é como o InTAX já funcionava).
-- Quem é do BPO é marcado depois, em Clientes > Serviços contratados.
INSERT INTO "ServicoContratado" ("id", "empresa_id", "tipo", "situacao", "nome", "atualizado_por", "updatedAt")
SELECT gen_random_uuid()::text, e."id", 'DIAGNOSTICO_PONTUAL', 'ATIVO', 'Diagnóstico (do cadastro anterior)', 'migração', CURRENT_TIMESTAMP
FROM "Empresa" e;
