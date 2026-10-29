# Auditoria: atualizações da Reforma Tributária × InTAX

Data: 28/10/2026. Pergunta: o que mudou na Reforma com efeito em cálculo e alíquotas divulgadas, e o InTAX já contempla?

**Atualização de 29/10/2026:** as três correções P1 (2026 informativo, CBS de 2027 e 2028 em 11,2% e catálogo cClassTrib v1.70) foram aplicadas na produção e no banco local; ver a seção 8. **Também em 29/10/2026**, a modelagem do que faltava (cenário de alíquotas 2029–2033, redutor de compras governamentais, crédito presumido de estoque, combustíveis e Imposto Seletivo) foi implementada no motor 1.3.0; ver a seção 9. As seções 1 e 2 descrevem o estado encontrado em 28/10.

**Método.** Textos oficiais lidos em 28/10/2026: Planalto (LC 214/2025 compilada com a LC 227/2026, LC 123, Decretos 12.955 e 13.075/2026, CF/ADCT), TCU, Agência Senado e Agência Câmara, CGIBS, Receita Federal/Portal do Simples e Portal da Conformidade Fácil (SVRS). O que não consegui confirmar em fonte oficial está marcado como **não confirmado**. Os números do InTAX foram lidos primeiro no banco de desenvolvimento e depois conferidos na produção, por consulta somente leitura autorizada pelo usuário em 29/10/2026 (seção 7): parâmetros e catálogos são idênticos nos dois.

## 1. Resumo

1. **Fato novo de hoje.** O TCU aprovou a alíquota de referência da CBS de 2027 em **11,3468%, arredondada para 11,3%** (LC 214, art. 349, §14), com redutor de compras governamentais de **44,16%**. Falta a resolução do Senado. O InTAX usa **9,21%** em 2027–2033, valor que não está na Resolução CGIBS 14/2026 (só sai por diferença: 27,91% − 18,7%).
2. **Três divergências de cálculo em relação ao texto da lei**, independentes do número final da CBS: (a) 2026 é tratado com efeito financeiro, mas a lei compensa IBS/CBS com PIS/Cofins e dispensa o recolhimento de quem cumpre as obrigações acessórias; (b) a CBS de 2027–2028 não recebe a redução de 0,1 p.p. do art. 347; (c) **44 das 61 classes com redução** têm percentual errado no catálogo (41 gravadas com 0%).
3. **O que confere com a lei:** IBS de 0,05% + 0,05% em 2027–2028, alíquotas de 2026 (0,9% e 0,1%), calendário de ICMS/ISS (9/10 a 6/10 e extinção em 2033), as 30 faixas do Simples 2027–2028 (alíquota, parcela e repartição de CBS/IBS) e as citações de artigos da calculadora pública.
4. **Não modelado em 28/10** (modelado em 29/10, exceto Zona Franca e cashback; ver a seção 9): redutor de compras governamentais, Imposto Seletivo (fora a premissa de 0,25% da mineração), combustíveis com alíquota específica, crédito presumido sobre estoque (Decreto 12.955, arts. 605–609), Zona Franca e cashback.
5. **Base legal e Radar:** faltam o Regulamento do IBS (Resolução CGIBS 6/2026) e os atos posteriores, e há 8 avisos de atualização aguardando aprovação do administrador em produção; o Radar roda toda semana (última execução em 26/10); a data-base normativa do sistema continua 01/09/2026.

## 2. O que mudou (fonte oficial) e a situação no InTAX

Situação: **Confere** (igual à lei), **Parcial**, **Divergente** (o sistema calcula diferente da lei) ou **Não modelado**.

| # | Atualização | Fonte oficial | Situação no InTAX |
|---|---|---|---|
| 1 | CBS 2027: TCU calculou 11,3468%, arredondada para 11,3%; redutor de compras governamentais 44,16%. Processo TC 006.529/2026-7. | [TCU, CBS 2027](https://sites.tcu.gov.br/reforma-tributaria/visao-cbs-2027.html); [Agência Senado, 28/10](https://www12.senado.leg.br/noticias/materias/2026/10/28/reforma-tributaria-tcu-calcula-aliquota-da-cbs-em-11-3-para-2027) | **Divergente.** `TransicaoAno.cbs_efetiva` = 9,21% de 2027 a 2033. Efeito: a CBS efetiva de 2027 sobe 1,99 p.p. (de 9,21% para 11,2%), o que soma 1,99 p.p. da receita na carga híbrida do Simples e R$ 1,99 a mais de CBS líquida para cada R$ 100 de base líquida. |
| 2 | Rito e prazos: o Senado fixa por resolução; se passar de 22/12, valem os cálculos do TCU (art. 349, §1º, II e §2º); arredondamento ao décimo de ponto (§14). A Agência Senado informa TCU até 30/10 e Senado até 15/12. | [LC 214, art. 349](https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214compilado.htm); [Agência Senado, 26/10](https://www12.senado.leg.br/noticias/materias/2026/10/26/reforma-tributaria-aliquota-da-cbs-avanca-nesta-semana) | **Parcial.** A tela do Simples híbrido diz "até 15/12" (confere com a Agência Senado). O comentário do código cita "art. 14", que é outro assunto. |
| 3 | CBS de 2027–2028 = alíquota fixada, **reduzida em 0,1 p.p.** (art. 347). Com 11,3%, a efetiva seria 11,2% e, somada ao IBS de 0,1%, volta a 11,3%. | [LC 214, art. 347](https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214compilado.htm) | **Divergente.** A observação do banco cita a regra, mas o valor gravado não a aplica. |
| 4 | IBS de 2027–2028: 0,05% estadual + 0,05% municipal. | LC 214, art. 344 | **Confere.** |
| 5 | 2026: IBS 0,1% e CBS 0,9%; o valor recolhido é compensado com PIS/Cofins (art. 348, I); fica dispensado o recolhimento de quem cumpre as obrigações acessórias (art. 348, §1º; ADCT, art. 125, §4º); não se aplica a optantes do Simples (art. 348, III, "c"). | LC 214, arts. 343, 346, 348; CF, ADCT art. 125 | **Divergente.** Alíquotas conferem, mas `efeito_financeiro` = 1 em 2026 soma IBS/CBS sobre PIS/Cofins integral. No Painel de teste, 2026 mostra R$ 11,6 mil de IBS/CBS que, cumpridas as obrigações acessórias, não são devidos. |
| 6 | ICMS/ISS a 9/10, 8/10, 7/10 e 6/10 em 2029–2032; extinção em 2033. | CF, ADCT art. 128 | **Confere.** |
| 7 | Alíquotas de referência do IBS (UF e município, 2029–2033) e da CBS (2028–2033): só por resolução do Senado, no ano anterior (art. 349, I, II e §1º). A Resolução CGIBS 14/2026 usa 18,7% de IBS como **premissa metodológica** para estimar a arrecadação de 2027 e o limite de 50% do CGIBS (R$ 2,58 bi); total 27,91% no quadro 2; não fala de CBS. O gatilho de 26,5% está no art. 475, §§ 9º a 12 (avaliação quinquenal). | [Res. CGIBS 14/2026](https://www.cgibs.gov.br/upload/arquivos/202607/31144942-resoluc-ao-cgibs-n-14-de-29-de-julho-de-2026-proposta-percentual-ibs-cgibs-2027.pdf); LC 214, arts. 349 e 475 | **Parcial.** O InTAX rotula "18,70% IBS + 9,21% CBS" como Resolução CGIBS 14 (a parte da CBS não está lá). Com a CBS do TCU, 18,7% + 11,3% = 30,0%, acima de 26,5%: **não há combinação oficial para 2029–2033**. |
| 8 | Imposto Seletivo: alíquotas por lei ordinária (art. 422); mineração no máximo 0,25% (art. 422, §2º). O governo deve enviar o projeto "nos próximos dias" (22/10). | LC 214, arts. 419–422; [Agência Câmara, 22/10](https://www.camara.leg.br/noticias/1313045-contribuicao-sobre-bens-e-servicos-entra-em-vigor-em-2027-e-novas-regulamentacoes-serao-enviadas-ao-congresso) | **Parcial.** Só a premissa de 0,25% do perfil "mineradora" da calculadora pública. O motor não calcula IS. |
| 9 | Crédito presumido do produtor rural e do transportador autônomo: percentuais definidos por ato conjunto, divulgados até setembro, vigência em 1º de janeiro (arts. 168, §4º, e 169, §4º). Ato de 2027 **não localizado**; a página do TCU lista como pendência em 28/10. | LC 214, arts. 168 e 169; TCU | **Parcial.** O Painel traz a ressalva correta. Os percentuais entram por operação; o catálogo `CredPres` tem 1 linha. |
| 10 | Crédito presumido de CBS sobre o **estoque de abertura de 1º/1/2027** (LC 214, art. 381): 9,25% sobre o estoque comprado no mercado interno, apropriado até 30/06/2027, em 12 parcelas, só compensa CBS; exige inventário em 31/12/2026 com documentação fiscal idônea. | [Decreto 12.955/2026, arts. 605–608](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2026/decreto/d12955.htm) | **Não modelado.** Tem relação direta com o projeto de saneamento de estoques. |
| 11 | Decreto 13.075/2026 (21/07, DOU 22/07): CNPJ e documento fiscal de pessoa física e de produtor rural PF só a partir de 1º/1/2027 (art. 105, §4º-A, e art. 115, §3º, do Decreto 12.955). | [Decreto 13.075/2026](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2026/decreto/d13075.htm) | **Fora da Base legal** (carregada em 25/09 só com o Decreto 12.955 original). |
| 12 | Regulamento do IBS (Resolução CGIBS 6/2026, de 30/04) e resoluções seguintes (13, 14, 15, 16, 17 e 18, até 15/09). | [CGIBS, resoluções](https://www.cgibs.gov.br/resolucoes) | **Fora da Base legal** (pendência já conhecida: fonte não é o Planalto). |
| 13 | Portaria Conjunta MF/CGIBS 14/2026 (2/10, DOU 5/10): combustíveis têm alíquota específica por unidade, uniforme no país; CBS a partir de 2027, IBS a partir de 2029; etanol anidro e biodiesel de mistura com IBS a 90% da gasolina A e do diesel A. Os valores em R$/litro **não constam** do texto lido. | [CGIBS, Portaria Conjunta](https://www.cgibs.gov.br/combustiveis-portaria-conjunta-define-como-serao-calculadas-as-aliquotas-do-ibs-e-da-cbs) | **Não modelado.** O perfil "etanol" calcula ad valorem, sem redução. |
| 14 | Simples: Resolução CGSN 194/2026 (DOU 28/09) fixa a opção pelo regime regular de IBS/CBS de 01/09 a 30/10/2026 (efeitos em 1º/1/2027), ingresso no Simples até 15/10 e cancelamento de 03/11 a 20/12. | [Receita Federal](https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/setembro/simples-nacional-2027-entenda-os-novos-prazos-e-faca-sua-escolha-com-consciencia-e-tranquilidade) (texto da resolução **não conferido**) | **Tabelas conferem** (ver seção 3). A tela não cita os prazos. O Radar de produção registrou a Resolução 194 nas semanas 41 e 42; o item da semana 40 ainda trazia o prazo antigo de 30/09. |
| 15 | Tabela cClassTrib: Informe Técnico 2025.002 v1.70 (01/10/2026) com 173 classes, 170 vigentes. | [Portal da Conformidade Fácil](https://dfe-portal.svrs.rs.gov.br/CFF/ClassificacaoTributaria) | **Divergente.** O InTAX tem 164 classes. Ver anexo A. |

Sem efeito direto no cálculo de IBS/CBS: a LC 238/2026 (mexe no MEI, conforme a LC 123 compilada), a LC 237/2026 (Radar; texto não lido) e o [Decreto 13.140/2026](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2026/decreto/d13140.htm) (21/10), que dispensa o nanoempreendedor de CNPJ e de documento fiscal (arts. 105 e 115 do Decreto 12.955; no IBS só a partir de 1º/1/2029 e com manifestação do CGIBS) e permite ao MEI usar a DASN-SIMEI como documento fiscal nas vendas a consumidor final. Ele não altera o que consta na linha 11 sobre pessoa física e produtor rural PF.

## 3. Conferências que deram certo

- **Simples 2027–2028.** As 30 faixas de `ANEXOS_2027` (`src/motor/simplesHibrido.js`) conferem com a LC 214, Anexos XVIII a XXII (nova redação dos Anexos I a V da LC 123, vigência 2027–2028): alíquota nominal, parcela a deduzir e repartição de CBS e IBS. O CBS de 16,41% do Anexo III vem da redação da LC 227/2026 (a tabela original trazia 16,42% e não fechava 100%). **A fonte certa é a LC 214, não a LC 123**; o comentário do arquivo e o texto que escrevi na página de Arquitetura devem citar assim.
- **Calculadora pública.** As citações de artigo conferem: art. 128 (IX insumos agropecuários, VI alimentos), arts. 133 e 146 (medicamentos), arts. 172 a 180 (combustíveis), arts. 273 a 280 (bares e restaurantes, redução de 40% no art. 275) e art. 422, §2º (mineração).
- **Redução de 60% dos insumos** (art. 138, Anexo IX) e **in natura** (art. 137): perfis "sementeira" e "ração" usam 60%.

## 4. De onde vem cada número (para saber o que trocar)

| Onde | O que guarda | Alimenta |
|---|---|---|
| Tabela `TransicaoAno` (banco) | Alíquotas e fatores por ano | Painel, Operações, Cenários, PDF, calculadora pública (`/public/parametros-transicao`), Simples híbrido (linha de 2027) |
| Tabela `ClassTrib` (banco) | Redução de IBS/CBS por classe | Só o motor (por operação) e a validação do importador. **A calculadora pública não usa**: as reduções por perfil estão fixas em `src/lib/calculadoraAgro.js`. |
| Textos fixos com números | "9,21%", "18,7%", "Resolução CGIBS 14", "até 15/12" | `TransicaoPage.jsx` (nota), `relatorioReforma.js`, `roteiroTestes.js`, `SimplesHibridoPage.jsx`, comentários de `simplesHibrido.js` |

Trocar a alíquota exige atualizar a tabela e esses cinco textos.

## 5. Correções sugeridas, por prioridade

**P1: corrigem cálculo (pequenas).**
1. 2026: `efeito_financeiro` = 0 e caráter "Informativo" (arts. 348 e ADCT 125), mantendo uma chave para simular quem não cumpre as obrigações acessórias.
2. CBS de 2027–2028: usar 11,2% (11,3% − 0,1 p.p.), rotulada "estimativa do TCU em 28/10/2026, pendente da resolução do Senado". **Decisão sua:** manter o 9,21% como cenário alternativo?
3. Reimportar a tabela cClassTrib v1.70 e gravar os percentuais oficiais (`PercRedIbs`/`PercRedCbs`); inativar 220001–220003 só depois de conferir.

**P2: coerência e atualização.**
4. Escolha de cenário de alíquotas para 2029–2033 (TCU, estimativa do CGIBS, gatilho de 26,5%) e alerta quando a soma passar do gatilho. **Feito em 29/10 (seção 9).**
5. Os cinco textos fixos passarem a ler os valores do banco. **Feito em parte em 29/10:** a nota da tela Transição passou a ler os valores da tabela e do cenário; os demais textos citam o fato oficial, sem repetir o número.
6. Base legal: carregar Decreto 13.075, Resoluções CGIBS 6, 13 e 14, Portarias Conjuntas MF/CGIBS 7 e 14 e Resoluções CGSN 186 e 194; atualizar a data-base normativa.
7. Radar: em produção roda toda semana (execuções agendadas das semanas 40 a 44, a última em 26/10) e já registrou a Resolução CGSN 194, a Portaria Conjunta 14 e o Decreto 13.140. O cálculo do TCU é de 28/10, então só pode aparecer a partir do ciclo de 02/11: conferir.
8. Base legal: aprovar os 8 avisos pendentes (seção 7) e carregar as normas novas que o Radar já citou.

**P3: modelagem nova (cada uma é um projeto).**
9. Redutor de compras governamentais (44,16% em 2027). **Feito em 29/10 (seção 9).**
10. Crédito presumido sobre estoque (9,25%, 12 parcelas) para quem estava no Lucro Presumido. **Feito em 29/10 (seção 9).**
11. Combustíveis com alíquota específica. **Feito em 29/10 (seção 9), com a CBS de 2027 da Portaria MF 3.074/2026.**
12. Imposto Seletivo, quando houver lei. **Estrutura feita em 29/10 (alíquota informada na operação); as alíquotas continuam dependendo da lei.**
13. Percentuais do crédito presumido do produtor rural, quando o ato conjunto sair.

## 6. O que não consegui confirmar

- Texto da Resolução CGSN 195/2026 (citada pelo Radar em 26/10; não lida).
- Texto da Resolução CGSN 194/2026 e do Ato Conjunto RFB/CGIBS 4/2026 (só páginas de notícia oficiais).
- ~~Valores em R$/litro dos combustíveis~~ (resolvido em 29/10: Portaria MF 3.074/2026, DOU de 09/10/2026, lida no texto do DOU; a Portaria Conjunta 14/2026 só traz a metodologia). Continua sem confirmação o texto integral das Resoluções CGIBS 6 e 13 e qualquer IBS por litro (será divulgado pelo CGIBS no ano anterior a 2029).
- Ato conjunto com os percentuais do crédito presumido de 2027.
- Leiaute da NF-e na versão atual da NT 2025.002: conferi só o que o importador lê (cClassTrib, cCredPres, CST e pCredPres). Grupos como tributação regular e compra governamental não são lidos.

## 7. Verificação em produção (29/10/2026)

Consulta somente leitura (sessão do banco aberta em modo leitura), agregada, a parâmetros e catálogos oficiais, sem dados de clientes, autorizada pelo usuário.

| Item | Produção | Conclusão |
|---|---|---|
| `TransicaoAno` | 8 linhas idênticas às do banco local: CBS 9,21% de 2027 a 2033, IBS de 18,7% em 2033, 2026 com `efeito_financeiro` 1 e status Oficial (atualizadas em 29/08 e 01/09) | Os achados 1, 3, 5 e 7 da seção 2 valem para a produção |
| `ClassTrib` | 164 classes, todas ativas (atualizado em 03/09); nenhuma das 9 classes novas da v1.70. Reduções gravadas: 200002, 200009, 200032, 200036 e 200047 em 0%; 200005, 200008 e 200011 em 60% (oficial: 100%, 100%, 60%, 60%, 40%, 100%, 100% e 100%) | O achado 15 e o anexo A valem para a produção |
| Outros catálogos | 18 CST, 1 `CredPres`, 10.515 NCM e 556 correlações NCM × anexos | Iguais ao banco local |
| Radar | Execuções semanais agendadas de 28/09 a 26/10 (semanas 40 a 44), todas OK, com 4 a 5 itens cada; semanas 38 e 39 manuais | Está rodando. Quem ficou parado em 21/09 foi o banco local |
| Base legal | 13 normas, capturadas entre 05/10 e 26/10 (LC 214, Decreto 12.955 e CF em 05/10) | Texto de 05/10 para os três dispositivos mais importantes |
| Avisos da Base legal | 8 pendentes de aprovação: nova norma citada pelo Radar (Ato Técnico Conjunto RFB/CGIBS 5/2026 e 7/2026, Portaria Conjunta MF/CGIBS 14/2026 e Decreto 13.140/2026) e texto oficial atualizado (LC 214, Decreto 12.955 e CF, avisos de 12/10; LC 123, aviso de 26/10) | Aguardam o administrador. Enquanto não forem aprovados, a Base legal e o assistente usam o texto anterior desses dispositivos |
| Configuração | Versão v0.18 e data-base normativa 01/09/2026 | Desatualizada em relação às novidades de setembro e outubro |

## 8. Aplicação das correções P1 (29/10/2026)

As três correções P1 da seção 5 foram escritas como SQL versionado em `backend/scripts/sql/2026-10-29-reforma-parametros-e-classes.sql` (com a conferência somente leitura `...-verificar.sql`). O script roda numa transação, aborta sem gravar nada se o estado atual não for o esperado e confere ao final se o catálogo ficou igual à tabela oficial.

| Ambiente | Situação |
|---|---|
| Banco local | **Aplicado e conferido.** 173 classes, 0 ausentes, 0 divergentes em relação à tabela oficial; 2026 informativo (efeito financeiro 0); CBS de 2027 e 2028 em 11,2%; 2029 a 2033 sem mudança de valor; data-base normativa em 28/10/2026. |
| Produção | **Aplicado e conferido em 29/10/2026** (executado pelo usuário em PowerShell; transação confirmada). O estado anterior era idêntico ao do local antes do ensaio (164 classes, 9 ausentes, 44 divergentes) e o backup das três tabelas está em `/var/backups/simulador-reforma/pre-aplica-reforma-20261029.sql` (102 KB). Verificação somente leitura depois: 173 classes, 0 ausentes, 0 divergentes; 2026 informativo; CBS de 2027 e 2028 em 11,2%; 2029 a 2033 inalterados; data-base normativa em 28/10/2026; a API pública já serve os valores novos. |

Regra usada no catálogo: percentuais oficiais em todas as classes, mantendo a convenção do InTAX de gravar isenção e imunidade (CST 400 e 410) com 100%, que é o que faz o motor zerar o tributo. As classes de suspensão (CST 550) e de diferimento seguem a tabela oficial, em 0%. As classes 220001 a 220003 não foram inativadas, só ganharam um aviso na observação.

Efeito medido no Painel Executivo do banco local (66 operações de teste): em 2026 a carga da transição passou de R$ 99.259,82 para R$ 87.652,78, igual aos tributos atuais, porque o IBS/CBS de teste deixou de somar; em 2027 o IBS/CBS líquido foi de R$ 69.415,36 para R$ 84.252,80 e a carga efetiva de 10,86% para 12,24%, por causa da CBS de 11,2%.

Os textos que repetiam o 9,21% (nota da tela Transição, relatório em PDF, roteiro de testes e página do Simples × Híbrido) foram reescritos para citar o fato oficial (cálculo do TCU e arts. 347 e 349) em vez de repetir o número da tabela, e valem com os dois estados dos dados.

## Anexo A: classes cClassTrib, tabela oficial v1.70 × catálogo do InTAX

Contagem: 173 classes na tabela oficial (170 vigentes em 28/10/2026) e 164 no InTAX. Das 61 classes vigentes com redução, 44 estão erradas no InTAX.

### A.1 Classes vigentes na tabela oficial e ausentes no InTAX (9)

| Código | CST | Redução oficial | Descrição oficial (resumo) |
|---|---|---|---|
| 000006 | 000 | 0% | Situações tributadas integralmente pelo IBS e CBS realizadas por autônomo |
| 200055 | 200 | 60% | Fornecimento dos serviços com redução de alíquota de 60% realizado por autônomo, observado o art. 128 da Lei… |
| 200056 | 200 | 30% | Fornecimento dos serviços com redução de alíquota de 30% realizado por autônomo, observado o art. 127 da Lei… |
| 400003 | 400 | 0% | Bagagens de viajantes e de tripulantes, acompanhadas ou desacompanhadas, observado o art. 94 da Lei Complemen… |
| 400004 | 400 | 0% | Remessas internacionais, observado o art. 94 da Lei Complementar nº 214, de 2025. |
| 550026 | 550 | 0% | Regimes de admissão temporária com suspensão total do pagamento dos tributos durante o período de sua permanê… |
| 550027 | 550 | 0% | Regimes de Aperfeiçoamento (Drawback), observado o art. 90 da Lei Complementar nº 214, de 2025. |
| 550028 | 550 | 0% | Regimes de Aperfeiçoamento (Admissão temporária), observado o art. 90 da Lei Complementar nº 214, de 2025. |
| 550029 | 550 | 0% | Zona de Processamento de Exportação, observado os art. 102 da Lei Complementar nº 214, de 2025. |

### A.2 Classes que estão no InTAX e não estão mais vigentes na tabela oficial (3)

220001, 220002, 220003 (incorporação imobiliária / parcelamento do solo). Conferir se saíram da tabela ou só mudaram de código antes de inativar.

### A.3 Redução gravada errada no InTAX: oficial tem redução e o sistema grava 0% (41)

Nestas classes o InTAX calcula IBS/CBS **cheio** onde a tabela oficial prevê redução (efeito: imposto simulado maior que o da lei).

| Código | InTAX | Oficial | Descrição oficial (resumo) |
|---|---|---|---|
| 011001 | 0% | 60% | Planos de assistência funerária, observado o art. 236 da Lei Complementar nº 214, de 2025. |
| 011002 | 0% | 60% | Planos de assistência à saúde, observado o art. 237 da Lei Complementar nº 214, de 2025. |
| 011003 | 0% | 60% | Intermediação de planos de assistência à saúde, observado o art. 240 da Lei Complementar nº 214, de… |
| 011005 | 0% | 30% | Planos de assistência à saúde de animais domésticos, observado o art. 243 da Lei Complementar nº 21… |
| 200001 | 0% | 100% | Serviços de transporte de bens até as zonas de processamento de exportação e bens exportados a part… |
| 200002 | 0% | 100% | Fornecimento ou importação de tratores, máquinas e implementos agrícolas, destinados a produtor rur… |
| 200006 | 0% | 100% | Situação de emergência de saúde pública reconhecida pelo Poder Legislativo federal, estadual, distr… |
| 200009 | 0% | 100% | Fornecimento dos medicamentos registrados na Anvisa, observado o art. 146 da Lei Complementar nº 21… |
| 200010 | 0% | 100% | Fornecimento dos medicamentos registrados na Anvisa, quando adquiridos por órgãos da administração… |
| 200012 | 0% | 100% | Situação de emergência de saúde pública reconhecida pelo Poder Legislativo federal, estadual, distr… |
| 200013 | 0% | 100% | Fornecimento de tampões higiênicos, absorventes higiênicos internos ou externos, descartáveis ou re… |
| 200015 | 0% | 100% | Venda de automóveis de passageiros de fabricação nacional de, no mínimo, 4 (quatro) portas, inclusi… |
| 200048 | 0% | 40% | Hotelaria, Parques de Diversão e Parques Temáticos, observado o art. 281 da Lei Complementar nº 214… |
| 200016 | 0% | 100% | Prestação de serviços de pesquisa e desenvolvimento por Instituição Científica, Tecnológica e de In… |
| 200017 | 0% | 100% | Operações relacionadas ao FGTS, considerando aquelas necessárias à aplicação da Lei nº 8.036, de 19… |
| 200018 | 0% | 100% | Operações de resseguro e retrocessão ficam sujeitas à incidência à alíquota zero, inclusive quando… |
| 200019 | 0% | 100% | Importador dos serviços financeiros que seja contribuinte e tenha direito de apropriação de crédito… |
| 200020 | 0% | 100% | Operação praticada por sociedades cooperativas optantes por regime específico do IBS e CBS, quando… |
| 200021 | 0% | 100% | Serviços de transporte público coletivo de passageiros ferroviário e hidroviário urbanos, semiurban… |
| 200022 | 0% | 100% | Operação originada fora da Zona Franca de Manaus que destine bem material industrializado de origem… |
| 200023 | 0% | 100% | Operação realizada por indústria incentivada que destine bem material intermediário para outra indú… |
| 200024 | 0% | 100% | Operação originada fora das Áreas de Livre Comércio que destine bem material industrializado de ori… |
| 200025 | 0% | IBS 60% / CBS 100% | Fornecimento dos serviços de educação relacionados ao Programa Universidade para Todos (Prouni), in… |
| 200026 | 0% | 80% | Locação de imóveis localizados nas zonas reabilitadas, pelo prazo de 5 (cinco) anos, contado da dat… |
| 200027 | 0% | 70% | Operações de locação, cessão onerosa e arrendamento de bens imóveis, observado o art. 261 da Lei Co… |
| 200032 | 0% | 60% | Fornecimento dos medicamentos registrados na Anvisa ou produzidos por farmácias de manipulação, res… |
| 200036 | 0% | 60% | Fornecimento de produtos agropecuários, aquícolas, pesqueiros, florestais e extrativistas vegetais… |
| 200037 | 0% | 60% | Fornecimento de serviços ambientais de conservação ou recuperação da vegetação nativa, mesmo que fo… |
| 200040 | 0% | 60% | Fornec dos seguintes serv de comunic instit à admin púb direta, autarq e fund púb: serviços direcio… |
| 200041 | 0% | 60% | Operações relacionadas às seguintes atividades desportivas: fornecimento de serviço de educação des… |
| 200042 | 0% | 60% | Operações relacionadas às seguintes atividades desportivas: gestão e exploração do desporto por ass… |
| 200045 | 0% | 60% | Operações relacionadas a projetos de reabilitação urbana de zonas históricas e de áreas críticas de… |
| 200046 | 0% | 50% | Operações com bens imóveis, observado o art. 261 da Lei Complementar nº 214, de 2025. |
| 200047 | 0% | 40% | Bares e Restaurantes, observado o art. 275 da Lei Complementar nº 214, de 2025. |
| 200049 | 0% | 40% | Transporte coletivo de passageiros rodoviário, ferroviário e hidroviário intermunicipais e interest… |
| 200050 | 0% | 40% | Serviços de transporte aéreo regional coletivo de passageiros ou de carga, observado o art. 287 da… |
| 200051 | 0% | 40% | Agências de Turismo, observado o art. 289 da Lei Complementar nº 214, de 2025. |
| 200052 | 0% | 30% | Prestação de serviços das seguintes profissões intelectuais de natureza científica, literária ou ar… |
| 200053 | 0% | 100% | Fornecimento de medicamentos registrados na Anvisa, quando  classificados como soros ou vacinas, ob… |
| 200054 | 0% | 100% | Fornecimento de bem material pela cooperativa de produção agropecuária a associado não sujeito ao r… |
| 515001 | 0% | 60% | Operações, sujeitas a diferimento, com insumos agropecuários e aquícolas, observado o art. 138 da L… |

### A.4 Redução gravada com valor diferente (3)

| Código | InTAX | Oficial | Descrição oficial (resumo) |
|---|---|---|---|
| 200005 | 60% | 100% | Fornecimento de dispositivos médicos com a especificação das respectivas classificações da NCM/SH p… |
| 200008 | 60% | 100% | Fornecimento dos dispositivos de acessibilidade próprios para pessoas com deficiência relacionados… |
| 200011 | 60% | 100% | Fornecimento das composições para nutrição enteral e parenteral, composições especiais e fórmulas n… |

### A.5 Divergência só de convenção (40 classes)

Classes de não incidência, imunidade, isenção ou suspensão (CST 4xx e similares): a tabela oficial traz redução 0% e o InTAX grava 100%. O resultado no motor é o mesmo (tributo zero), então **não é erro de cálculo**; só convém documentar a convenção.

400001, 400002, 410001, 410002, 410003, 410004, 410005, 410006, 410007, 410008, 410009, 410010, 410011, 410012, 410013, 410014, 410015, 410016, 410017, 410018, 410019, 410020, 410021, 410022, 410023, 410024, 410025, 410026, 410027, 410028, 410029, 410030, 410031, 410032, 410033, 410034, 410035, 410036, 410037, 410999

## 9. Modelagem do que faltava (29/10/2026)

Pedido do usuário: colocar o cenário de alíquotas, aprovar os avisos da Base legal (feito pelo administrador na tela) e "modelar o que falta"; sobre o crédito presumido de estoque, o usuário perguntou se a decisão é dele ou se deve seguir a base legal, e a resposta é a segunda: elegibilidade, valor e prazos estão na LC 214 e no Decreto 12.955, e a empresa informa só fatos. Tudo abaixo foi lido no texto da lei carregado na Base legal do InTAX e, para os combustíveis, no texto do DOU. O motor foi para a versão **1.3.0**. Operação sem os novos dados dá o mesmo resultado da 1.2.0 (os 515 testes anteriores continuam passando), com duas ressalvas: (a) `compra_governamental_informado` já existia como campo informativo do DF-e e agora vale, então operação antiga marcada "Sim" recebe o redutor assim que o ano tiver redutor cadastrado (antes do deploy, conferir em produção, só leitura: `select count(*) from "Operacao" where compra_governamental_informado ilike 's%'`; o importador de XML não grava esse campo); (b) o cenário padrão novo (gatilho de 26,5%) muda a série de 2029 a 2033 em todas as telas em relação à tabela cadastrada (CBS de 9,21% para 11,3%; IBS cheio de 18,7% para 15,2%), e o cenário "Tabela cadastrada" reproduz os números anteriores.

| Item | O que a lei diz (fonte) | O que o InTAX faz agora | O que continua pendente |
|---|---|---|---|
| Cenário de alíquotas 2029–2033 | A CBS e o IBS de referência de cada ano só saem em outubro do ano anterior (LC 214, art. 349); IBS de 2029 a 2032 na escala do ICMS/ISS (ADCT 128 e 130); soma de 26,5% é gatilho de revisão (art. 475, §11), não trava | Quatro cenários, com o **Gatilho de 26,5%** como padrão (CBS 11,3% do TCU + IBS 15,2%; não confundir com o "Teto de Referência" dos arts. 367 a 369); "estimativas somadas" (11,3% + 18,7% = 30,0%, com alerta, para estresse); tabela cadastrada; personalizado. A escolha é por usuário (navegador), vale para Painel, Calculadora, Transição e PDF, aparece no relatório e na simulação salva, e nunca altera linha gravada como Oficial | Quando o Senado fixar um ano, o administrador grava a linha como Oficial. Não aplica a eventual redução da CBS do art. 368 |
| Redutor de compras governamentais | Reduz de modo uniforme IBS e CBS nas aquisições da administração direta, autarquias e fundações (arts. 349, III, 370 e 472); exceções: compra presencial dispensada de licitação, alíquota nacionalmente uniforme e fornecedor do Simples/MEI | Coluna `redutor_compra_gov` em `TransicaoAno`; a venda marcada como "Venda a órgão público" sai com alíquotas × (1 − redutor). 2027 = 44,16% (TCU, estimativa); anos sem valor repetem o último cadastrado, à vista na tela | O redutor de 2028 a 2033 (só sai no ano anterior). A destinação da arrecadação ao ente comprador (art. 473) não muda o valor do fornecedor |
| Crédito presumido de estoque | Regime regular da CBS, três hipóteses, bens novos para revenda, produção ou serviços; 9,25% do estoque nacional, ou o PIS/Cofins-Importação pago; apropriar até junho/2027, 12 parcelas, só contra CBS; direito vence em 5 anos (LC 214, arts. 381 a 383; Decreto 12.955, arts. 605 a 609) | Ferramenta própria (menu Consultas e cálculos): itens do inventário, elegibilidade conferida com o artigo que exclui, cronograma de 12 parcelas, vencimento e abatimento da CBS mensal, CSV | O ato do Poder Executivo que disciplina a verificação do estoque (art. 381, §2º): conferir o texto vigente antes de apropriar |
| Combustíveis | Incidência única, alíquota por litro ou quilo (arts. 172 a 180). **CBS de 2027 publicada:** Portaria MF 3.074/2026 (DOU 09/10/2026, edição 192-B): gasolina R$ 0,7925/l; EAC R$ 0,1922/l; diesel R$ 0,3515/l; B100 R$ 0,1480/l; GLP R$ 0,1677/kg; EHC R$ 0,1922/l; QAV R$ 0,0712/l; óleo combustível R$ 0,3403/kg; efeitos a partir de 08/01/2027. IBS 0,1% do valor em 2027–2028, dedutível da CBS (arts. 344 e 347, §2º) | Tabela nova `AliquotaCombustivel` (aba Combustíveis em Catálogos) com a carga da Portaria; operação com `combustivel_produto` = quantidade × alíquota; débito do produtor/importador, saída 620006 sem débito, crédito de quem consome (art. 47, §§4º e 5º), sem crédito na revenda (art. 180); em 2026 não se aplicam as alíquotas de teste (art. 348, III, b) | **IBS por litro de 2029 em diante** (o CGIBS divulga no ano anterior): o motor avisa e o exclui, sem inventar; CBS de 2028 em diante repete a de 2027 até haver divulgação (reajuste pelo preço médio, art. 174, §3º); gás natural processado, biometano e GNV |
| Imposto Seletivo | Incidência única, sem crédito, a partir de 2027; Anexo XVII (veículos, aeronaves e embarcações, fumígenos, bebidas alcoólicas e açucaradas, bens minerais); base sem IBS, CBS, o próprio IS e, até 2032, ICMS e ISS (arts. 409, 410, 414, 415, 417); integra a base de IBS/CBS (art. 12, §1º, V); mineração com teto de 0,25% (art. 422, §2º); alíquotas por lei ordinária **ainda não publicada** | Campo `is_pct` na operação (alíquota que o usuário quer simular): IS = i × (valor − ICMS/ISS) ÷ (1 + i), somado à carga da transição, ao preço-alvo, ao consolidado e ao PDF; NCM do Anexo XVII reconhecido na tela da operação, com botão do teto de 0,25% para minerais | Alíquotas (lei ordinária); alíquota específica de fumígenos e bebidas alcoólicas; concursos de prognósticos |
| Zona Franca de Manaus | Habilitação na Suframa e regras por tipo de operação (arts. 439 a 457) | **Não modelada**, de propósito: sem os dados de habilitação e da operação o resultado seria palpite | Projeto próprio, com especialista |
| Devolução personalizada (cashback) | Repasse da CBS e do IBS a pessoas físicas de famílias de baixa renda (arts. 112 a 120); não muda o tributo que a empresa apura | Não modelada (não afeta a apuração); efeito no caixa de quem fornece energia, água, gás canalizado e telecomunicações (art. 116, §1º) depende do regulamento | Acompanhar o regulamento |
| Crédito presumido do produtor rural | Percentuais por ato conjunto Fazenda/CGIBS até setembro do ano anterior (art. 168, §4º) | Sem mudança: segue "pendente" e estimado com os percentuais informados na operação | O ato de 2027 não foi localizado |

**Dados e implantação.** A migração `20261029010000_reforma_redutor_is_combustiveis` só acrescenta colunas com valor padrão (`TransicaoAno.redutor_compra_gov`, `Operacao.is_pct` e `Operacao.combustivel_produto`) e cria a tabela `AliquotaCombustivel` com as 8 linhas da Portaria; nenhuma linha existente é alterada. O redutor de 2027 entra pelo SQL versionado `backend/scripts/sql/2026-10-29-redutor-compras-governamentais.sql` (com trava; aplicado no banco local, aguardando a produção). Os textos que diziam "não modelado" (FAQ, relatório da Calculadora, cobertura por setor, dicas dos campos, ressalvas do PDF, roteiro de testes e arquitetura) foram atualizados, e o teste do FAQ agora amarra os números citados às constantes do motor.

## 10. Base de cálculo do IBS e da CBS na transição (achado de 29/10/2026, corrigido na versão 1.4.0 do motor)

Ao revisar o art. 12 da LC 214 (texto da Base legal) para o Imposto Seletivo, apareceu uma diferença que **não é desta modelagem e atinge todos os cálculos**.

**O que a lei diz.** O art. 12, §2º, V, manda que **não integrem a base de cálculo do IBS e da CBS** o montante, na operação, do ICMS, do ISS, da Cofins (art. 195, I, "b", e IV, da CF) e do PIS (art. 239), **de 1º/1/2026 a 31/12/2032**; o inciso II exclui o IPI e o inciso I, o próprio IBS e a CBS. Ou seja, nos anos de transição o IBS e a CBS incidem sobre o valor da operação **menos** esses tributos embutidos no preço.

**O que o InTAX fazia até a versão 1.3.0.** O motor (`calcIbsCbs`) aplicava as alíquotas de IBS e CBS sobre o `valor_bruto` inteiro, sem retirar ICMS, ISS, PIS e Cofins. Era o que vinha da planilha original (v0.16) e das premissas validadas até então.

**Tamanho do efeito** (venda de R$ 1.000 com ICMS de 18%, PIS 1,65% e Cofins 7,6% no sistema atual; IBS e CBS do cenário padrão):

| Ano | IBS + CBS no motor até a 1.3.0 | Pela lei, agora no motor 1.4.0 (base sem os tributos) | Diferença |
|---|---|---|---|
| 2027 | R$ 113,00 | R$ 92,66 (base R$ 820,00) | −18,0% |
| 2029 | R$ 128,20 | R$ 107,43 (base R$ 838,00) | −16,2% |
| 2032 | R$ 173,80 | R$ 155,03 (base R$ 892,00) | −10,8% |
| 2033 | R$ 265,00 | R$ 265,00 | 0 (a exclusão acaba em 2032) |

Quanto maior o ICMS embutido, maior o excesso. Até a 1.3.0 o motor **superestimava** o IBS e a CBS de 2027 a 2032 (a favor da segurança, mas errado), inclusive na Calculadora pública e nas simulações salvas.

**O que foi feito (motor 1.4.0, 29/10/2026).** A exclusão está em `baseIbsCbs` (`src/motor/taxEngine.js`): de 2026 a 2032 a base é o valor da operação menos o ICMS (com o FCP), o ISS, o PIS e a Cofins ainda cobrados no ano, isto é, o valor de cada tributo vezes o fator de transição do ano. Vale para o débito, o crédito e a partilha entre estados e municípios, e chega à Calculadora pública porque ela usa as mesmas funções. A partir de 2033 não há exclusão. IPI e ICMS-ST ficam fora da conta porque não estão dentro do valor da operação, e o combustível (alíquota por unidade) não usa base percentual. Linha de transição sem o ano não exclui nada (só acontece em testes). As simulações salvas guardam a versão do motor e o resultado da época.

**Para o especialista confirmar.** (a) Se o `valor_bruto` das operações de algum ERP já vem sem esses tributos; nesse caso a exclusão seria dupla. (b) O tratamento do ICMS-ST retido e do FCP. (c) Se, no Simples com IBS/CBS fora do DAS, o ICMS e o ISS pagos dentro do DAS também saem da base; o comparador Simples × Híbrido não aplica a exclusão.

## 11. Transporte, crédito presumido e importações (29/10/2026)

Pergunta de origem: o InTAX tem condições de analisar uma transportadora e apoiar o planejamento de 2027? O que entrou, e o que ficou de fora:

| # | Item | Situação | Fonte |
|---|---|---|---|
| 1 | Base de cálculo do IBS/CBS sem ICMS, ISS, PIS e Cofins (2026 a 2032) | Aplicado no motor 1.4.0 (seção 10) | LC 214, art. 12, §2º, V |
| 2 | Crédito presumido "por fora" (CP = VO×C/(1+C)) do produtor rural e do transportador autônomo | Aplicado; o código antigo `CP-RURAL` estava como "Direto" e foi corrigido | Decreto 12.955, arts. 247 e 253 |
| 3 | Percentual informado na operação vale mesmo com o ato oficial pendente (resultado "Estimativa") | Aplicado | LC 214, arts. 168 e 169, §4º |
| 4 | Crédito do transportador autônomo, de resíduos e de bem usado sem ressarcimento (só compensa tributo devido) | Aplicado (não entra no crédito acumulado a realizar) | LC 214, arts. 169, §7º, 170, §2º e 171, §2º; Decreto 12.955, art. 254 |
| 5 | Resíduos (CBS 7%; IBS 1,3% em 2029 a 13% em 2033) e bem usado (alíquota do bem) com o percentual da lei | Aplicado | LC 214, arts. 170 e 171 |
| 6 | Apuração por empresa e ano: o crédito presumido de CBS abate a CBS (antes todo o crédito presumido abatia só o IBS e o de CBS se perdia) | Corrigido | — |
| 7 | Catálogo oficial de cCredPres (quatro códigos, gravados com dois dígitos como no XML) | Migração `20261030010000_credpres_catalogo_oficial` | Portal da Conformidade Fácil (SVRS), tabela conferida em 29/10/2026 |
| 8 | CT-e e CT-e OS no importador de XML, com o evento de apropriação do crédito presumido (211110) | Aplicado | Portal Nacional do CT-e: schemas PL_CTe_400_NT2026.004 RTC_1.00 e NTs 2025.001, 2026.002 e 2026.004 |
| 9 | Importação de operações por planilha XLSX/CSV | Aplicado | — |
| 10 | Simples × Híbrido com o crédito das compras da própria empresa (versão 0.2.0) | Aplicado | LC 214, art. 47 |
| 11 | Classes do transporte de passageiros e de bens a zonas de exportação (200001, 200021, 200049, 200050, 400001, 400002) | Já existiam no catálogo; agora há orientação no formulário | LC 214, arts. 157 e 285 a 287 |
| 12 | Simples: transporte intermunicipal e interestadual de cargas (Anexo III sem ISS e com o ICMS do Anexo I) | **Não feito**: faltam as repartições de ISS (Anexo III) e de ICMS (Anexo I) nas tabelas de 2027 e a leitura do art. 18, §5º-E depois da LC 214 | LC 123, art. 18, §5º-E |
| 13 | Percentuais de 2027 do crédito presumido do produtor rural e do transportador autônomo | **Não localizados** em fonte oficial (o ato conjunto devia sair até setembro) | LC 214, arts. 168 e 169, §4º |
| 14 | Elegibilidade do crédito por tipo de compra e por regime: o percentual de crédito elegível é um só, por operação, e vale para o crédito do sistema atual e para o do IBS/CBS; as importações de NF-e e de CT-e o deixam em 0 | **Não feito**; proposta à parte (separar o crédito de PIS/Cofins, que só o Lucro Real tem, do crédito de ICMS e de IBS/CBS) | — |
| 15 | Cancelamento de NF-e por evento: o `prepararEvento` buscava `infEvento` só entre os filhos diretos da raiz e, no arquivo padrão `procEventoNFe`, não achava a chave (o cancelamento nunca era aplicado) | **Corrigido** (achado ao ler o CT-e, confirmado por teste): a busca agora lê o pedido e o retorno da SEFAZ; vale para as próximas importações, e eventos já enviados precisam ser reenviados | — |


### 11.1 Revisão independente do lote (29/10/2026)

Duas revisões independentes (motor e telas; backend e importações) leram o lote antes do commit. Nada de severidade alta no motor; no backend, dois achados altos. O que foi feito:

| # | Achado | Tratamento |
|---|---|---|
| 16 | Simples × Híbrido: com crédito de compras (valor fixo em R$), o ponto de equilíbrio tratava o crédito como proporcional ao preço e subestimava o repasse (R$ 40 mil de compras: 5,61% no lugar de 5,93%) | Corrigido: o equilíbrio sai da conta exata (líquido do vendedor no preço novo = líquido no Simples puro), com teste de propriedade; a carga "no preço novo" vem do motor |
| 17 | Crédito presumido "por fora" com IBS e CBS juntos: divisores separados davam mais do que a lei permite (IBS 4% + CBS 4% sobre R$ 1.000: R$ 76,92 contra R$ 74,07) | Corrigido: a LC 214 (arts. 168, §§1º a 3º, e 169, §§2º e 3º) tem um só valor líquido; o divisor leva a soma dos percentuais. Com um percentual só, nada muda (é a fórmula do Decreto 12.955) |
| 18 | NF-e importada gravava a alíquota nominal do ICMS (CST 20 com redução de base: 17% em vez de 6,8%), o que agora também contamina a base do IBS/CBS | Corrigido: grava o ICMS efetivo (vICMS ÷ valor da linha; sem vICMS, a alíquota com a redução de base); o original do XML continua guardado |
| 19 | Evento de cancelamento enviado junto com o documento (o caso comum de baixar o mês inteiro) não cancelava nada: só olhava o banco, e os itens do envio ainda estavam na memória | Corrigido: os eventos são aplicados depois que os documentos do envio estão gravados, em qualquer ordem dos arquivos; o resumo do lote desconta os itens que viraram cancelados |
| 20 | Cancelamento de NF-e era aplicado sem conferir o retorno da SEFAZ (pedido sem retorno ou rejeitado cancelava item e estornava operação confirmada) | Corrigido: só age evento com cStat 135, 136 ou 155 (NF-e) e 135 ou 136 (CT-e) |
| 21 | Planilha: o ID vinha do hash do arquivo inteiro; "corrija e reenvie" duplicava tudo o que já tinha entrado, e a tela dizia o contrário | Corrigido: o ID nasce do conteúdo da linha (empresa, data, direção, valor, descrição, documento, CFOP, NCM/NBS, UFs e quantidade) e da ordem entre linhas idênticas; a linha igual é ignorada e só a corrigida entra. Textos da tela, FAQ e roteiro revisados |
| 22 | Planilha: dois envios ao mesmo tempo gravavam duas vezes; falha no meio deixava lotes gravados; a consulta de duplicadas varria a tabela inteira | Corrigido: transação única com trava (pg_advisory_xact_lock) e consulta por empresa e ID; testado contra o Postgres local, com dois envios simultâneos |
| 23 | Planilha: célula formatada como % (1,65% guardado como 0,0165) era lida como 0,0165 ponto (imposto 100 vezes menor, sem aviso); texto "12.500" valia 12,5 no XLSX e 12.500 no CSV | Corrigido: o leitor entrega os números em texto brasileiro nos dois formatos e reconhece o formato de percentual; o alerta de fração lida como pontos vale para PIS, Cofins, ICMS, ISS e IPI e sai também na importação |
| 24 | Planilha: a coluna "Empresa" (alias CNPJ, que numa planilha de vendas é o do cliente) mandava a linha para outra empresa do grupo; o servidor aceitava empresa de qualquer grupo | Corrigido: com a empresa escolhida na tela a coluna não é lida; o alias "CNPJ" sozinho saiu; a tela manda o grupo e o servidor só aceita as empresas dele |
| 25 | Planilha: nota que já entrou pelo XML contava em dobro; código desfigurado pelo Excel (cClassTrib 1, CST 10, NCM sem o zero); ICMS interestadual sugerido para exportação, UF inválida e serviço de ISS; regime desconhecido calava | Corrigido: nota já importada por XML (mesma chave e empresa) fica de fora; zeros devolvidos; tabela de ICMS só entre UFs do país e fora de serviço de ISS; aviso de regime e de cClassTrib inexistente |
| 26 | Planilha: leitura de moeda ("-R$ 1.234,56", "R$ (100,00)", "100,00 D"); "0.500" lido como 500; linha citada no erro era a linha lógica, não a do arquivo; nome do arquivo com acento chegava em latin1 | Corrigido |
| 27 | Ano da operação pelo fuso do servidor (UTC): CT-e ou NF-e das 22h30 de 31/12/2026 caía em 2027 | Corrigido: ano no fuso de Brasília (NF-e e CT-e) |
| 28 | CT-e OS de passageiros: o local da operação é o início do transporte (LC 214, art. 11, VI), não o fim | Corrigido para tpServ 6 (pessoas) e 8 (excesso de bagagem); a carga e os valores seguem o fim (art. 11, VII) |
| 29 | FAQ antigo ainda dizia que o IBS/CBS incide sobre o valor bruto inteiro e que o crédito presumido pendente "não será calculado" | Oito respostas reescritas, com teste que impede a volta |
| 30 | Apuração por empresa (`creditoAcumuladoApurado`) incluía o crédito presumido sem ressarcimento; crédito normal zerado por cCredPres sem explicação na tela; dica de transporte aparecia em todo serviço; textos "campos abaixo" | Corrigidos |
| 31 | Comparador Simples × Híbrido não aplica a base do art. 12 ao crédito das compras | Texto da tela pede o valor das compras sem o ICMS e o ISS embutidos |
| 32 | Segunda rodada: o cancelamento só valia para item já gravado. O CT-e que chegasse depois (lote reprocessado ou outro lote) entrava como importável e podia ser confirmado | Corrigido: o cancelamento já processado pela SEFAZ num envio anterior é aplicado ao documento novo; cancelamento de documento que ainda não existe fica processado, com o aviso na tela do log |
| 33 | Contadores do lote fora do envio atual; falha de banco ao aplicar um evento derrubava o envio; cancelamento repetido rebaixava ESTORNADO para CANCELADO; erro antigo ficava no evento reprocessado | Corrigido: item de outro lote tem o contador do próprio lote ajustado, o estorno baixa os itens confirmados do lote, o evento que falha vira FALHOU (reprocessável) sem derrubar os demais, ESTORNADO e CANCELADO não são refeitos e o erro antigo é limpo |
| 34 | Planilha: a trava da nota já importada por XML dependia da ordem do cadastro quando matriz e filial dividem o id_empresa, e descartava todas as linhas de uma nota importada só em parte | Corrigido: vale qualquer cadastro com o id; com tantos itens no XML quantas são as linhas a nota fica de fora, com menos as linhas entram com aviso |
| 35 | Planilha: formato "0,00""%""" (o % é só texto) era lido como percentual e multiplicava por 100 em silêncio | Corrigido: só o % fora de aspas, de barra invertida e de colchetes conta como percentual |
| 36 | Planilha: linha já importada com PIS, ICMS ou cClassTrib corrigidos era ignorada sem aviso; o campo ID aconselhava o número da nota, que se repete entre fornecedores | Corrigido: a conferência e o resultado contam e avisam as linhas já importadas que diferem do gravado (nada é alterado); o texto do ID manda usar a chave de acesso ou emitente + série + número + item |
| 37 | Data de emissão sem fuso (leiaute antigo, "2027-01-01") era lida como 21h de 31/12 em Brasília e mudava o ano da operação; o FCP não acompanhava o ICMS efetivo; o centavo do vICMS dava 18,18% em linha pequena | Corrigido: data sem fuso vale a hora de Brasília; vFCP ÷ valor como no ICMS; tolerância de um centavo |
| 38 | Planilha de 50 mil linhas com milhares de empresas varria a lista de empresas a cada linha (17 s de CPU) | Corrigido: empresas indexadas por ID e por CNPJ uma vez por planilha |

Registrado e não tratado neste lote: (a) o leitor de planilha não limita a descompressão de um XLSX malicioso (herdado do módulo de produtos; exige usuário autenticado e arquivo de até 60 MB); (b) o importador de XML baixa a URL que o cliente manda em `file_url` sem validar a origem (SSRF autenticado, já existia antes; tarefa aberta à parte); (c) o catálogo de CFOP local tem uma linha só, então todo CFOP fora dela gera o alerta "não localizado" (comportamento antigo, vale para NF-e e CT-e). (d) o ano da operação vale pela hora de Brasília: uma nota emitida entre 23h e 24h locais de 31/12 em Manaus ou Rio Branco (UTC−4 e UTC−5) cai no ano seguinte; (e) a planilha não atualiza operação já importada (só avisa quando o percentual ou a classificação mudou).

## Fontes

- [Decreto 13.133/2026](https://www.planalto.gov.br/ccivil_03/_Ato2023-2026/2026/decreto/d13133.htm) (delegação ao Ministro da Fazenda das alíquotas da CBS dos combustíveis) e Portaria MF 3.074/2026 (DOU de 09/10/2026, edição 192-B, seção 1 extra B, p. 2: anexo com as alíquotas por litro e quilo)
- [LC 214/2025, texto compilado (Planalto)](https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214compilado.htm) e [LC 123/2006](https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm)
- [Decreto 12.955/2026](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2026/decreto/d12955.htm) e [Decreto 13.075/2026](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2026/decreto/d13075.htm)
- CF/1988, ADCT arts. 125 e 128 (texto compilado no Planalto, carregado na Base legal do InTAX)
- [TCU, CBS 2027](https://sites.tcu.gov.br/reforma-tributaria/visao-cbs-2027.html), [Agência Senado, 26/10](https://www12.senado.leg.br/noticias/materias/2026/10/26/reforma-tributaria-aliquota-da-cbs-avanca-nesta-semana) e [28/10](https://www12.senado.leg.br/noticias/materias/2026/10/28/reforma-tributaria-tcu-calcula-aliquota-da-cbs-em-11-3-para-2027), [Agência Câmara, 22/10](https://www.camara.leg.br/noticias/1313045-contribuicao-sobre-bens-e-servicos-entra-em-vigor-em-2027-e-novas-regulamentacoes-serao-enviadas-ao-congresso)
- [CGIBS: resoluções](https://www.cgibs.gov.br/resolucoes), [Resolução 14/2026](https://www.cgibs.gov.br/upload/arquivos/202607/31144942-resoluc-ao-cgibs-n-14-de-29-de-julho-de-2026-proposta-percentual-ibs-cgibs-2027.pdf) e [Portaria Conjunta de combustíveis](https://www.cgibs.gov.br/combustiveis-portaria-conjunta-define-como-serao-calculadas-as-aliquotas-do-ibs-e-da-cbs)
- [Portal da Conformidade Fácil: cClassTrib](https://dfe-portal.svrs.rs.gov.br/CFF/ClassificacaoTributaria)
- [Receita Federal: Simples Nacional 2027](https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/setembro/simples-nacional-2027-entenda-os-novos-prazos-e-faca-sua-escolha-com-consciencia-e-tranquilidade)
