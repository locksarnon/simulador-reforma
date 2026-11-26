/**
 * Carga inicial do Cadastro de ERPs (Administração > Configuração e ERPs). Fontes: docs/sap-b1-saneamento.md, docs/erp-aliare-siagri-saneamento.md
 * e docs/erp-totvs-protheus-saneamento.md (pesquisas de 26/11/2026, só fontes oficiais). Textos parafraseados e curtos; cada item leva a URL
 * da fonte e o grau (CONFIRMADO ou NAO_CONFIRMADO). Os ids são fixos: a carga cria o que falta e só atualiza o que ninguém editou
 * (ErpsService.aplicarCarga), sem duplicar.
 *
 * Em COLUNA_EXPORT, `chave` é o campo do saneamento (CAMPOS_BASE de saneamento-estoques/importacao/tipos.ts) e `campo_erp` o cabeçalho da
 * coluna no export do ERP. Em ACAO_NO_ERP, {sai} e {fica} viram os códigos da linha do mapa de unificações.
 */
import type { GrauErp, SituacaoErp, TipoConhecimento } from './logica';

export type ItemCarga = {
  k: string; tipo: TipoConhecimento; tipo_ajuste?: string | null; chave: string; texto: string; campo_erp?: string | null; fonte_url: string; grau: GrauErp;
};
export type ErpCarga = { id: string; nome: string; fabricante: string; produto?: string | null; versoes: string[]; situacao: SituacaoErp; itens: ItemCarga[] };

const C: GrauErp = 'CONFIRMADO';
const N: GrauErp = 'NAO_CONFIRMADO';

// ── SAP Business One ─────────────────────────────────────────────────────────
const SDK = 'https://help.sap.com/doc/089315d8d0f8475a9fc84fb919b501a3/10.0/en-US/SDKHelp';
const LRN_UOM = 'https://learning.sap.com/courses/managing-logistics-in-sap-business-one/working-with-units-of-measure-uom-in-sap-business-one';
const LRN_IMD = 'https://learning.sap.com/courses/managing-logistics-in-sap-business-one/creating-item-master-data-and-item-groups-in-sap-business-one';
const WN10 = 'https://help.sap.com/doc/1e4d3a635ae2433597e22263e3b2c8f4/10.0/en-US/Whats_New_EN.pdf';

const SAP_CONSULTA_A = `SELECT T0."ItemCode", T0."ItemName", T0."FrgnName",
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
           GROUP BY "ItemCode") M ON M."ItemCode" = T0."ItemCode"`;

const SAP_CONSULTA_B = `SELECT T0."ItemCode", T0."WhsCode", T1."WhsName", T0."OnHand", T0."IsCommited", T0."OnOrder",
       T0."AvgPrice", T0."StockValue", T0."Freezed", T0."Locked"
FROM "OITW" T0
LEFT JOIN "OWHS" T1 ON T1."WhsCode" = T0."WhsCode"
WHERE T0."OnHand" <> 0 OR T0."IsCommited" <> 0 OR T0."OnOrder" <> 0`;

const SAP_CONSULTA_C = `SELECT T0."UgpEntry", T0."UgpCode", T0."UgpName", T0."BaseUom",
       T1."UomEntry", T2."UomCode", T2."UomName", T1."AltQty", T1."BaseQty", T1."IsActive"
FROM "OUGP" T0
JOIN "UGP1" T1 ON T1."UgpEntry" = T0."UgpEntry"
LEFT JOIN "OUOM" T2 ON T2."UomEntry" = T1."UomEntry"`;

const SAP_CONSULTA_D = `SELECT T0."ItemCode", T0."WhsCode", T1."DistNumber", T0."Quantity"
FROM "OBTQ" T0
JOIN "OBTN" T1 ON T1."ItemCode" = T0."ItemCode" AND T1."SysNumber" = T0."SysNumber"
WHERE T0."Quantity" <> 0
-- Séries: o mesmo com OSRQ + OSRN.`;

const SAP: ErpCarga = {
  id: 'erp-sap-b1', nome: 'SAP Business One', fabricante: 'SAP', produto: 'Business One (SQL Server e HANA)', versoes: ['10.0'], situacao: 'COMPLETO',
  itens: [
    // Colunas do export (Consulta A; estabelecimento na Consulta B)
    { k: 'col-codigo', tipo: 'COLUNA_EXPORT', chave: 'codigo', campo_erp: 'ItemCode', texto: 'Código do item (OITM.ItemCode).', fonte_url: `${SDK}/OITM.html`, grau: C },
    { k: 'col-descricao', tipo: 'COLUNA_EXPORT', chave: 'descricao', campo_erp: 'ItemName', texto: 'Descrição do item (OITM.ItemName); FrgnName é a descrição alternativa.', fonte_url: `${SDK}/OITM.html`, grau: C },
    { k: 'col-unidade', tipo: 'COLUNA_EXPORT', chave: 'unidade', campo_erp: 'InvntryUom', texto: 'Unidade de estoque (OITM.InvntryUom).', fonte_url: `${SDK}/OITM.html`, grau: C },
    { k: 'col-ncm', tipo: 'COLUNA_EXPORT', chave: 'ncm', campo_erp: 'NcmCode', texto: 'NCM de 8 dígitos vem de ONCM.NcmCode pelo JOIN; OITM.NCMCode é a chave interna (-1 = sem NCM) e nunca vai cru.', fonte_url: `${SDK}/ONCM.html`, grau: C },
    { k: 'col-grupo', tipo: 'COLUNA_EXPORT', chave: 'grupo', campo_erp: 'ItmsGrpNam', texto: 'Grupo de itens pelo nome (OITB.ItmsGrpNam); ItmsGrpCod é a chave.', fonte_url: `${SDK}/OITB.html`, grau: C },
    { k: 'col-ativo', tipo: 'COLUNA_EXPORT', chave: 'ativo', campo_erp: 'frozenFor', texto: 'Situação: frozenFor = Y é inativo (congelado); validFor = N também.', fonte_url: `${SDK}/OITM.html`, grau: C },
    { k: 'col-saldo', tipo: 'COLUNA_EXPORT', chave: 'saldo', campo_erp: 'OnHand', texto: 'Saldo total (OITM.OnHand); por depósito em OITW.OnHand (Consulta B).', fonte_url: `${SDK}/OITW.html`, grau: C },
    { k: 'col-ultmov', tipo: 'COLUNA_EXPORT', chave: 'ultimaMovimentacao', campo_erp: 'UltimaMov', texto: 'Última movimentação = maior OIVL.DocDate com quantidade (não UpdateDate, que é alteração de cadastro).', fonte_url: `${SDK}/OIVL.html`, grau: C },
    { k: 'col-fabricante', tipo: 'COLUNA_EXPORT', chave: 'fabricante', campo_erp: 'FirmName', texto: 'Fabricante pelo nome (OMRC.FirmName); FirmCode é a chave.', fonte_url: `${SDK}/OMRC.html`, grau: C },
    { k: 'col-referencia', tipo: 'COLUNA_EXPORT', chave: 'referencia', campo_erp: 'SuppCatNum', texto: 'Referência do fabricante/fornecedor (OITM.SuppCatNum).', fonte_url: `${SDK}/OITM.html`, grau: C },
    { k: 'col-estab', tipo: 'COLUNA_EXPORT', chave: 'estabelecimento', campo_erp: 'WhsCode', texto: 'Depósito (OITW.WhsCode), na Consulta B.', fonte_url: `${SDK}/OITW.html`, grau: C },
    // Consultas de extração
    { k: 'consulta-a', tipo: 'CONSULTA_EXTRACAO', chave: 'Consulta A: cadastro + NCM + última movimentação', texto: SAP_CONSULTA_A, campo_erp: 'OITM, ONCM, OITB, OMRC, OUGP, OCEST, OIVL', fonte_url: `${SDK}/OITM.html`, grau: C },
    { k: 'consulta-b', tipo: 'CONSULTA_EXTRACAO', chave: 'Consulta B: saldo por depósito', texto: SAP_CONSULTA_B, campo_erp: 'OITW, OWHS', fonte_url: `${SDK}/OITW.html`, grau: C },
    { k: 'consulta-c', tipo: 'CONSULTA_EXTRACAO', chave: 'Consulta C: grupos de UdM e conversões', texto: SAP_CONSULTA_C, campo_erp: 'OUGP, UGP1, OUOM', fonte_url: `${SDK}/UGP1.html`, grau: C },
    { k: 'consulta-d', tipo: 'CONSULTA_EXTRACAO', chave: 'Consulta D: lotes e séries com saldo', texto: SAP_CONSULTA_D, campo_erp: 'OBTQ, OBTN, OSRQ, OSRN', fonte_url: `${SDK}/OBTQ.html`, grau: C },
    { k: 'apelidos', tipo: 'OBSERVACAO', chave: 'Apelidos do nome', texto: 'SAP B1; B1; SBO; SAP Business One', fonte_url: WN10, grau: N },
    { k: 'consulta-aviso', tipo: 'OBSERVACAO', chave: 'Como rodar as consultas', texto: 'Rodar no Query Manager e exportar para Excel. Aspas duplas obrigatórias no HANA. As consultas não foram executadas numa base SAP B1: validar no cliente antes de usar.', fonte_url: `${SDK}/OITM.html`, grau: N },
    // Restrições por tipo de ajuste
    { k: 'r-udm-transacao', tipo: 'RESTRICAO', tipo_ajuste: 'MUDOU_UNIDADE', chave: 'Unidade de estoque travada', texto: 'A UdM de estoque não muda depois que o item tem transações: criar item novo com a unidade certa e transferir o saldo.', campo_erp: 'OITM.InvntryUom', fonte_url: LRN_UOM, grau: C },
    { k: 'r-udm-grupo-docs', tipo: 'RESTRICAO', tipo_ajuste: 'MUDOU_UNIDADE', chave: 'Conversões com documentos abertos', texto: 'As taxas de conversão do grupo de UdM não mudam enquanto houver documento aberto com o item: fechar os documentos antes.', campo_erp: 'OUGP / UGP1', fonte_url: LRN_UOM, grau: C },
    { k: 'r-udm-grupo', tipo: 'RESTRICAO', tipo_ajuste: 'MUDOU_UNIDADE', chave: 'Troca do grupo de UdM', texto: 'Trocar o grupo de UdM do item só para um grupo que contenha todas as regras de conversão do original.', campo_erp: 'OUGP / UGP1', fonte_url: 'https://userapps.support.sap.com/sap/support/knowledge/en/3642762', grau: C },
    { k: 'r-excluir', tipo: 'RESTRICAO', tipo_ajuste: 'INATIVOU', chave: 'Excluir item com transações', texto: 'Item com transações não se exclui: inativar. Excluir só item sem linha em OIVL e sem documento aberto.', campo_erp: 'OITM.frozenFor', fonte_url: 'https://userapps.support.sap.com/sap/support/knowledge/en/3608928', grau: C },
    { k: 'r-inativar-antes', tipo: 'RESTRICAO', tipo_ajuste: 'INATIVOU', chave: 'Antes de inativar', texto: 'Zerar OITW.OnHand e fechar documentos abertos (IsCommited/OnOrder) antes de inativar. O efeito do inativo em documento aberto não é documentado pela SAP.', campo_erp: 'OITW', fonte_url: LRN_IMD, grau: N },
    { k: 'r-codigo', tipo: 'RESTRICAO', tipo_ajuste: 'MUDOU_CODIGO_DESCRICAO', chave: 'Trocar o ItemCode', texto: 'Tratar como impossível: item novo + saída e entrada do saldo + inativar o antigo. Não há página da SAP sobre trocar o código.', campo_erp: 'OITM.ItemCode', fonte_url: 'https://help.sap.com/saphelp_sbo882/helpdata/en/45/06da78d8696c30e10000000a114a6b/content.htm', grau: N },
    { k: 'r-descricao', tipo: 'RESTRICAO', tipo_ajuste: 'MUDOU_CODIGO_DESCRICAO', chave: 'Descrição em documentos', texto: 'Cada linha de documento guarda a própria descrição; o antes e depois do cadastro fica em AITM (Items - History).', campo_erp: 'RDR1/INV1.Dscription, AITM', fonte_url: `${SDK}/AITM.html`, grau: C },
    { k: 'r-ncm', tipo: 'RESTRICAO', tipo_ajuste: 'MUDOU_NCM', chave: 'NCM nas linhas', texto: 'As linhas de documento guardam o próprio NCM (campo NCMCode da linha).', campo_erp: 'RDR1/INV1.NCMCode', fonte_url: `${SDK}/RDR1.html`, grau: C },
    { k: 'r-ncm-emitidos', tipo: 'RESTRICAO', tipo_ajuste: 'MUDOU_NCM', chave: 'NCM de documentos já emitidos', texto: 'Consequência provável, não documentada pela SAP: documentos emitidos mantêm o NCM antigo; conferir os documentos abertos. Bloqueio de troca de NCM com movimento também não é documentado.', campo_erp: 'RDR1/INV1.NCMCode', fonte_url: `${SDK}/RDR1.html`, grau: N },
    { k: 'r-fusao', tipo: 'RESTRICAO', tipo_ajuste: 'CONSOLIDOU_INATIVOU', chave: 'Fusão de itens não documentada', texto: 'Não há função de fusão de itens na documentação da SAP (ausência de documentação, não proibição escrita): não prometer fusão nativa.', campo_erp: 'OITM', fonte_url: `${SDK}/SAPbobsCOM~Items_members.html`, grau: N },
    { k: 'r-owtr', tipo: 'RESTRICAO', tipo_ajuste: 'CONSOLIDOU_INATIVOU', chave: 'Transferência de estoque (OWTR)', texto: 'A transferência de estoque (OWTR) move o mesmo item entre depósitos: não serve para passar saldo de um item a outro.', campo_erp: 'OWTR', fonte_url: `${SDK}/SAPbobsCOM~StockTransfer.html`, grau: C },
    { k: 'r-custo-entrada', tipo: 'RESTRICAO', tipo_ajuste: 'CONSOLIDOU_INATIVOU', chave: 'Custo da entrada na unificação', texto: 'A entrada de mercadoria pode atualizar o último preço de compra do item: lançar a entrada pelo custo médio do item que sai. Pista da SAP Community, não confirmada em documentação oficial.', campo_erp: 'OIGN', fonte_url: 'https://answers.sap.com/t5/enterprise-resource-planning-q-a/wants-put-stock-opening-balance-through-dtw/m-p/4390724', grau: N },
    { k: 'r-lote', tipo: 'RESTRICAO', tipo_ajuste: 'CONSOLIDOU_INATIVOU', chave: 'Lote e série', texto: 'Item com lote ou série: saída e entrada por lote/série; ligar ou desligar esse controle só com saldo zero e sem lote alocado (confirmado na ajuda da versão 9.0; conferir na versão instalada).', campo_erp: 'ManBtchNum / ManSerNum', fonte_url: 'https://help.sap.com/saphelp_sbo900/helpdata/en/45/2365db9e152b31e10000000a1553f7/content.htm', grau: C },
    { k: 'r-tributario', tipo: 'RESTRICAO', tipo_ajuste: 'MUDOU_TRATAMENTO', chave: 'IBS/CBS fora do cadastro', texto: 'OITM não tem campo de IBS, CBS ou cClassTrib; o CST de IBS/CBS fica nas linhas de documento. cClassTrib não confirmado em tabela oficial.', campo_erp: 'RDR1/INV1.CSTfIBS, CSTfCBS', fonte_url: `${SDK}/RDR1.html`, grau: C },
    { k: 'r-congelado', tipo: 'RESTRICAO', tipo_ajuste: null, chave: 'Depósito congelado', texto: 'Com OITW.Freezed = Y (contagem aberta), concluir a contagem antes de ajustar o item.', campo_erp: 'OITW.Freezed', fonte_url: `${SDK}/OITW.html`, grau: C },
    { k: 'r-estoque', tipo: 'RESTRICAO', tipo_ajuste: null, chave: 'Item de estoque', texto: 'Mudar a categoria "item de estoque" é bloqueado depois de transação.', campo_erp: 'OITM.InvntItem', fonte_url: 'https://userapps.support.sap.com/sap/support/knowledge/en/3357935', grau: C },
    { k: 'r-grupo-contas', tipo: 'RESTRICAO', tipo_ajuste: null, chave: 'Grupo de itens e contas', texto: 'Se as contas contábeis vêm do grupo de itens, confirmar com a contabilidade antes de trocar o grupo.', campo_erp: 'OITM.ItmsGrpCod', fonte_url: `${SDK}/SAPbobsCOM~Items_members.html`, grau: N },
    // Ação no ERP
    { k: 'a-unificar', tipo: 'ACAO_NO_ERP', tipo_ajuste: 'CONSOLIDOU_INATIVOU', chave: 'Unificação', texto: 'Saída de mercadoria (OIGE) de {sai} por depósito, lote e série; entrada de mercadoria (OIGN) em {fica} na mesma quantidade convertida, na mesma data; depois inativar {sai}', campo_erp: 'OIGE, OIGN', fonte_url: `${SDK}/SAPbobsCOM~Documents.html`, grau: C },
    { k: 'a-inativar', tipo: 'ACAO_NO_ERP', tipo_ajuste: 'INATIVOU', chave: 'Inativação', texto: 'Inativar {sai} no cadastro (frozenFor = Y)', campo_erp: 'OITM.frozenFor', fonte_url: `${SDK}/OITM.html`, grau: C },
    { k: 'a-codigo', tipo: 'ACAO_NO_ERP', tipo_ajuste: 'MUDOU_CODIGO_DESCRICAO', chave: 'Troca de código', texto: 'Criar {fica}, saída OIGE de {sai}, entrada OIGN em {fica} e inativar {sai} (o ItemCode não se altera)', campo_erp: 'OITM, OIGE, OIGN', fonte_url: `${SDK}/SAPbobsCOM~Documents.html`, grau: N },
    { k: 'a-unidade', tipo: 'ACAO_NO_ERP', tipo_ajuste: 'MUDOU_UNIDADE', chave: 'Unidade', texto: 'Com movimento: item novo com a unidade certa + OIGE/OIGN + inativar o antigo; só conversão: grupo de UdM novo com as regras do original', campo_erp: 'OUGP', fonte_url: LRN_UOM, grau: C },
    { k: 'a-cadastro', tipo: 'ACAO_NO_ERP', tipo_ajuste: 'MUDOU_NCM', chave: 'NCM', texto: 'Atualizar o cadastro do item (DI API Items ou DTW oItems)', campo_erp: 'OITM.NCMCode', fonte_url: `${SDK}/SAPbobsCOM~Items_members.html`, grau: N },
    // Modelos de carga
    { k: 'm-items', tipo: 'MODELO_CARGA', chave: 'oItems (atualização de cadastro)', texto: 'ItemCode + campos alterados. Conferir o cabeçalho com o modelo do DTW da versão instalada e rodar antes em base de teste.', campo_erp: 'oItems', fonte_url: 'https://help.sap.com/saphelp_sbo900/helpdata/en/45/06437857240484e10000000a155369/content.htm', grau: C },
    { k: 'm-entrada-saida', tipo: 'MODELO_CARGA', chave: 'oInventoryGenExit e oInventoryGenEntry', texto: 'Documents + Document_Lines + lote/série, para a saída do item que sai e a entrada no que fica.', campo_erp: 'OIGE, OIGN', fonte_url: `${SDK}/SAPbobsCOM~Documents.html`, grau: C },
    { k: 'm-udm', tipo: 'MODELO_CARGA', chave: 'oUnitOfMeasurementGroups', texto: 'Grupos de UdM novos. O nome da pasta de modelo do DTW na 10.0 não foi confirmado.', campo_erp: 'OUGP', fonte_url: `${SDK}/SAPbobsCOM~UnitOfMeasurementGroupsService.html`, grau: N },
    // Limites de campo (DB Tables Reference do SDK 10.0: tipo e tamanho de cada coluna)
    { k: 'l-codigo', tipo: 'LIMITE_CAMPO', chave: 'codigo', campo_erp: 'OITM.ItemCode', texto: '50 caracteres (nVarChar 50).', fonte_url: `${SDK}/OITM.html`, grau: C },
    { k: 'l-descricao', tipo: 'LIMITE_CAMPO', chave: 'descricao', campo_erp: 'OITM.ItemName', texto: '200 caracteres (nVarChar 200). A descrição alternativa (FrgnName) também tem 200. O leiaute oficial é menor (xProd da NF-e: 120).', fonte_url: `${SDK}/OITM.html`, grau: C },
    { k: 'l-unidade', tipo: 'LIMITE_CAMPO', chave: 'unidade', campo_erp: 'OITM.InvntryUom', texto: '100 caracteres (nVarChar 100); BuyUnitMsr e SalUnitMsr também 100. O leiaute oficial é menor (0190 UNID, uCom e uTrib: 6).', fonte_url: `${SDK}/OITM.html`, grau: C },
    { k: 'l-referencia', tipo: 'LIMITE_CAMPO', chave: 'referencia', campo_erp: 'OITM.SuppCatNum', texto: '50 caracteres (nVarChar 50).', fonte_url: `${SDK}/OITM.html`, grau: C },
    { k: 'l-fabricante', tipo: 'LIMITE_CAMPO', chave: 'fabricante', campo_erp: 'OMRC.FirmName', texto: '30 caracteres (nVarChar 30).', fonte_url: `${SDK}/OMRC.html`, grau: C },
    // Observações
    { k: 'o-sped', tipo: 'OBSERVACAO', chave: 'Quem gera o SPED', texto: 'Não confirmado que o B1 gere a EFD de forma nativa: perguntar qual solução gera o SPED/NF-e e a versão e FP; usar o SPED do cliente como contraprova do export.', fonte_url: WN10, grau: N },
  ],
};

// ── Aliare Siagri ────────────────────────────────────────────────────────────
const AGB = 'https://siagri.atlassian.net/wiki/spaces/AGB/pages';

const SIAGRI: ErpCarga = {
  id: 'erp-aliare-siagri', nome: 'Aliare Siagri', fabricante: 'Aliare', produto: 'Siagri AgriBusiness', versoes: ['10.0.0.0', '9.6.0.0', '8.6.0.0', '7.6.0.0'], situacao: 'PARCIAL',
  itens: [
    { k: 'consulta-cadastro', tipo: 'CONSULTA_EXTRACAO', chave: 'Cadastro de produtos', texto: 'Pedir o cadastro de produtos (TRAN1071) e o de materiais de consumo (TRAN107B), separados: código, código original, descrição, grupo, tipo, NCM, unidade, Nº Registro MAPA e situação. O relatório que exporta o cadastro completo não foi confirmado: perguntar à Aliare.', campo_erp: 'TRAN1071, TRAN107B', fonte_url: `${AGB}/6113378267`, grau: N },
    { k: 'consulta-estoque', tipo: 'CONSULTA_EXTRACAO', chave: 'Saldos e movimentos', texto: 'Composição do Estoque Consolidado exportada por empresa, depósito e lote na data-base; Kardex Analítico do período (última movimentação e custo médio); Lotes dos Produtos (Tran1076) com validade e registro MAPA.', campo_erp: 'Tran1076', fonte_url: `${AGB}/3896181197/Compras+e+Estoque+-+V7.6.0.0`, grau: C },
    { k: 'consulta-sped', tipo: 'CONSULTA_EXTRACAO', chave: 'SPED do próprio ERP', texto: 'SPED Fiscal (0200 e H010) gerado pelo Siagri, como base independente das telas.', fonte_url: `${AGB}/6113375162/Escrita+Fiscal+-+9.6.0.0`, grau: C },
    { k: 'r-descricao', tipo: 'RESTRICAO', tipo_ajuste: 'MUDOU_CODIGO_DESCRICAO', chave: 'Descrição até 120 caracteres', texto: 'A descrição do produto tem até 120 caracteres.', campo_erp: 'TRAN1071', fonte_url: `${AGB}/3513450517/`, grau: C },
    { k: 'l-descricao', tipo: 'LIMITE_CAMPO', chave: 'descricao', campo_erp: 'TRAN1071 (descrição do produto)', texto: '120 caracteres (ampliada na versão 7.6.0.0). Igual ao xProd da NF-e.', fonte_url: `${AGB}/3513450517/`, grau: C },
    { k: 'l-codigo', tipo: 'LIMITE_CAMPO', chave: 'codigo', campo_erp: 'TRAN1071 (código)', texto: 'Tamanho do código do produto não publicado no Portal de Documentação Aliare: perguntar à Aliare.', fonte_url: `${AGB}/6113378267`, grau: N },
    { k: 'r-ncm', tipo: 'RESTRICAO', tipo_ajuste: 'MUDOU_NCM', chave: 'NCM extinto e troca em massa', texto: 'A importação de NCM (Tran10113) não remove código extinto e não mexe nos produtos; a TRAN539 altera só campos tributários, não o NCM.', campo_erp: 'Tran10113, TRAN539', fonte_url: `${AGB}/6113373196`, grau: C },
    { k: 'r-unificar', tipo: 'RESTRICAO', tipo_ajuste: 'CONSOLIDOU_INATIVOU', chave: 'Unificação não publicada', texto: 'Não há rotina de unificação publicada: o caminho é transferir o saldo e inativar, a confirmar com a Aliare.', fonte_url: `${AGB}/6113373157`, grau: N },
    { k: 'r-mapa', tipo: 'RESTRICAO', tipo_ajuste: 'CONSOLIDOU_INATIVOU', chave: 'Registro MAPA por lote', texto: 'Lotes do mesmo produto com registros MAPA diferentes indicam produtos distintos: candidato a desmembrar, não a unificar.', campo_erp: 'Tran1076', fonte_url: `${AGB}/3645505540/`, grau: C },
    { k: 'r-excluir', tipo: 'RESTRICAO', tipo_ajuste: 'INATIVOU', chave: 'Excluir × inativar', texto: 'Exclusão e inativação de produto não são publicadas: não recomendar exclusão sem confirmar com a Aliare.', fonte_url: `${AGB}/6113378267`, grau: N },
    { k: 'r-unidade', tipo: 'RESTRICAO', tipo_ajuste: 'MUDOU_UNIDADE', chave: 'Unidade de item movimentado', texto: 'Troca de unidade e conversões não são publicadas: não recomendar sem confirmar com a Aliare.', fonte_url: `${AGB}/4537024534/Compras+e+Estoque+-+8.6.0.0`, grau: N },
    { k: 'r-tributario', tipo: 'RESTRICAO', tipo_ajuste: 'MUDOU_TRATAMENTO', chave: 'cClassTrib por agrupamento', texto: 'O cClassTrib não fica no produto: o item entra num agrupamento tributário (Efis117) ligado à classificação (Efis120).', campo_erp: 'Efis117, Efis120', fonte_url: `${AGB}/4747067393/Reforma+Tribut+ria`, grau: C },
    { k: 'r-periodo', tipo: 'RESTRICAO', tipo_ajuste: null, chave: 'Período encerrado', texto: 'Há parâmetro que bloqueia saldos em períodos encerrados: ajustes na data corrente.', fonte_url: `${AGB}/4537024534/Compras+e+Estoque+-+8.6.0.0`, grau: C },
    { k: 'r-receituario', tipo: 'RESTRICAO', tipo_ajuste: null, chave: 'Receituário agronômico', texto: 'Item com receituário, lote ou registro MAPA: alteração com o responsável técnico.', fonte_url: `${AGB}/5939232769/Vers+o+10.0.0.0`, grau: C },
    { k: 'a-unificar', tipo: 'ACAO_NO_ERP', tipo_ajuste: 'CONSOLIDOU_INATIVOU', chave: 'Unificação', texto: 'Transferir o saldo de {sai} para {fica}, inativar {sai}, registrar {sai} no Código Original de {fica} e incluir {fica} nos agrupamentos tributários (Efis117) de {sai}; a confirmar com a Aliare', campo_erp: 'Código Original, Efis117', fonte_url: `${AGB}/6113378267`, grau: N },
    { k: 'a-ncm', tipo: 'ACAO_NO_ERP', tipo_ajuste: 'MUDOU_NCM', chave: 'NCM', texto: 'Planilha DE → PARA: campos tributários pela TRAN539; NCM no cadastro (manual ou por serviço da Aliare)', campo_erp: 'TRAN539', fonte_url: `${AGB}/6113373157`, grau: C },
    { k: 'm-agrupamento', tipo: 'MODELO_CARGA', chave: 'Ferramenta de Inclusão (Efis117A1)', texto: 'Inclui produtos em massa nos agrupamentos tributários, por faixa de código e NCM.', campo_erp: 'Efis117A1', fonte_url: `${AGB}/4957470721`, grau: C },
    { k: 'm-planilha', tipo: 'MODELO_CARGA', chave: 'Importação de cadastro por planilha', texto: 'Importação de planilha e API de produtos não são publicadas: entregar a planilha DE → PARA por item.', fonte_url: `${AGB}/6113373157`, grau: N },
    // "Aliare" sozinho não entra: a Aliare tem outros produtos (Essencial, Web/Simer, Agrimanager...), ver "Qual produto Aliare".
    { k: 'apelidos', tipo: 'OBSERVACAO', chave: 'Apelidos do nome', texto: 'Siagri; Siagri AgriBusiness; Aliare Siagri', fonte_url: 'https://siagri.atlassian.net/wiki/spaces/AGB/overview', grau: N },
    { k: 'o-produto', tipo: 'OBSERVACAO', chave: 'Qual produto Aliare', texto: 'As regras valem para o Siagri AgriBusiness. Perguntar o produto (AgriBusiness, Essencial, Web/Simer, Agrimanager, Datacoper, Solution) e a versão.', fonte_url: 'https://siagri.atlassian.net/wiki/spaces/AGB/overview', grau: C },
    // Perguntas abertas (docs/erp-aliare-siagri-saneamento.md, "A confirmar")
    { k: 'p-01', tipo: 'OBSERVACAO', chave: 'Pergunta: excluir e inativar', texto: 'Permite excluir produto com movimento? Existe situação inativo no TRAN1071 e ela bloqueia venda, compra e inventário?', fonte_url: `${AGB}/6113378267`, grau: N },
    { k: 'p-02', tipo: 'OBSERVACAO', chave: 'Pergunta: trocar unidade', texto: 'Dá para trocar a unidade de produto com saldo ou movimento? Se não, o procedimento é novo código + transferência?', fonte_url: `${AGB}/4537024534/Compras+e+Estoque+-+8.6.0.0`, grau: N },
    { k: 'p-03', tipo: 'OBSERVACAO', chave: 'Pergunta: unificar', texto: 'Existe rotina de unificação ou substituição de produtos? O campo Código Original é editável e serve para isso?', fonte_url: `${AGB}/6113378267`, grau: N },
    { k: 'p-04', tipo: 'OBSERVACAO', chave: 'Pergunta: alteração em massa', texto: 'Há importação de planilha (ou serviço da Aliare) para alterar NCM, descrição, grupo e unidade em massa?', fonte_url: `${AGB}/6113373157`, grau: N },
    { k: 'p-05', tipo: 'OBSERVACAO', chave: 'Pergunta: export do cadastro', texto: 'Qual relatório exporta o cadastro completo (unidade, conversões, NCM, registro MAPA, situação) em Excel?', fonte_url: `${AGB}/6113378267`, grau: N },
    { k: 'p-06', tipo: 'OBSERVACAO', chave: 'Pergunta: última movimentação', texto: 'Qual relatório traz a data da última movimentação por produto e depósito?', fonte_url: `${AGB}/3760586826/`, grau: N },
    { k: 'p-07', tipo: 'OBSERVACAO', chave: 'Pergunta: conversões', texto: 'Como são as conversões de unidade e embalagem (estoque × venda × tributável)?', fonte_url: `${AGB}/4537024534/Compras+e+Estoque+-+8.6.0.0`, grau: N },
    { k: 'p-08', tipo: 'OBSERVACAO', chave: 'Pergunta: dados agronômicos', texto: 'Onde ficam princípio ativo, classe toxicológica, RENASEM e dados de grãos (umidade, impureza)?', fonte_url: 'https://www.siagri.com.br/produto/siagri-agribusiness/', grau: N },
    { k: 'p-09', tipo: 'OBSERVACAO', chave: 'Pergunta: SPED 0205/0220/H010', texto: 'O SPED gera 0205 quando a descrição muda e 0220 para conversões? O H010 sai do saldo por depósito ou consolidado?', fonte_url: `${AGB}/5939462147/Escrita+Fiscal+-+10.0.0.0`, grau: N },
    { k: 'p-10', tipo: 'OBSERVACAO', chave: 'Pergunta: versão da Reforma', texto: 'A partir de qual versão o configurador da Reforma (Efis115 a Efis120) está disponível, e o cliente já está nela?', fonte_url: `${AGB}/4747067393/Reforma+Tribut+ria`, grau: N },
    { k: 'p-11', tipo: 'OBSERVACAO', chave: 'Pergunta: grãos de terceiros', texto: 'Saldos de grãos de terceiros (armazém geral) ficam no estoque próprio ou só no módulo de armazenagem?', fonte_url: 'https://www.siagri.com.br/produto/siagri-agribusiness/', grau: N },
  ],
};

// ── TOTVS Protheus ───────────────────────────────────────────────────────────
const TDN = 'https://tdn.totvs.com/pages/viewpage.action?pageId=';
const CENTRAL = 'https://centraldeatendimento.totvs.com/hc/pt-br/articles/';
const MATA010 = 'https://tdn.totvs.com/display/PROT/Produtos+-+MATA010+-+Estoque+-+P12';
const PIMS_TDN = 'https://tdn.totvs.com/pages/viewpage.action?pageId=351372629';

const PROTHEUS_A = `SELECT B1_FILIAL, B1_COD, B1_DESC, B1_TIPO, B1_GRUPO, B1_UM, B1_SEGUM, B1_CONV, B1_TIPCONV,
       B1_POSIPI, B1_EX_NCM, B1_CEST, B1_ORIGEM, B1_GRTRIB, B1_CODBAR, B1_CODGTIN, B1_FABRIC,
       B1_MSBLQL, B1_ATIVO, B1_RASTRO, B1_LOCALIZ, B1_LOCPAD, B1_CODANT, B1_DATREF, B1_UPRC, B1_CUSTD
FROM SB1
-- Com MV_ARQPROD = SBZ, trazer também a SBZ (indicadores do produto por filial).`;

const PROTHEUS_B = `SELECT B2_FILIAL, B2_COD, B2_LOCAL, B2_QATU, B2_VATU1, B2_CM1, B2_USAI, B2_DINVENT,
       B2_RESERVA, B2_QEMP, B2_SALPEDI, B2_QPEDVEN, B2_QNTP, B2_QTNP, B2_QACLASS
FROM SB2`;

const PROTHEUS_C = `SELECT COD AS B1_COD, MAX(DT) AS ULTIMA_MOV
FROM (SELECT D1_COD AS COD, D1_DTDIGIT AS DT FROM SD1
      UNION ALL SELECT D2_COD, D2_EMISSAO FROM SD2
      UNION ALL SELECT D3_COD, D3_EMISSAO FROM SD3
      -- tirar os estornados da SD3 (D3_ESTORNO preenchido; conferir MV_D3ESTOR)
     ) M
GROUP BY COD`;

const PROTHEUS: ErpCarga = {
  id: 'erp-totvs-protheus', nome: 'TOTVS Protheus', fabricante: 'TOTVS', produto: 'Protheus (P12)', versoes: ['12.1.2410', '12.1.2510'], situacao: 'PARCIAL',
  itens: [
    { k: 'col-estab', tipo: 'COLUNA_EXPORT', chave: 'estabelecimento', campo_erp: 'B1_FILIAL', texto: 'Filial (B1_FILIAL ou B2_FILIAL); a SB1 pode ser compartilhada (filial vazia).', fonte_url: `${TDN}788612446`, grau: C },
    { k: 'col-codigo', tipo: 'COLUNA_EXPORT', chave: 'codigo', campo_erp: 'B1_COD', texto: 'Código do produto (B1_COD), chave que não se altera.', fonte_url: MATA010, grau: C },
    { k: 'col-descricao', tipo: 'COLUNA_EXPORT', chave: 'descricao', campo_erp: 'B1_DESC', texto: 'Descrição (B1_DESC).', fonte_url: `${TDN}702823280`, grau: C },
    { k: 'col-unidade', tipo: 'COLUNA_EXPORT', chave: 'unidade', campo_erp: 'B1_UM', texto: '1ª unidade (B1_UM); 2ª unidade e fator em B1_SEGUM, B1_CONV e B1_TIPCONV (M ou D).', fonte_url: `${CENTRAL}56836052745747`, grau: C },
    { k: 'col-ncm', tipo: 'COLUNA_EXPORT', chave: 'ncm', campo_erp: 'B1_POSIPI', texto: 'NCM (B1_POSIPI, tabela SYD); exceção em B1_EX_NCM.', fonte_url: `${TDN}528468928`, grau: C },
    { k: 'col-grupo', tipo: 'COLUNA_EXPORT', chave: 'grupo', campo_erp: 'B1_GRUPO', texto: 'Grupo de produto (B1_GRUPO → SBM).', fonte_url: 'https://tdn.totvs.com/display/PROT/Grupos+de+Produtos+-+MATA035', grau: C },
    { k: 'col-ativo', tipo: 'COLUNA_EXPORT', chave: 'ativo', campo_erp: 'B1_MSBLQL', texto: "Situação: B1_MSBLQL = '1' é bloqueado; B1_ATIVO só como informação.", fonte_url: `${CENTRAL}56867629820819`, grau: C },
    { k: 'col-saldo', tipo: 'COLUNA_EXPORT', chave: 'saldo', campo_erp: 'B2_QATU', texto: 'Saldo = soma de B2_QATU por produto (por B2_LOCAL no detalhe).', fonte_url: 'https://tdn.totvs.com/display/PROT/PEST01011+-+Conceito+do+Consulta+F4+do+produto+e+seus+campos', grau: C },
    { k: 'col-ultmov', tipo: 'COLUNA_EXPORT', chave: 'ultimaMovimentacao', campo_erp: 'ULTIMA_MOV', texto: 'Maior data entre SD1 (D1_DTDIGIT), SD2 (D2_EMISSAO) e SD3 (D3_EMISSAO, sem estornos): consulta C. Método do InTAX, não rotina da TOTVS.', fonte_url: `${TDN}774613029`, grau: N },
    { k: 'col-fabricante', tipo: 'COLUNA_EXPORT', chave: 'fabricante', campo_erp: 'B1_FABRIC', texto: 'Fabricante (B1_FABRIC).', fonte_url: `${TDN}284350567`, grau: C },
    // Limites de campo: o tamanho vem do dicionário (SX3, e grupo de campos SXG quando houver) do ambiente do cliente; sem dicionário público
    // oficial por campo (docs/erp-totvs-protheus-saneamento.md), fica sem número até ler no Configurador do cliente.
    { k: 'l-codigo', tipo: 'LIMITE_CAMPO', chave: 'codigo', campo_erp: 'B1_COD', texto: 'Tamanho configurável no dicionário (SX3/grupo de campos) do ambiente; o tamanho padrão não foi confirmado em página oficial da TOTVS. Ler em Configurador > Base de Dados > Dicionário (SB1).', fonte_url: MATA010, grau: N },
    { k: 'l-descricao', tipo: 'LIMITE_CAMPO', chave: 'descricao', campo_erp: 'B1_DESC', texto: 'Tamanho configurável no dicionário (SX3) do ambiente; o tamanho padrão não foi confirmado em página oficial da TOTVS. Ler em Configurador > Base de Dados > Dicionário (SB1).', fonte_url: `${TDN}702823280`, grau: N },
    { k: 'l-unidade', tipo: 'LIMITE_CAMPO', chave: 'unidade', campo_erp: 'B1_UM', texto: 'Tamanho do campo no dicionário (SX3) do ambiente; não confirmado em página oficial da TOTVS.', fonte_url: `${CENTRAL}56836052745747`, grau: N },
    { k: 'consulta-a', tipo: 'CONSULTA_EXTRACAO', chave: 'Consulta A: produtos (SB1)', texto: PROTHEUS_A, campo_erp: 'SB1, SBZ', fonte_url: MATA010, grau: C },
    { k: 'consulta-b', tipo: 'CONSULTA_EXTRACAO', chave: 'Consulta B: saldos (SB2)', texto: PROTHEUS_B, campo_erp: 'SB2', fonte_url: 'https://tdn.totvs.com/display/PROT/PEST01011+-+Conceito+do+Consulta+F4+do+produto+e+seus+campos', grau: C },
    { k: 'consulta-c', tipo: 'CONSULTA_EXTRACAO', chave: 'Consulta C: última movimentação (SD1, SD2, SD3)', texto: PROTHEUS_C, campo_erp: 'SD1, SD2, SD3', fonte_url: `${TDN}774613029`, grau: N },
    { k: 'consulta-aviso', tipo: 'OBSERVACAO', chave: 'Nome das tabelas no banco', texto: 'SB1, SB2 e SD1 a SD3 são os nomes lógicos; no banco levam o sufixo da empresa (ex.: SB1010), que depende do ambiente. As consultas não foram executadas numa base Protheus.', fonte_url: MATA010, grau: N },
    { k: 'r-codigo', tipo: 'RESTRICAO', tipo_ajuste: 'MUDOU_CODIGO_DESCRICAO', chave: 'B1_COD não muda', texto: 'B1_COD não pode ser alterado: código novo com B1_CODANT = antigo, transferência pela MATA261 e bloqueio do antigo. O 0205 só sai no mês do primeiro movimento do código novo.', campo_erp: 'B1_COD, B1_CODANT', fonte_url: `${CENTRAL}56862677795603`, grau: C },
    { k: 'r-descricao', tipo: 'RESTRICAO', tipo_ajuste: 'MUDOU_CODIGO_DESCRICAO', chave: 'Descrição e 0205', texto: 'A descrição se altera direto; só com MV_HISTTAB ligado a mudança grava a AIF e gera o 0205.', campo_erp: 'B1_DESC, AIF', fonte_url: `${TDN}702823280`, grau: C },
    { k: 'r-excluir', tipo: 'RESTRICAO', tipo_ajuste: 'INATIVOU', chave: 'Produto com vínculo', texto: "Produto com vínculo não se exclui (FWFORMCANCEL): bloquear com B1_MSBLQL = '1'.", campo_erp: 'B1_MSBLQL', fonte_url: `${CENTRAL}56867629820819`, grau: C },
    { k: 'r-bloquear-antes', tipo: 'RESTRICAO', tipo_ajuste: 'INATIVOU', chave: 'Zerar antes de bloquear', texto: 'Primeiro zerar o saldo e encerrar empenho, reserva e pedido; depois bloquear: produto bloqueado não entra em inventário nem transferência.', campo_erp: 'SB2, B1_MSBLQL', fonte_url: `${CENTRAL}56867629820819`, grau: C },
    { k: 'r-segum', tipo: 'RESTRICAO', tipo_ajuste: 'MUDOU_UNIDADE', chave: '2ª UM e fator', texto: 'Trocar a 2ª UM ou o fator de produto movimentado exige zerar o saldo, alterar e reimplantar depois do fechamento.', campo_erp: 'B1_SEGUM, B1_CONV, B1_TIPCONV', fonte_url: `${CENTRAL}56836052745747`, grau: C },
    { k: 'r-1um', tipo: 'RESTRICAO', tipo_ajuste: 'MUDOU_UNIDADE', chave: '1ª UM', texto: 'Para a 1ª UM de produto movimentado não há procedimento oficial: tratar como código novo + MATA261 + bloqueio.', campo_erp: 'B1_UM', fonte_url: `${TDN}235594412`, grau: N },
    { k: 'r-fusao', tipo: 'RESTRICAO', tipo_ajuste: 'CONSOLIDOU_INATIVOU', chave: 'Sem fusão nativa', texto: 'Não há fusão de cadastros: transferir pela Transferência Múltipla MATA261 (a MATA260 foi descontinuada em 2022), com data após o último fechamento.', campo_erp: 'MATA261', fonte_url: `${TDN}607042817`, grau: C },
    { k: 'r-codant', tipo: 'RESTRICAO', tipo_ajuste: 'CONSOLIDOU_INATIVOU', chave: 'Um só código anterior', texto: 'B1_CODANT guarda um só código anterior: os demais absorvidos ficam sem 0205 de código.', campo_erp: 'B1_CODANT', fonte_url: `${CENTRAL}56862677795603`, grau: N },
    { k: 'r-ncm', tipo: 'RESTRICAO', tipo_ajuste: 'MUDOU_NCM', chave: 'NCM e devolução', texto: 'O NCM se altera direto; a devolução de nota antiga pode reproduzir o NCM da nota original. Revisar as regras por NCM no Configurador de Tributos.', campo_erp: 'B1_POSIPI', fonte_url: `${TDN}1076450926`, grau: C },
    { k: 'r-ncm-movimento', tipo: 'RESTRICAO', tipo_ajuste: 'MUDOU_NCM', chave: 'NCM com movimento', texto: 'Restrição (ou ausência dela) para trocar NCM ou grupo de produto movimentado: não documentada.', campo_erp: 'B1_POSIPI, B1_GRUPO', fonte_url: `${TDN}528468928`, grau: N },
    { k: 'r-tributario', tipo: 'RESTRICAO', tipo_ajuste: 'MUDOU_TRATAMENTO', chave: 'CST e cClassTrib fora da SB1', texto: 'CST e cClassTrib ficam no Configurador de Tributos (Perfil de Produto), não na SB1: todo código novo precisa entrar no perfil certo.', campo_erp: 'CFGTRIB/FISA170', fonte_url: `${TDN}1104717414`, grau: C },
    { k: 'r-sbz', tipo: 'RESTRICAO', tipo_ajuste: null, chave: 'MV_ARQPROD = SBZ', texto: 'Com MV_ARQPROD = SBZ, dados do produto ficam na SBZ por filial: o export precisa trazer a SBZ.', campo_erp: 'SBZ', fonte_url: `${TDN}339509615`, grau: C },
    { k: 'r-fechamento', tipo: 'RESTRICAO', tipo_ajuste: null, chave: 'Data do fechamento', texto: 'Ajustes com data posterior ao último fechamento: a Virada de Saldos (MATA280) bloqueia datas anteriores.', campo_erp: 'MATA280, SB9', fonte_url: `${TDN}450141831`, grau: C },
    { k: 'r-rastro', tipo: 'RESTRICAO', tipo_ajuste: null, chave: 'Lote e endereço', texto: 'Desligar lote ou endereço (B1_RASTRO, B1_LOCALIZ) só com saldo zerado; a alternativa é código novo + MATA261.', campo_erp: 'B1_RASTRO, B1_LOCALIZ', fonte_url: `${TDN}367232994`, grau: C },
    { k: 'a-unificar', tipo: 'ACAO_NO_ERP', tipo_ajuste: 'CONSOLIDOU_INATIVOU', chave: 'Unificação', texto: "Transferência Múltipla (MATA261) do saldo de {sai} para {fica} por armazém, lote e endereço, com data após o último fechamento; depois bloquear {sai} (B1_MSBLQL = '1')", campo_erp: 'MATA261, B1_MSBLQL', fonte_url: `${CENTRAL}56863243789075`, grau: C },
    { k: 'a-inativar', tipo: 'ACAO_NO_ERP', tipo_ajuste: 'INATIVOU', chave: 'Inativação', texto: "Zerar o saldo de {sai} e encerrar empenhos, reservas e pedidos; depois bloquear {sai} (B1_MSBLQL = '1')", campo_erp: 'B1_MSBLQL', fonte_url: `${CENTRAL}56867629820819`, grau: C },
    { k: 'a-codigo', tipo: 'ACAO_NO_ERP', tipo_ajuste: 'MUDOU_CODIGO_DESCRICAO', chave: 'Troca de código', texto: 'Copiar o produto para {fica} com B1_CODANT = {sai} (MV_HISTTAB ligado), transferir o saldo pela MATA261 e bloquear {sai}', campo_erp: 'MATA010, MATA261', fonte_url: `${CENTRAL}56862677795603`, grau: C },
    { k: 'a-unidade', tipo: 'ACAO_NO_ERP', tipo_ajuste: 'MUDOU_UNIDADE', chave: '2ª UM e fator', texto: 'Zerar o saldo, alterar B1_SEGUM/B1_CONV/B1_TIPCONV na MATA010 e reimplantar o saldo, depois do fechamento', campo_erp: 'MATA010', fonte_url: `${CENTRAL}56836052745747`, grau: C },
    { k: 'a-ncm', tipo: 'ACAO_NO_ERP', tipo_ajuste: 'MUDOU_NCM', chave: 'NCM', texto: 'MATA010 – Alterar (manual) ou ExecAuto/MVC opção 4 (em lote)', campo_erp: 'MATA010', fonte_url: MATA010, grau: C },
    { k: 'm-execauto', tipo: 'MODELO_CARGA', chave: 'Alteração em massa (ExecAuto/MVC da MATA010)', texto: 'B1_COD + só as colunas alteradas, uma linha por produto, rodado pelo TI do cliente.', campo_erp: 'MATA010 (opção 4)', fonte_url: MATA010, grau: C },
    { k: 'm-mile', tipo: 'MODELO_CARGA', chave: 'MILE só inclui', texto: 'O MILE da MATA010 só faz inclusão: serve para criar códigos novos, não para corrigir os existentes.', campo_erp: 'MATA010 (MILE)', fonte_url: MATA010, grau: C },
    { k: 'm-mata261', tipo: 'MODELO_CARGA', chave: 'Transferências (MATA261)', texto: 'Produto, armazém e lote/endereço de origem e de destino, quantidade e data. Os nomes de campo do ExecAuto da MATA261 não foram confirmados: colunas em português e o TI faz o de-para.', campo_erp: 'MATA261', fonte_url: `${TDN}379292606`, grau: N },
    { k: 'm-api', tipo: 'MODELO_CARGA', chave: 'API REST de produtos', texto: 'API REST pública de produtos com alteração: não confirmada. Não prometer correção por API.', fonte_url: 'https://tdn.totvs.com/display/framework/Mensagem+Padronizada+Via+Rest', grau: N },
    // "TOTVS" sozinho não entra: pode ser Protheus, RM, Datasul ou outro produto da TOTVS.
    { k: 'apelidos', tipo: 'OBSERVACAO', chave: 'Apelidos do nome', texto: 'Protheus; TOTVS Protheus; P12; Protheus 12', fonte_url: MATA010, grau: N },
    { k: 'o-usai', tipo: 'OBSERVACAO', chave: 'B2_USAI só olha saídas', texto: 'B2_USAI (última saída) só considera saídas: item que só recebeu parece obsoleto. Usar a maior data de SD1, SD2 e SD3 (consulta C).', campo_erp: 'B2_USAI', fonte_url: `${TDN}348295976`, grau: C },
    { k: 'o-sped', tipo: 'OBSERVACAO', chave: 'De onde sai o SPED', texto: '0205 vem da AIF e do B1_CODANT com MV_HISTTAB; 0220 só sai com MV_GER0220 e 2ª UM cadastrada; o Bloco H vem da SB9 e da MATR460.', campo_erp: 'SPEDFISCAL', fonte_url: `${TDN}652398035`, grau: C },
    { k: 'o-perguntas', tipo: 'OBSERVACAO', chave: 'Perguntar ao cliente', texto: 'MV_ARQPROD, MV_HISTTAB, MV_RASTRO, MV_LOCALIZ, data do último fechamento e se a SB1 é compartilhada entre filiais.', fonte_url: MATA010, grau: C },
    { k: 'o-pend-cclasstrib', tipo: 'OBSERVACAO', chave: 'Pendência: cClassTrib na SB1', texto: 'Nenhuma página oficial do Protheus cria campo de cClassTrib/CST na SB1; nem o campo de ligação produto × Perfil de Produto (tabela F24).', fonte_url: `${TDN}1104717414`, grau: N },
    { k: 'o-pend-ativo', tipo: 'OBSERVACAO', chave: 'Pendência: B1_ATIVO e B1_UCOM', texto: 'O efeito do B1_ATIVO fora da integração SFA e o campo B1_UCOM (última compra) não foram confirmados.', fonte_url: `${TDN}359473597`, grau: N },
    // Add-on PIMS (linha Multicultivos) integrado ao Protheus: migrado de src/lib/conhecimentoSistemas.js (conferido em 16/10/2026).
    // Convenção: a chave começa por "PIMS <linha> · " (o add-on e a linha) e o texto termina com "Revisão da fonte: ... Conferido em ...".
    { k: 'pims-codigo-erp', tipo: 'OBSERVACAO', chave: 'PIMS Multicultivos · Código interno e código do ERP', texto: 'Compare o vínculo de integração antes de classificar códigos diferentes como produtos duplicados. Evidência: a documentação distingue o código interno do PIMS do código recebido do ERP e descreve configuração sequencial. Revisão da fonte: Documento legado, atualizado em 18/04/2018. Conferido em 16/10/2026.', campo_erp: 'B1_COD, CD_INT_ERP', fonte_url: PIMS_TDN, grau: C },
    { k: 'pims-campos-item', tipo: 'OBSERVACAO', chave: 'PIMS Multicultivos · Mapeamento de produtos e unidades', texto: 'Confirme os mapas de código, descrição, unidade, tipo e grupo. Grupo de estoque não deve ser tratado como conta contábil sem regra da empresa. Evidência: a integração relaciona o cadastro de produtos do Protheus às entidades do PIMS conforme o tipo de material. Revisão da fonte: Documento legado, atualizado em 18/04/2018. Conferido em 16/10/2026.', campo_erp: 'B1_COD, B1_DESC, B1_UM, B1_TIPO, B1_GRUPO', fonte_url: PIMS_TDN, grau: C },
    { k: 'pims-vinculos', tipo: 'OBSERVACAO', chave: 'PIMS Multicultivos · Vínculos com apontamentos antes de excluir', texto: 'Levante os relacionamentos operacionais antes de recomendar exclusão ou unificação de um cadastro. Evidência: a documentação condiciona a exclusão à ausência de vínculos em tabelas operacionais. Revisão da fonte: Documento legado, atualizado em 18/04/2018. Conferido em 16/10/2026.', campo_erp: null, fonte_url: PIMS_TDN, grau: C },
  ],
};

const OUTRO: ErpCarga = { id: 'erp-outro', nome: 'Outro ERP (sem perfil)', fabricante: '—', produto: null, versoes: [], situacao: 'A_DESENVOLVER', itens: [] };

export const CARGA_ERPS: ErpCarga[] = [SAP, SIAGRI, PROTHEUS, OUTRO];
/** Id do item da carga: fixo, para a carga não duplicar. */
export const idDoItemDaCarga = (erpId: string, k: string) => `${erpId}:${k}`;
