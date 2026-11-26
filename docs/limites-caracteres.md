# Limites de caracteres do cadastro de itens

Pesquisa de 26/11/2026, só em fonte oficial. Serve ao aspecto **Limites de caracteres** das Diretrizes do Saneamento (docs/saneamento-diretrizes.md, seção 3).

## Resumo

- **Ordem de confiança:** o leiaute oficial (Guia Prático do SPED, leiaute da NF-e) é o **teto**. O ERP (Cadastro de ERPs, tipo "Limite de campo") e o cliente só **restringem mais**. Vale o **menor limite confirmado**. Limite não confirmado fica `null` (pendente), nunca um número genérico.
- **Descrição do item:** o teto efetivo é **120 caracteres** (`xProd` da NF-e e da NFC-e). No SPED (0200 `DESCR_ITEM`, 0205 `DESCR_ANT_ITEM`, C170 `DESCR_COMPL`) o limite é **255**.
- **Código do item:** **60** em todos os leiautes (0200/0205/C170/H010 `COD_ITEM`, `cProd`).
- **Unidade:** **6** em todos os leiautes (0190 `UNID`, 0200 `UNID_INV`, 0220 `UNID_CONV`, C170/H010 `UNID`, `uCom`, `uTrib`).
- **SPED, campo "C" sem tamanho não quer dizer "sem limite".** Os dois Guias Práticos dizem que todo campo alfanumérico tem no máximo 255 caracteres, salvo indicação diferente. Na tabela do registro o tamanho aparece como "-" e vale 255 (EFD ICMS/IPI 3.2.4, Cap. I, Seção 3, p. 19; EFD-Contribuições 1.35, Seção 3, p. 34, e legenda dos registros, p. 56).
- **ERPs:** SAP Business One confirmado (ItemCode 50, ItemName 200). Aliare Siagri: descrição 120 confirmada. TOTVS Protheus: tamanhos do SB1 configuráveis no dicionário (SX3, com grupo de campos), sem página oficial com o tamanho padrão. Ficam **não confirmados** até serem lidos no ambiente do cliente.

Onde está no InTAX:
- `backend/src/saneamento-estoques/diretrizes/conteudo/limites-oficiais.ts`: `LIMITES_OFICIAIS: LinhaLimite[]`, com origem LEIAUTE_OFICIAL, tratamento padrão SUGERIR_ABREVIACAO e componentes preservados NOME e REFERENCIA.
- Cadastro de ERPs (`backend/src/erps/`): tipo de conhecimento `LIMITE_CAMPO`, com o rótulo "Limite de campo" na ficha do ERP. `chave` é o campo do item (descricao, codigo, unidade, referencia, fabricante) e `campo_erp` é o campo no ERP. Quando o tamanho é confirmado, o `texto` começa por "N caracteres". `limitesDoErp(perfil)` devolve os limites (null quando o item não é confirmado ou o texto não traz o número).

## Fontes

| Sigla | Documento | Versão | URL |
|---|---|---|---|
| EFD | Guia Prático EFD ICMS/IPI | 3.2.4, atualização 30/07/2026 (leiaute 020; a NT 2026.001, leiaute 021 de 2027, mantém os tamanhos dos registros 0190, 0200 e 0205) | https://www.gov.br/sped/pt-br/assuntos/escrituracoes-digitais/efd-icms-ipi/manuais-e-documentos-tecnicos/guia-pratico-efd-versao-3-2-4.pdf/@@display-file/file |
| CONTRIB | Guia Prático EFD-Contribuições | 1.35, 18/06/2021 (único guia publicado) | https://www.gov.br/sped/pt-br/assuntos/escrituracoes-digitais/efd-contribuicoes/manuais/guia_pratico_efd_contribuicoes_versao_1_35-18_06_2021.pdf |
| MOC | MOC 7.00, Anexo I: Leiaute e Regras de Validação da NF-e e da NFC-e | 7.00 (Portal SVRS) | https://dfe-portal.svrs.rs.gov.br/NFE/DownloadArquivoEstatico/?sistema=NFE&tipoArquivo=1&nomeArquivo=moc7-anexo-i-leiaute-e-rv.pdf |
| XSD | `leiauteNFe_v4.00.xsd` (schemas oficiais) | PL_010c (NT 2022.002 v1.30, arquivos de 11/03/2026). O PL_010b (NT 2025.002 v1.30) traz os mesmos valores | https://dfe-portal.svrs.rs.gov.br/NFE/DownloadArquivoEstatico/?sistema=NFE&tipoArquivo=2&nomeArquivo=PL_010c_NT2022_002v1.30.zip |
| SAP | SAP Business One SDK 10.0, DB Tables Reference | 10.0 | https://help.sap.com/doc/089315d8d0f8475a9fc84fb919b501a3/10.0/en-US/SDKHelp/OITM.html (e OMRC.html) |
| AGB | Portal de Documentação Aliare (Siagri AgriBusiness), notas da versão 7.6.0.0 | 7.6.0.0 | https://siagri.atlassian.net/wiki/spaces/AGB/pages/3513450517/ |

## Leiautes oficiais (teto)

"No InTAX" = linha em `LIMITES_OFICIAIS`. Os campos sem "sim" ficam só nesta tabela: eles não correspondem a um campo do item que a regra de limites trata (código de barras, descrição da unidade, informação adicional).

| Destino | Campo | Campo do item | Limite | Fonte (registro/campo, página) | Grau | No InTAX |
|---|---|---|---|---|---|---|
| SPED EFD ICMS/IPI | 0200 COD_ITEM | código | 60 | EFD, 0200 campo 02 (C 060), p. 36 | Confirmado | sim |
| SPED EFD ICMS/IPI | 0200 DESCR_ITEM | descrição | 255 | EFD, 0200 campo 03 (C -), p. 36 + regra dos 255, p. 19 | Confirmado | sim |
| SPED EFD ICMS/IPI | 0200 COD_BARRA | código de barras | 255 | EFD, 0200 campo 04 (C -), p. 36 + regra dos 255, p. 19 | Confirmado | não |
| SPED EFD ICMS/IPI | 0200 UNID_INV | unidade | 6 | EFD, 0200 campo 06 (C 006), p. 36 | Confirmado | sim |
| SPED EFD ICMS/IPI | 0190 UNID | unidade | 6 | EFD, 0190 campo 02 (C 006), p. 35 | Confirmado | sim |
| SPED EFD ICMS/IPI | 0190 DESCR | descrição da unidade | 255 | EFD, 0190 campo 03 (C -), p. 35 + regra dos 255, p. 19 | Confirmado | não |
| SPED EFD ICMS/IPI | 0205 DESCR_ANT_ITEM | descrição | 255 | EFD, 0205 campo 02 (C -), p. 39 + regra dos 255, p. 19 | Confirmado | sim |
| SPED EFD ICMS/IPI | 0205 COD_ANT_ITEM | código | 60 | EFD, 0205 campo 05 (C 060), p. 39 | Confirmado | sim |
| SPED EFD ICMS/IPI | 0220 UNID_CONV | unidade | 6 | EFD, 0220 campo 02 (C 006), p. 41 | Confirmado | sim |
| SPED EFD ICMS/IPI | 0220 COD_BARRA | código de barras da unidade | 255 | EFD, 0220 campo 04 (C -), p. 41 + regra dos 255, p. 19 | Confirmado | não |
| SPED EFD ICMS/IPI | C170 COD_ITEM | código | 60 | EFD, C170 campo 03 (C 060), p. 80 | Confirmado | sim |
| SPED EFD ICMS/IPI | C170 DESCR_COMPL | descrição | 255 | EFD, C170 campo 04 (C -), p. 80 + regra dos 255, p. 19 | Confirmado | sim |
| SPED EFD ICMS/IPI | C170 UNID | unidade | 6 | EFD, C170 campo 06 (C 006), p. 80 | Confirmado | sim |
| SPED EFD ICMS/IPI | H010 COD_ITEM | código | 60 | EFD, H010 campo 02 (C 060), p. 267 | Confirmado | sim |
| SPED EFD ICMS/IPI | H010 UNID | unidade | 6 | EFD, H010 campo 03 (C 006), p. 267 | Confirmado | sim |
| SPED EFD-Contribuições | 0200 COD_ITEM | código | 60 | CONTRIB, 0200 campo 02 (C 060), p. 83 | Confirmado | sim |
| SPED EFD-Contribuições | 0200 DESCR_ITEM | descrição | 255 | CONTRIB, 0200 campo 03 (C -), p. 83 + regra dos 255, p. 34 e 56 | Confirmado | sim |
| SPED EFD-Contribuições | 0200 COD_BARRA | código de barras | 255 | CONTRIB, 0200 campo 04 (C -), p. 83 + regra dos 255 | Confirmado | não |
| SPED EFD-Contribuições | 0200 UNID_INV | unidade | 6 | CONTRIB, 0200 campo 06 (C 006), p. 83 | Confirmado | sim |
| SPED EFD-Contribuições | 0190 UNID | unidade | 6 | CONTRIB, 0190 campo 02 (C 006), p. 83 | Confirmado | sim |
| SPED EFD-Contribuições | 0205 DESCR_ANT_ITEM | descrição | 255 | CONTRIB, 0205 campo 02 (C -), p. 85 + regra dos 255 | Confirmado | sim |
| SPED EFD-Contribuições | 0205 COD_ANT_ITEM | código | 60 | CONTRIB, 0205 campo 05 (C 060), p. 85 | Confirmado | sim |
| SPED EFD-Contribuições | C170 DESCR_COMPL | descrição | 255 | CONTRIB, C170 campo 04 (C -), p. 118 + regra dos 255 | Confirmado | sim |
| NF-e e NFC-e | cProd (I02) | código | 60 | MOC, p. 17 (1-60); XSD maxLength 60 | Confirmado | sim |
| NF-e e NFC-e | xProd (I04) | descrição | 120 | MOC, p. 17 (1-120); XSD maxLength 120 | Confirmado | sim |
| NF-e e NFC-e | uCom (I09) | unidade | 6 | MOC, p. 18 (1-6); XSD maxLength 6 | Confirmado | sim |
| NF-e e NFC-e | uTrib (I13) | unidade | 6 | MOC, p. 19 (1-6); XSD maxLength 6 | Confirmado | sim |
| NF-e e NFC-e | cEAN (I03) / cEANTrib (I12) | GTIN | "SEM GTIN" ou 8, 12, 13 ou 14 dígitos | MOC, p. 17 e 19; XSD pattern `SEM GTIN\|[0-9]{0}\|[0-9]{8}\|[0-9]{12,14}` | Confirmado | não (formato, não limite) |
| NF-e e NFC-e | cBarra / cBarraTrib | código de barras fora do GTIN | 3 a 30 | XSD minLength 3, maxLength 30 | Confirmado | não |
| NF-e e NFC-e | infAdProd (V01) | informação adicional do item | 500 | MOC, p. 58 (1-500); XSD maxLength 500 | Confirmado | não |

Observações:
- **NFC-e:** o leiaute é o mesmo da NF-e (o MOC Anexo I cobre os modelos 55 e 65): `xProd` também tem 120 caracteres. Não há limite próprio diferente.
- **NFS-e:** a NFS-e não tem lista de itens de produto. A descrição do serviço não é campo do cadastro de itens e não entrou.
- **Paginação:** números de página impressos nos guias ("Página X de 366" no EFD) e do PDF no EFD-Contribuições e no MOC.

## ERPs (restrição adicional)

| ERP | Campo do item | Campo no ERP | Tamanho | Fonte | Grau |
|---|---|---|---|---|---|
| SAP Business One 10.0 | código | OITM.ItemCode | 50 (nVarChar 50) | SAP, OITM | Confirmado |
| SAP Business One 10.0 | descrição | OITM.ItemName (FrgnName também 200) | 200 (nVarChar 200) | SAP, OITM | Confirmado |
| SAP Business One 10.0 | unidade | OITM.InvntryUom (BuyUnitMsr e SalUnitMsr também 100) | 100 (nVarChar 100) | SAP, OITM | Confirmado |
| SAP Business One 10.0 | referência | OITM.SuppCatNum | 50 (nVarChar 50) | SAP, OITM | Confirmado |
| SAP Business One 10.0 | fabricante | OMRC.FirmName | 30 (nVarChar 30) | SAP, OMRC | Confirmado |
| Aliare Siagri | descrição | TRAN1071 | 120 (desde a 7.6.0.0) | AGB 3513450517 | Confirmado |
| Aliare Siagri | código | TRAN1071 | não publicado | AGB 6113378267 | Não confirmado |
| TOTVS Protheus | código | B1_COD | configurável no SX3/grupo de campos; padrão não confirmado | TDN MATA010 | Não confirmado |
| TOTVS Protheus | descrição | B1_DESC | configurável no SX3; padrão não confirmado | TDN 702823280 | Não confirmado |
| TOTVS Protheus | unidade | B1_UM | dicionário do ambiente; não confirmado | Central TOTVS 56836052745747 | Não confirmado |

Como ler: no SAP B1 a descrição (200) e a unidade (100) **passam** do teto oficial (120 e 6). O saneamento usa o teto oficial e aponta o ERP configurado acima do leiaute. No Siagri a descrição (120) coincide com o `xProd`. No Protheus o tamanho se lê em Configurador > Base de Dados > Dicionário (SB1) do cliente e entra como item confirmado do projeto ou do ERP.

## Não confirmado

- TOTVS Protheus: tamanho padrão de B1_COD, B1_DESC e B1_UM. Não há dicionário público oficial por campo, e as buscas no TDN só trazem boletins de outros campos.
- Aliare Siagri: tamanho do código do produto.
- Gravação no PVA do SPED com descrição acima de 255: o guia fixa o máximo, mas o comportamento do validador não foi testado.
