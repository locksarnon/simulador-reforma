-- Itens dos Anexos IX e VII da LC 214/2025 que a lei especifica por CAPÍTULO inteiro (ex.: IX, item 2 = "Capítulo 31").
-- Entram como REFERÊNCIA (c_class_trib NULL): o validador passa a dizer "NCM em capítulo citado no Anexo X, item N — revisar
-- requisitos", em vez de afirmar tributação padrão. NÃO sugerem classe (o enquadramento depende de "definições e demais
-- requisitos da legislação específica" e de ressalvas do texto). Idempotente. Texto conferido na Base legal (27/09/2026).
INSERT INTO "CorrelacaoNcm" ("id", "anexo", "item_lei", "ncm", "descricao_produto", "c_class_trib", "fonte", "updatedAt")
SELECT gen_random_uuid()::text, v.anexo, v.item, v.ncm, v.descr, NULL,
       'LC 214/2025 — referência por capítulo (sem classe sugerida: depende de requisitos e ressalvas do texto da lei)', now()
FROM (VALUES
  ('IX', 2, '31', 'Fertilizantes (adubos), em conformidade com as definições e demais requisitos da legislação específica — Capítulo 31'),
  ('IX', 3, '25', 'Corretivos de solo (inclusive condicionadores), remineralizadores e substratos para plantas; em conformidade com as definições e demais requisitos da legislação específica — Capítulo 25'),
  ('IX', 10, '07', 'Sementes (genética, básica, nativa, certificadas C1/C2, não certificadas S1/S2, crioulas); em conformidade com a legislação específica — Capítulos 7, 10 e 12'),
  ('IX', 10, '10', 'Sementes (genética, básica, nativa, certificadas C1/C2, não certificadas S1/S2, crioulas); em conformidade com a legislação específica — Capítulos 7, 10 e 12'),
  ('IX', 10, '12', 'Sementes (genética, básica, nativa, certificadas C1/C2, não certificadas S1/S2, crioulas); em conformidade com a legislação específica — Capítulos 7, 10 e 12'),
  ('IX', 19, '10', 'Sementes e cereais destinados diretamente à fabricação de ração ou à alimentação animal, exceto de animais domésticos — Capítulos 10, 11 e 12'),
  ('IX', 19, '11', 'Sementes e cereais destinados diretamente à fabricação de ração ou à alimentação animal, exceto de animais domésticos — Capítulos 10, 11 e 12'),
  ('IX', 19, '12', 'Sementes e cereais destinados diretamente à fabricação de ração ou à alimentação animal, exceto de animais domésticos — Capítulos 10, 11 e 12'),
  ('VII', 14, '07', 'Frutas, produtos hortícolas e demais produtos vegetais sem adição de açúcar ou outros edulcorantes — capítulos 7 e 8, com ressalvas (Anexos I e XV; exceto posições 07.11, 08.12 e 0814.00.00)'),
  ('VII', 14, '08', 'Frutas, produtos hortícolas e demais produtos vegetais sem adição de açúcar ou outros edulcorantes — capítulos 7 e 8, com ressalvas (Anexos I e XV; exceto posições 07.11, 08.12 e 0814.00.00)'),
  ('VII', 15, '10', 'Cereais do capítulo 10 e sementes e frutos oleaginosos do capítulo 12, ressalvados os produtos do Anexo I'),
  ('VII', 15, '12', 'Cereais do capítulo 10 e sementes e frutos oleaginosos do capítulo 12, ressalvados os produtos do Anexo I')
) AS v(anexo, item, ncm, descr)
WHERE NOT EXISTS (SELECT 1 FROM "CorrelacaoNcm" c WHERE c.anexo = v.anexo AND c.item_lei = v.item AND c.ncm = v.ncm);
