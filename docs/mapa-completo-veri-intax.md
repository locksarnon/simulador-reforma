# Mapa completo: Veri × InTAX

Levantamento revisado em 11/11/2026. Substitui a lista de 33 itens: nada some no caminho porque **cada função do Veri tem um número (V001…), um destino no InTAX e uma fase**, e cada rota do InTAX de hoje também tem destino (parte B).

Legenda de **Depende de**: `Rec` dado da Receita ou de fonte oficial equivalente (Integra Contador do Serpro); `Ext` conta, contrato ou provedor externo; `Cad` só o cadastro do InTAX; `—` nada externo.

## 1. Em números

- **125 funções do Veri** (a lista anterior tinha 33): 35 não estavam no primeiro levantamento ou estavam sem detalhe.
- Dependem de dado da Receita: **66**. Dependem de conta ou contrato externo: **9**. Usam só o cadastro: **8**. Não dependem de nada externo: **42**.
- Por fase: fase 0 = 2; fase 1 = 30; fase 2 = 10; fase 3 = 65; fase 4 = 11; fases 2 e 4 juntas = 1; já existem = 3; fora por ora = 3. (Duas funções "existem e evoluem na fase 1" e entram na contagem da fase 1.)
- **20 grupos de rotas do InTAX de hoje**, todas com destino (parte B).

## 1-A. Situação em 11/11/2026

- **Feitas: 98** (fases 0, 1 e 2, com tela, teste, FAQ e roteiro; a calculadora de multas está em beta). **Já existiam: 5** (duas delas evoluídas). **Fora por ora: 6** (com Asaas e assinatura eletrônica, retirados por decisão de 11/11/2026), com o motivo.
- **Em breve: 16** (fases 3 e 4). Cada uma aparece na tela do módulo, na lista "O que vem a seguir", com a dependência: Integra Contador do Serpro e procuração eletrônica, agente de WhatsApp do escritório ou lojas de aplicativo.
- O teste `src/lib/mapaAderencia.test.js` lê este mapa e falha se uma função das fases 0 a 2 ficar sem tela, teste, FAQ ou roteiro, se um arquivo de teste citado não existir ou se uma função das fases 3 e 4 sumir das listas de previstas.

- **Monitoramento fiscal entregue (11/11/2026):** situação fiscal, declarações, guias, caixa postal, parcelamentos, MEI, procurações, pessoa física, painel de risco, rotinas e envio de guias, pelo Integra Contador. Hoje roda no ambiente de demonstração oficial do Serpro (dados fictícios); com o contrato, passa a dados reais sem mudar as telas.

## 2. Regra para nada se perder

1. Nenhuma função entra ou sai da lista sem mudar este documento (e o `.csv`, que abre no Excel).
2. Uma função só é dada como **pronta** quando tem tela, teste, FAQ, roteiro e QA no navegador (`docs/estrutura-de-telas.md`, seção 9).
3. Função que for decidida como **fora** continua na lista, com o motivo.
4. Tela do InTAX que mudar de lugar ganha redirecionamento e não some.

## 3. Cadastro único e duas carteiras (diagnóstico pontual × BPO)

**A base cadastral é a mesma.** Grupo, empresa, pessoa física, contatos, procurações, certificados, tags e colaboradores moram em Clientes e servem aos dois mundos. O que separa diagnóstico pontual de BPO é o **serviço contratado** da empresa, e não uma segunda base.

- **Serviço contratado** (novo, em Clientes > empresa > aba "Serviços contratados"): empresa, tipo (`BPO fiscal` ou `diagnóstico pontual`, extensível), situação (proposta, ativo, pausado, encerrado), início, fim, responsável e, no BPO, os módulos ligados (XML, monitoramento, obrigações…). Liga-se à proposta e ao contrato do Comercial.
- **Diagnóstico pontual** é projeto: tem início, fim, escopo e entregáveis (relatórios, papéis de trabalho, lista de solicitações). **BPO** é rotina mensal: módulos ligados, tarefas recorrentes e monitoramento.
- As listas de cada área abrem filtradas pela carteira (BPO Fiscal mostra as empresas com BPO ativo; Diagnóstico e Serviços, as com diagnóstico), com a opção "todas as empresas". Uma empresa pode estar nos dois, e "converter diagnóstico em BPO" não pede digitar nada de novo.
- **Dados operacionais não se misturam:** XML, monitoramento, obrigações e tarefas são do BPO; operações importadas, saneamento, classificação e solicitações são do diagnóstico. A passagem entre os dois é por ação explícita (como o "Enviar ao importador" do Repositório de XML).
- **Dados de hoje:** todas as empresas começam como diagnóstico (como é agora) e você marca as de BPO em lote. Até marcar, o BPO Fiscal mostra todas, com um aviso.

## 4. Parte A: todas as funções do Veri e onde cada uma entra


### 1. Monitoramento da empresa (Dashboard Federal do Veri: 17 telas)

| ID | Função | Depende de | Destino no InTAX | Fase | 1º levantamento | Situação em 11/11/2026 | Tela |
|---|---|---|---|---|---|---|---|
| V001 | Diagnóstico fiscal PJ (situação fiscal e-CAC, histórico, baixar todos) | Rec | BPO > Monitoramento > Situação | 3 (entregue) | #1 | feito (demonstração oficial do Serpro hoje; dados reais com o contrato do Integra Contador) | /bpo/monitoramento/:empresaId |
| V002 | Sublimite do Simples (receita acumulada, % do limite, sócios) | Rec | BPO > Monitoramento > Situação | 3 | #1 | em breve: depende da leitura da receita bruta (RBT12) da declaração do PGDAS-D | /bpo/monitoramento |
| V003 | Ausência de declarações (por regime, obrigações em falta) | Rec | BPO > Monitoramento > Situação | 3 (entregue) | #1 | feito (demonstração oficial do Serpro hoje; dados reais com o contrato do Integra Contador); ausência por obrigação, com as dispensas | /bpo/monitoramento/:empresaId |
| V004 | Exclusão MEI/Simples (períodos e status) | Rec | BPO > Monitoramento > Situação | 3 (entregue) | novo | feito (demonstração oficial do Serpro hoje; dados reais com o contrato do Integra Contador); CCMEI e enquadramento do DTE | /bpo/monitoramento/:empresaId |
| V005 | Aviso de exclusão do Simples (previsão e dias restantes) | Rec | BPO > Monitoramento > Situação | 3 (entregue) | novo | feito (demonstração oficial do Serpro hoje; dados reais com o contrato do Integra Contador); o termo de exclusão chega pela caixa postal | /bpo/monitoramento/:empresaId |
| V006 | Dívida ativa (situação e detalhes) | Rec | BPO > Monitoramento > Situação | 3 (entregue) | #1 | feito (demonstração oficial do Serpro hoje; dados reais com o contrato do Integra Contador); relatório de situação fiscal e dívida ativa do MEI | /bpo/monitoramento/:empresaId |
| V007 | E-processos (processo mais recente, situação, histórico) | Rec | BPO > Monitoramento > Situação | 3 (entregue) | novo | feito (demonstração oficial do Serpro hoje; dados reais com o contrato do Integra Contador); o e-Processo não responde no ambiente de demonstração do Serpro | /bpo/monitoramento/:empresaId |
| V008 | PGDAS-D (transmissões, status, documentos) | Rec | BPO > Monitoramento > Declarações e guias | 3 (entregue) | #1 | feito (demonstração oficial do Serpro hoje; dados reais com o contrato do Integra Contador) | /bpo/monitoramento/:empresaId |
| V009 | DEFIS (por ano-calendário, status, recibo) | Rec | BPO > Monitoramento > Declarações e guias | 3 (entregue) | #1 | feito (demonstração oficial do Serpro hoje; dados reais com o contrato do Integra Contador) | /bpo/monitoramento/:empresaId |
| V010 | DCTFWeb (transmissão, débito apurado, saldo a pagar) | Rec | BPO > Monitoramento > Declarações e guias | 3 (entregue) | #1 | feito (demonstração oficial do Serpro hoje; dados reais com o contrato do Integra Contador) | /bpo/monitoramento/:empresaId |
| V011 | MIT (apuração mensal, situação, valor) | Rec | BPO > Monitoramento > Declarações e guias | 3 (entregue) | #1 | feito (demonstração oficial do Serpro hoje; dados reais com o contrato do Integra Contador) | /bpo/monitoramento/:empresaId |
| V012 | DAS: gerar, baixar, pago, duplicidade, extrato | Rec | BPO > Monitoramento > Declarações e guias | 3 (entregue) | novo | feito (demonstração oficial do Serpro hoje; dados reais com o contrato do Integra Contador) | /bpo/monitoramento/:empresaId |
| V013 | DARF da DCTFWeb: gerar e baixar em lote | Rec | BPO > Monitoramento > Declarações e guias | 3 (entregue) | novo | feito (demonstração oficial do Serpro hoje; dados reais com o contrato do Integra Contador); geração em lote no dia escolhido | /admin/parametros-rotinas |
| V014 | Comprovantes de pagamento (DARF, DAS, DAE, DJE por mês; baixar em lote) | Rec | BPO > Monitoramento > Declarações e guias | 3 (entregue) | novo | feito (demonstração oficial do Serpro hoje; dados reais com o contrato do Integra Contador); a consulta de pagamentos não responde no ambiente de demonstração do Serpro | /bpo/monitoramento/:empresaId |
| V015 | Relatório de faturamento (Simples e regime normal; exige configuração) | Rec | BPO > Monitoramento > Declarações e guias | 3 | novo | em breve: depende da leitura da receita das declarações | /bpo/monitoramento |
| V016 | Fator R (relatório por empresa) | Rec | BPO > Monitoramento > Declarações e guias | 3 | #1 | em breve: depende da leitura da folha e da receita das declarações | /bpo/monitoramento |
| V017 | Procurações (situação; consulta em lote) | Rec | BPO > Monitoramento > Procurações e certificados | 3 (entregue) | #7 | feito (demonstração oficial do Serpro hoje; dados reais com o contrato do Integra Contador) | /clientes/procuracoes |
| V018 | Vencimento dos certificados A1 dos clientes | — | BPO > Monitoramento > Procurações e certificados | existe | novo | existe | /bpo/repositorio-xml |

### 2. Mensagens da Receita

| ID | Função | Depende de | Destino no InTAX | Fase | 1º levantamento | Situação em 11/11/2026 | Tela |
|---|---|---|---|---|---|---|---|
| V019 | Mensagens e-CAC (consultar novas, leitura, classificar, pontuais) | Rec | BPO > Monitoramento > Mensagens | 3 (entregue) | #2 | feito (demonstração oficial do Serpro hoje; dados reais com o contrato do Integra Contador) | /bpo/monitoramento/:empresaId |
| V020 | Malha fiscal | Rec | BPO > Monitoramento > Mensagens | 3 (entregue) | #2 | feito (demonstração oficial do Serpro hoje; dados reais com o contrato do Integra Contador); malha do PGDAS-D e avisos da caixa postal | /bpo/monitoramento/:empresaId |
| V021 | Termos da Receita (intimações) | Rec | BPO > Monitoramento > Mensagens | 3 (entregue) | #2 | feito (demonstração oficial do Serpro hoje; dados reais com o contrato do Integra Contador); intimações pela caixa postal | /bpo/monitoramento/:empresaId |

### 3. Certidões

| ID | Função | Depende de | Destino no InTAX | Fase | 1º levantamento | Situação em 11/11/2026 | Tela |
|---|---|---|---|---|---|---|---|
| V022 | CND federal (RFB/PGFN) | Rec | BPO > Monitoramento > Certidões | 3 (entregue) | #3 | feito (emissão no portal oficial, que exige captcha; validade e alerta em Arquivos e documentos) | /bpo/monitoramento/:empresaId |
| V023 | CND estadual (por UF, validade, baixar todas) | Rec (portal com captcha) | BPO > Monitoramento > Certidões | 3 (entregue) | #3 | feito (emissão no portal da SEFAZ; validade e alerta em Arquivos e documentos) | /bpo/monitoramento/:empresaId |
| V024 | CND trabalhista | Rec (portal com captcha) | BPO > Monitoramento > Certidões | 3 (entregue) | #3 | feito (emissão no portal do TST; validade e alerta em Arquivos e documentos) | /bpo/monitoramento/:empresaId |
| V025 | CND FGTS | Rec (portal com captcha) | BPO > Monitoramento > Certidões | 3 (entregue) | #3 | feito (emissão no portal da Caixa; validade e alerta em Arquivos e documentos) | /bpo/monitoramento/:empresaId |
| V026 | CND municipal | Rec (portal por município) | BPO > Monitoramento > Certidões | 3 (entregue) | #3 | feito (emissão no portal da prefeitura; validade e alerta em Arquivos e documentos) | /bpo/monitoramento/:empresaId |
| V027 | Relatório unificado de certidões | Rec | BPO > Monitoramento > Certidões | 3 (entregue) | #3 | feito (radar de certidões na Análise de risco) | /bpo/analise-risco |

### 4. Parcelamentos

| ID | Função | Depende de | Destino no InTAX | Fase | 1º levantamento | Situação em 11/11/2026 | Tela |
|---|---|---|---|---|---|---|---|
| V028 | Parcelamento do Simples (SN) | Rec | BPO > Monitoramento > Parcelamentos | 3 (entregue) | #4 | feito (demonstração oficial do Serpro hoje; dados reais com o contrato do Integra Contador) | /bpo/monitoramento/:empresaId |
| V029 | Parcelamento especial SN | Rec | BPO > Monitoramento > Parcelamentos | 3 (entregue) | #4 | feito (demonstração oficial do Serpro hoje; dados reais com o contrato do Integra Contador) | /bpo/monitoramento/:empresaId |
| V030 | PERT SN | Rec | BPO > Monitoramento > Parcelamentos | 3 (entregue) | #4 | feito (demonstração oficial do Serpro hoje; dados reais com o contrato do Integra Contador) | /bpo/monitoramento/:empresaId |
| V031 | RELP SN | Rec | BPO > Monitoramento > Parcelamentos | 3 (entregue) | #4 | feito (demonstração oficial do Serpro hoje; dados reais com o contrato do Integra Contador) | /bpo/monitoramento/:empresaId |
| V032 | Parcelamento MEI | Rec | BPO > Monitoramento > Parcelamentos | 3 (entregue) | #4 | feito (demonstração oficial do Serpro hoje; dados reais com o contrato do Integra Contador) | /bpo/monitoramento/:empresaId |
| V033 | Parcelamento especial MEI | Rec | BPO > Monitoramento > Parcelamentos | 3 (entregue) | #4 | feito (demonstração oficial do Serpro hoje; dados reais com o contrato do Integra Contador) | /bpo/monitoramento/:empresaId |
| V034 | PERT MEI | Rec | BPO > Monitoramento > Parcelamentos | 3 (entregue) | #4 | feito (demonstração oficial do Serpro hoje; dados reais com o contrato do Integra Contador) | /bpo/monitoramento/:empresaId |
| V035 | RELP MEI | Rec | BPO > Monitoramento > Parcelamentos | 3 (entregue) | #4 | feito (demonstração oficial do Serpro hoje; dados reais com o contrato do Integra Contador) | /bpo/monitoramento/:empresaId |
| V036 | Parcelamento PGFN (Sispar) | Rec | BPO > Monitoramento > Parcelamentos | fora | #4 | fora (o Integra Contador não tem o parcelamento da PGFN; acompanhar no Regularize) | — |
| V037 | Ações em lote nos parcelamentos (atualizar, gerar DAS, enviar e-mails, baixar DAS) | Rec + e-mail | BPO > Monitoramento > Parcelamentos | 3 (entregue) | novo | feito (demonstração oficial do Serpro hoje; dados reais com o contrato do Integra Contador); atualizar em lote e emitir o DAS de cada parcela | /bpo/monitoramento |

### 5. MEI

| ID | Função | Depende de | Destino no InTAX | Fase | 1º levantamento | Situação em 11/11/2026 | Tela |
|---|---|---|---|---|---|---|---|
| V038 | CCMEI (status, atualizar em lote) | Rec | BPO > Monitoramento > MEI | 3 (entregue) | #5 | feito (demonstração oficial do Serpro hoje; dados reais com o contrato do Integra Contador) | /bpo/monitoramento/:empresaId |
| V039 | Diagnóstico fiscal MEI | Rec | BPO > Monitoramento > MEI | 3 (entregue) | #5 | feito (demonstração oficial do Serpro hoje; dados reais com o contrato do Integra Contador) | /bpo/monitoramento/:empresaId |
| V040 | DAS MEI (por competência, gerar em lote, recalcular) | Rec | BPO > Monitoramento > MEI | 3 (entregue) | novo | feito (demonstração oficial do Serpro hoje; dados reais com o contrato do Integra Contador) | /bpo/monitoramento/:empresaId |
| V041 | DASN-SIMEI (ausência e irregularidade) | Rec | BPO > Monitoramento > MEI | 3 | #5 | em breve: depende do contrato do Integra Contador (a DASN-SIMEI não está no ambiente de demonstração do Serpro) | /bpo/monitoramento |
| V042 | Optantes e excluídas do MEI | Rec | BPO > Monitoramento > MEI | 3 (entregue) | #5 | feito (demonstração oficial do Serpro hoje; dados reais com o contrato do Integra Contador) | /bpo/monitoramento/:empresaId |
| V043 | Dívida ativa MEI | Rec | BPO > Monitoramento > MEI | 3 (entregue) | #5 | feito (demonstração oficial do Serpro hoje; dados reais com o contrato do Integra Contador) | /bpo/monitoramento/:empresaId |

### 6. Pessoa física

| ID | Função | Depende de | Destino no InTAX | Fase | 1º levantamento | Situação em 11/11/2026 | Tela |
|---|---|---|---|---|---|---|---|
| V044 | Painel da pessoa física | Rec | BPO > Monitoramento > Pessoa física | 3 (entregue) | #6 | feito (demonstração oficial do Serpro hoje; dados reais com o contrato do Integra Contador) | /bpo/monitoramento/pf/:empresaId |
| V045 | Cadastro de pessoas físicas (CPF; vincular a procuração) | Cad | Clientes > Pessoas físicas | 1 | #6 | feito | /clientes/pessoas-fisicas |
| V046 | Mensagens e-CAC da pessoa física | Rec | BPO > Monitoramento > Pessoa física | 3 (entregue) | #6 | feito (demonstração oficial do Serpro hoje; dados reais com o contrato do Integra Contador) | /bpo/monitoramento/pf/:empresaId |
| V047 | Situação fiscal da pessoa física | Rec | BPO > Monitoramento > Pessoa física | 3 (entregue) | #6 | feito (demonstração oficial do Serpro hoje; dados reais com o contrato do Integra Contador) | /bpo/monitoramento/pf/:empresaId |
| V048 | CND federal da pessoa física | Rec | BPO > Monitoramento > Pessoa física | 3 (entregue) | #6 | feito (emissão no portal da Receita; validade e alerta em Arquivos e documentos) | /bpo/monitoramento/pf/:empresaId |
| V049 | CND trabalhista da pessoa física | Rec (portal com captcha) | BPO > Monitoramento > Pessoa física | 3 (entregue) | #6 | feito (emissão no portal do TST; validade e alerta em Arquivos e documentos) | /bpo/monitoramento/pf/:empresaId |
| V050 | Procurações da pessoa física | Rec | BPO > Monitoramento > Pessoa física | 3 (entregue) | #6 | feito (demonstração oficial do Serpro hoje; dados reais com o contrato do Integra Contador) | /bpo/monitoramento/pf/:empresaId |
| V051 | Certificados da pessoa física (vencimento) | — | BPO > Monitoramento > Pessoa física | 1 | #6 | feito | /clientes/pessoas-fisicas |
| V052 | Arquivos da pessoa física | — | BPO > Arquivos e documentos | 2 | #23 | feito | /bpo/arquivos |

### 7. Análise e indicadores

| ID | Função | Depende de | Destino no InTAX | Fase | 1º levantamento | Situação em 11/11/2026 | Tela |
|---|---|---|---|---|---|---|---|
| V053 | Gestão à Vista 360° (resumo executivo e gráficos: entregas, ausências por obrigação e regime, diagnóstico, CNDs, evolução mensal) | Rec | BPO > Análise de risco | 3 (entregue) | #8 | feito (demonstração oficial do Serpro hoje; dados reais com o contrato do Integra Contador) | /bpo/analise-risco |
| V054 | Top 5 empresas em risco, com score e nível | Rec | BPO > Análise de risco | 3 (entregue) | #8 | feito (demonstração oficial do Serpro hoje; dados reais com o contrato do Integra Contador) | /bpo/analise-risco |
| V055 | Calculadora de multas por atraso de obrigação | — (regras legais) | BPO > Análise de risco | 2 | novo | feito (beta) | /bpo/analise-risco |
| V056 | Radar de CND (vencimentos das certidões) | Rec | BPO > Análise de risco | 3 (entregue) | novo | feito (demonstração oficial do Serpro hoje; dados reais com o contrato do Integra Contador) | /bpo/analise-risco |
| V057 | Fila de prioridade e ações rápidas | Rec | BPO > Análise de risco | 3 (entregue) | novo | feito (demonstração oficial do Serpro hoje; dados reais com o contrato do Integra Contador) | /bpo/analise-risco |
| V058 | Auditoria e cross-check dos dados | Rec | BPO > Análise de risco | 3 (entregue) | novo | feito (demonstração oficial do Serpro hoje; dados reais com o contrato do Integra Contador) | /bpo/analise-risco |
| V059 | BI da carteira: saúde, regime tributário, porte | Cad | Início > Painel da carteira | 1 | novo | feito | /inicio/carteira |
| V060 | Geolocalização da carteira (mapa por município) | Cad | Início > Painel da carteira | 1 | novo | feito | /inicio/carteira |
| V061 | Distribuição da carteira por CNAE | Cad | Início > Painel da carteira | 1 | novo | feito | /inicio/carteira |
| V062 | Indicadores por módulo (diagnóstico, caixa postal, PGDAS, CNDs, DCTFWeb, ausências, sublimite; PJ, PF, parcelamentos, cobrança) | Rec | BPO > Análise de risco | 3 (entregue) | #9 | feito (demonstração oficial do Serpro hoje; dados reais com o contrato do Integra Contador) | /bpo/analise-risco |
| V063 | Raio-X Fiscal / Diagnóstico (relatório por fonte e por empresa) | Rec | BPO > Análise de risco | 3 (entregue) | #10 | feito (demonstração oficial do Serpro hoje; dados reais com o contrato do Integra Contador); o raio-X é a página do cliente | /bpo/monitoramento/:empresaId |
| V064 | Health Score Fiscal | Rec | BPO > Análise de risco | 3 (entregue) | #11 | feito (demonstração oficial do Serpro hoje; dados reais com o contrato do Integra Contador) | /bpo/analise-risco |
| V065 | Pré-análise por CNPJ de prospect, com exportação | Cad + dados públicos | Comercial > Prospecção | 2 | #12 | feito | /comercial/pre-analise |
| V066 | Pós-análise por IA (análises mensais) | Rec | BPO > Análise de risco | 3 | #13 | em breve: depende de dados reais do monitoramento e da chave de IA no servidor | /bpo/analise-risco |
| V067 | Assistente de IA para análise fiscal (chat) | Rec | BPO > Análise de risco | 3 | novo | em breve: depende de dados reais do monitoramento e da chave de IA no servidor | /bpo/analise-risco |
| V068 | Simulador da Reforma Tributária | — | Reforma > Simulador | existe; evoluir na 1 | #14 e #15 | existe; evoluído | /reforma/regimes |

### 8. Rotina do escritório

| ID | Função | Depende de | Destino no InTAX | Fase | 1º levantamento | Situação em 11/11/2026 | Tela |
|---|---|---|---|---|---|---|---|
| V069 | Agenda de obrigações fiscais por empresa | — (datas oficiais) | BPO > Obrigações e agenda | 2 | #16 | feito | /bpo/agenda |
| V070 | Calendário geral: eventos próprios, tipos de evento, mês, semana, dia, arrastar | — | BPO > Obrigações e agenda | 1 | novo | feito | /bpo/agenda |
| V071 | Processos e tarefas (modelos, recorrência, atrasos) | — | BPO > Processos e tarefas | 1 | #17 | feito | /bpo/tarefas |
| V072 | Replicar processos recorrentes | — | BPO > Processos e tarefas | 1 | novo | feito | /bpo/tarefas |
| V073 | Tour de uso (guia na primeira visita) | — | Núcleo | 2 | novo | feito | /inicio |
| V074 | Tipos de documento (nome, órgão expedidor) | Cad | BPO > Arquivos e documentos | 2 | novo | feito | /bpo/arquivos |
| V075 | Documentos por empresa com data de validade e alerta de vencimento | Cad | BPO > Arquivos e documentos | 2 | novo | feito | /bpo/arquivos |
| V076 | Gerenciador de arquivos por empresa | — | BPO > Arquivos e documentos | 2 | #23 | feito | /bpo/arquivos |
| V077 | Meus downloads (fila de downloads em lote, com validade) | — | BPO > Arquivos e documentos | 1 | #32 | feito | /bpo/arquivos |
| V078 | Central de notificações (sino com 7 categorias) | — | Início (sino do topo) | 1 | #18 | feito | /notificacoes |
| V079 | Cadastro automático de novas empresas a partir das procurações | Rec | Clientes > Grupos e empresas | 3 | novo | em breve: depende do contrato do Integra Contador (vínculos do contador no PNRCONTADOR) | / |
| V080 | Busca rápida de módulo | — | Núcleo | 0 | plano | feito | Ctrl K (topo) |
| V081 | Seletor global de empresa no topo | — | Núcleo | 1 | plano | feito | topo (empresa em foco) |
| V082 | Início com atalhos do dia | — | Início | 1 | plano | feito | /inicio |

### 9. Relacionamento e comercial

| ID | Função | Depende de | Destino no InTAX | Fase | 1º levantamento | Situação em 11/11/2026 | Tela |
|---|---|---|---|---|---|---|---|
| V083 | Portal do cliente (login personalizável, forma de acesso, funções) | Ext | Comercial > Portal do cliente | 4 | #24 | em breve: depende de conta ou contrato externo | /em-breve/portal-contratos |
| V084 | Rastreio público por CNPJ | — | Comercial > Portal do cliente | 4 | novo | em breve: depende de vem junto com o portal do cliente e os contratos (fase 4) | /em-breve/portal-contratos |
| V085 | App móvel com a marca do escritório (baixar, personalizar) | Ext (lojas de app) | Comercial > App | 4 | #25 | em breve: depende de lojas de aplicativo | /em-breve/portal-contratos |
| V086 | Usuários do app (clientes) e permissões | Ext | Comercial > App | 4 | #25 | em breve: depende de conta ou contrato externo | /em-breve/portal-contratos |
| V087 | Envio de guias ao app | Rec + Ext | Comercial > App | 4 | novo | em breve: depende de Integra Contador (Serpro) e procuração + conta externa | /em-breve/portal-contratos |
| V088 | Solicitações dos clientes pelo app (lista e status) | — | Comercial > Solicitações | 4 | novo | em breve: depende de vem junto com o portal do cliente e os contratos (fase 4) | /em-breve/portal-contratos |
| V089 | Orçamento comercial / calculadora de honorários | — | Comercial > Propostas | 1 | #21 | feito | /comercial/propostas |
| V090 | Propostas: lista, modelos (templates), PDF com logo | — | Comercial > Propostas | 1 | #21 | feito | /comercial/propostas |
| V091 | Contratos: modelos | — | Comercial > Contratos | 4 | #26 | em breve: depende de vem junto com o portal do cliente e os contratos (fase 4) | /em-breve/portal-contratos |
| V092 | Contratos: assinatura eletrônica | Ext (provedor) | Comercial > Contratos | fora | #26 | fora (decisão de 11/11/2026: sem Asaas e sem assinatura eletrônica) | — |
| V093 | Cobrança de honorários (boleto, PIX, cartão) | Ext (Asaas) | Comercial > Cobrança | fora | #27 | fora (decisão de 11/11/2026: sem Asaas e sem assinatura eletrônica) | — |
| V094 | Comunicados por e-mail para grupos de clientes (tags, anexos) | — (SMTP) | Comercial > Comunicação | 2 | #22 | feito | /comercial/comunicados |
| V095 | Comunicados por WhatsApp | Ext (agente de WhatsApp) | Comercial > Comunicação | 4 | #22 | em breve: depende de agente de WhatsApp do escritório | /comercial/comunicados |
| V096 | Tags de empresas e vínculo em lote | Cad | Clientes > Tags e filtros | 1 | #29 | feito | /clientes/tags |

### 10. Administração

| ID | Função | Depende de | Destino no InTAX | Fase | 1º levantamento | Situação em 11/11/2026 | Tela |
|---|---|---|---|---|---|---|---|
| V097 | Cadastro de empresas (e exclusão em lote) | — | Clientes (lista única) | existe; evoluir na 1 | #30 | existe; refeito como lista única de clientes, com exclusão em lote | / |
| V098 | Importador de dados de empresas e exportação | — | Clientes > Importação e exportação | 1 | #30 | feito | /clientes/importacao |
| V099 | E-mail e WhatsApp de contato por empresa | — | Clientes > Grupos e empresas | 1 | novo | feito | /clientes/:empresaId (ficha do cliente) |
| V100 | Procuradores (certificado do escritório) | Rec + Ext | Administração > Integrações | 3 (entregue) | #7 | feito (demonstração oficial do Serpro hoje; dados reais com o contrato do Integra Contador); certificado e chaves do escritório só no servidor | /admin/integracoes |
| V101 | Usuários e níveis de acesso | — | Administração > Usuários e acessos | 1 | #28 | feito | /admin/usuarios |
| V102 | Vincular empresas por colaborador (em lote e por importação) | — | Clientes > Carteira e colaboradores | 1 | #28 | feito | /clientes/carteira |
| V103 | Relatórios empresa por colaborador (com e sem) | — | Clientes > Carteira e colaboradores | 1 | #28 | feito | /clientes/carteira |
| V104 | Filtros personalizados (listas salvas de empresas; importar empresas) | — | Clientes > Tags e filtros | 1 | #29 | feito | /clientes/tags |
| V105 | Destinatários dos avisos por e-mail (habilitar e desabilitar) | — | Administração > Comunicações | 1 | novo | feito | /admin/comunicacoes |
| V106 | Controle de notificações por tipo (federais, certidões) | Rec | Administração > Comunicações | 3 (entregue) | novo | feito (demonstração oficial do Serpro hoje; dados reais com o contrato do Integra Contador); categoria Monitoramento fiscal nos avisos | /admin/comunicacoes |
| V107 | E-mails enviados (por empresa e período) e lista de bloqueio | — | Administração > Logs de envio | 2 | #22 | feito | /admin/comunicacoes |
| V108 | WhatsApps enviados e lista de bloqueio | Ext (agente de WhatsApp) | Administração > Logs de envio | 4 | #22 | em breve: depende de agente de WhatsApp do escritório | /admin/comunicacoes |
| V109 | Parâmetros da consulta automática (dia por módulo) | Rec | Administração > Parâmetros e rotinas | 3 (entregue) | #20 | feito (demonstração oficial do Serpro hoje; dados reais com o contrato do Integra Contador) | /admin/parametros-rotinas |
| V110 | Rotinas automáticas: envio de guias no dia escolhido | Rec + e-mail | Administração > Parâmetros e rotinas | 3 (entregue) | #19 | feito (demonstração oficial do Serpro hoje; dados reais com o contrato do Integra Contador) | /admin/parametros-rotinas |
| V111 | Lista de IPs permitidos | — | Administração > Acessos | 1 | #31 | feito | /admin/acessos |
| V112 | Registro de acesso (último acesso por usuário) | — | Administração > Acessos | 1 | #31 | feito | /admin/acessos |
| V113 | Plano contratado e limites de CNPJ e usuários | — | Administração | fora (só se o InTAX for oferecido a terceiros) | #33 | fora (só se o InTAX for oferecido a terceiros) | — |
| V114 | Perfil do usuário (dados e troca de senha) | — | Menu do usuário | 1 | novo | feito | /perfil |
| V115 | FAQ e suporte | — | Suporte | existe | — | existe | /manual |
| V116 | Chat de suporte dentro do sistema | Ext | Suporte | fora | #33 | fora (o suporte segue pelos canais do escritório) | — |
| V117 | Termos de uso do sistema | — | Suporte | fora (só se o InTAX for oferecido a terceiros) | — | fora (só se o InTAX for oferecido a terceiros) | — |

### 11. Funções transversais (valem para várias telas)

| ID | Função | Depende de | Destino no InTAX | Fase | 1º levantamento | Situação em 11/11/2026 | Tela |
|---|---|---|---|---|---|---|---|
| V118 | Marcar empresa como "sem obrigação" por obrigação (DCTFWeb, PGDAS, DEFIS, MIT) | Rec | Núcleo do Monitoramento | 3 (entregue) | novo | feito (demonstração oficial do Serpro hoje; dados reais com o contrato do Integra Contador) | /bpo/monitoramento/:empresaId |
| V119 | Atualizar em lote ou sob demanda, com histórico por empresa | Rec | Núcleo do Monitoramento | 3 (entregue) | novo | feito (demonstração oficial do Serpro hoje; dados reais com o contrato do Integra Contador) | /bpo/monitoramento |
| V120 | Exportar Excel, PDF e CSV com escolha de colunas em toda lista | — | Núcleo (molde Lista) | 1 | #30 | feito | todas as listas novas (botão Exportar) |
| V121 | Baixar em lote (ZIP, pasta única) | — | BPO > Arquivos e documentos | 1 | novo | feito | /bpo/arquivos |
| V122 | Envio em lote por e-mail e WhatsApp (guias, avisos) | Ext | Comercial > Comunicação | 2 e 4 | #19 | feito por e-mail; WhatsApp em breve (agente do escritório) | /comercial/comunicados |
| V123 | Proteger o uso do certificado com PIN | — | BPO > Monitoramento > Procurações e certificados | 1 | novo | feito | /bpo/repositorio-xml |
| V124 | Filtro, busca e paginação padrão (10, 50, 100, 500, todos) | — | Núcleo (molde Lista) | existe no Repositório de XML | plano | existe | /bpo/repositorio-xml |
| V125 | Estados de vazio, erro e carregando; selo beta | — | Núcleo | 0 | plano | feito | todas as telas novas |

## 5. Parte B: tudo o que o InTAX tem hoje e para onde vai

| Rota | Tela | Destino | Muda a URL? |
|---|---|---|---|
| `/` | Grupos e empresas (DataHub) | Clientes > Grupos e empresas | não; "/" vira o Início e a lista vai para /clientes (com redirecionamento) |
| `/cockpit` | Painel executivo (global, por grupo ou por empresa) | Início > Painel do escritório (é a base dele) | ao virar o Início, ganha redirecionamento |
| `/workroom/:id e /empresas, /operacoes, /importacao-xml, /importacao-planilha` | Visão do grupo, lista de empresas, operações, importações | Diagnóstico e Serviços | não |
| `/workroom/:id/empresas/:empresaId (serviços, histórico, painel, agenda)` | Serviços e análises, histórico, painel e agenda da empresa | Diagnóstico e Serviços | não |
| `.../validador-cadastro, saneamento-estoque, classificacao-servicos, validador-nfse` | Validador de cadastro, Saneamento de estoques, Classificação de serviços, Validador de NFS-e | Diagnóstico e Serviços | não |
| `.../importacao-xml, importacao-planilha, operacoes (por empresa)` | Importações e operações da empresa | Diagnóstico e Serviços | não |
| `/cenarios, /transicao, /catalogos` | Cenários, Transição 2026–2033, Catálogos IBS/CBS | Reforma Tributária | não |
| `/ferramentas/consulta-ncm, /ferramentas/credito-estoque, /base-legal/guia-art-11` | Consulta NCM, Crédito presumido de estoque, Guia do art. 11 | Reforma Tributária | não |
| `/ferramentas/classificacao, /calculadora, /art-11, /validador-nfse, /validador-cadastro` | Redirecionamentos que já existem | mantidos | não |
| `/base-legal, /base-legal/:chave, /base-legal/:chave/:caminho` | Base legal e normas | Conhecimento | não |
| `/agenda-reforma` | Agenda da Reforma | Conhecimento | não |
| `/ferramentas/radar-reforma, /ferramentas/noticias` | Radar de Novidades, Acervo de Notícias | Conhecimento | não |
| `/comercial/leads, /comercial/newsletter` | Leads, Newsletter | Comercial e relacionamento | não |
| `/bpo/repositorio-xml e /bpo/repositorio-xml/:empresaId` | Repositório de XML (certificado, captura, tipos, resumos e eventos, relatórios) | BPO Fiscal > Captura de XML | não |
| `/workroom/:id/empresas/:empresaId/repositorio-xml` | Redirecionamento para o Repositório de XML | mantido | não |
| `/configuracao` | Configuração | Administração | não (alias /admin/configuracao no futuro) |
| `/roteiro-testes, /manual, /arquitetura` | Roteiro de testes, FAQ e Manual, Arquitetura | Suporte | não |
| `/calculadora, /simples-hibrido, /consulta-ncm, /validador-cadastro (públicas)` | Páginas públicas | Casca pública, fora do menu | não |
| `/login, /register, /forgot-password, /reset-password` | Autenticação | Casca de autenticação | não |
| `*` | Página não encontrada | Núcleo | não |

**Capacidades que já existem e serão reaproveitadas:**

- Cofre de certificado A1 e aviso de vencimento por e-mail (base de Procurações e certificados e do PIN).
- Captura de XML (NF-e, CT-e, NFS-e) com agendador, Ciência da Operação, PDF dos documentos e relatórios.
- Envio de e-mail (SMTP) e geração de PDF (base de comunicados e propostas).
- Newsletter com WhatsApp pela API oficial (na branch feature/newsletter-clientes-whatsapp, sem merge).
- Resumo executivo por IA (Gemini) e Painel executivo (base de Início e Análise de risco).
- Base legal com revisão, Agenda da Reforma com datas oficiais e Radar de Novidades (base de Conhecimento).
- Autenticação JWT com papéis admin e consultor (base de Usuários e acessos).
- MinIO para arquivos e Prisma/Postgres (base de Arquivos e documentos).

## 6. O que a revisão achou e o primeiro levantamento não trazia

1. O Dashboard Federal tem **17 telas**, não "cerca de 15 em um item": faltavam Comprovantes de pagamento, E-processos, Relatório de faturamento, Aviso de exclusão do Simples, Exclusão MEI/Simples e MIT em detalhe, além do vencimento de certificados A1.
2. **Emissão**, e não só consulta: gerar DAS, DARF da DCTFWeb, DAS MEI e parcelas, em lote, com envio por e-mail.
3. Na análise: **calculadora de multas por atraso**, **Radar de CND**, fila de prioridade, ações rápidas e **auditoria cross-check**.
4. O BI da carteira (mapa por município, CNAE, regime, porte, saúde) usa **só o cadastro**: pode sair na fase 1, sem esperar a Receita.
5. O calendário geral do Veri **guarda eventos próprios, com tipos**; não é só uma visão. O plano foi corrigido.
6. **Documentos com validade** e tipos de documento (alvarás, licenças) são um módulo à parte do gerenciador de arquivos.
7. Funções transversais que valem para muitas telas: "sem obrigação", atualizar em lote com histórico, exportação com colunas, download em lote, PIN do certificado.
8. Mensagens: classificar e mensagens pontuais, malha fiscal e termos de intimação. Cadastro automático de novas empresas pelas procurações.
9. Controle de comunicação: destinatários dos avisos, controle por tipo e **listas de bloqueio** de e-mail e WhatsApp.
10. O InTAX **não tem perfil do usuário nem troca de senha** logado (só "esqueci minha senha"), e a mudança de papel é por SQL.
11. Rastreio público por CNPJ e tour de uso.

## 7. O que não foi visto, e por quê

- **Telas que executam ação** não foram abertas, só as de leitura: "Atualizar novas empresas", "Gerar" (relatórios empresa por colaborador e diagnóstico unificado), botões de atualizar, gerar DAS e enviar. O que elas fazem vem do nome e dos botões vizinhos.
- **Detalhe interno** (modais, todas as colunas, regras de cálculo) não foi levantado. Isso será definido a partir de fonte oficial e do desenho do InTAX, não da tela do Veri.
- Algumas variações repetem o mesmo molde das telas vistas (CND trabalhista, FGTS e federal; subtelas do MEI e da pessoa física). Estão na lista pelo nome.
- Parte do que o Veri mostra depende de dado que ele obtém da Receita. Como obter pelo caminho oficial (Integra Contador) está na seção de dependências do plano.
