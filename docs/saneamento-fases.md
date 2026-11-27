# Saneamento em fases (plano aprovado em 27/11/2026)

Reorganiza o serviço "Saneamento de estoques" em **Fase 1 (Saneamento)**, **Fase 2 (Tributário e Reforma)** e **Fechamento**. Reaproveita as camadas,
os casos, as versões e os entregáveis que existem; nada é recriado.

## Objetivo e medida

| Fase | Objetivo | Medida |
|---|---|---|
| 1 | Cadastro de estoque sem itens mortos, sem duplicados, organizado e padronizado, executado no ERP: base única da Fase 2 | % de itens saneados (definição abaixo); ações entregues ao ERP e marcadas como executadas |
| 2 | Cada item × operação com IBS/CBS (cClassTrib, CST, fundamento) e o crédito do estoque de transição | % da matriz aprovada; notas de homologação sem divergência na calculadora oficial da RFB |
| Fechamento | Entrega consolidada e auditável | — |

**Item saneado (Fase 1):** ativo com movimento (ou inativado sem saldo); sem duplicado (ou no mapa de unificação com destino e saldo); grupo válido; descrição
e unidade no padrão das Diretrizes e dentro do limite; NCM existente e vigente.

## Fase 1 — Saneamento de estoques (ordem obrigatória)

1. **Preparar** — ERP, data-base, corte de movimentação, última escrituração entregue, importação. **Sem trava de atividades (CNAE).**
2. **Identificação** — códigos e formatos.
3. **Qualidade** — sem movimento (sem saldo: inativar; com saldo: regularizar), saldos, campos, descrição insuficiente, atributo ausente.
4. **Duplicidades** — mapa de unificações (código que morre, que fica, saldo, 0205).
5. **Grupos** — grafias, genéricos, sobrepostos, deslocados, sem grupo, novo grupo. (A finalidade sai daqui.)
6. **Nomes e unidades** — Diretrizes: Nomes, Atributos, Unidades, Limites.
7. **Validar NCM** — só ausente, formato, zeros, inexistente ou não vigente (Siscomex).
8. **SPED do saneamento** — 0200, 0205, H010 de inativação, unificação e troca de unidade.
9. **Ações no ERP** — lista de ações com a marca "executado".

**Liberação:** versão "Cadastro saneado". Entregáveis: lista de ações ao ERP, política (cadastro + controles internos), relatório da Fase 1, base antes × depois.
IA na Fase 1: só no caso; nenhum parecer legal.

## Fase 2 — Tributário e Reforma

Entrada: Fase 1 liberada **e** regime do cliente informado.

1. **Premissas** — regime do cliente (obrigatório), atividades (CNAE), participantes (opcional, premissa padrão escrita). Lista A (LC 214):
   regime regular (arts. 21 e 41); Simples recolhendo no Simples (art. 47 §9º); Simples no regime regular (art. 41 §3º); produtor rural não contribuinte
   (art. 164; crédito presumido do adquirente art. 168); produtor rural contribuinte por opção (art. 165); transportador autônomo PF (art. 169);
   PF vendedora de bem usado (art. 171); coletor de resíduos (art. 170); não contribuintes do art. 26; exterior (arts. 79 a 82); administração pública
   (arts. 370 e 473). Zona Franca (a partir do art. 444) é local da operação, não participante.
2. **Finalidade** — tipo do item do registro 0200 da EFD (00 a 10 e 99; reconferir no Guia Prático 3.2.4) com marcadores da lei: uso ou consumo pessoal
   (art. 57), conta para o crédito do estoque (art. 381 §1º), imobilizado (art. 47 §7º), de terceiros (indicador de propriedade do H010).
3. **NCM** — reclassificação (incompatível com a descrição, informação insuficiente, divergente entre itens iguais).
4. **Operações** — CFOP agrupado por natureza; vínculo com o ERP (Utilização no SAP B1, TES no Protheus).
5. **Tratamento** — matriz operação × participante × NCM × tipo do item → cClassTrib, CST, fundamento (tabela SVRS/RFB).
6. **Crédito do estoque** — crédito do estoque de transição (LC 214 art. 381; Decreto 12.955 arts. 605 a 611).
7. **SPED tributário** — reflexos do tratamento.

**Liberação:** versão "Tributário aprovado".

## Fechamento

Base final antes × depois (todas as colunas do ERP, célula ajustada pintada, coluna "camada que alterou", Padrão FAL); homologação pela calculadora
oficial da RFB (quando a Fase 2 foi contratada); relatórios e política (cadastro + controles internos + seção fiscal); parecer de IA que lê só decisões
aprovadas; lista de solicitações ao cliente.

## De-para da finalidade atual → tipo do item (0200)

| Atual | Tipo | Marcador |
|---|---|---|
| Revenda | 00 | — |
| Matéria-prima | 01 | — |
| Embalagem | 02 | — |
| Uso e consumo | 07 | — |
| Manutenção | 07 | manutenção |
| Imobilizado | 08 | imobilizado |
| Insumo de produção | 10 | — |
| Material de terceiros | pela natureza do item | de terceiros |

## Funcionalidades

- Fases com trava e liberação por fase; Cobertura agrupada por fase; "Analisar a etapa" em segundo plano (servidor).
- Agrupamento de casos repetitivos (pré-requisito da planilha).
- Planilha de decisão por camada: ida e volta, decisão por caso (Aprovar, Rejeitar, Pedir informação), motivo, valor corrigido revalidado, prévia,
  recusa de linha velha (versão do caso), auditoria (quem, quando, arquivo).
- Base antes × depois pintada; lista de ações ao ERP com "executado".
- Botão "Roteiro do projeto": desenho das fases com a situação real de cada etapa, modo apresentação (sem números internos), detalhe por etapa (o que
  é feito, o que o cliente fornece, o que recebe) e PDF no Padrão FAL.
- Listas oficiais como seleção (Lista A, tipo do item, CFOP, cClassTrib).
- Parecer de IA só no Fechamento.

## Ordem de implementação

1. Fases e travas (CNAE para a Fase 2, Cobertura por fase, liberação por fase).
2. Agrupamento de casos repetitivos.
3. Planilha de decisão por camada.
4. Base antes × depois e ações ao ERP com "executado".
5. Botão "Roteiro do projeto".
6. Fase 2: premissas, listas oficiais, tipo do item (migração da finalidade).
7. Operações, tratamento por operação e crédito do estoque.
8. Fechamento (parecer de IA, homologação).

Etapas 1 a 5 entregam a Fase 1.

## Riscos aceitos e tratados

- Prazo do crédito do estoque (posição de 31/12/2026): recorte de urgência — duplicidades e valoração dos itens com saldo antes da virada.
- Migração da finalidade: quebra motor, regras, cenários, Excel, testes e projetos salvos — exige de-para e migração de dados.
- "Executado no ERP" depende da confirmação do cliente.
- Não confirmado: percentuais de 2027 do crédito presumido (arts. 168 e 169); percentual do crédito do estoque; tabela do tipo do item no Guia 3.2.4.

## Contrato técnico (onda 1 — todos os agentes seguem isto)

### Camadas (chaves em `tipos.ts` CAMADAS e espelho em `src/components/saneamento-estoques/logica.js`)

Ordem: IDENTIFICACAO, QUALIDADE, DUPLICIDADE, GRUPOS_FINALIDADE, NOMES_UNIDADES, NCM, ESTOQUE, FINALIDADE, NCM_CLASSIFICACAO, TRIBUTARIO, OBRIGACOES.

| Chave | Rótulo | Fase | Tipos de caso |
|---|---|---|---|
| GRUPOS_FINALIDADE (chave mantida, sem migrar) | Grupos | 1 | só os de grupo (GRUPO_*, ITEM_DESLOCADO, ITEM_SEM_GRUPO, NECESSIDADE_NOVO_GRUPO) |
| NCM | Validar NCM | 1 | NCM_AUSENTE, NCM_PREENCHIMENTO_INVALIDO, NCM_FORMATO, NCM_INEXISTENTE, NCM_NAO_VIGENTE, NCM_CLASSIFICACAO_ANTIGA |
| FINALIDADE (nova) | Finalidade | 2 | FINALIDADE_GRUPO, FINALIDADE_EXCECAO |
| NCM_CLASSIFICACAO (nova) | Classificação NCM | 2 | NCM_INFO_INSUFICIENTE, NCM_INCOMPATIVEL_DESCRICAO, NCM_DIVERGENTE_ENTRE_ITENS_IGUAIS |
| OBRIGACOES | Impacto no SPED | 1 e 2 | sem mudança (roda no fim de cada fase) |
| ESTOQUE (módulo conciliação) | Estoque | 1 | sem mudança |

`FASES` (backend `dados/constantes.ts`, espelho no front): `FASE1 = [IDENTIFICACAO, QUALIDADE, DUPLICIDADE, GRUPOS_FINALIDADE, NOMES_UNIDADES, NCM, ESTOQUE, OBRIGACOES]`,
`FASE2 = [FINALIDADE, NCM_CLASSIFICACAO, TRIBUTARIO, OBRIGACOES]` (filtradas por `camadasAtivas`). `faseDaCamada(c)` devolve a primeira fase que a contém.

### Travas
- Importação e camadas da Fase 1: **sem trava** de atividades.
- Camadas FINALIDADE, NCM_CLASSIFICACAO e TRIBUTARIO (e gravação de casos delas): exigem, nesta ordem, (1) versão liberada com `resumo.fase = 'FASE1'`
  → erro 400 `codigo: 'FASE1_NAO_LIBERADA'`; (2) `parametros.regimeCliente` preenchido → `REGIME_NAO_INFORMADO`; (3) atividades confirmadas →
  `ATIVIDADES_NAO_CONFIRMADAS` (o código que já existe). OBRIGACOES roda sem trava.
- `CAMADAS_DAS_ATIVIDADES = ['FINALIDADE','TRIBUTARIO']`. `DEPENDENCIAS.TRIBUTARIO` lê FINALIDADE (finalidade, tambemUsadoComo), NCM e NCM_CLASSIFICACAO (ncm).

### Regime do cliente (Fase 2, obrigatório)
`parametros.regimeCliente` ∈ `REGIMES_CLIENTE` (backend `fiscal/regimes.ts`, espelho no front), cada um com `{codigo, rotulo, fundamento}`:
REGULAR (LC 214 arts. 21 e 41), SIMPLES_NO_SIMPLES (art. 47 §9º), SIMPLES_REGULAR (art. 41 §3º), PRODUTOR_RURAL_NAO_CONTRIBUINTE (art. 164),
PRODUTOR_RURAL_CONTRIBUINTE (art. 165). Gravado pelo PUT de configuração existente (campo `regimeCliente`, validado contra a lista).

### Versões por fase
POST de versão aceita `fase: 'FASE1' | 'FASE2'` (opcional; gravada em `resumo.fase`). FASE2 exige uma FASE1 liberada antes (`FASE1_NAO_LIBERADA`).
Nova rota `GET projetos/:id/fases` → `{ fases: [{ fase: 'FASE1'|'FASE2', camadas: [...], liberada: {versaoId, numero, em} | null,
bloqueio: {codigo, mensagem} | null }] }`.

### Migração (no boot, idempotente, como o preenchimento de células do ESTOQUE)
Casos FINALIDADE_GRUPO/FINALIDADE_EXCECAO de GRUPOS_FINALIDADE → camada FINALIDADE; NCM_INFO_INSUFICIENTE/NCM_INCOMPATIVEL_DESCRICAO/
NCM_DIVERGENTE_ENTRE_ITENS_IGUAIS de NCM → NCM_CLASSIFICACAO; recalcula `chave`; move as células cujo `caso_id` aponta para esses casos; cria as
células que faltarem das camadas novas para todos os itens. Fotos de versões antigas ficam como estão: leitores aceitam as duas camadas.
