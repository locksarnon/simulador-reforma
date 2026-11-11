-- Núcleo operacional: usuários e acessos, carteira por colaborador, tags e filtros, tarefas, notificações e calendário geral.
-- Só acrescenta (duas colunas novas em "User", com valor padrão); nada existente é alterado nem apagado.

ALTER TABLE "User" ADD COLUMN "ativo" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "lastLoginAt" TIMESTAMP(3);

CREATE TABLE "ParametroSistema" (
    "chave" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "descricao" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ParametroSistema_pkey" PRIMARY KEY ("chave")
);

CREATE TABLE "AcessoLog" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "email" TEXT NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "resultado" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AcessoLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AcessoLog_createdAt_idx" ON "AcessoLog"("createdAt");
CREATE INDEX "AcessoLog_email_idx" ON "AcessoLog"("email");

CREATE TABLE "IpPermitido" (
    "id" TEXT NOT NULL,
    "faixa" TEXT NOT NULL,
    "descricao" TEXT,
    "criado_por" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IpPermitido_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IpPermitido_faixa_key" ON "IpPermitido"("faixa");

CREATE TABLE "VinculoColaborador" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VinculoColaborador_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VinculoColaborador_user_id_empresa_id_key" ON "VinculoColaborador"("user_id", "empresa_id");
CREATE INDEX "VinculoColaborador_empresa_id_idx" ON "VinculoColaborador"("empresa_id");

CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cor" TEXT NOT NULL DEFAULT '#1E764D',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Tag_nome_key" ON "Tag"("nome");

CREATE TABLE "EmpresaTag" (
    "tag_id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmpresaTag_pkey" PRIMARY KEY ("tag_id", "empresa_id")
);
CREATE INDEX "EmpresaTag_empresa_id_idx" ON "EmpresaTag"("empresa_id");
ALTER TABLE "EmpresaTag" ADD CONSTRAINT "EmpresaTag_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FiltroSalvo" (
    "id" TEXT NOT NULL,
    "dono" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "escopo" TEXT NOT NULL DEFAULT 'empresas',
    "criterios" JSONB NOT NULL,
    "compartilhado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FiltroSalvo_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FiltroSalvo_dono_idx" ON "FiltroSalvo"("dono");

CREATE TABLE "ProcessoModelo" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "recorrencia" TEXT NOT NULL DEFAULT 'MENSAL',
    "dia" INTEGER NOT NULL DEFAULT 10,
    "mes" INTEGER,
    "escopo" TEXT NOT NULL DEFAULT 'POR_EMPRESA_BPO',
    "responsavel" TEXT,
    "prioridade" TEXT NOT NULL DEFAULT 'NORMAL',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_por" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProcessoModelo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Tarefa" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "empresa_id" TEXT,
    "responsavel" TEXT,
    "prazo" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ABERTA',
    "prioridade" TEXT NOT NULL DEFAULT 'NORMAL',
    "modelo_id" TEXT,
    "competencia" TEXT,
    "concluida_em" TIMESTAMP(3),
    "criado_por" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Tarefa_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Tarefa_status_prazo_idx" ON "Tarefa"("status", "prazo");
CREATE INDEX "Tarefa_empresa_id_idx" ON "Tarefa"("empresa_id");
CREATE INDEX "Tarefa_responsavel_idx" ON "Tarefa"("responsavel");
CREATE INDEX "Tarefa_modelo_id_competencia_idx" ON "Tarefa"("modelo_id", "competencia");

CREATE TABLE "Notificacao" (
    "id" TEXT NOT NULL,
    "destinatario" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensagem" TEXT,
    "link" TEXT,
    "chave" TEXT,
    "lida_em" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notificacao_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Notificacao_destinatario_chave_key" ON "Notificacao"("destinatario", "chave");
CREATE INDEX "Notificacao_destinatario_lida_em_idx" ON "Notificacao"("destinatario", "lida_em");

CREATE TABLE "TipoEvento" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cor" TEXT NOT NULL DEFAULT '#2563EB',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TipoEvento_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TipoEvento_nome_key" ON "TipoEvento"("nome");

CREATE TABLE "EventoAgenda" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3),
    "dia_inteiro" BOOLEAN NOT NULL DEFAULT false,
    "tipo_id" TEXT,
    "empresa_id" TEXT,
    "responsavel" TEXT,
    "local" TEXT,
    "criado_por" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EventoAgenda_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EventoAgenda_inicio_idx" ON "EventoAgenda"("inicio");

-- Tipos de evento de partida (a equipe muda depois, em Obrigações e agenda).
INSERT INTO "TipoEvento" ("id", "nome", "cor") VALUES
  (gen_random_uuid()::text, 'Reunião', '#2563EB'),
  (gen_random_uuid()::text, 'Prazo', '#DC2626'),
  (gen_random_uuid()::text, 'Visita ao cliente', '#16A34A'),
  (gen_random_uuid()::text, 'Outro', '#6B7280');
