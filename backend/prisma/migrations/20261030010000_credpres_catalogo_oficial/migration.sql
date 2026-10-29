-- Catálogo oficial de crédito presumido (cCredPres): os quatro códigos da tabela do Portal da Conformidade Fácil
-- (SVRS/RFB), conferida em 29/10/2026, gravados com dois dígitos (01 a 04), como no XML do DF-e (a tabela mostra 1 a 4). Só acrescenta as linhas que ainda não existem e corrige o método de cálculo do
-- código antigo do produtor rural; nenhuma outra linha é alterada. Pode rodar mais de uma vez sem duplicar.
--
-- Método de cálculo: Decreto nº 12.955/2026, arts. 247 (produtor rural) e 253 (transportador autônomo): CP = VO×C/(1+C),
-- isto é, "por fora". Com IBS e CBS juntos há um só valor líquido (LC 214, arts. 168, §§1º a 3º, e 169, §§2º e 3º), e o
-- divisor leva a soma dos percentuais. Resíduos (LC 214, art. 170, §2º) e bem móvel usado (art. 171, §1º) têm o
-- percentual fixado em lei sobre o valor da aquisição ("direto").

INSERT INTO "CredPres" ("id", "c_cred_pres", "descricao_oficial", "apropria_dfe", "apropria_evento", "deduz_credito_presumido",
                        "ibs_aplicavel", "inicio_ibs", "cbs_aplicavel", "inicio_cbs", "percentual_oficial", "metodo_calculo",
                        "base_legal_metodo", "fonte", "status", "observacao", "createdAt", "updatedAt")
SELECT 'credpres_oficial_01', '01',
       'Crédito presumido da aquisição de bens e serviços de produtor rural e produtor rural integrado não contribuinte, observado o art. 168 da Lei Complementar nº 214, de 2025.',
       'Não', 'Sim', 'Não', 'Sim', TIMESTAMP '2027-01-01 00:00:00', 'Sim', TIMESTAMP '2027-01-01 00:00:00',
       'Pendente de regulamentação (ato conjunto do Ministro da Fazenda e do CGIBS, até setembro de cada ano; LC 214, art. 168, §4º)',
       'Por Fora', 'Decreto nº 12.955/2026, art. 247: CP = VO×C/(1+C)',
       'Portal da Conformidade Fácil (SVRS/RFB), Tabela Crédito Presumido, conferida em 29/10/2026', 'Ativo',
       'Admite o ressarcimento (LC 214, art. 168, §8º). Informe na operação o percentual do ato conjunto; sem ele, o crédito presumido não é calculado (com o percentual informado, o resultado fica como estimativa).',
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "CredPres" WHERE "c_cred_pres" = '01');

INSERT INTO "CredPres" ("id", "c_cred_pres", "descricao_oficial", "apropria_dfe", "apropria_evento", "deduz_credito_presumido",
                        "ibs_aplicavel", "inicio_ibs", "cbs_aplicavel", "inicio_cbs", "percentual_oficial", "metodo_calculo",
                        "base_legal_metodo", "fonte", "status", "observacao", "createdAt", "updatedAt")
SELECT 'credpres_oficial_02', '02',
       'Crédito presumido da aquisição de serviço de transportador autônomo de carga pessoa física não contribuinte, observado o art. 169 da Lei Complementar nº 214, de 2025.',
       'Não', 'Sim', 'Não', 'Sim', TIMESTAMP '2027-01-01 00:00:00', 'Sim', TIMESTAMP '2027-01-01 00:00:00',
       'Pendente de regulamentação (ato conjunto do Ministro da Fazenda e do CGIBS, até setembro de cada ano; LC 214, art. 169, §4º)',
       'Por Fora', 'Decreto nº 12.955/2026, art. 253: CP = VO×C/(1+C)',
       'Portal da Conformidade Fácil (SVRS/RFB), Tabela Crédito Presumido, conferida em 29/10/2026', 'Ativo',
       'Só compensa o tributo devido; vedado o ressarcimento (LC 214, art. 169, §7º; Decreto 12.955, art. 254). Vale só para o contratante que suporta a cobrança do frete (art. 169, §1º). Apropria à medida que os pagamentos ao autônomo são confirmados (Decreto, art. 250, §2º, II). Informe o percentual do ato conjunto quando houver.',
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "CredPres" WHERE "c_cred_pres" = '02');

INSERT INTO "CredPres" ("id", "c_cred_pres", "descricao_oficial", "apropria_dfe", "apropria_evento", "deduz_credito_presumido",
                        "ibs_aplicavel", "inicio_ibs", "cbs_aplicavel", "inicio_cbs", "percentual_oficial", "metodo_calculo",
                        "base_legal_metodo", "fonte", "status", "observacao", "createdAt", "updatedAt")
SELECT 'credpres_oficial_03', '03',
       'Crédito presumido da aquisição de resíduos e demais materiais destinados à reciclagem, reutilização ou logística reversa adquiridos de pessoa física, cooperativa ou outra forma de organização popular, observado o art. 170 da Lei Complementar nº 214, de 2025.',
       'Não', 'Sim', 'Não', 'Sim', TIMESTAMP '2029-01-01 00:00:00', 'Sim', TIMESTAMP '2027-01-01 00:00:00',
       'Fixado em lei: CBS 7%; IBS 1,3% (2029), 2,6% (2030), 3,9% (2031), 5,2% (2032) e 13% (2033 em diante)',
       'Direto', 'LC 214/2025, art. 170, §2º: percentual sobre o valor da aquisição',
       'Portal da Conformidade Fácil (SVRS/RFB), Tabela Crédito Presumido, conferida em 29/10/2026', 'Ativo',
       'Não vale para agrotóxicos, medicamentos, pilhas e baterias, pneus, eletroeletrônicos, óleos lubrificantes (salvo o usado ou contaminado coletado por rerrefinador autorizado), lâmpadas e sucata de cobre (art. 170, §§3º e 4º). Só compensa o tributo devido.',
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "CredPres" WHERE "c_cred_pres" = '03');

INSERT INTO "CredPres" ("id", "c_cred_pres", "descricao_oficial", "apropria_dfe", "apropria_evento", "deduz_credito_presumido",
                        "ibs_aplicavel", "inicio_ibs", "cbs_aplicavel", "inicio_cbs", "percentual_oficial", "metodo_calculo",
                        "base_legal_metodo", "fonte", "status", "observacao", "createdAt", "updatedAt")
SELECT 'credpres_oficial_04', '04',
       'Crédito presumido da aquisição de bens móveis usados de pessoa física não contribuinte para revenda, observado o art. 171 da Lei Complementar nº 214, de 2025.',
       'Sim', 'Sim', 'Sim', 'Sim', TIMESTAMP '2027-01-01 00:00:00', 'Sim', TIMESTAMP '2027-01-01 00:00:00',
       'Igual à alíquota do IBS e da CBS aplicável ao bem (LC 214, art. 171, §1º)',
       'Direto', 'LC 214/2025, art. 171, §1º: alíquota do tributo sobre o valor da aquisição',
       'Portal da Conformidade Fácil (SVRS/RFB), Tabela Crédito Presumido, conferida em 29/10/2026', 'Ativo',
       'O IBS usa a alíquota vigente na data da revenda (aquisições até 2032) ou da aquisição (a partir de 2033); a CBS, a vigente na aquisição (a partir de 2027). O InTAX usa as alíquotas do ano. Só compensa o tributo devido na revenda do próprio bem (art. 171, §2º).',
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "CredPres" WHERE "c_cred_pres" = '04');

-- Código antigo do InTAX para o produtor rural ("CP-RURAL", método "Direto", nunca calculou nada por estar pendente):
-- o cálculo oficial é "por fora". Mantido para as operações já lançadas com esse código.
UPDATE "CredPres"
   SET "metodo_calculo" = 'Por Fora',
       "base_legal_metodo" = 'Decreto nº 12.955/2026, art. 247: CP = VO×C/(1+C)',
       "observacao" = 'Código antigo do InTAX para o produtor rural; o código oficial é 1 (Conformidade Fácil/SVRS). Mantido para as operações já lançadas.',
       "updatedAt" = CURRENT_TIMESTAMP
 WHERE "c_cred_pres" = 'CP-RURAL' AND "metodo_calculo" = 'Direto';
