# Perfil de ERP: TOTVS Protheus (saneamento de estoques e cadastro de produtos)

Levantamento feito em 26/11/2026 só em fontes oficiais da TOTVS: TDN (tdn.totvs.com, Linha Microsiga Protheus) e Central de Atendimento TOTVS (centraldeatendimento.totvs.com, artigos públicos). Fóruns, blogs e terceiros não foram usados como fundamento.

Legenda de grau: **confirmado** = o fato está escrito em página oficial da TOTVS citada ao lado; **não confirmado** = não achei página oficial que o afirme (o texto diz por quê); **inferência** = conclusão minha a partir de fatos confirmados, marcada como tal.

## 0. Fontes e limites do levantamento

| Fonte | Situação | Observação |
|---|---|---|
| TDN, espaço PROT (Linha Microsiga Protheus) | Público, lido página a página | Documentação de rotinas (MATA010, MATA260/261, MATA280, SPEDFISCAL), FAQs "PEST" do Estoque e documentos técnicos (DT) de correções |
| Central de Atendimento TOTVS | Artigos públicos, lidos no navegador | Os links antigos (IDs 360…, 1500…, 13993…) redirecionam para novos IDs (56…); usei os endereços novos |
| Dicionário de dados (SX2/SX3) completo | **Não achei versão pública oficial** do dicionário do Protheus por campo | Os nomes de campo abaixo só estão como "confirmado" quando aparecem em página oficial da TOTVS. O dicionário completo fica no próprio ambiente do cliente (Configurador > Base de Dados > Dicionário) |
| Portal de APIs (api.totvs.com.br) | Não consultado diretamente | Ver item 4.4 |
| Conteúdo com login | Não acessado | Nada foi contornado |

Versão: as páginas e DTs lidas cobrem a P12 até as releases 12.1.2410 e 12.1.2510 (citadas em DTs de 2025–2026, por exemplo a DT do FISA170 com IBS/CBS "P12.1.2510"). Não confirmei qual é a release mais nova liberada hoje; isso não mudou nenhuma regra abaixo.

Tabelas confirmadas (nome oficial): SB1 – Descrição Genérica do Produto; SB2 – Saldos Físico e Financeiro; SB9 – Saldos Iniciais; SBJ/SBK – saldos iniciais por lote/endereço; SB8 – saldos por lote; SBM – Grupo de Produto; SAH – Unidades de Medida; SD1 – Itens das NF de Entrada; SD2 – Itens de Venda da NF; SD3 – Movimentações Internas; SBZ – Indicadores de Produtos; AIF – histórico de alterações de produto; SYD – Nomenclatura Comum do Mercosul. Fontes nos itens abaixo.

---

## 1. Cadastro de produtos (SB1, rotina MATA010)

### 1.1 Rotina e chave

- **Fato.** O cadastro é a rotina MATA010 (Produtos), tabela SB1. O código `B1_COD` não pode ser alterado depois de incluído: a TOTVS diz que ele é o identificador do produto em todo o ERP. Há ExecAuto/MVC documentado para incluir (3), alterar (4) e excluir (5) produto.
- **Consequência.** No Protheus, "mudar o código" de um item nunca é edição do cadastro; é sempre "novo código + transferência de saldo + bloqueio do antigo" (ver 3c e 3g).
- **Fonte.** https://tdn.totvs.com/display/PROT/Produtos+-+MATA010+-+Estoque+-+P12 (seção 03, "Bloqueio de Campos"; seção 02, exemplos).
- **Grau.** Confirmado.

### 1.2 Campos-chave

| Campo | O que é (oficial) | Fonte | Grau |
|---|---|---|---|
| `B1_COD` | Código do produto; não editável | MATA010 P12 (acima) | Confirmado |
| `B1_DESC` | Descrição; alterações gravam histórico na AIF se `MV_HISTTAB` = .T. | https://tdn.totvs.com/pages/viewpage.action?pageId=702823280 | Confirmado |
| `B1_TIPO` | Tipo do produto (ex.: PA, MP, MC, BN…), "apenas informativo", salvo BN; afeta o Bloco K | MATA010 P12; Central: https://centraldeatendimento.totvs.com/hc/pt-br/articles/56867614632851 | Confirmado |
| `B1_GRUPO` → SBM | Grupo de produto (rotina MATA035, tabela SBM) | https://tdn.totvs.com/display/PROT/Grupos+de+Produtos+-+MATA035 (lista "SBM - Grupo de Produto"); uso de B1_GRUPO no SPED (MV_COMBUS) na página SPDFIS | Confirmado |
| `B1_UM` | 1ª unidade, usada "em todos os movimentos desde a compra até a venda" | MATA010 P12; Central 2ª UM: https://centraldeatendimento.totvs.com/hc/pt-br/articles/56836052745747 | Confirmado |
| `B1_SEGUM` | 2ª unidade | Central 2ª UM; https://tdn.totvs.com/x/ZaK8Hg | Confirmado |
| `B1_CONV` | Fator de conversão 1ª↔2ª UM | idem | Confirmado |
| `B1_TIPCONV` | Tipo de conversão: M (multiplicador) ou D (divisor) | idem; PEST01009: https://tdn.totvs.com/pages/viewpage.action?pageId=235594412 | Confirmado |
| `B1_POSIPI` | "Pos.IPI/NCM"; consulta na tabela SYD; existem também `B1_EX_NCM` e `B1_EX_NBM` | https://tdn.totvs.com/pages/viewpage.action?pageId=528468928 ; https://tdn.totvs.com/pages/viewpage.action?pageId=286213504 | Confirmado |
| `B1_ORIGEM` | Origem da mercadoria (0 nacional, 1 importação direta, 2 adquirida no mercado interno…) | MATA010 P12 (campo "Origem"); DT Bloco H: https://tdn.totvs.com/pages/viewpage.action?pageId=339509615 | Confirmado |
| `B1_MSBLQL` | "Blq. de Tela": bloqueio de uso; `'1'` = bloqueado | Central: https://centraldeatendimento.totvs.com/hc/pt-br/articles/56867629820819 ; DT MATA310: https://tdn.totvs.com/pages/viewpage.action?pageId=287061728 | Confirmado |
| `B1_CODBAR` | Código de barras; o sistema calcula e acrescenta o dígito verificador | https://tdn.totvs.com/pages/viewpage.action?pageId=451256358 | Confirmado |
| `B1_CODGTIN` | GTIN usado no 0200 (alternativa ao B1_CODBAR) | SPDFIS: https://tdn.totvs.com/pages/viewpage.action?pageId=652398035 (campo 4 do 0200) | Confirmado |
| `B1_FABRIC` | "Fabricante"; usado por outras áreas (ex.: serviços), não pela solicitação de compras | https://tdn.totvs.com/pages/viewpage.action?pageId=284350567 | Confirmado |
| `B1_ATIVO` | Campo "Ativo" existe; a integração SFA trata como inativo se `B1_ATIVO` ≠ 'S' ou `B1_MSBLQL` = 1 | DT: https://tdn.totvs.com/pages/viewpage.action?pageId=359473597 ; Central SFA: https://centraldeatendimento.totvs.com/hc/pt-br/articles/56867753904275 | Existência confirmada; **efeito no ERP fora do SFA não confirmado** (o help do campo foi reescrito, mas o texto não está na página) |
| `B1_GRTRIB` | "Grupo Trib." do produto (usado em filtros do Perfil de Produto do Configurador de Tributos) | https://tdn.totvs.com/pages/viewpage.action?pageId=1098659342 | Confirmado |
| `B1_CEST` | Código CEST; levado ao campo 13 do 0200; não obrigatório para NFC-e | https://tdn.totvs.com/display/PROT/MSERV-4064_DT_B1_CEST ; https://tdn.totvs.com/display/PROT/DVARLOJ3-433+DT+NAO+OBRIGATORIEDADE+DO+CAMPO+B1_CEST+PARA+NFCE | Confirmado |
| `B1_CODANT` | "Cod Ant": código anterior; gera o 0205 (código anterior) | Central 0205: https://centraldeatendimento.totvs.com/hc/pt-br/articles/56862677795603 ; SPDFIS | Confirmado |
| `B1_RASTRO` | Rastreabilidade: L (lote), S (sublote), ou não utiliza; depende de `MV_RASTRO` | PEST10008: https://tdn.totvs.com/pages/viewpage.action?pageId=367232994 | Confirmado |
| `B1_LOCALIZ` | "Contr. Ender.": controle de endereço; depende de `MV_LOCALIZ` | https://tdn.totvs.com/pages/viewpage.action?pageId=555274482 | Confirmado |
| `B1_DATREF` | Campo padrão usado como "data de cadastro" no 0200 (parametrizável) | SPDFIS (seção do 0200) | Confirmado |
| `B1_UPRC` / `B1_CUSTD` | Último preço de compra / custo standard (MATA320) | https://tdn.totvs.com/pages/viewpage.action?pageId=448601697 | Confirmado |
| `B1_LOCPAD` | Armazém padrão | MATA010 P12 (exemplo ExecAuto) | Confirmado |
| `B1_UCOM` (data da última compra) | — | Não achei página oficial que descreva | **Não confirmado** |

- **Consequência (SBZ).** Vários dados do produto podem estar na tabela SBZ (Indicadores de Produtos, por filial) em vez da SB1, conforme o parâmetro `MV_ARQPROD` (SB1 ou SBZ). Ex.: a TOTVS cita que a origem só é lida da SB1 quando `MV_ARQPROD = 'SB1'` e que o Grupo Trib. usa a SBZ. O InTAX deve perguntar ao cliente o valor de `MV_ARQPROD` e, se for SBZ, pedir também a SBZ no export. Fontes: https://tdn.totvs.com/pages/viewpage.action?pageId=339509615 ; https://tdn.totvs.com/pages/viewpage.action?pageId=1098659342 . Grau: confirmado (que existe a dependência); a lista exata de campos que migram para a SBZ: não confirmada.
- **Consequência (compartilhamento).** A SB1 pode estar compartilhada entre filiais e a SB2 exclusiva; a TOTVS registra efeitos disso no SPED (0200 duplicado com `MV_COFLSPD`). O export deve trazer a filial (`B1_FILIAL`/`B2_FILIAL`). Fonte: https://tdn.totvs.com/pages/viewpage.action?pageId=788612446 . Grau: confirmado.

### 1.3 Reforma Tributária (IBS/CBS, CST, cClassTrib)

- **Fato.** No Protheus, CST e cClassTrib de IBS/CBS/IS **não aparecem documentados como campos da SB1**. Eles ficam no Configurador de Tributos (CFGTRIB/FISA170): regra de escrituração (tabela CJ2, campo `CJ2_CSTCCT` = cClassTrib; `CJ2_CCTVIG` = vigência), classificação por CST (CKB), perfis vinculados ao cenário (CJG), Perfil de Operação (F20), tributos IBSEST, CBSFED, ISFED (F2E). O produto entra pela via do **Perfil de Produto** do configurador (ligação do código na SB1 ao perfil, inclusive por filtro de campos como `B1_TIPO` e `B1_GRTRIB`). Há um assistente que importa a tabela de CST/cClassTrib pela API do governo.
- **Consequência.** No saneamento, "cClassTrib do produto" no Protheus = em que Perfil de Produto o item está e qual regra o perfil usa. Alerta do InTAX: ao **criar código novo** (troca de código, consolidação, mudança de tipo), o código novo tem que ser incluído nos mesmos Perfis de Produto do antigo, ou estar coberto pelo filtro do perfil; ao mudar `B1_TIPO`/`B1_GRTRIB`, o produto pode **entrar ou sair** de perfis automáticos. O export do consultor deve incluir a relação produto × perfil do Configurador de Tributos.
- **Fontes.** https://tdn.totvs.com/pages/viewpage.action?pageId=1104717414 (CLASSTRIB – Reforma Tributária: tabelas e campos) ; https://tdn.totvs.com/pages/viewpage.action?pageId=1027813812 (Otimizador de Perfis – Produtos: filtro por `B1_TIPO`, inclusão automática) ; https://tdn.totvs.com/pages/viewpage.action?pageId=1079781431 (vincular produto da MATA010 a perfil) ; https://tdn.totvs.com/pages/viewpage.action?pageId=1020394255 (Assistente de Configuração – Reforma) ; https://tdn.totvs.com/pages/viewpage.action?pageId=945408020 (Central de Conteúdo Reforma/CFGTRIB).
- **Grau.** Confirmado que CST/cClassTrib ficam no Configurador de Tributos; **não confirmado** que não exista nenhum campo de cClassTrib na SB1 em alguma release (não achei página que crie esse campo para o Protheus; as páginas "cClassTrib no cadastro de produtos" achadas são de outras linhas: Datasul, Gemco, Varejo/PDV, e não valem para o Protheus).
- **Nome de tabela/campo do Perfil de Produto.** A página do MATA010 lista "F24 - Perfil Tributário de Produto" entre as tabelas usadas. O nome do campo de ligação não está nas páginas lidas: **não confirmado**.

---

## 2. Saldos e última movimentação

### 2.1 Saldo atual por armazém (SB2)

- **Fato.** SB2 guarda o saldo por produto e armazém: `B2_FILIAL`, `B2_COD`, `B2_LOCAL`, `B2_QATU` (saldo físico atual), `B2_VATU1` (valor), `B2_CM1` (custo médio). A consulta F4 do produto mostra a composição do saldo disponível: `B2_RESERVA`, `B2_QEMP` (empenhos), `B2_QACLASS` (a endereçar), `B2_QEMPSA`, `B2_QEMPPRJ`, `B2_QTNP` (de terceiros em nosso poder), `B2_QNTP` (nosso em poder de terceiros), `B2_SALPEDI` (entrada prevista), `B2_QPEDVEN`, `B2_QTER`, `B2_QEMPPRE`. Saldo por lote fica na SB8 (`B8_SALDO`, `B8_LOCAL`).
- **Consequência.** O InTAX deve tratar como "saldo" o `B2_QATU` somado por produto (e por filial), e como "comprometido" os campos de empenho/reserva/entrada prevista. Produto com qualquer um desses diferente de zero **não pode ser excluído** e não deve ser bloqueado sem antes regularizar (ver 3b e 3f).
- **Fontes.** F4: https://tdn.totvs.com/display/PROT/PEST01011+-+Conceito+do+Consulta+F4+do+produto+e+seus+campos ; campos B2_COD/B2_LOCAL/B2_CM1/B8_SALDO: https://tdn.totvs.com/pages/viewpage.action?pageId=1118779156 ; B2_VATU1: https://tdn.totvs.com/pages/viewpage.action?pageId=853914568
- **Grau.** Confirmado.

### 2.2 Movimentos (SD1, SD2, SD3)

- **Fato.** SD1 = itens das notas de entrada; SD2 = itens das notas de saída (venda); SD3 = movimentações internas (requisições/devoluções RE/DE, produção PR, transferências RE4/DE4). Campos confirmados em páginas oficiais: `D1_COD`, `D1_QUANT`, `D1_DTDIGIT`, `D1_UM`; `D2_COD`, `D2_LOCAL`, `D2_EMISSAO`, `D2_DTDIGIT`, `D2_QUANT`; `D3_COD`, `D3_LOCAL`, `D3_EMISSAO`, `D3_CF` (tipo RE/DE), `D3_TM`, `D3_OP`, `D3_QUANT`, `D3_ESTORNO`.
- **Consequência.** A última movimentação por produto pode ser calculada como a maior data entre SD1 (`D1_DTDIGIT`), SD2 (`D2_EMISSAO`) e SD3 (`D3_EMISSAO`), por `*_COD` (e `*_LOCAL`). Movimentos estornados da SD3 têm `D3_ESTORNO` preenchido e devem ser excluídos do cálculo (o comportamento exato do campo é regido por `MV_D3ESTOR`: ver fonte). Transferências RE4/DE4 contam como movimento.
- **Fontes.** Smart View Resumo de Entradas e Saídas (SD1/SD2/SD3, D3_CF): https://tdn.totvs.com/pages/viewpage.action?pageId=774613029 ; índice SD2 com D2_COD+D2_LOCAL+D2_DTDIGIT e D2_EMISSAO: https://tdn.totvs.com/pages/viewpage.action?pageId=511545542 ; índice SD3 com D3_EMISSAO, D3_CF, D3_COD, D3_LOCAL, D3_TM: https://tdn.totvs.com/pages/viewpage.action?pageId=873207017 ; D1_DTDIGIT: https://tdn.totvs.com/pages/viewpage.action?pageId=1147684995 ; D1_UM: https://tdn.totvs.com/display/PROT/13573510+DSERFIS1-29423+DT+-+SPED+FISCAL+0200+INFORMANDO+UNIDADE+DE+MEDIDA+DIFERENTE+DO+DOCUMENTO+FISCAL ; D3_ESTORNO/MV_D3ESTOR: https://tdn.totvs.com/pages/viewpage.action?pageId=270098455
- **Grau.** Nomes de tabelas e campos: confirmado. A regra "maior data entre as três" é **inferência** (método de cálculo do InTAX, não rotina da TOTVS).

### 2.3 Campo pronto de "última saída": `B2_USAI`

- **Fato.** SB2 tem `B2_USAI` ("Dt.Ult.Saida"), data da última saída por produto/armazém. A própria TOTVS usa esse campo como critério de **produto obsoleto** no relatório Análise de Estoques (MATR290) e no Smart View ESTSV011 ("Lista só produtos obsoletos?" + "Data limite"). Há também `B2_DINVENT` (data do último inventário).
- **Consequência.** Para o filtro "sem movimento há X meses" do InTAX, `B2_USAI` é o atalho oficial; mas ele só olha **saída**. Produto que só recebeu (compra sem venda/consumo) aparece como obsoleto pelo critério TOTVS. Regra do InTAX: usar `B2_USAI` como primeiro filtro e, para os candidatos, conferir a data máxima de SD1/SD2/SD3 (2.2). Houve DT de `B2_USAI` não atualizado após exclusão de NF de saída (corrigida): alerta de "conferir pela SD2 quando a data parecer estranha".
- **Fontes.** MATR290: https://tdn.totvs.com/pages/viewpage.action?pageId=348295976 ; ESTSV011: https://tdn.totvs.com/pages/viewpage.action?pageId=1140423884 ; DT do B2_USAI: https://tdn.totvs.com/pages/viewpage.action?pageId=392498369 ; B2_DINVENT: https://tdn.totvs.com/pages/viewpage.action?pageId=317296996
- **Grau.** Confirmado. Campo de "última entrada" em SB2 ou `B1_UCOM` em SB1: **não confirmado**.

### 2.4 Fechamento (SB9/SBJ/SBK)

- **Fato.** A Virada de Saldos (MATA280) grava os saldos finais como saldo inicial (SB9; SBJ por lote; SBK por endereço) e **impede movimentos com data menor ou igual à do fechamento**. `MV_A280GRV` define se produtos sem movimento/zerados também ganham registro de saldo inicial. O Bloco H do SPED é montado a partir da SB9 na data de fechamento.
- **Consequência.** (a) Ajustes do saneamento (transferências, inventário) só podem ter data posterior ao último fechamento; o InTAX deve pedir a data do último fechamento e avisar. (b) Exclusão de produto: a existência de registro na SB9 impede a exclusão (ver 3b), mesmo com saldo zero, se `MV_A280GRV` = .T.
- **Fontes.** MATA280: https://tdn.totvs.com/pages/viewpage.action?pageId=450141831 ; Bloco H a partir da SB9: SPDFIS https://tdn.totvs.com/pages/viewpage.action?pageId=652398035
- **Grau.** Confirmado; o item (b) é **inferência** que junta este fato ao 3b.

---

## 3. Restrições que afetam o saneamento

### (a) Trocar unidade de medida

- **Fato.** Para **incluir/alterar a 2ª UM e o fator** (`B1_SEGUM`, `B1_CONV`, `B1_TIPCONV`) em produto que já tem movimento, a TOTVS manda **zerar o saldo antes** (requisição interna valorizada ou inventário), alterar o cadastro e **reimplantar o saldo** (devolução interna); fazer depois do fechamento, com backup e teste em base de homologação. Sem isso há "divergências irremediáveis" entre as unidades. Para trocar a **1ª UM** (`B1_UM`) de produto movimentado, não achei procedimento oficial do Protheus.
- **Consequência.** Alerta "unidade/conversão" no perfil Protheus: (1) mudança só da 2ª UM/fator: roteiro zerar → alterar → reimplantar, após fechamento; (2) mudança da 1ª UM: tratar como **novo código** + transferência MATA261 + bloqueio do antigo (mesma solução que a TOTVS dá para tipo, lote e endereço). Além disso, a EFD exige que o fator do 0220 não mude para o mesmo código de unidade entre arquivos: se o fator mudar, usar novo código de unidade comercial.
- **Fontes.** PEST01009: https://tdn.totvs.com/pages/viewpage.action?pageId=235594412 ; Central 2ª UM: https://centraldeatendimento.totvs.com/hc/pt-br/articles/56836052745747 ; Central "incluir saldo na 2ª UM de produto com saldo": https://centraldeatendimento.totvs.com/hc/pt-br/articles/56853211944083
- **Grau.** 2ª UM: confirmado. 1ª UM: **não confirmado** (a recomendação "novo código" é inferência por analogia com 3e/3g).

### (b) Excluir produto com movimento

- **Fato.** A exclusão na MATA010 é barrada com o help "FWFORMCANCEL – Violação de Integridade" quando o código existe em outras tabelas (SB2, SB6, SB9, empenho, entrada prevista, poder de terceiros, pedido de venda etc.). Só exclui quando não há vínculo nenhum. A saída oficial é **bloquear** (`B1_MSBLQL` = Sim), depois de zerar/regularizar o que aparece na F4. A verificação de vínculos usa os relacionamentos do dicionário (SX9; parâmetro `MV_MVCMTHR` para fazer isso em multithread). Há ainda o acesso de usuário "Excluir produtos" e pontos de entrada de validação (MTA010OK, MT010EXC).
- **Consequência.** No Protheus o InTAX **nunca** deve propor "excluir" item com histórico; a ação padrão é "inativar = bloquear `B1_MSBLQL`". Exclusão só para item sem nenhum registro em SB2/SB9/SD1/SD2/SD3/pedidos (cadastro duplicado nunca usado).
- **Fontes.** Central FWFORMCANCEL: https://centraldeatendimento.totvs.com/hc/pt-br/articles/56867629820819 ; MATA010 P12 (MV_MVCMTHR e pontos de entrada).
- **Grau.** Confirmado.

### (c) Trocar o código (`B1_COD`)

- **Fato.** Não é possível alterar `B1_COD`; não há forma segura, pois o código é chave em Estoque, Compras, Faturamento e Fiscal. Roteiro oficial para o SPED: ativar `MV_HISTTAB`, criar novo produto com as mesmas características, informar o código antigo em `B1_CODANT` (aba Outros), movimentar. O 0205 só sai **no mês em que o código novo tiver movimento**, não no mês da alteração.
- **Consequência.** Alerta "mudou código": (1) criar código novo (cópia na MATA010) com `B1_CODANT` = código antigo; (2) transferir saldo pela MATA261; (3) bloquear o antigo; (4) incluir o novo nos Perfis de Produto do Configurador de Tributos; (5) avisar que o 0205 aparece só quando houver movimento do novo código.
- **Fontes.** Central 0205: https://centraldeatendimento.totvs.com/hc/pt-br/articles/56862677795603 ; MATA010 P12 (bloqueio de B1_COD) ; SPDFIS (0205 a partir da AIF e do B1_CODANT): https://tdn.totvs.com/pages/viewpage.action?pageId=652398035
- **Grau.** Confirmado.

### (d) Mudar NCM, grupo ou tipo com movimento

- **Fato (tipo).** `B1_TIPO` pode ser alterado na própria MATA010; o sistema não impede, mas há impacto no Bloco K, em lançamentos padrão, relatórios e consultas. A sugestão da TOTVS é copiar o produto com o tipo novo, transferir o saldo pela MATA261 e bloquear o antigo, preservando a integridade fiscal do histórico.
- **Fato (NCM).** `B1_POSIPI` é editável (consulta à tabela SYD). Não achei restrição de alteração com movimento. A Consultoria Tributária TOTVS orienta que a NF de devolução pode reproduzir o NCM da nota original, mesmo que o cadastro tenha mudado. Regras de pauta/MVA do Configurador de Tributos podem estar por NCM.
- **Fato (grupo).** Não achei restrição oficial para trocar `B1_GRUPO`; o grupo é usado em filtros de relatórios, em `MV_COMBUS` (geração do registro 0206 – código ANP de combustíveis) e pode ser usado em perfis/filtros.
- **Consequência.** Alerta "NCM": mudança direta no cadastro (MATA010), com aviso de: revisar o Perfil de Produto/regras por NCM no Configurador de Tributos; devoluções de notas antigas podem sair com o NCM antigo; o NCM no 0200 reflete o cadastro atual. Alerta "tipo": preferir novo código + MATA261 quando o produto entra no Bloco K. Grupo: alteração direta, com aviso para relatórios/filtros/perfis.
- **Fontes.** Central B1_TIPO: https://centraldeatendimento.totvs.com/hc/pt-br/articles/56867614632851 ; NCM e devolução (Consultoria de Segmentos TOTVS): https://tdn.totvs.com/pages/viewpage.action?pageId=1076450926 ; regras por NCM no CFGTRIB: https://tdn.totvs.com/display/PROT/CFGTRIB+-+Perguntas+e+Respostas+-+Configurador+de+Tributos ; MV_COMBUS: SPDFIS.
- **Grau.** Tipo e devolução: confirmado. "Sem restrição técnica para NCM e grupo com movimento": **não confirmado** (não achei página que afirme ou negue).

### (e) Lote, endereço, rastro (`B1_RASTRO`, `B1_LOCALIZ`)

- **Fato.** **Ligar** rastro em produto com saldo: backup, fechamento completo, `MV_RASTRO` = S, alterar `B1_RASTRO`, distribuir o saldo em lotes pela MATA390; lote não aceita saldo negativo. **Desligar** rastro ou endereço: só com saldo totalmente zerado (Refaz Saldos MATA300 e Refaz Empenhos MATA215, sem empenho/reserva/pedido), requisitar ou inventariar, alterar o campo, devolver o saldo. A TOTVS indica como **alternativa mais efetiva**: copiar o produto para novo código sem o controle, transferir pela MATA261 e bloquear o antigo.
- **Consequência.** Item com `B1_RASTRO` ≠ não utiliza ou `B1_LOCALIZ` = S exige, em qualquer transferência/consolidação, informar lote/endereço de origem e destino. Alerta específico quando o ajuste mexe nesses controles.
- **Fontes.** PEST10008: https://tdn.totvs.com/pages/viewpage.action?pageId=367232994 ; Central desligar endereço: https://centraldeatendimento.totvs.com/hc/pt-br/articles/56843663250963 ; Central desligar rastro: https://centraldeatendimento.totvs.com/hc/pt-br/articles/56850647082515 ; endereçamento: https://tdn.totvs.com/pages/viewpage.action?pageId=555274482
- **Grau.** Confirmado.

### (f) Efeito do bloqueio (`B1_MSBLQL`) em documentos e inventário

- **Fato.** Bloqueado, o produto continua cadastrado mas não pode ser usado em novos processos: qualquer rotina que tente selecioná-lo dá o help REGBLOQ. Exemplos oficiais: não permite digitação de inventário (MATA270) nem Mestre de Inventário (ACDA030, inclusão manual); não permite transferência entre filiais (MATA310); impede apontamento de OP com componente bloqueado (MATA681); integração TOTVS Colaboração de pedido de venda rejeita produto bloqueado; perfis do Configurador de Tributos ignoram produto bloqueado na consulta por filtro. Só o usuário administrador acessa o campo (segundo o artigo).
- **Consequência.** **Ordem obrigatória no InTAX: primeiro zerar o saldo (transferência/inventário), depois bloquear.** Se bloquear com saldo, o cliente fica sem como inventariar ou transferir o item até desbloquear. Também: pedidos, empenhos e entradas previstas devem ser encerrados antes.
- **Fontes.** Central FWFORMCANCEL (bloqueio e REGBLOQ): https://centraldeatendimento.totvs.com/hc/pt-br/articles/56867629820819 ; MATA270: https://tdn.totvs.com/pages/viewpage.action?pageId=359473665 ; ACDA030: https://tdn.totvs.com/pages/viewpage.action?pageId=578045331 e https://tdn.totvs.com/display/PROT/1458334+DMANMAT01-3201+DT+MESTRE+DE+INVENTARIO+COM+PRODUTO+BLOQUEADO ; MATA310: https://tdn.totvs.com/pages/viewpage.action?pageId=287061728 ; MATA681: https://tdn.totvs.com/pages/viewpage.action?pageId=937696195 ; TOTVS Colaboração: https://tdn.totvs.com/pages/viewpage.action?pageId=705433089 ; Gestor de Tributos: https://tdn.totvs.com/pages/viewpage.action?pageId=1098659342
- **Grau.** Confirmado. Efeito em NF de entrada/saída em geral: confirmado só pelo texto genérico do artigo ("qualquer rotina"); não li DT específica para MATA103/MATA460.

### (g) Unificar dois produtos

- **Fato.** Não há rotina nativa de "fusão" de cadastros. O caminho oficial é a **Transferência Múltipla (MATA261)**, que transfere saldo **de um código de produto para outro** (e entre lotes/endereços), gerando requisição RE4 no produto origem e devolução DE4 no destino, valorizadas pelo custo médio. A MATA260 (transferência simples) foi **descontinuada em 04/04/2022**; a MATA261 tem ExecAuto. A transferência não se exclui; desfaz-se por estorno (por item ou documento). A TOTVS descreve a transferência entre códigos justamente como forma de corrigir inconsistências de informação. Há ponto de entrada (MT261UM) para tratar conversão de UM na transferência.
- **Consequência.** Ação "consolidou" no Protheus: escolher o código sobrevivente; transferir pela MATA261 o saldo de cada código absorvido (por armazém, lote e endereço) para o sobrevivente; conferir que ambos estão na mesma 1ª UM (se não, converter a quantidade antes: alerta); bloquear os absorvidos; se o sobrevivente for código novo, `B1_CODANT` só guarda **um** código anterior (os demais ficam sem 0205 de código: alerta). Fazer com data posterior ao último fechamento.
- **Fontes.** Central MATA261: https://centraldeatendimento.totvs.com/hc/pt-br/articles/56863243789075 ; PEST11002: https://tdn.totvs.com/pages/viewpage.action?pageId=235593819 ; MATA260: https://tdn.totvs.com/pages/viewpage.action?pageId=346495993 ; descontinuação: https://tdn.totvs.com/pages/viewpage.action?pageId=607042817
- **Grau.** Confirmado. A observação "B1_CODANT guarda um código" é **inferência** do fato de ser um campo único; a TOTVS não trata o caso de N códigos.

### (h) Alterar descrição

- **Fato.** `B1_DESC` é editável. Com `MV_HISTTAB` = .T., cada alteração de `B1_DESC` (e das margens `B1_PICMENT`/`B1_PICMRET`) grava um registro na AIF, que alimenta o 0205 (descrição anterior); `MV_205HIST` define quantos meses para trás o SPED considera.
- **Consequência.** Alerta "mudou descrição": antes de alterar, conferir que `MV_HISTTAB` está ligado; sem ele, o 0205 não sai. Mudança de descrição que altere a natureza do item deve virar código novo (regra do Guia Prático da EFD; ver documento de saneamento do InTAX).
- **Fontes.** https://tdn.totvs.com/pages/viewpage.action?pageId=702823280 ; SPDFIS (MV_HISTTAB, MV_205HIST, 0205): https://tdn.totvs.com/pages/viewpage.action?pageId=652398035
- **Grau.** Confirmado.

---

## 4. Ferramentas oficiais para correções em massa

### 4.1 ExecAuto / MVC da MATA010

- **Fato.** A TDN publica exemplos de rotina automática da MATA010 sem MVC (`MSExecAuto` com opções 3, 4, 5) e com MVC (modelo `MATA010`, submodelo `SB1MASTER`, `FWMVCRotAuto`). O parâmetro `MV_CADPROD` define cadastros complementares (SA5, SBZ, SB5, DH5, SGI) que a rotina automática respeita.
- **Consequência.** É o caminho para **alteração em lote** (descrição, NCM, grupo, bloqueio) pelo time de TI do cliente ou parceiro TOTVS. O InTAX entrega a planilha; quem roda é o cliente.
- **Fonte.** MATA010 P12 (seções 02 e 06); PEST01018: https://tdn.totvs.com/pages/viewpage.action?pageId=384565594
- **Grau.** Confirmado.

### 4.2 MILE (importador de layout)

- **Fato.** A MATA010 aceita o MILE (Model Integrator Layout Engine) **só para inclusão**; a TOTVS diz que a rotina não é compatível com alteração. O submodelo SBZ não deve ser usado no MILE. Com Perfil Tributário, recomenda desligar `MV_FACAUTO` durante a importação.
- **Consequência.** MILE serve para **criar os códigos novos** (troca de código, consolidação em código novo), não para corrigir os existentes.
- **Fonte.** MATA010 P12 (seção 09 – MILE).
- **Grau.** Confirmado.

### 4.3 Importação por CSV

- **Fato.** Há na TDN rotinas de importação por CSV de cadastro de produtos (SB1) e de saldos iniciais (SB9/SBJ/SBK), com log, publicadas como artefato (zip) no espaço "Aceleradores + IA", não como rotina padrão do produto.
- **Consequência.** Pode ser citada ao cliente como acelerador; não tratar como funcionalidade padrão. Não confirmei se a de produtos faz alteração.
- **Fontes.** https://tdn.totvs.com/pages/viewpage.action?pageId=633061157 ; https://tdn.totvs.com/pages/viewpage.action?pageId=633060609
- **Grau.** Existência confirmada; suporte a alteração: **não confirmado**.

### 4.4 APIs REST / integração

- **Fato.** O produto é integrado pela Mensagem Única **ITEM** (adapter EAI `MATI010`, versões até 4.005, JSON a partir da 4.000); a mensagem padronizada pode trafegar por REST. Não achei, em página oficial da linha Protheus, uma API REST pública de produtos com PUT/PATCH documentado (as APIs de "products" achadas são de outras linhas: WinThor etc.).
- **Consequência.** O InTAX não deve prometer correção "via API" no Protheus; o caminho é planilha → ExecAuto/MVC (alteração) ou MILE (inclusão), executado pelo cliente.
- **Fontes.** MATA010 P12 (seção 08 – Adapter EAI); https://tdn.totvs.com/display/framework/Mensagem+Padronizada+Via+Rest
- **Grau.** EAI/ITEM: confirmado. API REST de produtos para alteração: **não confirmado**.

### 4.5 Outros pontos

- A rotina "Facilitador" da MATA010 permite manutenção de algumas tabelas por parâmetros (`MV_A010FAC` para campos da SB1). Fonte: MATA010 P12. Grau: confirmado (escopo exato da alteração em massa: não confirmado).
- O novo browser "Smart X" da MATA010 mantém as regras de inclusão, alteração e exclusão; muda a tela e ignora o Papel de Trabalho. Fonte: https://tdn.totvs.com/pages/viewpage.action?pageId=1045375397 . Grau: confirmado.

---

## 5. Consulta de extração recomendada (o que o cliente exporta)

Só nomes confirmados em página oficial (itens 1 e 2). O cliente pode extrair por Smart View, relatório ou consulta SQL do seu TI; os nomes físicos das tabelas no banco (sufixo da empresa, ex.: SB1010) dependem do ambiente e não foram confirmados aqui.

**Arquivo 1 – Produtos (SB1), um por linha:**
`B1_FILIAL`, `B1_COD`, `B1_DESC`, `B1_TIPO`, `B1_GRUPO` (+ descrição do grupo na SBM), `B1_UM`, `B1_SEGUM`, `B1_CONV`, `B1_TIPCONV`, `B1_POSIPI`, `B1_EX_NCM`, `B1_CEST`, `B1_ORIGEM`, `B1_GRTRIB`, `B1_CODBAR`, `B1_CODGTIN`, `B1_FABRIC`, `B1_MSBLQL`, `B1_ATIVO`, `B1_RASTRO`, `B1_LOCALIZ`, `B1_LOCPAD`, `B1_CODANT`, `B1_DATREF`, `B1_UPRC`, `B1_CUSTD`.

**Arquivo 2 – Saldos (SB2), um por produto + armazém:**
`B2_FILIAL`, `B2_COD`, `B2_LOCAL`, `B2_QATU`, `B2_VATU1`, `B2_CM1`, `B2_USAI`, `B2_DINVENT`, `B2_RESERVA`, `B2_QEMP`, `B2_SALPEDI`, `B2_QPEDVEN`, `B2_QNTP`, `B2_QTNP`, `B2_QACLASS`.

**Arquivo 3 – Última movimentação por produto (agregado pelo TI do cliente):**
para cada `B1_COD` (e filial): maior `D1_DTDIGIT` da SD1, maior `D2_EMISSAO` da SD2, maior `D3_EMISSAO` da SD3 (sem os estornados, `D3_ESTORNO` preenchido), e a contagem de linhas de cada uma no período analisado.

**Complementos:**
- Se `MV_ARQPROD` = SBZ: a SBZ do produto por filial.
- Lote: SB8 (`B8_SALDO`, `B8_LOCAL`, lote) se `B1_RASTRO` usar lote.
- Data do último fechamento (MATA280) e se `MV_A280GRV` está ligado.
- Valor de `MV_HISTTAB` (histórico AIF para o 0205).
- Relação produto × Perfil de Produto do Configurador de Tributos (Reforma).
- Unidades (SAH) para validar o 0190.

---

## 6. SPED gerado pelo Protheus a partir do cadastro (rotina SPEDFISCAL)

| Registro | Origem no Protheus | Fonte | Grau |
|---|---|---|---|
| 0190 | Cadastro de Produtos (SB1) e Unidades de Medida (SAH) | SPDFIS: https://tdn.totvs.com/pages/viewpage.action?pageId=652398035 | Confirmado |
| 0200 | Cadastro de Produtos (SB1); data de cadastro pelo campo parametrizado (padrão `B1_DATREF`); código de barras de `B1_CODGTIN` ou `B1_CODBAR` só se tiver tamanho GTIN; CEST de `B1_CEST` | idem; DT CEST acima | Confirmado |
| 0205 | Histórico da AIF (`MV_HISTTAB`) para descrição; `B1_CODANT` para código anterior; dois registros separados (descrição e código); só no mês em que há movimento | idem; Central 0205 | Confirmado |
| 0220 | SB1, para itens com 2ª UM cadastrada e movimentados, ou via ponto de entrada SPDFIS02; `MV_GER0220` liga/desliga (padrão .T.); COD_BARRA do 0220 vem de `B5_2CODBAR` (complemento SB5) | idem; DT 0220 com K200/H010: https://tdn.totvs.com/display/PROT/533515+DSERFIS1-702+DT+SPEDFISCAL+REGISTRO+0220+BLOCO+K+E+BLOCO+H | Confirmado |
| H005/H010/H020 | Função a partir dos saldos da SB9 na data do fechamento; exige processar o Registro de Inventário Modelo P7 (MATR460) com geração de arquivo; inclui saldo em terceiros e de terceiros; `B1_ORIGEM` usado no H020 | SPDFIS (Bloco H); MATR460: https://tdn.totvs.com/pages/viewpage.action?pageId=461900714 ; B1_ORIGEM/H020: https://tdn.totvs.com/pages/viewpage.action?pageId=339509615 | Confirmado |

- **Consequências para o saneamento.**
  1. **Unidade no C170 × 0190/0200**: já houve DT em que o 0190/0200 seguiam a UM da nota (`D1_UM`) e o C170 a do cadastro (`B1_UM`); hoje o C170 usa `D1_UM` e cai para `B1_UM` se vazio. Trocar `B1_UM` muda o 0200 dali em diante: o 0220 precisa cobrir a unidade antiga usada nos documentos. Fonte: https://tdn.totvs.com/display/PROT/13573510+DSERFIS1-29423+DT+-+SPED+FISCAL+0200+INFORMANDO+UNIDADE+DE+MEDIDA+DIFERENTE+DO+DOCUMENTO+FISCAL (confirmado).
  2. **0220 só sai com 2ª UM no cadastro**: unidade comercial diferente sem `B1_SEGUM`/`B1_CONV` não gera 0220 (salvo ponto de entrada). Alerta para itens comprados em CX e estocados em UN sem 2ª UM (confirmado pela regra de geração; o efeito no PVA é inferência).
  3. **Bloco H depende do fechamento (SB9) e da MATR460**: inventário do saneamento só aparece no H010 se houver fechamento na data e o P7 processado (confirmado).
  4. **0205 de código**: depende de `B1_CODANT` + movimento do código novo (confirmado).

---

## Perfil TOTVS Protheus no InTAX: o que implementar

### A. Mapeamento de colunas do export (import do InTAX)

| Coluna do InTAX | Campo Protheus | Observação |
|---|---|---|
| Filial | `B1_FILIAL` / `B2_FILIAL` | SB1 pode ser compartilhada (filial vazia) |
| Código | `B1_COD` | Chave; não editável |
| Descrição | `B1_DESC` | |
| Tipo | `B1_TIPO` | Afeta Bloco K e perfis |
| Grupo | `B1_GRUPO` (SBM) | |
| Unidade | `B1_UM` | |
| 2ª unidade / fator / tipo de conversão | `B1_SEGUM` / `B1_CONV` / `B1_TIPCONV` (M/D) | Fator converte 1ª→2ª conforme M ou D |
| NCM / EX | `B1_POSIPI` / `B1_EX_NCM` | |
| CEST | `B1_CEST` | |
| Origem | `B1_ORIGEM` | Pode vir da SBZ se `MV_ARQPROD` = SBZ |
| Grupo tributário | `B1_GRTRIB` | |
| GTIN | `B1_CODGTIN`, `B1_CODBAR` | |
| Fabricante | `B1_FABRIC` | |
| Situação | `B1_MSBLQL` ('1' = bloqueado) e `B1_ATIVO` | Inativo se `B1_MSBLQL` = 1; `B1_ATIVO` só como informação |
| Controle de lote / endereço | `B1_RASTRO` / `B1_LOCALIZ` | |
| Código anterior | `B1_CODANT` | |
| Data de cadastro | `B1_DATREF` (padrão) | Parametrizável no SPED |
| Saldo | soma de `B2_QATU` por produto | por `B2_LOCAL` no detalhe |
| Valor / custo médio | `B2_VATU1` / `B2_CM1` | |
| Comprometido | `B2_RESERVA`, `B2_QEMP`, `B2_SALPEDI`, `B2_QPEDVEN`, `B2_QNTP`, `B2_QTNP`, `B2_QACLASS` | Qualquer ≠ 0 trava exclusão e pede cuidado no bloqueio |
| Última saída | `B2_USAI` (maior por produto) | Critério TOTVS de obsoleto |
| Última movimentação | máx(`D1_DTDIGIT`, `D2_EMISSAO`, `D3_EMISSAO`) | Calculado pelo cliente (arquivo 3) |

### B. Alertas por tipo de ajuste (quando ERP = Protheus)

| Ajuste | Alerta |
|---|---|
| Mudou código | `B1_COD` não muda. Criar novo código (cópia), `B1_CODANT` = antigo, `MV_HISTTAB` ligado, transferir saldo (MATA261), bloquear o antigo, incluir o novo nos Perfis de Produto (Reforma). 0205 só no mês do 1º movimento do novo. |
| Mudou descrição | Alteração direta (MATA010). Conferir `MV_HISTTAB` = .T. antes, senão não há 0205. Se mudou a natureza do item, tratar como código novo. |
| Unidade / conversão (2ª UM, fator) | Zerar saldo (requisição valorizada ou inventário) → alterar `B1_SEGUM`/`B1_CONV`/`B1_TIPCONV` → reimplantar saldo; após fechamento; testar em homologação. Fator do 0220 não pode mudar para o mesmo código de unidade entre períodos. |
| Unidade (1ª UM) | Sem procedimento oficial: recomendar novo código + MATA261 + bloqueio (indicar "não confirmado pela TOTVS"). Revisar 0190/0200/0220. |
| Consolidou | Sem fusão nativa. MATA261 do absorvido para o sobrevivente (por armazém, lote, endereço), mesma 1ª UM ou quantidade convertida, data após o último fechamento, depois bloquear o absorvido. `B1_CODANT` aceita um só código. |
| Inativou | Não excluir item com histórico (FWFORMCANCEL). Zerar saldo e encerrar empenho/reserva/pedido/entrada prevista **antes**; depois `B1_MSBLQL` = Sim. Bloqueado não entra em inventário nem transferência. |
| Excluir | Só item sem nenhum registro em SB2, SB9, SB6, SD1/SD2/SD3, pedidos. Caso contrário, bloquear. |
| NCM | Alteração direta (MATA010, tabela SYD). Revisar regras por NCM e Perfil de Produto no Configurador de Tributos; devoluções de notas antigas podem usar o NCM da nota original. |
| Tipo (`B1_TIPO`) | Editável, mas impacta Bloco K, LPs e relatórios; TOTVS sugere novo código + MATA261 + bloqueio. Mudança de tipo pode tirar/pôr o item em perfis automáticos do CFGTRIB. |
| Grupo | Alteração direta; avisar relatórios, filtros e perfis por grupo. |
| Tratamento (lote/endereço) | Ligar rastro: fechamento + `MV_RASTRO` + MATA390. Desligar rastro/endereço: saldo zerado (MATA300/MATA215, F4 limpa) ou, melhor, novo código + MATA261. |
| Reforma (cClassTrib/CST) | No Protheus fica no Configurador de Tributos (perfil/regra), não na SB1: todo código novo precisa entrar no perfil certo. |
| Qualquer movimento de ajuste | Data posterior ao último fechamento (MATA280 bloqueia datas anteriores). |

### C. Ação no ERP por tipo de ajuste

| Ajuste | Rotina Protheus |
|---|---|
| Alterar descrição, NCM, grupo, CEST, origem, bloqueio | MATA010 – Alterar (manual) ou ExecAuto/MVC opção 4 (lote) |
| Criar código novo | MATA010 – Copiar (manual) ou MILE/ExecAuto opção 3 (lote) |
| Transferir saldo entre códigos (consolidar, trocar código, tipo, rastro, endereço) | MATA261 – Transferência Múltipla (ExecAuto disponível); estorno pela própria rotina |
| Zerar/reimplantar saldo | Movimento interno (requisição/devolução valorizada) ou inventário (MATA270 + acerto) |
| Distribuir saldo em lote | MATA390 – Manutenção de Lotes |
| Recalcular antes de mexer em controle | MATA300 (Refaz Saldos), MATA215 (Refaz Empenhos) |
| Bloquear | MATA010, `B1_MSBLQL` = Sim |
| Fechamento | MATA280 – Virada de Saldos |
| Perfil de Produto (Reforma) | Configurador de Tributos (CFGTRIB/FISA170) – Perfil de Produto |

### D. Modelos de carga (planilhas que o InTAX gera para Protheus)

1. **Alteração de cadastro (ExecAuto/MVC opção 4)**: `B1_COD` + só as colunas alteradas (`B1_DESC`, `B1_POSIPI`, `B1_GRUPO`, `B1_CEST`, `B1_ORIGEM`, `B1_MSBLQL`…), uma linha por produto.
2. **Inclusão de códigos novos (MILE/ExecAuto opção 3)**: `B1_COD`, `B1_DESC`, `B1_TIPO`, `B1_UM`, `B1_LOCPAD`, `B1_POSIPI`, `B1_GRUPO`, `B1_ORIGEM`, `B1_SEGUM`, `B1_CONV`, `B1_TIPCONV`, `B1_RASTRO`, `B1_LOCALIZ`, `B1_CODANT`.
3. **Transferências (MATA261)**: produto origem, armazém origem, lote/endereço origem, produto destino, armazém destino, lote/endereço destino, quantidade, data. Os nomes de campo do layout do ExecAuto da MATA261 não foram confirmados aqui (há DT de revisão da documentação da rotina automática: https://tdn.totvs.com/pages/viewpage.action?pageId=379292606); o modelo do InTAX usa nomes de coluna em português e o TI do cliente faz o de-para.
4. **Bloqueios**: `B1_COD` + `B1_MSBLQL` = 1, só para itens com saldo e comprometidos zerados.
5. **Perfil de Produto (Reforma)**: lista de códigos novos × perfil de origem do código antigo.

### E. Consulta de extração

Usar os três arquivos e os complementos do item 5. Perguntar sempre: `MV_ARQPROD`, `MV_HISTTAB`, `MV_RASTRO`, `MV_LOCALIZ`, data do último fechamento, compartilhamento da SB1 entre filiais.

### F. Pendências (não confirmadas em fonte oficial)

- Procedimento oficial para trocar a 1ª UM (`B1_UM`) de produto movimentado.
- Campo de cClassTrib/CST na SB1 em alguma release (nenhuma página oficial do Protheus encontrada).
- Nome do campo de ligação produto × Perfil de Produto (tabela F24 citada, campo não).
- Efeito do `B1_ATIVO` fora da integração SFA.
- `B1_UCOM` (data de última compra).
- API REST de produtos com alteração.
- Restrição técnica (ou ausência dela) para trocar NCM e grupo de produto movimentado.

---

## Resumo

No Protheus o código (`B1_COD`) é imutável e o produto com qualquer histórico não pode ser excluído (FWFORMCANCEL); a saída oficial é bloquear por `B1_MSBLQL`, e isso só depois de zerar saldo, porque item bloqueado não entra em inventário nem transferência. Trocar código, consolidar, mudar tipo ou desligar lote/endereço seguem o mesmo roteiro TOTVS: novo código (com `B1_CODANT` quando for troca), transferência pela MATA261 (RE4/DE4) e bloqueio do antigo, com data após o último fechamento (MATA280). Mudar a 2ª UM/fator exige zerar e reimplantar o saldo; para a 1ª UM não há procedimento oficial. Descrição e NCM se alteram direto, com `MV_HISTTAB` ligado para o 0205. A última saída está pronta em `B2_USAI` (critério TOTVS de obsoleto); a última movimentação completa vem de SD1/SD2/SD3. O SPEDFISCAL tira 0190/0200/0220 da SB1 (+SAH), 0205 da AIF/`B1_CODANT` e o Bloco H da SB9/MATR460. Na Reforma, CST e cClassTrib ficam no Configurador de Tributos (perfil/regra), não na SB1, então todo código novo precisa entrar no Perfil de Produto certo. Correção em massa: ExecAuto/MVC para alteração; MILE só para inclusão; API REST de produtos não confirmada.
