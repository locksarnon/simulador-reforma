-- =============================================================================
-- Correções de dados da auditoria da Reforma (29/10/2026)
-- Relatório: docs/auditoria-reforma-2026-10-28.md
--
--  1) TransicaoAno 2026: informativo (efeito financeiro 0)                  LC 214, art. 348; ADCT, art. 125
--  2) TransicaoAno 2027 e 2028: CBS efetiva 11,2% (TCU 11,3% - 0,1 p.p.)   LC 214, arts. 347 e 349
--  3) ClassTrib: 44 percentuais corrigidos e 9 classes novas (tabela oficial v1.70, de 01/10/2026).
--     Convenção do InTAX mantida: CST 400 e 410 (isenção e imunidade) gravados com 100% (tributo zero).
--  Também: texto da fonte de 2029 a 2033 (os valores NÃO mudam) e Configuracao.data_base_normativa = 28/10/2026.
--
-- Roda numa transação e ABORTA SEM GRAVAR NADA se o estado atual não for o esperado (164 classes,
-- 2026 com efeito financeiro 1, CBS de 2027 e 2028 em 9,21%) ou se, ao final, o catálogo não ficar
-- igual à tabela oficial. Depois de aplicado, uma segunda execução aborta na trava.
--
-- ANTES: backup das três tabelas (dentro do container reforma-postgres):
--   pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t '"TransicaoAno"' -t '"ClassTrib"' -t '"Configuracao"' --clean --if-exists > /tmp/pre-aplica.sql
-- RODAR no PowerShell (de qualquer pasta; lê o arquivo que está no servidor, depois do git pull). O "<" precisa ficar
-- DENTRO das aspas, porque o PowerShell 5.1 não aceita redirecionamento de entrada:
--   ssh -i "$HOME/.ssh/fal_hostinger" -o IdentitiesOnly=yes root@148.230.78.251 'cd /var/www/html/simulador-reforma && docker exec -i reforma-postgres sh -c ''psql -U $POSTGRES_USER -d $POSTGRES_DB -v ON_ERROR_STOP=1'' < backend/scripts/sql/2026-10-29-reforma-parametros-e-classes.sql'
-- RODAR no Git Bash (na raiz do projeto):
--   ssh -i ~/.ssh/fal_hostinger -o IdentitiesOnly=yes root@148.230.78.251 'docker exec -i reforma-postgres sh -c "psql -U \$POSTGRES_USER -d \$POSTGRES_DB -v ON_ERROR_STOP=1"' < backend/scripts/sql/2026-10-29-reforma-parametros-e-classes.sql
-- STATUS: aplicado em produção e no banco local em 29/10/2026 (transação confirmada; conferência: 173 classes, 0 ausentes, 0 divergentes).
-- CONFERIR (somente leitura): 2026-10-29-reforma-parametros-e-classes-verificar.sql, com PGOPTIONS="-c default_transaction_read_only=on".
-- REVERTER: restaurar o dump feito antes (psql < dump).
-- =============================================================================

\set ON_ERROR_STOP on
BEGIN;

-- 0) TRAVAS: se o estado atual não for o esperado, aborta tudo (nada é gravado)
DO $trava$
DECLARE r record; n int; ruim text := '';
BEGIN
  -- TransicaoAno: 8 anos, 2026 com efeito 1 e CBS de 2027/2028 em 9,21%
  SELECT count(*) INTO n FROM "TransicaoAno"; IF n <> 8 THEN ruim := ruim || ' TransicaoAno_linhas=' || n; END IF;
  SELECT count(*) INTO n FROM "TransicaoAno" WHERE ano = 2026 AND efeito_financeiro = 1 AND abs(cbs_efetiva - 0.009) < 1e-9; IF n <> 1 THEN ruim := ruim || ' ano2026'; END IF;
  SELECT count(*) INTO n FROM "TransicaoAno" WHERE ano IN (2027, 2028) AND abs(cbs_efetiva - 0.0921) < 1e-9; IF n <> 2 THEN ruim := ruim || ' cbs2027_2028'; END IF;
  SELECT count(*) INTO n FROM "Configuracao"; IF n <> 1 THEN ruim := ruim || ' Configuracao_linhas=' || n; END IF;
  -- ClassTrib: 164 classes e as 44 a corrigir com o valor antigo esperado
  SELECT count(*) INTO n FROM "ClassTrib"; IF n <> 164 THEN ruim := ruim || ' ClassTrib_linhas=' || n; END IF;
  FOR r IN SELECT * FROM (VALUES
    ('011001', 0::float8, 0::float8),
    ('011002', 0::float8, 0::float8),
    ('011003', 0::float8, 0::float8),
    ('011005', 0::float8, 0::float8),
    ('200001', 0::float8, 0::float8),
    ('200002', 0::float8, 0::float8),
    ('200006', 0::float8, 0::float8),
    ('200009', 0::float8, 0::float8),
    ('200010', 0::float8, 0::float8),
    ('200012', 0::float8, 0::float8),
    ('200013', 0::float8, 0::float8),
    ('200015', 0::float8, 0::float8),
    ('200048', 0::float8, 0::float8),
    ('200016', 0::float8, 0::float8),
    ('200017', 0::float8, 0::float8),
    ('200018', 0::float8, 0::float8),
    ('200019', 0::float8, 0::float8),
    ('200020', 0::float8, 0::float8),
    ('200021', 0::float8, 0::float8),
    ('200022', 0::float8, 0::float8),
    ('200023', 0::float8, 0::float8),
    ('200024', 0::float8, 0::float8),
    ('200025', 0::float8, 0::float8),
    ('200026', 0::float8, 0::float8),
    ('200027', 0::float8, 0::float8),
    ('200032', 0::float8, 0::float8),
    ('200036', 0::float8, 0::float8),
    ('200037', 0::float8, 0::float8),
    ('200040', 0::float8, 0::float8),
    ('200041', 0::float8, 0::float8),
    ('200042', 0::float8, 0::float8),
    ('200045', 0::float8, 0::float8),
    ('200046', 0::float8, 0::float8),
    ('200047', 0::float8, 0::float8),
    ('200049', 0::float8, 0::float8),
    ('200050', 0::float8, 0::float8),
    ('200051', 0::float8, 0::float8),
    ('200052', 0::float8, 0::float8),
    ('200053', 0::float8, 0::float8),
    ('200054', 0::float8, 0::float8),
    ('515001', 0::float8, 0::float8),
    ('200005', 0.6::float8, 0.6::float8),
    ('200008', 0.6::float8, 0.6::float8),
    ('200011', 0.6::float8, 0.6::float8)
  ) AS t(cod, ibs, cbs) LOOP
    SELECT count(*) INTO n FROM "ClassTrib" WHERE c_class_trib = r.cod AND abs(pct_reducao_ibs - r.ibs) < 1e-9 AND abs(pct_reducao_cbs - r.cbs) < 1e-9;
    IF n <> 1 THEN ruim := ruim || ' ' || r.cod; END IF;
  END LOOP;
  SELECT count(*) INTO n FROM "ClassTrib" WHERE c_class_trib IN ('000006', '200055', '200056', '400003', '400004', '550026', '550027', '550028', '550029'); IF n <> 0 THEN ruim := ruim || ' novas_ja_existem=' || n; END IF;
  IF ruim <> '' THEN RAISE EXCEPTION 'TRAVA: estado atual diferente do esperado:%', ruim; END IF;
END
$trava$;

-- 1) 2026: ano de teste, informativo (LC 214, art. 348; ADCT, art. 125)
UPDATE "TransicaoAno" SET efeito_financeiro = 0, carater = 'Informativo',
  fonte = 'LC 214/2025, arts. 343, 346 e 348; CF, ADCT, art. 125. IBS 0,1% e CBS 0,9% de teste, compensados com PIS/Cofins; recolhimento dispensado para quem cumpre as obrigações acessórias.',
  observacao = 'Ano de teste: sem efeito financeiro para quem cumpre as obrigações acessórias (art. 348, §1º; ADCT, art. 125, §4º). O valor é compensado com PIS/Cofins (art. 348, I) ou dispensado, e PIS/Cofins continuam integrais (art. 348, §2º). Não se aplica a optantes do Simples Nacional (art. 348, III, "c"). Ajustado em 29/10/2026: antes constava efeito financeiro 1, o que somava IBS/CBS ao PIS/Cofins integral.',
  "updatedAt" = now()
WHERE ano = 2026;

-- 2) CBS 2027 e 2028: referência do TCU (11,3%) menos 0,1 p.p. = 11,2% (LC 214, arts. 347 e 349)
UPDATE "TransicaoAno" SET cbs_efetiva = 0.112, carater = 'Estimativa', status = 'Estimativa',
  fonte = 'LC 214/2025, arts. 344, 347 e 349 (§14); TCU, cálculo da alíquota de referência da CBS de 2027 aprovado em 28/10/2026 (11,3468%, arredondada para 11,3%), pendente de resolução do Senado. IBS 0,05% UF + 0,05% município; CBS efetiva = referência menos 0,1 p.p.',
  observacao = 'PIS/Cofins extintos e IPI zerado por lei a partir de 1º/1/2027 (exceção da Zona Franca de Manaus não modelada aqui). CBS de 11,2% é ESTIMATIVA: referência do TCU (11,3%) menos 0,1 p.p. (art. 347); se o Senado não fixar a alíquota até 22/12/2026, valem as calculadas pelo TCU (art. 349, §2º). Até 29/10/2026 a tabela usava 9,21%, valor implícito da estimativa do CGIBS (Resolução CGIBS nº 14/2026), que não é alíquota de referência.',
  "updatedAt" = now()
WHERE ano = 2027;
UPDATE "TransicaoAno" SET cbs_efetiva = 0.112, carater = 'Estimativa', status = 'Estimativa',
  fonte = 'LC 214/2025, arts. 344, 347 e 349; TCU (28/10/2026): referência da CBS de 2027 de 11,3%, repetida aqui para 2028 até haver referência própria. IBS 0,05% UF + 0,05% município; CBS efetiva = referência menos 0,1 p.p.',
  observacao = 'Sem mudança relevante em relação a 2027: IBS segue em 0,1% de teste (lei) e a redução efetiva de ICMS/ISS só começa em 2029. A CBS repete a estimativa de 2027 (11,3% de referência do TCU menos 0,1 p.p.); a referência de 2028 será fixada pelo Senado em 2027 (art. 349, §1º).',
  "updatedAt" = now()
WHERE ano = 2028;

-- 3) 2029 a 2033: valores NÃO mudam; só a atribuição da fonte é corrigida (a Resolução CGIBS 14 não fixa CBS)
UPDATE "TransicaoAno" SET fonte = 'LC 214/2025 e CF, ADCT, arts. 128 e 129 (calendário legal: ICMS/ISS a 9/10, 8/10, 7/10 e 6/10 entre 2029 e 2032 e extinção em 2033) | Estimativa do Comitê Gestor do IBS na Resolução CGIBS nº 14, de 29/07/2026 (premissa metodológica: 18,7% de IBS e 27,91% de alíquota total; a resolução não fixa CBS, o 9,21% é a diferença). Não é alíquota de referência: as de 2029 a 2033 serão fixadas pelo Senado no ano anterior (LC 214, art. 349).',
  observacao = observacao || ' CBS mantida em 9,21% (estimativa derivada do CGIBS), sem referência oficial e abaixo da CBS de 2027 (11,3% do TCU): a escolha do cenário de alíquotas para 2029–2033 está pendente.',
  "updatedAt" = now()
WHERE ano BETWEEN 2029 AND 2033;

-- 4) Data-base normativa: tabelas e premissas revistas até 28/10/2026
UPDATE "Configuracao" SET data_base_normativa = timestamp '2026-10-28', "updatedAt" = now();

-- 5) ClassTrib: percentuais oficiais nas 44 classes com redução errada (v1.70, 01/10/2026)
UPDATE "ClassTrib" c SET pct_reducao_ibs = v.ibs, pct_reducao_cbs = v.cbs,
  observacao = 'Percentual corrigido em 29/10/2026 conforme a tabela oficial cClassTrib (Informe Técnico 2025.002 v1.70, Portal da Conformidade Fácil): IBS ' || v.oi || '% / CBS ' || v.oc || '% (antes: IBS ' || v.si || '% / CBS ' || v.sc || '%).',
  "updatedAt" = now()
FROM (VALUES
  ('011001', 0.6::float8, 0.6::float8, '60', '60', '0', '0'),
  ('011002', 0.6::float8, 0.6::float8, '60', '60', '0', '0'),
  ('011003', 0.6::float8, 0.6::float8, '60', '60', '0', '0'),
  ('011005', 0.3::float8, 0.3::float8, '30', '30', '0', '0'),
  ('200001', 1::float8, 1::float8, '100', '100', '0', '0'),
  ('200002', 1::float8, 1::float8, '100', '100', '0', '0'),
  ('200006', 1::float8, 1::float8, '100', '100', '0', '0'),
  ('200009', 1::float8, 1::float8, '100', '100', '0', '0'),
  ('200010', 1::float8, 1::float8, '100', '100', '0', '0'),
  ('200012', 1::float8, 1::float8, '100', '100', '0', '0'),
  ('200013', 1::float8, 1::float8, '100', '100', '0', '0'),
  ('200015', 1::float8, 1::float8, '100', '100', '0', '0'),
  ('200048', 0.4::float8, 0.4::float8, '40', '40', '0', '0'),
  ('200016', 1::float8, 1::float8, '100', '100', '0', '0'),
  ('200017', 1::float8, 1::float8, '100', '100', '0', '0'),
  ('200018', 1::float8, 1::float8, '100', '100', '0', '0'),
  ('200019', 1::float8, 1::float8, '100', '100', '0', '0'),
  ('200020', 1::float8, 1::float8, '100', '100', '0', '0'),
  ('200021', 1::float8, 1::float8, '100', '100', '0', '0'),
  ('200022', 1::float8, 1::float8, '100', '100', '0', '0'),
  ('200023', 1::float8, 1::float8, '100', '100', '0', '0'),
  ('200024', 1::float8, 1::float8, '100', '100', '0', '0'),
  ('200025', 0.6::float8, 1::float8, '60', '100', '0', '0'),
  ('200026', 0.8::float8, 0.8::float8, '80', '80', '0', '0'),
  ('200027', 0.7::float8, 0.7::float8, '70', '70', '0', '0'),
  ('200032', 0.6::float8, 0.6::float8, '60', '60', '0', '0'),
  ('200036', 0.6::float8, 0.6::float8, '60', '60', '0', '0'),
  ('200037', 0.6::float8, 0.6::float8, '60', '60', '0', '0'),
  ('200040', 0.6::float8, 0.6::float8, '60', '60', '0', '0'),
  ('200041', 0.6::float8, 0.6::float8, '60', '60', '0', '0'),
  ('200042', 0.6::float8, 0.6::float8, '60', '60', '0', '0'),
  ('200045', 0.6::float8, 0.6::float8, '60', '60', '0', '0'),
  ('200046', 0.5::float8, 0.5::float8, '50', '50', '0', '0'),
  ('200047', 0.4::float8, 0.4::float8, '40', '40', '0', '0'),
  ('200049', 0.4::float8, 0.4::float8, '40', '40', '0', '0'),
  ('200050', 0.4::float8, 0.4::float8, '40', '40', '0', '0'),
  ('200051', 0.4::float8, 0.4::float8, '40', '40', '0', '0'),
  ('200052', 0.3::float8, 0.3::float8, '30', '30', '0', '0'),
  ('200053', 1::float8, 1::float8, '100', '100', '0', '0'),
  ('200054', 1::float8, 1::float8, '100', '100', '0', '0'),
  ('515001', 0.6::float8, 0.6::float8, '60', '60', '0', '0'),
  ('200005', 1::float8, 1::float8, '100', '100', '60', '60'),
  ('200008', 1::float8, 1::float8, '100', '100', '60', '60'),
  ('200011', 1::float8, 1::float8, '100', '100', '60', '60')
) AS v(cod, ibs, cbs, oi, oc, si, sc)
WHERE c.c_class_trib = v.cod;

-- 6) ClassTrib: 9 classes novas da tabela oficial (convenção do InTAX: CST 400 e 410 com 100%)
INSERT INTO "ClassTrib" (id, c_class_trib, cst, descricao_oficial, pct_reducao_ibs, pct_reducao_cbs, fonte, publicacao, status, observacao, "updatedAt")
SELECT 'c' || substr(md5(random()::text || clock_timestamp()::text || v.cod), 1, 24), v.cod, v.cst, v.descricao, v.ibs, v.cbs,
  'Informe Técnico RT 2025.002 v1.70 — Tabela cClassTrib (Receita Federal / Comitê Gestor do IBS)', timestamp '2026-10-01', 'Ativo', v.obs, now()
FROM (VALUES
  ('000006', '000', 'Situações tributadas integralmente pelo IBS e CBS realizadas por autônomo', 0::float8, 0::float8, 'Classe incluída em 29/10/2026 conforme a tabela oficial cClassTrib (Informe Técnico 2025.002 v1.70, 01/10/2026).'),
  ('200055', '200', 'Fornecimento dos serviços com redução de alíquota de 60% realizado por autônomo, observado o art. 128 da Lei Complementar nº 214, de 2025.', 0.6::float8, 0.6::float8, 'Classe incluída em 29/10/2026 conforme a tabela oficial cClassTrib (Informe Técnico 2025.002 v1.70, 01/10/2026).'),
  ('200056', '200', 'Fornecimento dos serviços com redução de alíquota de 30% realizado por autônomo, observado o art. 127 da Lei Complementar nº 214, de 2025.', 0.3::float8, 0.3::float8, 'Classe incluída em 29/10/2026 conforme a tabela oficial cClassTrib (Informe Técnico 2025.002 v1.70, 01/10/2026).'),
  ('400003', '400', 'Bagagens de viajantes e de tripulantes, acompanhadas ou desacompanhadas, observado o art. 94 da Lei Complementar nº 214, de 2025.', 1::float8, 1::float8, 'Classe incluída em 29/10/2026 conforme a tabela oficial cClassTrib (Informe Técnico 2025.002 v1.70, 01/10/2026). Redução gravada em 100% por convenção do InTAX (tributo zero); a tabela oficial indica redução 0% e tributo não exigido.'),
  ('400004', '400', 'Remessas internacionais, observado o art. 94 da Lei Complementar nº 214, de 2025.', 1::float8, 1::float8, 'Classe incluída em 29/10/2026 conforme a tabela oficial cClassTrib (Informe Técnico 2025.002 v1.70, 01/10/2026). Redução gravada em 100% por convenção do InTAX (tributo zero); a tabela oficial indica redução 0% e tributo não exigido.'),
  ('550026', '550', 'Regimes de admissão temporária com suspensão total do pagamento dos tributos durante o período de sua permanência na Zona Franca de Manaus, observado o art. 89 da Lei Complementar nº 214, de 2025.', 0::float8, 0::float8, 'Classe incluída em 29/10/2026 conforme a tabela oficial cClassTrib (Informe Técnico 2025.002 v1.70, 01/10/2026).'),
  ('550027', '550', 'Regimes de Aperfeiçoamento (Drawback), observado o art. 90 da Lei Complementar nº 214, de 2025.', 0::float8, 0::float8, 'Classe incluída em 29/10/2026 conforme a tabela oficial cClassTrib (Informe Técnico 2025.002 v1.70, 01/10/2026).'),
  ('550028', '550', 'Regimes de Aperfeiçoamento (Admissão temporária), observado o art. 90 da Lei Complementar nº 214, de 2025.', 0::float8, 0::float8, 'Classe incluída em 29/10/2026 conforme a tabela oficial cClassTrib (Informe Técnico 2025.002 v1.70, 01/10/2026).'),
  ('550029', '550', 'Zona de Processamento de Exportação, observado os art. 102 da Lei Complementar nº 214, de 2025.', 0::float8, 0::float8, 'Classe incluída em 29/10/2026 conforme a tabela oficial cClassTrib (Informe Técnico 2025.002 v1.70, 01/10/2026).')
) AS v(cod, cst, descricao, ibs, cbs, obs)
WHERE NOT EXISTS (SELECT 1 FROM "ClassTrib" c WHERE c.c_class_trib = v.cod);

-- 7) ClassTrib: 3 classes que não constam como vigentes na tabela oficial (não inativa; só avisa)
UPDATE "ClassTrib" SET observacao = coalesce(observacao || ' ', '') || 'Não consta como vigente na tabela oficial de 28/10/2026 (Informe Técnico 2025.002 v1.70); conferir antes de inativar.', "updatedAt" = now()
WHERE c_class_trib IN ('220001', '220002', '220003');

-- 8) CONFERÊNCIA DENTRO DA TRANSAÇÃO: se algo não bater, nada é gravado
DO $confere$
DECLARE n int; ruim text := '';
BEGIN
  SELECT count(*) INTO n FROM "TransicaoAno" WHERE (ano = 2026 AND efeito_financeiro = 0 AND carater = 'Informativo') OR (ano IN (2027, 2028) AND abs(cbs_efetiva - 0.112) < 1e-9) OR (ano BETWEEN 2029 AND 2033 AND abs(cbs_efetiva - 0.0921) < 1e-9);
  IF n <> 8 THEN ruim := ruim || ' transicao=' || n; END IF;
  SELECT count(*) INTO n FROM "ClassTrib"; IF n <> 173 THEN ruim := ruim || ' classes=' || n; END IF;
  WITH oficial(cod, cst, ibs, cbs) AS (VALUES
    ('000001', '000', 0::float8, 0::float8),
    ('000002', '000', 0::float8, 0::float8),
    ('000003', '000', 0::float8, 0::float8),
    ('000004', '000', 0::float8, 0::float8),
    ('000005', '000', 0::float8, 0::float8),
    ('000006', '000', 0::float8, 0::float8),
    ('010001', '010', 0::float8, 0::float8),
    ('010002', '010', 0::float8, 0::float8),
    ('011001', '011', 60::float8, 60::float8),
    ('011002', '011', 60::float8, 60::float8),
    ('011003', '011', 60::float8, 60::float8),
    ('011004', '011', 0::float8, 0::float8),
    ('011005', '011', 30::float8, 30::float8),
    ('200001', '200', 100::float8, 100::float8),
    ('200002', '200', 100::float8, 100::float8),
    ('200003', '200', 100::float8, 100::float8),
    ('200004', '200', 100::float8, 100::float8),
    ('200005', '200', 100::float8, 100::float8),
    ('200006', '200', 100::float8, 100::float8),
    ('200007', '200', 100::float8, 100::float8),
    ('200008', '200', 100::float8, 100::float8),
    ('200009', '200', 100::float8, 100::float8),
    ('200010', '200', 100::float8, 100::float8),
    ('200011', '200', 100::float8, 100::float8),
    ('200012', '200', 100::float8, 100::float8),
    ('200013', '200', 100::float8, 100::float8),
    ('200014', '200', 100::float8, 100::float8),
    ('200015', '200', 100::float8, 100::float8),
    ('200016', '200', 100::float8, 100::float8),
    ('200017', '200', 100::float8, 100::float8),
    ('200018', '200', 100::float8, 100::float8),
    ('200019', '200', 100::float8, 100::float8),
    ('200020', '200', 100::float8, 100::float8),
    ('200021', '200', 100::float8, 100::float8),
    ('200022', '200', 100::float8, 100::float8),
    ('200023', '200', 100::float8, 100::float8),
    ('200024', '200', 100::float8, 100::float8),
    ('200025', '200', 60::float8, 100::float8),
    ('200026', '200', 80::float8, 80::float8),
    ('200027', '200', 70::float8, 70::float8),
    ('200028', '200', 60::float8, 60::float8),
    ('200029', '200', 60::float8, 60::float8),
    ('200030', '200', 60::float8, 60::float8),
    ('200031', '200', 60::float8, 60::float8),
    ('200032', '200', 60::float8, 60::float8),
    ('200033', '200', 60::float8, 60::float8),
    ('200034', '200', 60::float8, 60::float8),
    ('200035', '200', 60::float8, 60::float8),
    ('200036', '200', 60::float8, 60::float8),
    ('200037', '200', 60::float8, 60::float8),
    ('200038', '200', 60::float8, 60::float8),
    ('200039', '200', 60::float8, 60::float8),
    ('200040', '200', 60::float8, 60::float8),
    ('200041', '200', 60::float8, 60::float8),
    ('200042', '200', 60::float8, 60::float8),
    ('200043', '200', 60::float8, 60::float8),
    ('200044', '200', 60::float8, 60::float8),
    ('200045', '200', 60::float8, 60::float8),
    ('200046', '200', 50::float8, 50::float8),
    ('200047', '200', 40::float8, 40::float8),
    ('200048', '200', 40::float8, 40::float8),
    ('200049', '200', 40::float8, 40::float8),
    ('200050', '200', 40::float8, 40::float8),
    ('200051', '200', 40::float8, 40::float8),
    ('200052', '200', 30::float8, 30::float8),
    ('200053', '200', 100::float8, 100::float8),
    ('200054', '200', 100::float8, 100::float8),
    ('200055', '200', 60::float8, 60::float8),
    ('200056', '200', 30::float8, 30::float8),
    ('221001', '221', 0::float8, 0::float8),
    ('221002', '221', 0::float8, 0::float8),
    ('221003', '221', 0::float8, 0::float8),
    ('221004', '221', 0::float8, 0::float8),
    ('222001', '222', 0::float8, 0::float8),
    ('400001', '400', 0::float8, 0::float8),
    ('400002', '400', 0::float8, 0::float8),
    ('400003', '400', 0::float8, 0::float8),
    ('400004', '400', 0::float8, 0::float8),
    ('410001', '410', 0::float8, 0::float8),
    ('410002', '410', 0::float8, 0::float8),
    ('410003', '410', 0::float8, 0::float8),
    ('410004', '410', 0::float8, 0::float8),
    ('410005', '410', 0::float8, 0::float8),
    ('410006', '410', 0::float8, 0::float8),
    ('410007', '410', 0::float8, 0::float8),
    ('410008', '410', 0::float8, 0::float8),
    ('410009', '410', 0::float8, 0::float8),
    ('410010', '410', 0::float8, 0::float8),
    ('410011', '410', 0::float8, 0::float8),
    ('410012', '410', 0::float8, 0::float8),
    ('410013', '410', 0::float8, 0::float8),
    ('410014', '410', 0::float8, 0::float8),
    ('410015', '410', 0::float8, 0::float8),
    ('410016', '410', 0::float8, 0::float8),
    ('410017', '410', 0::float8, 0::float8),
    ('410018', '410', 0::float8, 0::float8),
    ('410019', '410', 0::float8, 0::float8),
    ('410020', '410', 0::float8, 0::float8),
    ('410021', '410', 0::float8, 0::float8),
    ('410022', '410', 0::float8, 0::float8),
    ('410023', '410', 0::float8, 0::float8),
    ('410024', '410', 0::float8, 0::float8),
    ('410025', '410', 0::float8, 0::float8),
    ('410026', '410', 0::float8, 0::float8),
    ('410027', '410', 0::float8, 0::float8),
    ('410028', '410', 0::float8, 0::float8),
    ('410029', '410', 0::float8, 0::float8),
    ('410030', '410', 0::float8, 0::float8),
    ('410031', '410', 0::float8, 0::float8),
    ('410032', '410', 0::float8, 0::float8),
    ('410033', '410', 0::float8, 0::float8),
    ('410034', '410', 0::float8, 0::float8),
    ('410035', '410', 0::float8, 0::float8),
    ('410036', '410', 0::float8, 0::float8),
    ('410037', '410', 0::float8, 0::float8),
    ('410999', '410', 0::float8, 0::float8),
    ('510001', '510', 0::float8, 0::float8),
    ('515001', '515', 60::float8, 60::float8),
    ('550001', '550', 0::float8, 0::float8),
    ('550002', '550', 0::float8, 0::float8),
    ('550003', '550', 0::float8, 0::float8),
    ('550004', '550', 0::float8, 0::float8),
    ('550005', '550', 0::float8, 0::float8),
    ('550006', '550', 0::float8, 0::float8),
    ('550007', '550', 0::float8, 0::float8),
    ('550008', '550', 0::float8, 0::float8),
    ('550009', '550', 0::float8, 0::float8),
    ('550010', '550', 0::float8, 0::float8),
    ('550011', '550', 0::float8, 0::float8),
    ('550012', '550', 0::float8, 0::float8),
    ('550013', '550', 0::float8, 0::float8),
    ('550014', '550', 0::float8, 0::float8),
    ('550015', '550', 0::float8, 0::float8),
    ('550016', '550', 0::float8, 0::float8),
    ('550017', '550', 0::float8, 0::float8),
    ('550018', '550', 0::float8, 0::float8),
    ('550019', '550', 0::float8, 0::float8),
    ('550020', '550', 0::float8, 0::float8),
    ('550021', '550', 0::float8, 0::float8),
    ('550022', '550', 0::float8, 0::float8),
    ('550023', '550', 0::float8, 0::float8),
    ('550024', '550', 0::float8, 0::float8),
    ('550025', '550', 0::float8, 0::float8),
    ('550026', '550', 0::float8, 0::float8),
    ('550027', '550', 0::float8, 0::float8),
    ('550028', '550', 0::float8, 0::float8),
    ('550029', '550', 0::float8, 0::float8),
    ('620001', '620', 0::float8, 0::float8),
    ('620002', '620', 0::float8, 0::float8),
    ('620003', '620', 0::float8, 0::float8),
    ('620004', '620', 0::float8, 0::float8),
    ('620005', '620', 0::float8, 0::float8),
    ('620006', '620', 0::float8, 0::float8),
    ('620007', '620', 0::float8, 0::float8),
    ('800001', '800', 0::float8, 0::float8),
    ('800002', '800', 0::float8, 0::float8),
    ('810001', '810', 0::float8, 0::float8),
    ('811001', '811', 0::float8, 0::float8),
    ('811002', '811', 0::float8, 0::float8),
    ('811003', '811', 0::float8, 0::float8),
    ('820001', '820', 0::float8, 0::float8),
    ('820002', '820', 0::float8, 0::float8),
    ('820003', '820', 0::float8, 0::float8),
    ('820004', '820', 0::float8, 0::float8),
    ('820005', '820', 0::float8, 0::float8),
    ('820006', '820', 0::float8, 0::float8),
    ('820007', '820', 0::float8, 0::float8),
    ('820008', '820', 0::float8, 0::float8),
    ('820009', '820', 0::float8, 0::float8),
    ('830001', '830', 0::float8, 0::float8)
  ), esperado AS (SELECT cod, CASE WHEN cst IN ('400', '410') THEN 1 ELSE ibs / 100 END ibs, CASE WHEN cst IN ('400', '410') THEN 1 ELSE cbs / 100 END cbs FROM oficial)
  SELECT count(*) INTO n FROM esperado e WHERE NOT EXISTS (SELECT 1 FROM "ClassTrib" c WHERE c.c_class_trib = e.cod AND abs(c.pct_reducao_ibs - e.ibs) < 1e-9 AND abs(c.pct_reducao_cbs - e.cbs) < 1e-9);
  IF n <> 0 THEN ruim := ruim || ' classes_divergentes_do_oficial=' || n; END IF;
  IF ruim <> '' THEN RAISE EXCEPTION 'CONFERENCIA FALHOU:%', ruim; END IF;
END
$confere$;

COMMIT;
\echo 'APLICADO: transacao confirmada.'
