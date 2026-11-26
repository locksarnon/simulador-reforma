# Saneamento de Estoques e Cadastro de Produtos — plano (versão para revisão)

Serviço da Consultoria Tributária do InTAX. Este documento é o contrato: o que será feito, como, e o que fica de fora.
Princípios: **menos é mais**; **trabalho por conjunto, resultado por item**; **a IA propõe, o consultor decide**; **tudo rastreável**; **uma entrega, um deploy**.

## 1. Decisões fechadas

| # | Decisão |
|---|---|
| 1 | Projeto **novo, do zero**, ligado ao serviço "Saneamento de estoques com foco em IBS e CBS" (já no catálogo, por **data-base**). O saneamento atual da Crestani **não é apagado**: fica guardado até o usuário excluir. |
| 2 | Reaproveita-se a **lógica de análise já testada** (unidades, identidade, conjuntos, fiscal, checagens); troca-se o armazenamento (hoje um JSON único por projeto) por **tabelas próprias**. |
| 3 | Tela principal: **tabela única** (produto × camadas) + **visão geral** por grupo de produtos (situação de cada camada), que abre os casos ao clicar. |
| 4 | **5 situações** por célula: Pendente · Sem problema · Proposto · Aprovado · Aguardando informação. "Revisão necessária" é uma **marca** (não uma situação). |
| 5 | **Dois conceitos** de guarda: *decisão salva* (rascunho até aprovar) e *versão liberada* (foto da base). |
| 6 | **Finalidade** (lista fechada de 8) e **Enquadramento legal** (texto da lei + artigo) são colunas no entregável. O trabalho é por conjunto (mesmo NCM + mesma finalidade); o resultado e a exportação são **por item**, com "herdado" ou "exceção". |
| 7 | Cenários tributários: só **4** (compra para revenda, venda, uso e consumo, devolução). Outro cenário = acrescentar coluna. |
| 8 | **Atividades do cliente** vêm do CNPJ (CNAE principal e secundários), editáveis, com **trava**: sem confirmação do consultor não há importação nem análise. PF pura: lista marcada à mão. Sintegra fica fora. |
| 9 | Impacto no SPED = **checklist por tipo de ajuste**, com **aba própria** no Excel e seção no relatório. |
| 10 | **Plano de ajustes** não é tela própria: é um filtro dos casos abertos. |
| 11 | Entregáveis: **Excel com 6 abas** + **relatório de fechamento em PDF** (padrão FAL/InTAX). |
| 12 | **Módulos opcionais** (conciliação de estoque, Blocos K/G, arquivo para o ERP): interruptores na configuração, **desligados por padrão**, com "i" explicando o que é, que dados exige e o que muda. |
| 13 | **IA na borda**: onde a regra não decide, devolve um parecer curto; o consultor aprova. Motor: Claude Fable pela ponte da VPS (Gemini de reserva). |

**Decisão pendente (1):** o que os módulos opcionais fazem **nesta** entrega.
- *Recomendado:* o interruptor, as solicitações de documentos, as pendências e as seções do relatório entram agora; o motor de conciliação e o arquivo para o ERP ficam sinalizados como "a desenvolver" e **não aparecem como ligáveis** até existirem (nada de interruptor que não faz nada).
- *Alternativa:* conciliação simples (saldo inicial + entradas − saídas × saldo final, por item) já nesta entrega. Exige saldo inicial, movimentação e saldo final na importação; a Crestani hoje não tem movimentação.

## 2. Abertura e configuração

Caminho: Consultoria → Carteira → cliente → Novo projeto → *Saneamento de estoques com foco em IBS e CBS* → **Data-base**.

Configuração (uma tela, na ordem):
1. **Cliente** (já vem do projeto), público PF/PJ.
2. **ERP e versão** (ex.: SAP Business One) e **estabelecimentos** (opcional; vazio = um só).
3. **Atividades do cliente** — preenchidas pelo CNPJ (CNAE principal e secundários → atividades). Para cada uma: manter ou excluir; acrescentar as que faltam; mínimo de uma. Botão **"Confirmo as atividades"** (registra quem e quando). **Sem isso, importação e análises ficam bloqueadas.** Se o CNPJ mudar depois, aviso "revisar atividades", sem bloquear o que já foi feito. Reabrir marca como "revisar" as sugestões dependentes, sem apagar decisões.
4. **Responsável.**
5. **Módulos opcionais** (desligados), cada um com "i".

Sem campo De/Até. O **corte de movimentação** fica na Configuração: item ativo sem movimento desde o corte é candidato a inativação na Qualidade (sem saldo propõe inativar; com saldo pede regularizar antes). Quem morre e para onde vai fica na aba **Unificações** (contrato, 7ª etapa).

## 3. Importação e base

- Reconhece e mapeia colunas; **prévia** antes de confirmar; relatório de linhas **aceitas, rejeitadas e pendentes**; registra arquivo, usuário, data e mapeamento.
- Preserva **zeros à esquerda** e identificadores. Coluna opcional **"Finalidade"** é mapeada se vier.
- Cada linha ganha **identificador estável** (chave = código + estabelecimento), ligado ao arquivo e à linha de origem.
- Camadas de dado: **original** (imutável) → **de trabalho** → **decisões** (por campo: antes, depois, fundamento, quem, quando) → **versões liberadas**.
- **Reimportação:** mostra diferenças e conflitos antes de incorporar; preserva decisões e rascunhos.
- **Concorrência:** bloqueio otimista por versão; a segunda gravação conflitante recebe aviso, nunca sobrescreve em silêncio.

## 4. As camadas (colunas da tabela única)

Identificação · Qualidade · Duplicidades · Grupos e finalidade · Nomes e unidades · Classificação (NCM) · Tratamento tributário · Estoque *(só se o módulo estiver ligado)* · Impacto nas obrigações.

Cada célula: uma das 5 situações (+ marca "revisar"). Código, descrição e estabelecimento ficam fixos. Clicar numa camada abre a **visão focada**. Filtros por situação e camada; ordem de trabalho livre; **salvar e ir ao próximo pendente**.

Casos: cada problema abre um caso (camada, itens, problema, evidência, dados originais e atuais, proposta, justificativa, impacto, responsável, situação, histórico, **origem: regra ou IA**). Ações: salvar rascunho · editar · aprovar · rejeitar com justificativa · pedir informação · reabrir/desfazer. **Lote** só mostrando antes itens e campos afetados e tratando as exceções.

**Dependências** (marca "revisar", sem apagar a decisão anterior): composição/identificação → NCM → tratamento tributário; finalidade → tratamento e créditos; unidade/conversão → duplicidade e SPED; consolidação de código → histórico e SPED; NCM ou finalidade mudou → o item troca de conjunto.

Escopo de cada camada: o que o código já faz hoje (qualidade, duplicidade, grupos, unidades, NCM/cClassTrib) é **migrado**; o que é novo é *finalidade*, *enquadramento por conjunto*, *cenários*, *impacto SPED* e *dependências*.

## 5. Tratamento tributário

- **Finalidade** (lista fechada): Revenda · Matéria-prima · Insumo de produção · Embalagem · Uso e consumo · Manutenção · Imobilizado · Material de terceiros. Uma principal + "também usado como".
- O sistema **sugere** a Finalidade pelo grupo, pelo nome e pelas **atividades confirmadas**; o consultor **confirma por grupo** (não por item) e corrige exceções.
- **Enquadramento legal** = função de NCM + finalidade, descrito **com o texto da lei e o artigo** + observação curta. Fontes: LC 214/2025 carregada na Base legal e tabela cClassTrib da SVRS, com **vigência**; nada é inventado — sem base, vira "aguardando informação".
- **Conjunto** = mesmo NCM + mesma finalidade (interno; na tela é o botão "aplicar a todos com mesmo NCM e finalidade"). Item **herda** o conjunto; **exceção** exige motivo.
- Cenários por item: compra para revenda · venda · uso e consumo · devolução, cada um com CST, cClassTrib, fundamento e origem (herdado/exceção). Regime e estabelecimento vêm do cliente (não multiplicam).
- **CFOP real** (quando houver XML/EFD do cliente): mostra o que ele de fato faz e **alerta se divergir** do CNAE.

## 6. Impacto no SPED (checklist por tipo de ajuste)

| Ajuste | Conferir | Registros |
|---|---|---|
| Mudou código/descrição do item | histórico do item | 0200, 0205 |
| Mudou unidade/conversão | unidades e fatores | 0190, 0220, e itens dos documentos |
| Consolidou/inativou código | correlação e inventário | 0221, H010; vínculo com documentos |
| Mudou NCM | classificação nos documentos | 0200, C170 |
| Mudou tratamento (CST/cClassTrib) | documentos eletrônicos e apuração | NF-e, C170, EFD-Contribuições |
| Item de bem do ativo | controle de crédito | 0300 e relacionados, Bloco G |

Cada linha do impacto registra: obrigação, competência, versão do leiaute, registro/campo, valor original e proposto, motivo, evidência, início da vigência, "avaliar períodos anteriores" e responsável. Distingue **ajuste cadastral futuro · regularização de saldo · impacto em escrituração já entregue**. Retificação e transmissão **não** fazem parte (análise e autorização próprias). Aplicabilidade por regime, UF, período e versão do leiaute, com a fonte oficial registrada.

## 7. IA como colaboradora (na borda)

- **Regra decide** o claro. **IA entra na borda**: duplicidade com sinais mistos, crédito de PIS/Cofins sobre item ambíguo, NCM com dois enquadramentos, finalidade duvidosa.
- Parecer curto: **recomendação · confiança (alta/média/baixa) · argumentos a favor e contra · o que confirmar · fontes** (lei carregada + pesquisa) · **"prática de mercado"** rotulada como tal, nunca como norma.
- **Nunca grava sozinha.** O raciocínio fica no histórico do caso. A decisão aprovada vira **precedente** para a mesma família (com contexto e fundamento).
- Roda **por caso**, em lotes, nunca nos 29 mil itens. Envia só o necessário (sem dados pessoais). Falha da IA nunca bloqueia: o caso segue sem parecer.
- Vale também como **botão geral em todos os serviços de consultoria**: monta o contexto padrão do projeto e devolve rascunho de parecer no padrão FAL (o roteiro muda por serviço).

## 8. Entregáveis

**Excel (6 abas):** Resumo da entrega · Cadastro saneado (inclui Finalidade) · De/para e equivalências · Cenários tributários (Enquadramento legal, CST, cClassTrib, origem) · Impactos no SPED · Pendências e histórico. Preserva zeros à esquerda, filtros e identificadores. Distingue **exportação para revisão** de **entrega liberada** (só dados aprovados; informa exclusões e pendências).

**Relatório de fechamento (PDF, padrão FAL/InTAX):** itens recebidos e analisados; ajustes por categoria; revisões feitas; pendências e limitações; versão liberada; comentário de cada aspecto tratado e o resumo; seção de impacto no SPED.

**Versões:** comparar duas, histórico por campo, exportar uma específica, continuar a partir dela (a base de trabalho volta aos valores da foto com uma decisão "restauração" por campo, prévia, justificativa e desfazer; nada é apagado — ver o contrato).

## 9. Governança de atuação

Contrato primeiro: este plano + `docs/saneamento-estoques-agentes.md` (escopo, entradas, saídas e critérios de cada especialista). Ordem: **dados e API** definem o contrato → os demais trabalham em paralelo sobre ele → integração → revisões → QA → deploy único.

Portões (todos obrigatórios):
1. Testes do que cada agente entrega, sem quebrar os existentes (suíte inteira verde).
2. **Duas revisões independentes** (código e regra de negócio), por agentes que não escreveram o código.
3. **Teste ponta a ponta** com a base real da Crestani (descartável, sem guardar o arquivo) e com um caso sintético contendo: duplicidade, grupo novo, nome, unidade, NCM, cenário tributário, impacto no SPED e pendência documental.
4. Navegador: percurso completo no ambiente local (Docker), inclusive reimportação, conflito de gravação e queda no meio.
5. Manual (POP) e FAQ no mesmo commit; permissões e histórico conferidos.
6. Migração só aditiva, com backup antes; **um único deploy**.

## 10. Critérios de aceite

1. Abertura pela Carteira de Consultoria, com data-base.
2. Trava de atividades funcionando (bloqueia, libera, reabre).
3. Importação com mapeamento, prévia e relatório de linhas; zeros preservados.
4. Cobertura: o sistema diz o que pode e o que não pode ser analisado por falta de dado.
5. Revisão por camada na tabela única e na visão geral; casos individuais e em conjunto.
6. Rascunho salvo e retomado; aprovação com histórico por campo.
7. Dependências geram "revisar" sem perder a decisão anterior.
8. Reimportação mostra diferenças e preserva decisões; conflito de gravação é avisado.
9. Finalidade confirmada por grupo; enquadramento herdado e exceção com motivo.
10. Impacto no SPED por tipo de ajuste, na tela, no Excel e no relatório.
11. Excel (6 abas) e relatório PDF gerados pelo sistema; liberada ≠ revisão.
12. Versões comparáveis; vínculos históricos (código antigo → novo, data, justificativa) preservados.
13. IA dá parecer nos casos de borda, não grava sozinha e cai com elegância se estiver fora.
14. Teste ponta a ponta completo (item 3 dos portões).

## 11. Fora desta entrega

Retificação/transmissão de SPED; integração com o Sintegra; motor de conciliação, Blocos K/G e arquivo para o ERP (ver **decisão pendente**); cenários além dos 4; layout do ERP não confirmado.
