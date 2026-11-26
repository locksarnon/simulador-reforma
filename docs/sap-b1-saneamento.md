# SAP Business One no Saneamento de Estoques: perfil de ERP

Pesquisa feita em 26/11/2026 na documentação oficial da SAP (SAP Help Portal, referência do SDK 10.0 com as tabelas do banco e a DI API, SAP Learning e KBAs públicas). Posts da SAP Community entram só como pista e vêm marcados assim.

**Graus usados**
- **Confirmado**: está na fonte oficial citada.
- **Confirmado (versão anterior)**: está na ajuda oficial de 9.x ou 8.8x e não achei a página equivalente da 10.0.
- **Não confirmado**: não achei fonte oficial. Quando houver pista, ela aparece como pista.

**Fontes-base (abreviações usadas abaixo)**
- **[SDK-T]**: SAP Business One SDK 10.0, *Database Tables Reference*. Uma página por tabela em `https://help.sap.com/doc/089315d8d0f8475a9fc84fb919b501a3/10.0/en-US/SDKHelp/<TABELA>.html` (por exemplo `.../SDKHelp/OITM.html`).
- **[SDK-DI]**: mesma base, objetos da DI API: `.../SDKHelp/SAPbobsCOM~Items_members.html`, `SAPbobsCOM~Items.html`, `SAPbobsCOM~Documents.html`, `SAPbobsCOM~StockTransfer.html`, `SAPbobsCOM~UnitOfMeasurementGroupsService.html`, `SAPbobsCOM~InventoryPostingsService.html`, `SAPbobsCOM~NCMCodesSetupService.html`.
- **[LRN-UoM]**: SAP Learning, *Working with Units of Measure (UoM) in SAP Business One*: https://learning.sap.com/courses/managing-logistics-in-sap-business-one/working-with-units-of-measure-uom-in-sap-business-one
- **[LRN-IMD]**: SAP Learning, *Creating Item Master Data and Item Groups in SAP Business One*: https://learning.sap.com/courses/managing-logistics-in-sap-business-one/creating-item-master-data-and-item-groups-in-sap-business-one (existe a trilha BR: `.../managing-logistics-in-sap-business-one-br/...`)
- **[WN-10]**: *What's New in Previous Versions of SAP Business One 10.0* (até o FP 2208): https://help.sap.com/doc/1e4d3a635ae2433597e22263e3b2c8f4/10.0/en-US/Whats_New_EN.pdf

Observação sobre a versão HANA: a referência de tabelas e a DI API são as mesmas para SQL Server e HANA. As KBAs citadas abaixo valem para as duas, salvo onde está dito. A diferença prática está na sintaxe SQL da consulta (item 5).

---

## 1. Cadastro de item (OITM)

Tabela OITM, "Items" [SDK-T OITM]. O nome da propriedade na DI API [SDK-DI Items] vem entre parênteses.

| Campo | Significado (oficial) | Tipo | Liga com | Grau |
|---|---|---|---|---|
| ItemCode (ItemCode) | Código do item (chave). Na DI API: "must be unique" | nVarChar 50 | — | Confirmado |
| ItemName (ItemName) | Descrição | nVarChar 200 | — | Confirmado |
| FrgnName (ForeignName) | Descrição em língua estrangeira | nVarChar 200 | — | Confirmado |
| ItmsGrpCod (ItemsGroupCode) | Grupo de itens. A DI API diz que cada item fica em um só grupo, usado em relatórios e avaliações. Padrão 100 | Int 6 | OITB (ItmsGrpNam) | Confirmado |
| InvntItem / SellItem / PrchseItem (InventoryItem / SalesItem / PurchaseItem) | Item de estoque / de venda / de compra (Y/N) | VarChar 1 | — | Confirmado |
| ItemClass | 1 = Serviço, 2 = Material (padrão 2) | VarChar 1 | — | Confirmado |
| ItemType | I = itens, L = mão de obra, T = viagem, F = ativo imobilizado | VarChar 1 | — | Confirmado |
| InvntryUom (InventoryUOM) | UdM de estoque (texto) | nVarChar 100 | — | Confirmado |
| IUoMEntry (InventoryUoMEntry) | UdM de estoque (chave) | Int 11 | OUOM | Confirmado |
| BuyUnitMsr / NumInBuy | UdM de compra (texto) / itens por unidade de compra | nVarChar 100 / Num 19.6 | — | Confirmado |
| SalUnitMsr / NumInSale | UdM de venda (texto) / itens por unidade de venda | nVarChar 100 / Num 19.6 | — | Confirmado |
| PUoMEntry / SUoMEntry | UdM padrão de compra e de venda (chave) | Int 11 | OUOM | Confirmado |
| UgpEntry (UoMGroupEntry) | Grupo de UdM | Int 11 | OUGP | Confirmado |
| OnHand (QuantityOnStock) | Quantidade em estoque (total) | Num 19.6 | — | Confirmado |
| validFor / validFrom / validTo (Valid) | "Active" e o período de validade | VarChar 1 / datas | — | Confirmado |
| frozenFor / frozenFrom / frozenTo (Frozen, FrozenFrom, FrozenTo, FrozenRemarks) | "Inactive" e o período de congelamento ("on hold" na DI API) | VarChar 1 / datas | — | Confirmado |
| CodeBars (BarCode) | Código de barras (EAN) principal | nVarChar 254 | — | Confirmado. Vários códigos por UdM ficam em OBCD ("Bar Code Master Data") e ITM12 |
| SuppCatNum (SupplierCatalogNo) | "Mfr Catalog No." na tabela. A DI API descreve como o nº de catálogo do fornecedor principal | nVarChar 50 | — | Confirmado. As duas descrições oficiais divergem |
| FirmCode (Manufacturer) | Fabricante. Padrão -1 = nenhum | Int 6 | OMRC (FirmName) | Confirmado |
| CardCode | Fornecedor preferencial | nVarChar 15 | OCRD | Confirmado |
| ManBtchNum / ManSerNum (ManageBatchNumbers / ManageSerialNumbers) | Controle por lote / por número de série | VarChar 1 | OBTN/OBTQ, OSRN/OSRQ | Confirmado |
| EvalSystem | Método de avaliação | VarChar 1 | — | Confirmado |
| **NCMCode** (NCMCode) | "NCM Code". É **Int**, chave interna de ONCM (padrão -1 = sem NCM). A DI API explica que é a classificação do governo brasileiro usada para a alíquota de IPI | Int 11 | **ONCM.AbsEntry**. O código de 8 dígitos está em ONCM.NcmCode | Confirmado |
| CESTCode | Código CEST (padrão -1) | Int 11 | OCEST (AbsId → CEST) | Confirmado |
| ProductSrc (ProductSource) | "Product Source" = origem da mercadoria (padrão 0) | nVarChar 2 | OPSC (Code, Desc) | Confirmado (campo). Não confirmado em fonte oficial que a tabela OPSC traga exatamente os códigos de origem do ICMS |
| MatType (MaterialType) | "Material Type" (de matéria-prima a produto acabado, conforme a DI API) | nVarChar 3 | OMTP (MatType, Descrip) | Confirmado |
| MatGrp (MaterialGroup) | Grupo de material | Int 11 | OMGP | Confirmado |
| ServiceCtg | Categoria de serviço | Int 11 | OSCG | Confirmado |
| OSvcCode / ISvcCode | Código de serviço de saída e de entrada | Int 11 | OSCD | Confirmado |
| DNFEntry | Código DNF | Int 11 | ODNF | Confirmado |
| CreateDate | Na tabela aparece como "Production Date". A DI API descreve como data de criação do cadastro | Date | — | Confirmado. O rótulo diverge; tratar como data de criação |
| UpdateDate | Data da última alteração do cadastro | Date | — | Confirmado |
| LastPurDat / LastPurPrc | Data e preço da última compra | Date / Num | — | Confirmado |
| CountryOrg | País de origem | nVarChar 3 | — | Confirmado |

Tabelas de apoio confirmadas em [SDK-T]:
- **ONCM** (NCM Code): AbsEntry, NcmCode (nVarChar 15), Descrip, GroupCode, Group→ONCG.
- **OUGP** (UoM Group): UgpEntry, UgpCode, UgpName, BaseUom→OUOM, Locked.
- **UGP1** (UoM Group Detail): UgpEntry, UomEntry, AltQty, BaseQty, IsActive.
- **OUOM** (UoM Master Data): UomEntry, UomCode, UomName, Locked.
- **ITM12** (UoM in Item): ItemCode, UomType P/S/I, UomEntry, BcdEntDft→OBCD.
- **OITB**: ItmsGrpCod, ItmsGrpNam, Locked.
- **OMRC**: FirmCode, FirmName (nVarChar 30).
- **OCEST**: AbsId, CEST, Descr.
- **OPSC**: Code, Desc, GroupCode.
- **OMTP**: AbsEntry, MatType, Descrip.

Cadastro de NCM pela API: o serviço NCMCodesSetupService cuida da tabela ONCM, e a DI API diz que o NCM chega ao item pelo campo NCMCode [SDK-DI NCMCodesSetupService]. Na lista de membros, a DI API descreve Items.NCMCode com "Returns". **Não confirmado** se a gravação pela DI API ou pelo DTW é aceita sem restrição: testar em base de homologação.

**Consequência para o InTAX.** Na exportação, o NCM do item é um número interno. A planilha do cliente precisa trazer **ONCM.NcmCode** pelo JOIN, nunca o OITM.NCMCode cru. -1 ou vazio vira "NCM ausente". O mesmo vale para FirmCode, CESTCode e ItmsGrpCod: exportar o código e também o nome.

## 2. Última movimentação e saldo por depósito

- **OIVL ("Whse Journal")** [SDK-T OIVL]: TransSeq (chave), TransType, CreatedBy (chave do documento), BASE_REF (nº do documento), **DocDate (data de lançamento)**, CreateDate, CreateTime, **ItemCode**, **LocCode (depósito)**, LocType, **InQty / OutQty**, DocLineNum. **Confirmado.**
- **OILM ("Inventory Log Message")** [SDK-T OILM]: DocEntry, TransType, DocLineNum, Quantity, EffectQty, LocCode, BaseType e outros. Os valores de TransType estão listados na página (13 nota de saída, 15 entrega, 18 nota de entrada, 20 recebimento de mercadoria, 59 entrada de mercadoria, 67 transferência etc.). **Confirmado.**
- **OINM**: a página do SDK 10.0 (`.../SDKHelp/OINM.html`) redireciona para login e não pude ler. O SDK traz a tabela **OIVK, "IVL Vs OINM Keys"**, que liga OIVL a OINM. **Não confirmado** que OINM seja uma visão sobre OIVL (pista da SAP Community: https://answers.sap.com/questions/86313/how-to-update-oinm-table-value.html).
- **Última data por item**: MAX(OIVL.DocDate) por ItemCode, filtrando InQty <> 0 ou OutQty <> 0 para ignorar lançamentos só de valor. Por depósito, agrupar também por LocCode. O filtro "só quantidade" é dedução minha sobre os campos oficiais, não regra da SAP. A data da última compra também vem direto de **OITM.LastPurDat**. **Confirmado (campos)**.
- **Saldo por depósito: OITW ("Items - Warehouse")** [SDK-T OITW]: ItemCode, WhsCode→OWHS, **OnHand**, IsCommited, OnOrder, Consig, Counted, AvgPrice, StockValue, Locked, **Freezed** (congelado no depósito) e FreezeDoc→OINC (contagem que congelou). **Confirmado.**
- **Lote e série por depósito**: OBTQ ("Batch No. Quantities": ItemCode, SysNumber→OBTN, WhsCode, Quantity, CommitQty), OBTN (DistNumber = número do lote) e OSRQ/OSRN para série. **Confirmado.**

**Consequência para o InTAX.** O critério "sem movimento há N meses" sai de OIVL.DocDate, não de UpdateDate (que é alteração de cadastro). Item com OITW.Freezed = Y ou com contagem aberta deve gerar o alerta "depósito congelado por contagem: ajuste só depois de fechar a contagem".

## 3. Restrições do B1 que afetam o saneamento

### (a) Trocar a UdM de estoque ou o grupo de UdM de item com transações
- A UdM de estoque **não pode ser alterada depois que o item tem transações** ("cannot be changed once transactions were made") [LRN-UoM]. **Confirmado.**
- As taxas de conversão de um grupo **não podem ser alteradas enquanto houver documentos abertos** com o item. É preciso fechar os documentos antes [LRN-UoM]. **Confirmado.**
- Para dar outra conversão a um item, o caminho oficial é criar outro grupo com as mesmas UdMs e atribuí-lo ao item [LRN-UoM]. **Confirmado.**
- Trocar o grupo só é aceito se o novo grupo contiver todas as regras de conversão do grupo original. Mensagem: "You cannot change the UoM group unless the new UoM group includes the set of conversion rules of the original UoM group" (KBA 3642762, todas as versões, SQL e HANA): https://userapps.support.sap.com/sap/support/knowledge/en/3642762. **Confirmado (sintoma).** A solução da KBA exige login.
- Depois de sair do grupo "Manual" e ter transações, voltar para "Manual" falha com "Field cannot be updated (ODBC -1029)". Trocar a UdM base de um grupo usado falha com "Removal is not permitted; UoM group is assigned to one or more Items" (KBA 3379277): https://userapps.support.sap.com/sap/support/knowledge/en/3379277. **Confirmado (sintoma).**
- Regras para mudar a definição de um grupo de UdM: KBA 3365952 (só o título é público): https://userapps.support.sap.com/sap/support/knowledge/en/3365952.
- **Regra no InTAX**: o ajuste "trocar unidade de estoque" em item SAP B1 com movimento é **bloqueado no cadastro**. A ação sugerida é criar um item novo com a unidade correta e transferir o saldo (ver (g)). Se a mudança for só de conversão compra/venda, a ação é criar um grupo de UdM novo que contenha as regras do original e fechar os documentos abertos.

### (b) Excluir item com transações
- Bloqueado. Mensagem "You cannot remove item; linked transactions exist" (KBA 3608928, B1 10.0): https://userapps.support.sap.com/sap/support/knowledge/en/3608928. **Confirmado.**
- Um registro usado em documento ou lançamento não pode ser excluído. O caminho é marcar inativo, e a exclusão só fica possível depois de arquivar os dados que o usam [LRN-IMD]. **Confirmado.**
- Item que é componente de estrutura (BOM): mensagem 10001363, "You cannot remove item linked to bill of materials". É preciso tirá-lo da estrutura antes: https://help.sap.com/saphelp_sbo900/helpdata/en/74/ecc920f62e4f1abd7c62fc0229438b/content.htm. **Confirmado (versão anterior, 9.0).**
- **Regra no InTAX**: no SAP B1, "excluir" vira "inativar". O InTAX só sugere exclusão para item sem nenhuma linha em OIVL e sem documento aberto.

### (c) Trocar o ItemCode
- **Não confirmado** em fonte oficial, porque não achei página da SAP sobre trocar o código. Indícios: ItemCode é a chave e "must be unique" [SDK-DI Items]. A importação do Excel diz que "master record numbers can't be changed" (ajuda 8.82: https://help.sap.com/saphelp_sbo882/helpdata/en/45/06da78d8696c30e10000000a114a6b/content.htm). Pista da SAP Community: código com transação não muda, só se inativa (https://answers.sap.com/questions/152171/item-master-data-inventory-item.html).
- **Regra no InTAX**: tratar como impossível. Trocar o código = criar item novo + transferir o saldo + inativar o antigo.

### (d) Mudar NCM ou grupo de itens (ItmsGrpCod) com movimento
- NCM: **não achei bloqueio documentado** (não confirmado). As linhas de documento guardam o próprio NCM (RDR1/INV1.NCMCode → ONCM) [SDK-T RDR1]. **Confirmado (campo).** Daí a consequência provável de que documentos já emitidos mantêm o NCM antigo. **Não confirmado** que o NCM do item seja copiado para a linha quando o documento é criado, porque nenhuma página oficial descreve essa cópia.
- Grupo de itens: **não achei bloqueio documentado** (não confirmado). Pontos relacionados confirmados:
  - Mudar o "inventory item" com transações é bloqueado: "You cannot change the inventory item category; item has been used in one or more transactions" (KBA 3357935, 10.0 SQL e HANA): https://userapps.support.sap.com/sap/support/knowledge/en/3357935.
  - Mudar o método de avaliação em lote exige quantidade zero em todos os depósitos (ajuda 9.0): https://help.sap.com/saphelp_sbo900/helpdata/en/1b/8ca15603a846039df2849b9343ecee/content.htm. **Confirmado (versão anterior).**
  - **Não confirmado** se trocar o grupo muda as contas contábeis quando as contas são definidas por grupo de itens (GLMethod em [SDK-DI Items] mostra que as contas podem vir de depósito, de grupo ou do item).
- **Regra no InTAX**: o ajuste de NCM é feito no cadastro e o InTAX alerta que "documentos já emitidos mantêm o NCM da linha; conferir documentos abertos". O ajuste de grupo também é feito no cadastro, com o alerta "se as contas vêm do grupo, confirmar com a contabilidade antes".

### (e) Item com lote ou série
- Para mudar "Manage Item by" (série ou lote), a quantidade em estoque e as quantidades de série e lote disponíveis precisam estar zeradas em todos os depósitos, e não pode haver pedido de venda ou reserva aberta com lote alocado (ajuda 9.0, *Defining Serial Number Settings per Item*): https://help.sap.com/saphelp_sbo900/helpdata/en/45/2365db9e152b31e10000000a1553f7/content.htm. **Confirmado (versão anterior).**
- Item com série precisa ser item de estoque (mesma página). **Confirmado.**
- Na transferência de saldo entre itens (saída de um, entrada de outro), cada linha leva lote ou série. A estrutura de documentos da DI API tem coleções de lote e série. As tabelas OBTN/OBTQ/OSRN/OSRQ estão confirmadas em [SDK-T]. Pista da SAP Community: o DTW pede arquivos separados de linhas e de lote/série para o oInventoryGenEntry.
- **Regra no InTAX**: quando ManBtchNum ou ManSerNum = Y, a exportação inclui OBTQ/OSRQ. A unificação gera saída e entrada por lote, e o alerta é "ligar ou desligar o controle por lote só com saldo zero".

### (f) Inativo × congelado
- Na tabela, validFor = "Active" e frozenFor = "Inactive", cada um com datas [SDK-T OITM]. Na DI API, Valid é "is valid" e Frozen é "on hold" [SDK-DI Items]. A tela oferece Ativo, Inativo e Avançado (períodos), e o tipo de regra avançada pode ser Geral, Depósito ou Grupo de itens. A faixa ativa é o período de validade e a faixa inativa é o período em que o item fica congelado (ajuda 9.1/9.2, aba General: https://help.sap.com/saphelp_sbo91/helpdata/en/45/221d4673c80108e10000000a114a6b/content.htm). **Confirmado (versão anterior).**
- Item inativo não entra em pedido de venda. Nas Configurações gerais se escolhe se o inativo aparece em relatórios e documentos [LRN-IMD]. **Confirmado.**
- Faixas de datas sobrepostas geram o erro "Date ranges overlap; change the active or inactive date range" (KBA 3388059): https://userapps.support.sap.com/sap/support/knowledge/en/3388059. **Confirmado (sintoma, só a prévia).**
- Efeito sobre documentos abertos e sobre contagem e lançamento de inventário: **não confirmado**. O "congelado" do inventário é outra coisa: OITW.Freezed, por depósito, ligado à contagem OINC [SDK-T OITW]. **Confirmado.**
- **Regra no InTAX**: o status "inativo" do SAP B1 corresponde a frozenFor = Y (ou validFor = N). Inativar só depois de zerar OITW.OnHand e de fechar os documentos abertos (OITW.IsCommited/OnOrder = 0). Esta última condição é prudência minha: a SAP não documenta o efeito sobre documentos abertos.

### (g) Unificar dois itens
- **Não achei função nativa de fusão de itens** (não confirmado: é ausência de documentação, não proibição escrita).
- Ferramentas oficiais disponíveis (confirmadas em [SDK-DI] / [SDK-T]):
  - saída de mercadoria **oInventoryGenExit (OIGE)** do item antigo e entrada de mercadoria **oInventoryGenEntry (OIGN, "Goods Receipt")** do item novo [SDK-DI Documents];
  - **contagem (OINC) e lançamento de inventário (OIQR, "Inventory Posting")**. A DI API tem o InventoryPostingsService (incluir, consultar, atualizar) [SDK-DI InventoryPostingsService];
  - **StockTransfer (OWTR)**, que move o **mesmo item entre depósitos** ("from one warehouse to another") [SDK-DI StockTransfer]. Não serve para passar saldo de um item para outro.
- Pista da SAP Community, não fundamento: a entrada de mercadoria pode atualizar o último preço de compra do item, então o custo da entrada deve ser o custo médio do item antigo (https://answers.sap.com/t5/enterprise-resource-planning-q-a/wants-put-stock-opening-balance-through-dtw/m-p/4390724).
- **Regra no InTAX**: unificar no SAP B1 = (1) escolher o item que fica (ou criar um novo, se o código ou a unidade não servirem), (2) saída OIGE do item que sai, por depósito, lote e série, (3) entrada OIGN do item que fica, na mesma quantidade convertida e pelo mesmo valor (custo de OITW.AvgPrice × quantidade), (4) inativar o item que sai. Conversão de unidade entre os dois itens: o InTAX calcula e mostra o fator. Usar a mesma data para não deixar saldo negativo.

### (h) Alterar a descrição
- Cada linha de documento guarda a própria descrição: RDR1/INV1.**Dscription** ("Item/Service Description") [SDK-T RDR1]. **Confirmado (campo).** Daí a consequência de que documentos emitidos mantêm o texto da época. Isso é dedução do modelo de dados, sem página da SAP afirmando.
- O histórico de cadastro fica na tabela **AITM, "Items - History"** [SDK-T AITM]. **Confirmado.**
- **Regra no InTAX**: troca de descrição é ajuste de cadastro simples, sem efeito retroativo. O antes e depois fica em AITM, que o consultor pode pedir como evidência.

## 4. Ferramentas oficiais para aplicar correções em massa

- **DI API** [SDK-DI]: objeto Items (Add, Update e Remove, com propriedades como ItemName, ItemsGroupCode, NCMCode, UoMGroupEntry, Valid/Frozen, BarCode, Manufacturer e SupplierCatalogNo); Documents(oInventoryGenEntry) → OIGN; Documents(oInventoryGenExit) → OIGE; StockTransfer → OWTR; UnitOfMeasurementGroupsService ("add, look up, update, and remove unit of measurement groups"); InventoryPostingsService; NCMCodesSetupService. **Confirmado.**
- **Service Layer**: o [WN-10] registra que os campos fiscais do Brasil são expostos pela DI API ou pela Service Layer (SAP Note 3227386), assim como o cálculo externo de imposto em documentos de compra (SAP Note 3227700). **Confirmado.** **Não confirmado** que os nomes das propriedades da entidade Items na Service Layer sejam idênticos aos da DI API: não li a referência da Service Layer.
- **Data Transfer Workbench (DTW)**: a ajuda oficial confirma que ele importa dados novos e atualiza os existentes, com modelos prontos (ajuda 9.0: https://help.sap.com/saphelp_sbo900/helpdata/en/45/06437857240484e10000000a155369/content.htm). **Confirmado (versão anterior).** Coletânea oficial de cenários: KBA 3307077 (conteúdo com login): https://userapps.support.sap.com/sap/support/knowledge/en/3307077.
  - Nomes dos modelos (oItems, oInventoryGenEntry, oInventoryGenExit, oStockTransfer, oUnitOfMeasurementGroups, oInventoryPostings): seguem os nomes dos objetos da DI API. Só oInventoryGenEntry e oInventoryGenExit estão confirmados na página Documents. Os demais são **não confirmados** como nome de pasta de modelo do DTW na 10.0. Pista da SAP Community: a pasta `Templates\oInventoryGenEntry` tem os arquivos Documents, Document_Lines e de lote/série.
  - Campos que o DTW não atualiza: **não confirmado** em lista oficial. As restrições do item 3 valem também pelo DTW e pela DI API, porque são regras do objeto: UdM de estoque com transação, grupo de UdM, "inventory item", "Manage by" com saldo e ItemCode.

**Regra no InTAX**: gerar arquivos de saída no formato de modelo do DTW (ver lista final), com o aviso "conferir o cabeçalho com o modelo do DTW da versão instalada; rodar primeiro em base de teste (simulação)".

## 5. Exportação recomendada para o consultor

Consulta para o Query Manager / Query Generator do cliente. Todos os nomes de tabela e campo vêm de [SDK-T]. Os identificadores vão entre aspas duplas para funcionar em **HANA** (que exige aspas e diferencia maiúsculas) e no **SQL Server** (aceita aspas duplas com QUOTED_IDENTIFIER ligado, que é o padrão). **A consulta não foi executada em base SAP B1**: validar no cliente antes de usar.

**Consulta A: cadastro + NCM + última movimentação (1 linha por item)**
```sql
SELECT T0."ItemCode", T0."ItemName", T0."FrgnName",
       T0."ItmsGrpCod", T1."ItmsGrpNam",
       T0."InvntItem", T0."SellItem", T0."PrchseItem", T0."ItemClass",
       T0."InvntryUom", T0."IUoMEntry", T0."UgpEntry", T4."UgpCode",
       T0."BuyUnitMsr", T0."NumInBuy", T0."SalUnitMsr", T0."NumInSale",
       T0."NCMCode" AS "NcmEntry", T2."NcmCode", T2."Descrip" AS "NcmDescricao",
       T0."CESTCode", T5."CEST", T0."ProductSrc", T0."MatType",
       T0."CodeBars", T0."SuppCatNum", T0."FirmCode", T3."FirmName",
       T0."ManBtchNum", T0."ManSerNum", T0."EvalSystem",
       T0."validFor", T0."frozenFor", T0."frozenFrom", T0."frozenTo",
       T0."CreateDate", T0."UpdateDate", T0."LastPurDat", T0."LastPurPrc",
       T0."OnHand",
       M."UltimaMov", M."UltimaEntrada", M."UltimaSaida"
FROM "OITM" T0
LEFT JOIN "OITB"  T1 ON T1."ItmsGrpCod" = T0."ItmsGrpCod"
LEFT JOIN "ONCM"  T2 ON T2."AbsEntry"   = T0."NCMCode"
LEFT JOIN "OMRC"  T3 ON T3."FirmCode"   = T0."FirmCode"
LEFT JOIN "OUGP"  T4 ON T4."UgpEntry"   = T0."UgpEntry"
LEFT JOIN "OCEST" T5 ON T5."AbsId"      = T0."CESTCode"
LEFT JOIN (SELECT "ItemCode",
                  MAX("DocDate") AS "UltimaMov",
                  MAX(CASE WHEN "InQty"  <> 0 THEN "DocDate" END) AS "UltimaEntrada",
                  MAX(CASE WHEN "OutQty" <> 0 THEN "DocDate" END) AS "UltimaSaida"
           FROM "OIVL"
           WHERE "InQty" <> 0 OR "OutQty" <> 0
           GROUP BY "ItemCode") M ON M."ItemCode" = T0."ItemCode"
```

**Consulta B: saldo por depósito (1 linha por item × depósito)**: OITW (ItemCode, WhsCode, OnHand, IsCommited, OnOrder, AvgPrice, StockValue, Freezed, Locked) + OWHS.WhsName, filtrando OnHand, IsCommited ou OnOrder diferentes de 0. Pode trazer a última movimentação por depósito com MAX(OIVL.DocDate) agrupado por ItemCode e LocCode.

**Consulta C: grupos de UdM e conversões**: OUGP (UgpEntry, UgpCode, UgpName, BaseUom) + UGP1 (UomEntry, AltQty, BaseQty, IsActive) + OUOM (UomCode, UomName). Serve para conferir o fator compra/venda contra o 0220 e para checar a regra de (a).

**Consulta D: lotes e séries com saldo**: OBTQ (ItemCode, SysNumber, WhsCode, Quantity) + OBTN.DistNumber, e o mesmo com OSRQ + OSRN.

Cuidados:
- OIVL pode ser grande. Se pesar, limitar por data.
- ItmsGrpCod, FirmCode, NCMCode, CESTCode e UgpEntry são chaves internas: exportar sempre o nome ao lado.

## 6. Localização Brasil: SPED e Reforma Tributária

- **SPED (0190, 0200, 0220, H010)**: **não confirmado** que o SAP B1 gere a EFD ICMS/IPI de forma nativa. Não achei página do Help Portal nem KBA de B1 sobre isso. As KBAs de SPED que aparecem (por exemplo 2419759, 0200 duplicado) são de SAP ERP/S/4HANA (DRC/TDF), **não** de B1. O [WN-10] registra que a localização Brasil do B1 trabalha com cálculo de imposto externo ("External Calculation of VAT for Brazil") e campo "ECD Posting Type" nos lançamentos. O site da SAP lista add-ons de parceiros para obrigações fiscais no Brasil (pista, sem fundamento oficial sobre B1).
  - Mapeamento provável, em que o add-on monta o SPED a partir do cadastro: 0200 ← OITM (ItemCode, ItemName, CodeBars, InvntryUom, NCM via ONCM, CEST via OCEST); 0190 ← OUOM; 0220 ← UGP1 (AltQty/BaseQty) ou NumInBuy/NumInSale; H010 ← saldo OITW e custo. **Não confirmado.** Depende do add-on.
  - **Regra no InTAX**: no perfil SAP B1, perguntar "qual solução gera o SPED" e usar o arquivo SPED do cliente como contraprova da exportação OITM (código, unidade e NCM batem?).
- **IBS/CBS/cClassTrib**:
  - Na referência de tabelas 10.0 publicada hoje, as **linhas de documento** (RDR1, INV1) têm **CSTfIBS ("CST for IBS Code"), CSTfCBS ("CST for CBS Code") e CSTfIS** [SDK-T RDR1, INV1]. **Confirmado.**
  - Em **OITM não há campo de IBS, CBS ou cClassTrib** na mesma referência. **Confirmado** em 26/11/2026.
  - **cClassTrib**: **não confirmado** em nenhuma tabela oficial lida. Não achei KBA de Reforma Tributária específica de B1: a KBA 3642384 (guia da Reforma, atualizada em 24/11/2026) cobre só ERP/S/4HANA.
  - Pista não oficial: um resumo de terceiros do FP 2502 cita "informação fiscal adicional" na aba Imposto do cadastro de item para o Brasil.
  - **Regra no InTAX**: no SAP B1, a classificação IBS/CBS não vem do cadastro do item. O saneamento cuida de NCM, origem, CEST e unidade, e o cClassTrib fica fora da exportação até haver fonte oficial.

---

## Perfil SAP B1 no InTAX: o que implementar

1. **Mapeamento de colunas pré-definido** (exportação da Consulta A → campos do saneamento):
   - código ← ItemCode
   - descrição ← ItemName (e FrgnName como descrição alternativa)
   - grupo ← ItmsGrpCod + ItmsGrpNam
   - unidade de estoque ← InvntryUom (chave IUoMEntry) e grupo de UdM ← UgpEntry/UgpCode
   - unidade e fator de compra ← BuyUnitMsr/NumInBuy; de venda ← SalUnitMsr/NumInSale
   - NCM ← **ONCM.NcmCode** (nunca OITM.NCMCode); CEST ← OCEST.CEST; origem ← ProductSrc; tipo de material ← MatType
   - EAN ← CodeBars; referência do fabricante ← SuppCatNum; fabricante ← FirmName
   - lote ← ManBtchNum; série ← ManSerNum
   - status ← validFor/frozenFor (+ datas)
   - saldo ← OnHand (total) e OITW.OnHand (por depósito)
   - datas ← CreateDate, UpdateDate, LastPurDat e última movimentação (OIVL)
   - tipo ← InvntItem/SellItem/PrchseItem/ItemClass

   Reconhecer automaticamente esses cabeçalhos quando o ERP escolhido for "SAP Business One".
2. **Alertas por tipo de ajuste** (quando o ERP é SAP B1):
   - *Unidade de estoque*: "bloqueada se o item tem movimento: criar item novo e transferir o saldo".
   - *Grupo de UdM / conversão*: "só para grupo que contenha as regras do original; fechar documentos abertos antes".
   - *Excluir*: "não permitido com movimento: inativar (frozenFor)".
   - *Código*: "não se altera: novo item + transferência + inativação".
   - *NCM*: "ajuste no cadastro; documentos emitidos mantêm o NCM da linha".
   - *Grupo de itens*: "confirmar contas contábeis se vierem do grupo".
   - *Item de estoque × não estoque*: "bloqueado com transação".
   - *Lote/série*: "só com saldo zero e sem lote alocado".
   - *Depósito congelado (OITW.Freezed)*: "concluir a contagem antes".
   - *Inativar*: "zerar saldo e fechar documentos (OITW.IsCommited/OnOrder) antes".
3. **Ação no ERP por tipo de ajuste**:
   - descrição, NCM, CEST, origem, EAN, fabricante e grupo → atualização de cadastro (oItems, atualizar existentes);
   - unificação → item que fica (ou novo) + saída OIGE do que sai + entrada OIGN do que fica pelo custo médio + inativação;
   - troca de código ou de unidade de estoque com movimento → igual à unificação, com item novo;
   - item obsoleto sem saldo → inativar; sem nenhum movimento em OIVL → pode excluir;
   - divergência de saldo → contagem/lançamento de inventário (OINC/OIQR).
4. **Modelos DTW de saída**, cada um com o aviso de conferir o cabeçalho com o modelo da versão instalada:
   - oItems (atualização de cadastro: ItemCode + campos alterados);
   - oInventoryGenExit e oInventoryGenEntry (Documents + Document_Lines + lote/série);
   - oUnitOfMeasurementGroups (grupos novos);
   - oInventoryPostings, opcional.
5. **Consulta de extração**: publicar as Consultas A a D no InTAX (botão "copiar consulta SAP B1") com instrução de rodar no Query Manager e exportar para Excel, e com nota para HANA (aspas duplas obrigatórias).
6. **Pergunta de cadastro do cliente**: "qual solução gera o SPED/NF-e no SAP B1" e "versão e FP", para registrar no projeto.

## Resumo

- A referência oficial do SDK 10.0 confirma todos os campos pedidos de OITM, inclusive os da localização Brasil: NCMCode (chave para ONCM), CESTCode, ProductSrc, MatType, ItemClass, ServiceCtg e DNFEntry.
- A última movimentação sai de OIVL.DocDate e o saldo por depósito de OITW. OINM não pôde ser lido na 10.0.
- Restrições confirmadas: unidade de estoque travada com transação, regras de troca de grupo de UdM, exclusão bloqueada (só inativar), "Manage by" lote/série só com saldo zero e "inventory item" travado com transação.
- Sem fonte oficial: proibição de trocar o ItemCode (tratada como impossível), efeito de NCM ou grupo no histórico, fusão nativa de itens, lista de campos que o DTW não atualiza, geração nativa de SPED e cClassTrib.
- IBS/CBS existem só como CST nas linhas de documento, não no cadastro de item.
