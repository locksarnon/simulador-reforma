# Tabelas oficiais da Fase 2 (Tributário e Reforma)

Módulos de dados em `backend/src/saneamento-estoques/fiscal/tabelas-oficiais/` (ainda não ligados às telas e camadas).
Regra: só fonte oficial; o que não foi conferido na fonte está marcado como **não confirmado** no dado e aqui.

| Tabela | Arquivo | Fonte oficial | Documento e versão | Lida em |
|---|---|---|---|---|
| Tipo do item (0200, campo 07 TIPO_ITEM) e IND_PROP (H010, campo 07) | `tipo-item-0200.ts` | https://www.gov.br/sped/pt-br/assuntos/escrituracoes-digitais/efd-icms-ipi/manuais-e-documentos-tecnicos/guia-pratico-efd-versao-3-2-4.pdf | Guia Prático EFD-ICMS/IPI 3.2.4, atualização de 30/07/2026 (0200: págs. 37 e 38; H010: págs. 267 e 268) | 27/11/2026 |
| CFOP | `cfop-dados.ts` (gerado), `cfop.ts` | https://www.confaz.fazenda.gov.br/legislacao/ajustes/sinief/cfop_cvsn_1-6.24 | Convênio s/nº de 15/12/1970, Anexo II, redação do Ajuste SINIEF 03/24 (efeitos desde 01/06/2024), com o CFOP 7.667 pelo Ajuste SINIEF 39/25 (efeitos desde 01/02/2026) | 27/11/2026 |
| Participantes e regimes (Lista A) | `participantes.ts` | https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214compilado.htm | LC 214/2025, texto compilado (com a LC 227/2026), lido por artigo na cópia da Base legal do InTAX (capturada em 26/11/2026) | 27/11/2026 |

## 1. Tipo do item do registro 0200

- 12 códigos: 00 Mercadoria para Revenda; 01 Matéria-prima; 02 Embalagem; 03 Produto em Processo; 04 Produto Acabado; 05 Subproduto;
  06 Produto Intermediário; 07 Material de Uso e Consumo; 08 Ativo Imobilizado; 09 Serviços; 10 Outros insumos; 99 Outras.
  Valores válidos do Guia: [00, 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 99].
- O Guia traz conceito só para 00, 01, 03, 04, 05 e 06; nos demais o campo `conceito` é `null` (o Guia não define).
- Regras gerais do campo copiadas do Guia: tipo de maior relevância na movimentação física quando há mais de uma destinação; destinação
  inicial; a classificação não muda a cada movimentação; vale a atividade do estabelecimento; NCM dispensado para 07, 08, 09, 10 e 99.
- H010, IND_PROP: 0 propriedade do informante e em seu poder; 1 propriedade do informante em posse de terceiros; 2 propriedade de
  terceiros em posse do informante (COD_PART obrigatório em 1 e 2). O marcador **de terceiros** liga ao IND_PROP 2.

### De-para da finalidade (exportado como `DE_PARA_FINALIDADE_TIPO_ITEM`)

| Finalidade | Tipo | Marcador |
|---|---|---|
| REVENDA | 00 | — |
| MATERIA_PRIMA | 01 | — |
| EMBALAGEM | 02 | — |
| USO_CONSUMO | 07 | — |
| MANUTENCAO | 07 | MANUTENCAO (interno, sem fundamento legal) |
| IMOBILIZADO | 08 | IMOBILIZADO |
| INSUMO_PRODUCAO | 10 | — |
| MATERIAL_TERCEIROS | pela natureza do item | DE_TERCEIROS |

Ponto de atenção (não altera o de-para): o Guia define o tipo 06 (produto intermediário) como o que, sem se integrar ao novo produto, é
consumido na industrialização; "insumo de produção" pode ser 06 em indústria. A observação está no dado.

### Marcadores e fundamentos (conferidos na LC 214)

- Uso ou consumo pessoal: art. 57 (vedação de crédito no § 5º; exceções do § 3º).
- Conta para o crédito do estoque: art. 381, § 1º (crédito presumido de **CBS** sobre o estoque de 1º/1/2027; só bens novos de PJ no País ou
  importados para revenda/produção/serviços; fora uso pessoal, imobilizado, imóveis e itens com alíquota zero/isenção/suspensão de PIS/Cofins).
- Imobilizado: art. 47, § 7º (estorno proporcional no roubo/furto de bem do imobilizado) e art. 381, § 1º, IV, "a".
- De terceiros: H010 IND_PROP = 2 (Guia Prático).

## 2. CFOP

- 695 linhas no texto oficial: 619 códigos de lançamento e 76 títulos de grupo (x.000, x.y00 e x.y50). Os títulos ficam em `TITULOS_CFOP`
  e não entram em `CFOPS`. Cada código traz a nota explicativa oficial ("Classificam-se neste código...").
- Grupo pelo primeiro dígito: 1 entradas do Estado, 2 de outros Estados, 3 do exterior; 5 saídas para o Estado, 6 para outros Estados, 7 para o exterior.
- Nas duas redações do 7.667 na página, vale a nova (Ajuste SINIEF 39/25).
- `cfop-dados.ts` é gerado do texto da página do CONFAZ; para atualizar, baixar a página de novo e regenerar (não editar à mão).

### Natureza agrupada (regra derivada, NÃO oficial)

Aplicada à descrição oficial, em `naturezaDoCfop`:
1. minúsculas, sem acento; retira os prefixos "Entrada decorrente de" e "Lançamento efetuado a título de";
2. pela primeira palavra: Devolução → DEVOLUCAO; Retorno → RETORNO; Transferência → TRANSFERENCIA; Compra ou Aquisição → COMPRA;
   Venda ou Prestação → VENDA; Remessa → REMESSA;
3. o resto → OUTRAS (Entrada de..., Anulação de valor..., Industrialização efetuada..., Exportação..., Fixação de preço..., Outra entrada/saída,
   Ressarcimento, Utilização de saldo credor etc.).

Resultado: 104 compra, 132 venda, 45 transferência, 106 devolução, 54 remessa, 62 retorno, 116 outras.

## 3. Participantes e regimes (Lista A)

Conferidos artigo por artigo no texto compilado:

| Código | Fundamento | Situação |
|---|---|---|
| REGULAR | arts. 21 e 41 | confirmado |
| SIMPLES_NO_SIMPLES | art. 47, § 9º | confirmado |
| SIMPLES_REGULAR | art. 41, § 3º | confirmado |
| PRODUTOR_RURAL_NAO_CONTRIBUINTE | art. 164 (crédito presumido do adquirente: art. 168) | confirmado |
| PRODUTOR_RURAL_CONTRIBUINTE | art. 165 | confirmado |
| TRANSPORTADOR_AUTONOMO_PF | art. 169 (não contribuinte: art. 26, VII) | confirmado |
| PF_BEM_MOVEL_USADO | art. 171 | confirmado |
| COLETOR_RESIDUOS | art. 170 | confirmado |
| NAO_CONTRIBUINTE_ART26 | art. 26 | confirmado |
| EXTERIOR | arts. 79 a 82 | confirmado (ver ressalva) |
| ADMINISTRACAO_PUBLICA | arts. 370 e 473 | confirmado (ver ressalva) |

Ressalvas encontradas no texto:
- Exportações: o capítulo vai do art. 79 ao **83**; importações (exterior como fornecedor) estão nos arts. 63 a 78, fora da Lista A.
- Administração pública: art. 370 é o redutor das alíquotas de 2027 a 2033; art. 473 destina a arrecadação ao ente contratante e remete à
  redução do art. 472.
- Zona Franca: o capítulo da ZFM começa no **art. 439** (vai até o 457; Áreas de Livre Comércio, arts. 458 a 470); o art. 444 é o crédito
  presumido de IBS na importação para revenda na ZFM. Continua fora da lista (local da operação, não participante).

## Não confirmado

- Início dos efeitos dos arts. 168, 169, 170 e 171 (o texto compilado traz a marca "Produção de efeitos"; a data não foi conferida).
- Alterações do CFOP por Ajustes SINIEF de 2026: a lista de 2026 no portal do CONFAZ não abriu (página pede login/cookies). Os Ajustes de 2025
  que alteram o Convênio de 1970 (10/25 e 18/25) foram lidos e não tocam o CFOP; o 39/25 já está na página consolidada.
- Natureza agrupada do CFOP: regra própria, não é classificação oficial.
- O Guia Prático 3.2.4 é a versão mais recente listada na página da EFD ICMS/IPI em 27/11/2026; não há conceito oficial no Guia para os tipos 02,
  07, 08, 09, 10 e 99.
