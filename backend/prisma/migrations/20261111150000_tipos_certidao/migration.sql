-- Tipos de documento das certidões (o radar de certidões da Análise de risco conta estes)
INSERT INTO "TipoDocumento" ("id", "nome", "orgao", "alerta_dias") VALUES
  (gen_random_uuid()::text, 'CND federal (Receita e PGFN)', 'Receita Federal e PGFN', 15),
  (gen_random_uuid()::text, 'CND estadual', 'Secretaria da Fazenda do estado', 15),
  (gen_random_uuid()::text, 'CND municipal', 'Prefeitura', 15),
  (gen_random_uuid()::text, 'CNDT (débitos trabalhistas)', 'Tribunal Superior do Trabalho', 15),
  (gen_random_uuid()::text, 'CRF do FGTS', 'Caixa Econômica Federal', 5)
ON CONFLICT ("nome") DO NOTHING;
