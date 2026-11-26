# Perfil de ERP: Aliare Siagri (saneamento de estoques e cadastro de produtos)

Levantamento feito em 26/11/2026 só em fontes oficiais da Aliare/Siagri. Terceiros e fóruns não foram usados como fundamento.

## 0. O que existe publicamente (e o que não existe)

| Fonte oficial | Situação | URL |
|---|---|---|
| Site institucional Siagri (produtos) | Público, só texto comercial | https://www.siagri.com.br/solucoes/ |
| Site Aliare (produtos, blog, Reforma Tributária) | Público, texto comercial e artigos | https://www.aliare.co/category/reforma-tributaria/ |
| Base de conhecimento (suporte.aliare.co / atendimento.aliare.co/kb) | Página inicial visível; os artigos devolvem 403 (exigem login) | https://suporte.aliare.co/kb |
| **Portal de Documentação Aliare (Confluence)** | **Público em acesso anônimo**: notas de versão por módulo e páginas da Reforma Tributária. Linkado pela própria base de conhecimento como "Central de documentação" | https://siagri.atlassian.net/wiki/spaces/AGB/overview |
| Universidade Siagri (treinamento) | Não acessado (área de cliente) | https://newacademy.aliare.co/ |

Espaços do portal de documentação: Siagri AgriBusiness (AGB), Siagri AgriManager (AGM), Siagri Essencial Web (EW), Siagri Web (SW), Simer, VistraBI, Clover CRM. Este relatório usa sobretudo o espaço AGB (Siagri AgriBusiness, o ERP de revendas, armazéns e agroindústrias).

**Não existe publicamente**: manual do usuário de cadastro de produtos, dicionário de campos, regras de exclusão/inativação/unificação, layout de importação de produtos, documentação de API. O que há são notas de versão, que citam telas e campos de passagem. Tudo que depende do manual ficou "não confirmado".

**Atenção à linha de produto**: a Aliare tem vários ERPs com bases distintas (Siagri AgriBusiness, Siagri Essencial, Siagri Web/Simer para distribuidores e cooperativas, Agrimanager para fazenda, além de Datacoper e Solution). Os códigos de rotina abaixo (TRAN, CEST, FATU, EFIS) são do **Siagri AgriBusiness**. O InTAX precisa perguntar qual produto e qual versão o cliente usa.

Observação de acesso: abri as páginas do portal pelo endereço normal de navegação. A consulta pela API REST de busca do Confluence foi bloqueada pela política de permissões desta sessão e não foi usada; por isso a busca por palavra-chave dentro do portal não foi exaustiva (as notas foram lidas por índice de versão: 10.0, 9.6, 8.6 e 7.6).

---

## 1. Cadastro de produtos

### 1.1 Tela e estrutura do cadastro
- **Fato**: o cadastro de produtos/kits é a rotina **TRAN1071** ("Manutenção no Cadastro de Produtos/kits de Produtos"); materiais de consumo têm cadastro próprio, **TRAN107B**. A descrição do produto foi ampliada para até **120 caracteres** na versão 7.6.0.0. O cadastro tem um campo **"Código Original"** (exibido ao lado do Código em exportações), o que indica código interno e código de origem separados.
- **Consequência para o saneamento**: o InTAX deve tratar produto de revenda (TRAN1071) e material de consumo (TRAN107B) como bases distintas na extração; descrição > 120 caracteres é erro de carga; o "Código Original" é candidato natural para guardar o código antigo quando houver recodificação.
- **Fontes**: TRAN1071 e 120 caracteres: https://siagri.atlassian.net/wiki/spaces/AGB/pages/3513450517/ ; TRAN1071, TRAN107B e Código Original: https://siagri.atlassian.net/wiki/spaces/AGB/pages/6113378267
- **Grau**: confirmado (notas de versão). Lista completa de campos: **não confirmado** (sem manual público).

### 1.2 Grupo/subgrupo, tipo de produto, NCM
- **Fato**: o produto tem **grupo**, **tipo de produto** e **NCM** (são filtros da manutenção tributária em massa TRAN539). Existe um cadastro de NCM próprio (**Tran10113**) que importa a tabela oficial da Receita (planilha do Siscomex, só códigos de 8 dígitos); a importação **só inclui códigos novos, não altera descrição dos existentes e não mexe no cadastro de produtos**.
- **Consequência**: NCM extinto continua válido no cadastro de NCM do Siagri e nos produtos. O InTAX deve cruzar o NCM de cada produto com a tabela NCM vigente e sinalizar "NCM vencido/inexistente na TEC" (o Siagri não faz isso pela importação).
- **Fontes**: https://siagri.atlassian.net/wiki/spaces/AGB/pages/6113373157 ; https://siagri.atlassian.net/wiki/spaces/AGB/pages/6113373196
- **Grau**: confirmado. Estrutura de subgrupos: não confirmado.

### 1.3 Unidade, conversões e embalagens
- **Fato**: nota de versão 8.6.0.0 cita "tipo de embalagem" ajustado à Portaria Conjunta IAT/ADAPAR nº 02/2023 (PR, agrotóxicos). Não há documentação pública de unidade de estoque × unidade comercial nem de fatores de conversão.
- **Consequência**: pedir ao cliente o print/relatório da unidade e embalagens de cada item; não presumir conversões.
- **Fonte**: https://siagri.atlassian.net/wiki/spaces/AGB/pages/4537024534/Compras+e+Estoque+-+8.6.0.0
- **Grau**: tipo de embalagem confirmado; unidade/conversão **não confirmado**.

### 1.4 Registro MAPA, lote e validade
- **Fato**: o número de registro no MAPA fica em dois lugares: no produto (campo "Nº Registro" do TRAN1071) e, opcionalmente, no **lote** (rotina **Tran1076 – Lotes dos Produtos**, campo "Número Registro do Mapa", menu Cadastros > Produtos > Materiais > "Lotes de Fabricação"). Na NF-e o sistema usa o número do lote e, se vazio, o do produto; lotes com registros diferentes saem separados no XML/DANFE. O ERP controla estoque por **lote e validade**, tem relatório de "composição do estoque" com listagem de lotes e consulta de saldos em aberto por lote.
- **Consequência**: na conferência de defensivos/fertilizantes, o InTAX deve checar (a) produto sem "Nº Registro" e sem registro no lote; (b) lotes do mesmo produto com registros MAPA diferentes (sinal de dois produtos distintos sob um código, candidato a desmembramento, não a unificação); (c) lotes vencidos com saldo (bloqueio de uso por prazo, primeiro filtro do saneamento).
- **Fontes**: https://siagri.atlassian.net/wiki/spaces/AGB/pages/3645505540/ ; lotes: https://siagri.atlassian.net/wiki/spaces/AGB/pages/3470459059/ e https://siagri.atlassian.net/wiki/spaces/AGB/pages/3457417242/ ; lote/validade (comercial): https://www.siagri.com.br/produto/siagri-agribusiness/
- **Grau**: confirmado.

### 1.5 Receituário agronômico
- **Fato**: o ERP emite receituário agronômico e ficha de emergência; a versão 10.0.0.0 permite reaproveitar o receituário da nota de simples faturamento na nota de remessa (parâmetro "Receita Doc. Origem"). Há cadastro de produtos com ajustes para relatório de agrotóxicos do INEA-RJ (10.0.0.0) e parâmetro para armazenagem de agrotóxicos de produtor (TRAN1082, 8.6.0.0).
- **Consequência**: produto que exige receita está ligado a registro MAPA e dados toxicológicos; trocar ou unificar esse item afeta receitas e relatórios estaduais de agrotóxicos. Alerta no InTAX: "item com receituário — alteração só com o responsável técnico".
- **Fontes**: https://siagri.atlassian.net/wiki/spaces/AGB/pages/5939232769/Vers+o+10.0.0.0 ; https://siagri.atlassian.net/wiki/spaces/AGB/pages/5939036163/Transacionadores+-+10.0.0.0 ; https://siagri.atlassian.net/wiki/spaces/AGB/pages/4568023053/Vers+o+8.6.0.0
- **Grau**: confirmado (existência). Campos (princípio ativo, classe toxicológica): **não confirmado**.

### 1.6 Sementes (RENASEM) e grãos (classificação, umidade)
- **Fato**: o módulo de Armazéns Gerais faz pesagem, partilha e **classificação** de grãos; Siagri Web cita beneficiamento de sementes e "Processo de Reembalagem de Sementes". Nada público sobre RENASEM nem sobre **umidade** como campo.
- **Consequência**: para cerealista/armazém, o saldo de grãos pode estar no módulo de armazenagem (saldo de depositante), não só no estoque próprio; o InTAX deve separar estoque próprio × de terceiros.
- **Fontes**: https://www.siagri.com.br/produto/siagri-agribusiness/ ; https://www.siagri.com.br/produto/siagri-web/ ; https://siagri.atlassian.net/wiki/spaces/SW/overview
- **Grau**: classificação confirmada; RENASEM e umidade **não confirmado**.

### 1.7 Situação ativo/inativo
- **Grau**: **não confirmado** (nenhuma fonte pública descreve o campo).

---

## 2. Saldos e última movimentação

- **Fato**: há consulta de estoque do produto (tecla F8) com nota de origem; **Kardex Analítico** (com opção de custo médio desde 8.6.0.0); relatório **Posição Diária do Estoque**; relatório **Composição do Estoque Consolidado** com exportação (7.6.0.0); relatório de carteira de pedidos com depósito (FATU425). O sistema trabalha com **saldo inicial gerado por período** (há aviso quando o produto está há 30/60/90 dias sem saldo inicial gerado, configurado na TRAN1021) e um **parâmetro que bloqueia saldos em períodos encerrados** (8.6.0.0). Ordem de transferência tem depósito e cultura.
- **Consequência**: (a) estoque por **depósito** existe; pedir a composição consolidada exportada por empresa/depósito/lote na data-base; (b) se o cliente não fecha o período/gera saldo inicial, consultas podem ser lentas e o Kardex é a fonte confiável; (c) correções retroativas podem estar bloqueadas pelo fechamento de período — ajuste vai na data corrente, com nota de ajuste, e o InTAX deve alertar isso; (d) **data da última movimentação**: não há relatório público que a traga pronta; derivar do Kardex (maior data por item/depósito).
- **Fontes**: https://siagri.atlassian.net/wiki/spaces/AGB/pages/3896181197/Compras+e+Estoque+-+V7.6.0.0 ; https://siagri.atlassian.net/wiki/spaces/AGB/pages/3760586826/ ; https://siagri.atlassian.net/wiki/spaces/AGB/pages/4537024534/Compras+e+Estoque+-+8.6.0.0 ; https://siagri.atlassian.net/wiki/spaces/AGB/pages/6113374313/Compras+e+Estoque+-+9.6.0.0 ; https://siagri.atlassian.net/wiki/spaces/AGB/pages/6113363698
- **Grau**: relatórios e bloqueio confirmados (pelas notas); colunas exatas, códigos de rotina dos relatórios e campo "última movimentação": **não confirmado**.

---

## 3. Restrições que afetam o saneamento

| Ação | O que se sabe | Grau |
|---|---|---|
| Trocar unidade de item movimentado | Nada publicado | **não confirmado** |
| Excluir × inativar | Nada publicado | **não confirmado** |
| Trocar código | Há campo "Código Original" no cadastro (TRAN1071/TRAN107B), útil para guardar o código antigo; regra de troca não publicada | parcial |
| Mudar NCM | Livre no cadastro; TRAN539 filtra por NCM mas altera **só campos tributários** (BC ICMS ST, alíquota IPI, benefício fiscal, ICMS desonerado e parâmetros DIFAL/FCP/pauta/estorno de crédito) — não troca NCM em massa | confirmado (TRAN539) |
| Mudar grupo | Grupo é filtro da TRAN539; alteração em massa não publicada | **não confirmado** |
| Lote/validade | Registro MAPA no lote; lote alimenta NF-e; saldo por lote | confirmado |
| Unificar itens | Nenhuma rotina de unificação publicada; o caminho seguro é transferência de saldo + inativação, a confirmar com a Aliare | **não confirmado** |
| Alterar descrição | Até 120 caracteres; impacto em histórico não publicado | parcial |
| Movimento retroativo | Bloqueio de saldos em períodos encerrados (parâmetro) | confirmado |

**Regras para o InTAX quando o ERP for Siagri**: não recomendar exclusão nem troca de unidade sem confirmação; propor unificação como "transferir saldo para o item mantido + inativar o item eliminado + registrar o código antigo no Código Original", marcada "a confirmar com a Aliare"; sinalizar itens com lote/registro MAPA/receituário como "alteração com responsável técnico".

Fontes: https://siagri.atlassian.net/wiki/spaces/AGB/pages/6113373157 ; https://siagri.atlassian.net/wiki/spaces/AGB/pages/6113378267 ; https://siagri.atlassian.net/wiki/spaces/AGB/pages/4537024534/Compras+e+Estoque+-+8.6.0.0

---

## 4. Carga e correção em massa

- **Fato**:
  - **TRAN539 – Manutenção Tributárias de Produtos** (Transacionadores > Utilitários): altera em massa campos tributários de produtos, com filtros por grupo, tipo de produto e NCM, mostrando "DE" (atual) e "PARA" (novo). Fonte: https://siagri.atlassian.net/wiki/spaces/AGB/pages/6113373157
  - **Tran10113**: importa a tabela NCM oficial (só inclui códigos novos). Fonte: https://siagri.atlassian.net/wiki/spaces/AGB/pages/6113373196
  - **Efis117A1 – "Ferramenta de Inclusão"**: inclui produtos em massa nos agrupamentos tributários da Reforma, filtrando por faixa de código e NCM. Fonte: https://siagri.atlassian.net/wiki/spaces/AGB/pages/4957470721
  - **Importação da tabela cClassTrib** (Efis116B, "Importar cClass IBS/CBS"). Mesma fonte.
  - Importação de XML de NF-e atualiza GTIN dos itens (7.6.0.0): https://siagri.atlassian.net/wiki/spaces/AGB/pages/3488972876/
  - Pré-nota (FATU2031) aceita itens por planilha (9.6.0.0): https://siagri.atlassian.net/wiki/spaces/AGB/pages/6113372397/Vers+o+9.6.0.0
  - Integrações: webhooks TRAN545 (Agrometrika), WMS Wemov, API Hendow; a Aliare diz que monta integração sob medida por cliente ("Aliare Integra"). Fontes: https://siagri.atlassian.net/wiki/spaces/AGB/pages/5939036163/Transacionadores+-+10.0.0.0 ; https://www.aliare.co/parceiros-de-integracao/
- **Consequência**: correção tributária em massa existe (TRAN539, agrupamentos); **importação de planilha de cadastro de produtos e API pública de produtos: não publicadas**. O InTAX deve entregar o resultado do saneamento como planilha "DE → PARA" por item, que o cliente aplica pela TRAN539 (campos tributários) ou manualmente/por serviço da Aliare (NCM, descrição, unidade, grupo).
- **Grau**: rotinas citadas confirmadas; importação de cadastro de produtos e API **não confirmado**.

---

## 5. Exportação recomendada para o consultor

Pedir ao cliente, por empresa e data-base (exportação Excel quando a tela permitir):
1. **Cadastro de produtos (TRAN1071) e materiais de consumo (TRAN107B)**: código, código original, descrição, grupo, tipo, NCM, unidade, Nº Registro MAPA, situação. Formato de exportação: **não confirmado** — perguntar à Aliare qual relatório lista o cadastro completo.
2. **Composição do Estoque Consolidado** (exportável, 7.6.0.0) por depósito e lote.
3. **Kardex Analítico** do período (para última movimentação e custo médio).
4. **Lotes dos Produtos (Tran1076)** com validade e registro MAPA.
5. **SPED Fiscal** (0200 e H010) gerado pelo próprio ERP, como base oficial independente das telas.
6. Agrupamentos tributários (Efis117) e classificações (Efis116), para a Reforma.

Fontes: as dos itens 1, 2 e 4. Grau: relatórios confirmados; nomes/colunas exatos de exportação não confirmados.

---

## 6. SPED e Reforma Tributária

### 6.1 SPED
- **Fato**: o Siagri gera **EFD ICMS/IPI** (layout 2026 atualizado; ajustes no C113, C197), **EFD-Contribuições** e **EFD-Reinf**; o Essencial anuncia "geração e exportação do SPED Fiscal" e inventário. Notas sobre os registros **0200, 0190, 0220 e H010** especificamente: não encontradas.
- **Consequência**: 0200 sai do cadastro (TRAN1071) — descrição, unidade e NCM corrigidos no saneamento mudam o 0200 do mês seguinte; troca de descrição/unidade exige 0205/0220 coerentes. O InTAX deve conferir 0200 × H010 × cadastro exportado e alertar que o H010 é gerado do saldo do ERP (por isso período fechado importa).
- **Fontes**: https://siagri.atlassian.net/wiki/spaces/AGB/pages/6113375162/Escrita+Fiscal+-+9.6.0.0 ; https://siagri.atlassian.net/wiki/spaces/AGB/pages/5939462147/Escrita+Fiscal+-+10.0.0.0 ; https://www.siagri.com.br/produto/siagri-essencial/
- **Grau**: geração das EFD confirmada; tratamento de 0190/0200/0205/0220/H010: **não confirmado**.

### 6.2 Reforma Tributária (IBS/CBS, cClassTrib)
- **Fato** (página oficial "Reforma Tributária" e "Cadastro e Configuração de Tributos e Classificação Tributária"):
  - **Efis115** Cadastro de Tributos (vigência inicial obrigatória, sem sobreposição); **Efis116** Classificação Tributária (campo "Situação Tributária" numérico de 4 dígitos na tela, onde vai o CST; cClassTrib de 6 dígitos; origem, modalidade: normal, alíquota zero, redução, isenção, não tributado, diferimento, suspensão, outros); **Efis117** Agrupamentos Tributários (itens, parceiros, operações por CFOP/tipo); **Efis118/119/120** base, alíquota e estrutura de tributação (com diferimento); simulador de cálculo; aba "Tributário" no faturamento (Fatu2022/2031/2032).
  - **O cClassTrib não fica no cadastro do produto**: o produto entra num **agrupamento** (Efis117), e a estrutura (Efis120) liga agrupamento de itens + parceiros + operações + UF + vigência à classificação.
  - Tabela cClassTrib importada do Portal da Reforma Tributária (Efis116B).
  - Artigos da Aliare (blog) reforçam: revisar NCM, cClassTrib, unidades, descrições e CFOPs para a Apuração Assistida (texto genérico, não técnico).
- **Consequência**: no Siagri, o saneamento de NCM/grupo de um item **não reclassifica sozinho** o IBS/CBS; o item precisa estar no agrupamento certo. O InTAX deve: (a) após unificar/recodificar, alertar "incluir o código mantido nos agrupamentos tributários (Efis117) em que o eliminado estava"; (b) conferir NCM × agrupamento (ex.: insumo com redução de 60% fora do agrupamento de redução); (c) entregar a lista "produto → agrupamento sugerido" para uso na Ferramenta de Inclusão (filtro por faixa de código e NCM).
- **Fontes**: https://siagri.atlassian.net/wiki/spaces/AGB/pages/4747067393/Reforma+Tribut+ria ; https://siagri.atlassian.net/wiki/spaces/AGB/pages/4957470721 ; https://www.aliare.co/reforma-tributaria-agribusiness/ ; https://www.aliare.co/reforma-tributaria-siagri-agribusiness/ ; https://www.aliare.co/reforma-tributaria-cadastro-fiscal/ ; https://www.aliare.co/erros-de-cadastro-apuracao-assistida/
- **Grau**: confirmado para Siagri AgriBusiness. Versão mínima que traz o configurador: **não confirmado** (é dúvida aberta nos próprios comentários da página).

---

## Perfil Aliare Siagri no InTAX: o que implementar

### Confirmado (pode virar regra/alerta)
1. Identificação do produto Aliare: perguntar "Siagri AgriBusiness, Essencial, Web/Simer, Agrimanager, Datacoper ou Solution" e a versão; as regras abaixo valem para o **AgriBusiness**.
2. Extração: cadastro TRAN1071 + TRAN107B separados; composição do estoque consolidado por depósito/lote; Kardex Analítico; lotes Tran1076; SPED 0200/H010.
3. Descrição máxima de 120 caracteres.
4. NCM: cruzar com a tabela vigente; o Siagri não remove NCM extinto do cadastro.
5. Registro MAPA: checar produto sem registro (produto e lote), e lotes do mesmo item com registros diferentes.
6. Lote vencido com saldo = primeiro filtro (bloqueio de uso por prazo).
7. Período encerrado bloqueia saldos: ajustes na data corrente.
8. Código antigo guardado em "Código Original" ao recodificar (sugestão, ver pergunta 3).
9. Correção tributária em massa via TRAN539 (só campos de ICMS/IPI/benefício/DIFAL/FCP); entregar "DE → PARA".
10. Reforma: cClassTrib por **agrupamento** (Efis117/Efis120), não no produto; alerta de agrupamento após unificar/recodificar; lista produto → agrupamento para a Ferramenta de Inclusão.
11. Itens com receituário/agrotóxico: alteração com responsável técnico.

### A confirmar com o cliente ou com a Aliare (perguntas objetivas)
1. O Siagri permite **excluir** produto com movimento? Existe campo/situação **inativo** no TRAN1071 e ele bloqueia venda, compra e inventário?
2. É possível **trocar a unidade** de um produto com saldo ou movimento? Se não, qual o procedimento padrão (novo código + transferência)?
3. Existe rotina de **unificação/substituição de produtos**? Se não, o caminho recomendado é transferência de saldo + inativação? O campo "Código Original" é editável e serve para isso?
4. Há **importação de planilha** (ou serviço da Aliare) para alterar em massa NCM, descrição, grupo e unidade no cadastro?
5. Qual relatório exporta o **cadastro completo de produtos** (com unidade, conversões, NCM, registro MAPA, situação) em Excel?
6. Qual relatório traz a **data da última movimentação** por produto/depósito?
7. Como são as **conversões de unidade/embalagem** (unidade de estoque × de venda × tributável)?
8. Onde ficam **princípio ativo, classe toxicológica, RENASEM** e dados de grãos (umidade, impureza)?
9. O SPED gera **0205** quando a descrição muda e **0220** para conversões? O H010 é gerado do saldo por depósito ou consolidado?
10. A partir de qual **versão** o configurador da Reforma (Efis115–Efis120) está disponível, e o cliente já está nela?
11. Saldos de grãos de terceiros (armazém geral) ficam no estoque próprio ou só no módulo de armazenagem?

---

## Resumo

A documentação técnica pública do Siagri é escassa: não há manual de cadastro nem API publicados, e a base de conhecimento exige login. A fonte útil é o **Portal de Documentação Aliare (Confluence, acesso anônimo)**, com notas de versão do Siagri AgriBusiness. Dele saem fatos confirmados: cadastro TRAN1071/TRAN107B com "Código Original" e descrição de 120 caracteres; registro MAPA no produto e no lote (Tran1076) indo para a NF-e; controle por lote/validade, Kardex, composição do estoque exportável e bloqueio de períodos encerrados; manutenção tributária em massa (TRAN539, só campos de ICMS/IPI); importação de NCM que não limpa códigos extintos; e, na Reforma, cClassTrib ligado a **agrupamentos tributários** (Efis115–Efis120), não ao produto. Ficam sem confirmação: exclusão × inativação, troca de unidade, unificação, importação de cadastro por planilha, última movimentação, conversões, RENASEM/umidade e o tratamento de 0190/0200/0205/0220/H010 — tudo listado como perguntas à Aliare.
