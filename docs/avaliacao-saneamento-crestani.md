# Avaliação de produto — Saneamento de estoques com a base real da Crestani

Base: `Itens_Estoque_Crestani.xlsx` (export SAP Business One, 29.694 itens, 80 colunas). Código: `feature/saneamento-estoques` @ 2a45a79. Ambiente isolado local (backend + Postgres + MinIO), tela pelo navegador embutido em 1440×900. Cliente cadastrado com o CNPJ 03.262.185/0008-77 (Tangará da Serra/MT), ERP SAP Business One 10.0, data-base 31/10/2026, corte de movimentação 01/01/2026, última competência entregue 09/2026, Modelo FAL — Agropecuária (base Crestani) aplicado (40 regras; 36 aprovadas, F02–F05 deixadas em rascunho).

Prints: `C:\Users\ARNONL~1\AppData\Local\Temp\claude\f88c57cf231927e5\4ed04a36-7d3c-4735-b30a-78d85b3e21fa\scratchpad\aval\telas\` (citados abaixo como `telas/NN-…`).

## Resumo executivo

1. O motor roda rápido (8 camadas em 82 s para 29.694 itens), mas gera **55.275 casos em aberto, dos quais só 2.142 (3,9%) têm proposta aprovável**. Os outros 53.133 só admitem "rejeitar" ou "pedir informação", um a um (4 ações cada).
2. Quatro tipos respondem por 96% do volume e são **ruído de formato, não decisões**: limite de caracteres da unidade (28.098, causado pelo mapeamento "UNIDADE" em vez de "UN"), NCM × descrição por texto (12.464), item sem data de movimentação (8.573) e "aguardando" tributário (4.111). Agrupados por valor/NCM/grupo, viram cerca de 1.300 casos; o total cai de 55.275 para **~6.900 (−88%)**.
3. A importação do export SAP tem duas armadilhas silenciosas: a coluna de unidade sugerida é o nome ("UNIDADE", "QUILOGRAM") e **4.302 saldos vêm multiplicados por 1.000.000** (24 vira 24.000.000; 11 de 73 unificações saem com saldo de milhões no Excel).
4. O que realmente rende é pouco e está escondido: **47 decisões de finalidade por grupo cobrem 29.482 itens** e **41 casos de "sem movimentação" inativam 10.024 itens** — ambos em lote, em menos de 5 minutos. Com isso a "Entrega 1" saiu em ~40 min, porém com o relatório dizendo "334 de 57.576 casos aprovados".
5. A tela ainda mostra códigos internos (`ABREVIACAO_ESCONDE_ATRIBUTO`, `decisao: PROPOR_INATIVACAO`, `false`, `[cmwyd00v]`), a lista de casos não mostra o item, o caso de NCM não tem campo para digitar o NCM e o lote para em 200 casos e **falha em parte sem avisar** (40 aprovados, 7 "restantes" ignorados).
6. Entregáveis: o Excel liberado tem 15 MB, 97.045 linhas de pendências/histórico, 58.969 linhas de cenários "Aguardando informação", coluna "ID interno" e datas em três formatos/fusos; a política tem 43 páginas, com a tabela de abreviações repetida 13 vezes; relatório e política discordam na data da liberação (27/11 × 26/11).

## Tabela por camada

Casos = abertos depois de "Analisar" (antes das decisões). Proposta = casos com alteração aprovável (o resto só aceita rejeitar/pedir informação). Tempo = análise pela Cobertura + decisões feitas na avaliação. Notas de 1 (ruim) a 5 (bom).

| Camada | Casos | Com proposta | Decisão humana real | Em lote | Tempo medido | Prático | Visual | Fluido |
|---|---:|---:|---|---|---|:-:|:-:|:-:|
| Identificação | 0 | 0 | nenhuma | — | 5 s | 5 | 3 | 4 |
| Qualidade | 9.265 | 66 | 41 conjuntos "sem movimentação" (10.024 itens) + 9.199 casos sem proposta (8.573 sem data, 428 descrição de 1 palavra, 177 sem unidade) | 41 casos em 13 s; o resto não tem lote | 8 s + 13 s lote; 1 pedido de informação = 4 ações | 2 | 3 | 3 |
| Duplicidades | 565 | 565 (423 são "solicitar informação") | 70 consolidações, 71 apresentações, 423 pedidos | 46 de 94 exatas aprovadas em 8 s (48 ficaram fora por "solicitar informação") | 14 s + 8 s lote | 3 | 2 | 3 |
| Grupos e finalidade | 487 | 485 | **47 finalidades de grupo = 29.482 itens**; 427 itens deslocados; 11 exceções | 47 casos em 2 rodadas (180 s + 31 s; a 1ª parou em 40 sem aviso) | 6 s + 3,5 min | 4 | 3 | 2 |
| Nomes e unidades | 29.538 | 1.021 | 967 descrições fora do padrão; 27 grafias de unidade; 28.098 limites de unidade (ruído) | 200 por vez (18 s cada) → 5 rodadas para as 967 | 15 s + 18 s/lote | 1 | 2 | 2 |
| NCM | 13.605 | 0 | 616 NCM inexistentes (105 NCMs distintos), 63 ausentes; 12.464 "incompatível por texto" | nenhum (sem proposta) | 11 s | 1 | 2 | 1 |
| Tratamento tributário | 1.810 → 4.111 após finalidade | 0 | nenhuma possível sem catálogo cClassTrib (ver limitação) | — | 12 s + 8 s | 1 | 2 | 1 |
| Impacto nas obrigações | 5 (agregados) | 5 | derivado das outras camadas | — | 10 s | 3 | 2 | 3 |
| **Total** | **55.275** | **2.142** | | | | | | |

Percurso inteiro: abrir o projeto (3 telas, 6 cliques) → configuração (8 ações) → importação 3,5 min (prévia 20 s; nova prévia após corrigir o mapeamento 35–55 s; gravação ~120 s) → modelo da biblioteca 3 s → aplicar 40 regras 10,5 min (12–17 s cada; na tela, ~7 ações por regra) → 8 análises 82 s → decisões em lote ~6 min → liberar 18 s → Excel revisão 27 s (16 MB), Excel liberado 15 s (15 MB), relatório 3,7 s (4 p.), política 3,8–5 s (43 p.).

Limitação do ambiente: no banco isolado não há a tabela cClassTrib da SVRS nem a correlação NCM × anexos (a tabela NCM foi carregada do Siscomex, Resolução Gecex 926/2026). Por isso o Tratamento tributário foi avaliado só em fluxo e apresentação; o conteúdo do enquadramento não foi medido.

## Achados — (A) ajustes de interface, texto, fluxo e entregável, de baixo risco

Ordenados por impacto.

**A1. Mapeamento do export SAP sugere colunas erradas e cria 35 mil casos falsos.**
Evidência: `telas/06-importacao-mapeamento-previa.jpg`. Unidade → "Unidade de Medida de Estoque" (valores "UNIDADE", "QUILOGRAM", "METRO QUA"); a coluna "Código da Unidade de Medida" ("UN") existe no arquivo. Resultado: 28.098 casos "Acima do limite de caracteres (L01): Unidade" (7 > 6 caracteres; `telas/22-nomes-excede-limite-unidade.jpg`) e 50 casos de grafia contraditórios ("UNIDADE → UN" num grupo, "UN → UNIDADE" em outro). Estabelecimento → "Depósito Última Compra" (certeza média): se aceito, divide o mesmo item por depósito.
Impacto: metade de todos os casos do projeto nasce do mapeamento.
Proposta: em `backend/src/saneamento-estoques/importacao/mapeamento.ts` e no perfil SAP B1 do Cadastro de ERPs, preferir a coluna de código de unidade (≤ 6 caracteres) quando existirem nome e código; nunca sugerir coluna "… Última Compra/Movimentação" para Estabelecimento; em `src/components/saneamento-estoques/Importacao.jsx`, acrescentar à tabela de mapeamento a coluna "Exemplos" (3 valores da coluna escolhida) e apagar o selo "Certeza média/alta" quando o consultor troca a coluna.

**A2. Saldos do SAP lidos 1.000.000 vezes maiores.**
Evidência: item 118 "ANEL ELASTICO 9100-0345" com saldo 24.000.000 no caso de duplicidade; 4.302 itens com saldo ≥ 1.000.000 e 25.392 com zero, nenhum entre 0 e 1 milhão; Excel de unificações: 11 de 73 linhas com saldo de milhões (ex.: 12320 "CONECTOR 8 VIAS" 2.000.000). O WP da FAL já registra "9070000 = 9,07". A importação avisou só "usa ponto como separador decimal".
Impacto: saldo errado no critério "qual código fica", no "sem movimentação com saldo", no de/para e no Excel ao cliente.
Proposta: em `importacao/normalizacao.ts` / `importacao/relatorio.ts`, detectar coluna numérica em que todo valor não nulo é múltiplo de 10^6 (ou de 10^n) e mostrar na prévia um aviso com a escolha explícita "dividir por 1.000.000" (o consultor confirma; nada automático).

**A3. Códigos internos na tela e no lote.**
Evidência: coluna Tipo `ABREVIACAO_ESCONDE_ATRIBUTO`, filtro "Tipo (texto exato) Ex.: DUPLICIDADE_EXATA" (`telas/14-casos-lista-todas.jpg`); proposta com campos `decisao`, `decisoesPossiveis`, `codigos`, `descricoes`, `manter`, `consolidar` e valores `PROPOR_INATIVACAO`, `false`, `RELACIONAR_…` cortado (`telas/19-…`, `telas/20-…`); exceções do lote com `[cmwyd00v]`; "confiança media" sem acento.
Impacto: o consultor precisa digitar um código interno para mudar a decisão de uma duplicidade.
Proposta: `src/components/saneamento-estoques/logica.js` — rótulo para todo tipo de caso e campo (`ROTULO_CAMPO` completo, "Ativo: Sim/Não"); `CasoDetalhe.jsx` — `decisao` vira select com `decisoesPossiveis` rotuladas, `codigos/descricoes` viram tabela de itens, `decisoesPossiveis` some da grade; `Casos.jsx` — filtro de Tipo vira lista com rótulo e contagem; exceções do lote mostram código e descrição do item, não o id.

**A4. O lote para em 200 casos e falha em parte sem avisar.**
Evidência: finalidade de grupo — resposta `{"aprovados":40,"excecoes":[],"restantes":[7 ids]}`; a tela mostrou "40 caso(s) aprovado(s). Nenhuma exceção." e 7 grupos (22.308 itens) ficaram Propostos; foi preciso refazer a prévia e aprovar de novo (31 s). "o lote vale só para os 200 mostrados": 967 descrições = 5 rodadas; o painel do lote fica aberto com o resultado anterior quando o filtro muda; com a lista vazia aparece "Nenhum caso ainda — rode as análises" (`telas/17-…`, `telas/21-…`).
Proposta: `Casos.jsx` — repetir automaticamente enquanto houver `restantes` (ou mostrar "7 casos ficaram para a próxima rodada" com botão); lote sobre o filtro inteiro, não só o carregado (o backend já aceita até `MAX_LOTE = 2000` em `dados/casos.service.ts`); fechar o painel ao trocar filtro; estado vazio "Nenhum caso em aberto com este filtro".

**A5. Lote só aprova; 96% dos casos não têm proposta.**
Evidência: Qualidade — prévia do lote com "0 casos aprováveis, 200 exceções" (`telas/17-qualidade-lote-0-aprovaveis.jpg`); pedir informação num caso = abrir, "Pedir informação…", digitar, "Registrar pedido" (sem "ir ao próximo").
Proposta: no painel de lote (`Casos.jsx` + `dados/casos.service.ts`), as ações "Pedir informação" e "Rejeitar" com texto comum; botão "Registrar e ir ao próximo" no pedido de informação (`CasoDetalhe.jsx`).

**A6. Caso sem o item e sem campo para corrigir.**
Evidência: caso "NCM 12022090 não existe na tabela" mostra só código 2186 e NCM; a coluna "Proposta (editável)" mostra "—" sem campo (`telas/23-ncm-inexistente-sem-descricao.jpg`); "RETENTOR" sem grupo, NCM, saldo (`telas/16-…`). A lista de casos não traz código nem descrição; com o painel de detalhe aberto, Itens e Situação ficam cortadas.
Proposta: `CasoDetalhe.jsx` — bloco fixo do item (código, descrição, grupo, NCM, unidade, saldo, última movimentação) em todo caso de 1 item; o campo-alvo do tipo (NCM, descrição, unidade) sempre editável, mesmo sem proposta. `Casos.jsx` — colunas padrão Código, Descrição, Grupo, Problema, Itens, Situação; Camada só com filtro "Todas"; Origem e Parecer da IA ocultas por padrão.

**A7. Cobertura ocupa a tela e não diz o que falta.**
Evidência: 8 cartões verdes "Com dados" com 55 mil casos abertos; fica acima de todas as abas (Casos, Tabela, Versões) — `telas/15-…`, `telas/27-…`. Sem "Analisar todas": 8 cliques sequenciais. Depois de aprovar as finalidades, nada indica que o Tratamento tributário precisa ser refeito.
Proposta: `Cobertura.jsx` — uma linha compacta com "Analisar todas (na ordem)"; selo por cartão com "N casos em aberto / N aguardando"; selo "desatualizada" quando a camada de que depende mudou (finalidade → tributário, NCM → tributário); mostrar a faixa só em Configuração, Importação e Visão geral.

**A8. Aplicar o modelo exige abrir 40 regras.**
Evidência: diálogo "Depois, abra cada regra e use Aplicar e reanalisar"; uma regra na tela = abrir, rolar, Aplicar, rolar até a confirmação (abre fora da vista, no fim da página), Confirmar, Aprovar, Confirmar, Voltar; 12–17 s de processamento cada; 40 regras = 10,5 min só de servidor. "Grupos sem regra" lista os 52 grupos 4 vezes (`telas/08-…`, `telas/10-…`, `telas/11-…`).
Proposta: `diretrizes/Diretrizes.jsx` — botão "Aplicar todas as regras do modelo" com uma prévia agregada (grupos e camadas) e uma única reanálise; "Aprovar selecionadas"; confirmação do aplicar em diálogo; "Grupos sem regra" com contagem e lista expansível.

**A9. Datas, fusos e nomes inconsistentes nos entregáveis.**
Evidência: Excel "Data-base 2026-10-31", "Versão liberada em 2026-11-26", "Atividades confirmadas … em 27/11/2026"; relatório "liberada em 27/11/2026"; política "liberada em 26/11/2026"; arquivos `…_revisao_2026-11-27.xlsx` gerados às 23:50 de 26/11; política baixa como `politica-estoques-versao.pdf` (sem cliente nem versão); aprovador e responsável aparecem como `qa@sanqa.test`.
Proposta: em `entregaveis/excel.ts`, `relatorio.ts`, `politica/pdf.ts` e no nome do arquivo (`entregaveis.controller.ts`), uma função única de data em America/Sao_Paulo e formato dd/mm/aaaa; nome do usuário no lugar do e-mail; nome da política `politica-estoques_<cliente>_v<n>.pdf`.

**A10. Excel liberado: sobra o que o cliente não usa.**
Evidência (Entrega 1): Cadastro saneado com "ID interno" e "Estabelecimento" vazio; "Camadas a revisar = Impacto nas obrigações" em 28.780 itens; Cenários tributários com 58.969 linhas, 58.766 "Aguardando informação" e uma linha "Devolução" por item (29.275); Pendências e histórico com 97.045 linhas (57.241 pendências, das quais 28.098 de limite de unidade); Resumo com "30440" sem separador e "Cobertura (analisados) = 1"; tipo "Descricao fora padrao" sem acento.
Proposta: `entregaveis/excel.ts` / `modelo.ts` — na versão liberada, tirar "ID interno" e colunas totalmente vazias; Cenários só com linhas enquadradas (as aguardando vão a uma contagem no Resumo); pendências agrupadas por tipo e grupo; percentuais e milhares formatados; rótulos com acento a partir do mesmo dicionário da tela.

**A11. Relatório de fechamento conta casos, não resultado.**
Evidência: "334 casos aprovados de 57.576", "Ficam pendentes 57.241 casos"; 1,5 página de restrições do SAP com URLs quebradas em 8 linhas.
Proposta: `entregaveis/relatorio.ts` — abrir com o resultado em itens ("10.024 itens a inativar, 46 unificações, finalidade definida para 29.482 itens, 200 descrições padronizadas") e as pendências em itens e por tipo; restrições do ERP em anexo resumido (fonte como link curto).

**A12. Política com 43 páginas.**
Evidência: "2.1 Padrão de nomes" ocupa as páginas 1–17; a tabela "ABREVIAÇÕES APROVADAS" aparece 13 vezes (uma por regra N01–N13); o quadro por grupo (o que o almoxarifado consulta) está na página 40.
Proposta: `entregaveis/politica/pdf.ts` / `topicos.ts` — tabela de abreviações e de termos uma vez só (anexo), regras mostrando só o que difere da N01; quadro de consulta por grupo logo após a Identificação.

**A13. Unificações mistura 10.024 inativações com 73 unificações.**
Evidência: aba com 10.591 linhas, 17 colunas, abre nas inativações (`telas/26-unificacoes.jpg`); texto "Cada linha é um código que deixa de existir" com o filtro "Equivalência (nenhum código morre) (494)"; unificação com saldo 0 nos dois códigos recebe a ação "Saída (OIGE) … entrada (OIGN) … depois inativar"; 23 unificações em conflito com inativação aprovada do código que fica.
Proposta: `Unificacoes.jsx` e `entregaveis/unificacoes.ts` — três listas (Unificações, Inativações, Equivalências), cada uma com as colunas que usa; com saldo 0, ação "Inativar o código que sai"; no lote, recusar como exceção a aprovação que cria conflito unificação × inativação (mostrando o par).

**A14. Visão geral e Tabela não priorizam.**
Evidência: matriz de 52 grupos × 8 camadas quase toda laranja "Proposto", sem totais, com rolagem horizontal (`telas/13-visao-geral-matriz.jpg`); Tabela ordena código como texto (10, 100, 1000, 10000…) e mantém "Estabelec." vazio (`telas/24-tabela-unica.jpg`).
Proposta: `VisaoGeral.jsx` — linha de totais, grupos ordenados por itens, cor só para o que exige ação (pendente/aguardando), "proposto" neutro, primeira coluna fixa; `TabelaUnica.jsx` — ordenação numérica quando o código é numérico; ocultar Estabelec. com estabelecimento único.

**A15. Entrada e Configuração com passos e textos que sobram.**
Evidência: Carteira → projeto → "Abrir o Saneamento…" → "Abrir o saneamento deste projeto" (`telas/01-…`, `telas/02-…`); "Módulos opcionais: a desenvolver" (3 linhas desligadas); ERP "Outro ERP (sem perfil) (perfil a desenvolver)"; CNAE 5250-8/04 "sem atividade correspondente" havendo "Transporte de cargas"; origem "CNPJprincipal" colada; após importar não há "próximo passo".
Proposta: criar o projeto de saneamento ao abrir o serviço (sem a tela intermediária); esconder módulos não disponíveis; corrigir o rótulo do ERP genérico; mapear 52.50-8 para Transporte de cargas/Armazenagem; botão "Ir para Diretrizes" no fim da importação (`Configuracao.jsx`, `Importacao.jsx`, `SaneamentoEstoquesPagina.jsx`).

**A16. Liberar versão sem dizer o que vai.**
Evidência: diálogo "Guarda uma foto da base como está agora" — liberou com 53.129 casos abertos sem mostrar a conta.
Proposta: `Versoes.jsx` — no diálogo, "Entram: N aprovados (itens inativados, unificados, finalidade…). Ficam fora: N pendentes, N aguardando informação".

## Achados — (B) decisões de produto e regra de negócio

**B1. Agrupar casos repetitivos (menos é mais).** Hoje um caso por item em quatro tipos de formato. Agrupando: limite de unidade por valor (28.098 → 7), sem data de movimentação por grupo (8.573 → 49, ou 1 parâmetro do projeto), NCM incompatível por NCM (12.464 → 1.171), NCM inexistente por NCM (616 → 105). Total aberto: 55.275 → ~6.900. Decidir se "NCM × descrição por texto" deve ser caso ou só indicador na Tabela (nenhuma proposta, 42% da base, linguagem de peças "Outras partes" não casa por palavra).

**B2. Item sem data de movimentação.** No SAP, sem data = sem movimento desde a implantação (o WP PSE.01 já trata assim, "confirmar"). Decidir um parâmetro na Configuração ("sem data conta como sem movimentação desde a implantação: sim/não") que leve esses itens ao mesmo conjunto de inativação.

**B3. Unidade no SAP.** A UdM de estoque não muda depois de transações (restrição confirmada exibida pelo próprio InTAX). Decidir se o padrão de unidade é o código (UN/KG/L) e se a camada deve propor troca de grafia em item com movimento (hoje propõe para 2.830 itens "UNIDADE → UN", cuja execução exige item novo + transferência).

**B4. Ordem de trabalho guiada.** O que rende é finalidade por grupo (47 decisões → 29.482 itens) e inativação (41 → 10.024); NCM e Tributário dependem dela. Decidir um roteiro fixo: 1) finalidade por grupo, 2) inativação, 3) duplicidades com saldo, 4) NCM inexistente/ausente, 5) tributário, 6) nomes (opcional por grupo). As abas e a Cobertura seguiriam essa ordem.

**B5. O que é "pronto para entregar".** A Entrega 1 saiu com 57.241 pendências. Decidir o critério mínimo (ex.: finalidade de todos os grupos, inativações e duplicidades com saldo decididas) e transformar os casos sem proposta em uma **lista de solicitações ao cliente** (por tipo e grupo), no lugar das 57 mil linhas de pendência.

**B6. Apresentações distintas.** "REFRIGERANTE COCA COLA 2L / 310ML / 2,5L / 500ML / 1,5L / 220ML" virou "relacionar apresentações por conversão" (71 casos). Volumes diferentes de consumo são produtos distintos. Decidir o padrão: para uso e consumo, "manter distintos"; relacionar só quando o mesmo produto muda de embalagem de compra.

**B7. Estilo "unidade colada ao número".** A regra N06 cola número e unidade ("8 MM" → "8MM") e erra em "BROCA 11.5 HP PRO" → "11.5HP", "9/16 POL" → "9/16POL". Decidir o padrão (espaço ou colado) e uma lista de siglas que não são unidade.

**B8. Conflito unificação × inativação.** Aprovar em lote "sem movimentação" e duplicidades gerou 23 unificações cujo código que fica também será inativado. Decidir a precedência (sugestão: o código que fica sai da inativação automaticamente, com registro).

**B9. Cenários tributários na entrega.** Uma linha de "Devolução" por item e linhas "Aguardando" para todo item sem enquadramento. Decidir se a aba vai ao cliente só com enquadramentos concluídos, e se "Devolução" entra só quando difere da aquisição. Observação: depois de aprovar as finalidades, 1.843 casos "aguardando finalidade" continuaram abertos e a aba mostra "Finalidade: Manutenção · Aguardando informação: finalidade" — confirmar se a reanálise deve encerrar os casos antigos.

**B10. Itens deslocados de grupo.** 427 sugestões, a maioria coerente (filtro em manutenção → FILTROS), algumas por uma palavra ("ROLAMENTO … S/ BLINDAGEM" → manutenção). Como os dois grupos têm a mesma finalidade, decidir se o deslocamento entre grupos de mesma finalidade vira caso ou só sugestão na Tabela.
