# Auditoria da implantação: calculadora oficial da Receita no InTAX

Implantação de 18/11/2026. Fonte oficial: repositório `ReceitaFederal/calculadora-rtc-regime-regular` (commit `150cccb`, versão 1.6.1, banco `V0059` de 30/09/2026, licença MIT), publicado pela Portaria Cotec nº 342/2026. Estudo prévio: `docs/estudo-calculadora-oficial-rfb.md`.

## 1. O que foi instalado (tudo no ar, commits na `main`)

| Peça | Onde | Commit |
|---|---|---|
| Correção das tabelas e do motor achadas na conferência (Fase 0) | correlação NCM × anexos, `taxEngine.js`, `TransicaoAno`, `ClassTrib` | `1fef494` |
| Serviço da calculadora (Java, só rede interna, 768 MB), tabelas oficiais copiadas, conferência semanal do GitHub, bateria de 808 casos, atualização pelo administrador | `docker-compose.calculadora-rfb.yml`, `calculadora-rfb/`, `backend/src/calculadora-rfb/`, `scripts/calculadora-rfb-atualizar.sh` | `7194e44`, `a25b26a` |
| Auditoria do IBS/CBS de cada NF-e (aba Divergências IBS/CBS) | `backend/src/auditoria-ibscbs/`, aba no Repositório de XML | `15a9b78`, `ae1db32` |
| Homologação fiscal do ERP (laudo por cenário) | `laudo.ts`, projeto de Consultoria | `d367e4b` |
| Comparação contínua das tabelas e selo de conferência na operação | `comparar-tabelas.ts`, `conferir-operacao.ts`, `ConferenciaOficial.jsx` | `e341edc`, `7b4605a` |
| Anexo XII e notação do Anexo XV | migração `20261118180000` | `73e1959`, `da8bca9` |
| Script desta auditoria | `backend/scripts/auditoria-implantacao-calculadora-rfb.mjs` | `b7d953f` |

Serviços em produção ao final: `reforma-backend`, `reforma-frontend` e `reforma-calculadora-rfb` saudáveis; o backup do banco foi feito antes de cada deploy (9 backups em 18/11). Migrações aplicadas: `20261118120000`, `…140000`, `…160000`, `…180000`.

## 2. Verificação em produção (script repetível, 10 de 10 OK)

`docker exec reforma-backend node scripts/auditoria-implantacao-calculadora-rfb.mjs`

| Verificação | Resultado |
|---|---|
| Serviço responde, versão travada | 1.6.1 · banco V0059 · commit 150cccb |
| Banco oficial publicado | 5.496.832 bytes |
| Tabelas oficiais no InTAX, versão igual à do serviço | 193 classificações e 1.490 vínculos NCM/NBS |
| Bateria de conferência | 808 casos fotografados (base do art. 12 de 2026 a 2033 e 792 itens, 99 cClassTrib × 8 anos); a mesma versão contra si mesma: 0 diferenças |
| Correlação NCM × anexos | 40 exceções (33 + 7 do Anexo XII), 0 códigos largos demais, 0 NBS gravadas como NCM |
| 2026 | IBS-UF 0,1% / município 0 (LC 214, art. 343); 220001–3 com fim de vigência |
| Auditoria das notas | 313 de 313 NF-e de 2026 conferidas, 0 órfãs |
| Conferência de operação | 2029: base 838,00 · CBS 77,18 · IBS 15,67 (igual ao motor) |
| Comparação das tabelas | gravada com a regra nova |
| Integridade | 0 duplicidades na correlação |

## 3. O que a conferência achou de errado no InTAX (e foi corrigido)

Régua: tabela cClassTrib do Portal da Conformidade Fácil (SVRS, v1.71) > texto da LC 214 > calculadora oficial. A calculadora nunca sobrescreveu uma tabela do InTAX.

| # | Achado | Prova | Correção |
|---|---|---|---|
| 1 | 33 códigos que a lei **exclui** ("exceto…") estavam como inclusão na correlação NCM × anexo (Anexos I, IV, VII, XII, XV) | texto do item da LC 214 e exceções da calculadora | marcados como exceção; `ncm-classe.ts` passa a respeitá-las |
| 2 | 7 códigos ainda mais: Anexo XII item 1.3 (9018.14.10/20/90, 9018.19.10/20) e item 11 (9022.21.10/20). **A calculadora oficial não registra essas exceções**; só a leitura do texto da lei as mostra | texto do Anexo XII | marcados como exceção (migração `…180000`) |
| 3 | 7 prefixos largos demais (0210.99, 1302.19, 3507.90, 9018.39, 9018.49, 9027.90) | texto dos itens | estreitados ao texto da lei |
| 4 | 12 linhas do Anexo IX, itens 22 a 31 (serviços, identificados por NBS) gravadas como NCM | texto do Anexo IX | removidas |
| 5 | O Anexo VII não cedia ao Anexo I ("ressalvados os produtos relacionados no Anexo I") | texto dos itens 4, 5, 6, 14 e 15 | ressalva implementada |
| 6 | Motor: CST 510/515 (diferimento) e 550 (suspensão) cobravam IBS/CBS cheios; cClassTrib 222001 sem a base pela metade; 2026 sem o IBS estadual de 0,1% | calculadora oficial e LC 214 arts. 138 §2º e 343 | motor corrigido, com testes |
| 7 | cClassTrib 220001–3 sem fim de vigência | tabela SVRS (fim 01/01/2026) | vigência encerrada |
| 8 | Notação 07.02.00 → 0702.00.00 (Anexo XV item 2) | texto do item | corrigida |

Resultado da comparação do cálculo do motor com a calculadora oficial (99 cClassTrib × 8 anos): antes das correções, 225 itens divergiam; depois, 1 (cClassTrib 221001, locação com alíquota sobre a receita bruta, só em 2026: a calculadora devolve valores próprios, CBS 32,85 e IBS 3,65 por R$ 1.000, e o motor aplica a alíquota padrão do ano). **Esse caso não foi corrigido**: depende do art. 487 da LC 214, que não foi conferido, e a calculadora marca essa classificação como dado simulado. Está registrado aqui, não escondido.

## 4. O que a auditoria das notas já mostra (dados reais, sem identificar cliente)

313 NF-e de 2026 do repositório conferidas pela regra atual: 176 conferem, 94 sem grupo IBS/CBS, 19 com valor divergente, 15 com enquadramento incorreto e 9 fora do alcance da calculadora. Padrões: (a) ERP que calcula a base igual ao valor do produto, sem tirar PIS e Cofins em 2026 (art. 12 da LC 214); (b) NCM desativado (3808.30.22, que não existe nem no Siscomex do InTAX nem na calculadora) em notas de entrada; (c) crédito presumido (cClassTrib 620006) que a calculadora ainda não calcula.

As 313 notas são todas de captura da SEFAZ (notas **recebidas**). Para a homologação de um ERP é preciso ter as notas **emitidas** pelo cliente no repositório (importação por arquivo ou ZIP); sem elas o laudo mostra "nenhuma nota emitida conferida" e explica o que fazer.

## 5. Testes

| Suíte | Resultado |
|---|---|
| Frontend (`vitest`, 102 arquivos) | 1.106 testes: passam todos |
| Backend em lotes | 1.426 passam, 2 pulados e 11 falham, todos de leitura de planilha Excel (`operacoes-planilha`, `produtos/leitura-planilha`, `produtos.service.test`), módulos que **não foram alterados** (0 arquivos mudaram nessas pastas) |
| Esses mesmos arquivos no Linux de produção | 226 de 226 passam |
| Build do frontend | OK |
| Verificação de tipos do backend | OK |

As 11 falhas são do Windows desta máquina (a memória do projeto já registrava, em 11/11, que esses testes falham de forma intermitente aqui). A primeira tentativa de rodar a suíte inteira do backend caiu por falta de memória do PC (código 139) e foi refeita em lotes menores.

## 6. Revisão independente

Duas revisões feitas por outro agente, só leitura: a primeira (correções da Fase 0) não achou erro grave e levantou 9 pontos, tratados (estorno que espelhava campos novos, combustível com CST de diferimento, parâmetro sem uso). A segunda cobre as Fases 1 a 4; seus achados e o tratamento estão na seção 8.

## 7. O que NÃO foi feito, e por quê (decisões, não esquecimentos)

| Item | Decisão |
|---|---|
| Trocar o gerador de DANFSe pelo oficial (Go) | **Não trocado.** O InTAX já gera o DANFSe v2.0 da NT 008/2026 (o mesmo leiaute); trocar um gerador que funciona por outro exigiria mais um serviço e uma comparação PDF a PDF, para ganho só de manutenção. Fica como opção futura |
| Regras do Simples (NT 2026.005) no motor | **Não incorporadas.** A calculadora do Simples não calcula alíquota efetiva, DAS, regime híbrido nem o crédito de quem compra; o que ela traz (tipos de receita e atividades) é para o grupo do documento de quem emite no Simples. O comparativo Simples × Híbrido do InTAX continua como está |
| Imposto Seletivo, crédito presumido, monofásicos, ZFM | A calculadora oficial ainda não calcula (CAL-007, `NAO_IMPLEMENTADO`). Ficam como "Conferir à parte" e continuam só no motor do InTAX |
| Alíquotas de 2027 em diante | A calculadora exige que quem chama informe; o InTAX informa as do cenário escolhido. A conferência vale para a regra e a conta, não para a alíquota |
| Município na conferência da operação | Usa um município de referência (a calculadora não tem alíquota própria de UF/município) |
| Produtor rural Pessoa Física na homologação | O repositório de XML guarda só notas de empresa; o laudo ainda não se aplica |
| Pedidos "vínculo da calculadora ausente no InTAX" (637) | Informativo: são classes que o InTAX não sugere por NCM porque dependem de quem compra ou da destinação (200005 e 515001 são irmãs de 200030 e 200038; Anexos VI e XI), como já documentado em `completar-correlacao-anexos.js`. Decisão de incluir algum fica com o especialista |

## 8. Riscos residuais e como voltar atrás

- A API da calculadora não tem autenticação: só existe na rede interna do Docker, sem porta publicada nem rota no Traefik.
- Atualização da calculadora: só entra pelo botão "Aplicar versão nova" (admin), depois da bateria de 808 casos; se a versão nova não montar ou não responder, a anterior continua.
- Rollback: `CALCULADORA_RFB_COMMIT` no `.env` + `docker compose … up -d --build calculadora-rfb`; migrações são aditivas (tabelas novas, uma coluna `excecao` com padrão `false`, e UPDATEs idempotentes nos dados corrigidos). Os backups do banco de 18/11 estão em `/var/backups/simulador-reforma/`.
- Deploy: o arquivo `docker-compose.calculadora-rfb.yml` passa a entrar **sempre** no comando (sem ele o backend perde os volumes da calculadora).
- Pasta de estudo local `Desktop\estudo-calculadora-rfb` (cópia dos três repositórios, 22 MB, nada rodou dela) pode ser apagada.
