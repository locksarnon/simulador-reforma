# Conferência do checklist SPED/NF-e do saneamento e do art. 57 da LC 214/2025 (26/11/2026)

Escopo: só leitura e relatório. Nenhum código alterado, sem commit, sem deploy. Arquivos conferidos (somente leitura):
`backend/src/saneamento-estoques/fiscal/impactoSped.ts` (CHECKLIST, FONTES_LEIAUTE) e `backend/src/saneamento-estoques/fiscal/cenarios.ts` (linhas 50 a 56).

## O que abriu

| Fonte | URL | Resultado |
|---|---|---|
| Portal do SPED, pasta "Manuais e Guias Práticos" da EFD ICMS/IPI | http://sped.rfb.gov.br/pasta/show/1573 | Abriu (navegador embutido) |
| Guia Prático EFD ICMS/IPI **versão 3.2.2**, atualização de 11/02/2026 (362 páginas) | http://sped.rfb.gov.br/arquivo/show/8112 (PDF: http://sped.rfb.gov.br/arquivo/download/8112) | Abriu e lido (texto extraído do PDF) |
| Nota Técnica EFD ICMS/IPI 2025.001 v1.0, **leiaute versão 020**, "válido de 01/01/2026 a 31/12/2026 - publicado pelo Ato Cotepe nº 79/2025" | http://sped.rfb.gov.br/arquivo/show/7819 | Abriu a página (descrição); PDF da NT não lido |
| Portal do SPED, "Manuais" da EFD-Contribuições | http://sped.rfb.gov.br/pasta/show/1989 | Abriu; a versão mais recente listada é a 1.35 |
| Guia Prático EFD-Contribuições **versão 1.35**, atualização de 18/06/2021 (433 páginas) | http://sped.rfb.gov.br/item/show/5836 (PDF: http://sped.rfb.gov.br/arquivo/download/5836) | Abriu e lido |
| gov.br/receitafederal, EFD-Contribuições | https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/declaracoes-e-demonstrativos/sped-sistema-publico-de-escrituracao-digital/efd-contribuicoes | Redireciona para a página de download do programa; nenhum guia mais novo que o 1.35 encontrado |
| Portal da NF-e, lista de notas técnicas | https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=04BIflQt1aY= | Abriu; a mais recente da 2025.002 é a **v1.53, publicada em 30/10/2026** |
| NT 2025.002-RTC versão 1.53 (96 páginas) | https://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?conteudo=BMcHSMEoepU= | Abriu e lido |
| MOC da NF-e, Anexo I (leiaute), campo NCM | cópia baixada do portal da NF-e em 10/11/2026 por sessão anterior (não reaberta hoje) | Lido da cópia |
| LC 214/2025, texto compilado | https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm | Abriu (navegador embutido) e lido |

Observação sobre a versão do leiaute da EFD-Contribuições: o guia 1.35 é o mais recente publicado no portal; o código de versão do leiaute vigente em 2026 (campo COD_VER do 0000) **não confirmado** nesta conferência.

## Parte A: por registro

Legenda: CONFERE / DIFERE (texto correto e fonte) / NÃO CONFIRMADO.

### EFD ICMS/IPI (Guia Prático 3.2.2; leiaute 020)

| Ajuste | Registro | Campos no arquivo | Resultado |
|---|---|---|---|
| MUDOU_CODIGO_DESCRICAO | 0200 | COD_ITEM, DESCR_ITEM, COD_ANT_ITEM | **DIFERE em COD_ANT_ITEM.** O campo 05 existe, mas a obrigatoriedade é "N (informar no 0205)" e o guia diz: "Campo 05 (COD_ANT_ITEM) - Não preencher. Se houver a informação, esta deve ser prestada no registro 0205." Além disso, a alínea "a" do 0200: alteração de codificação → informar código e descrição anteriores e datas no 0205. COD_ITEM (02) e DESCR_ITEM (03) conferem. |
| MUDOU_CODIGO_DESCRICAO | 0205 | DESCR_ANT_ITEM, DT_INI, DT_FIM, COD_ANT_ITEM | **CONFERE** (nome "Alteração do Item"; campos 02 DESCR_ANT_ITEM, 03 DT_INI, 04 DT_FIM, 05 COD_ANT_ITEM). Detalhe a acrescentar: campos 02 e 05 são mutuamente excludentes, um registro por alteração; não pode haver sobreposição de períodos; só vale se a alteração não descaracterizar o item (se descaracterizar, é item novo com código novo). |
| MUDOU_UNIDADE | 0190 | UNID, DESCR | **CONFERE** ("Identificação das unidades de medida"). |
| MUDOU_UNIDADE | 0220 | UNID_CONV, FAT_CONV | **CONFERE** ("Fatores de conversão de unidades"; 02 UNID_CONV, 03 FAT_CONV). Complemento do guia: o 0220 também é obrigatório quando a UNID_INV do 0200 muda em relação à EFD da competência anterior, e o fator não pode mudar entre arquivos para o mesmo código de unidade (fator novo exige código de unidade novo). |
| MUDOU_UNIDADE | 0200 | UNID_INV | **CONFERE** (campo 06). |
| MUDOU_UNIDADE | C170 | UNID, QTD | **CONFERE** (05 QTD, 06 UNID). |
| MUDOU_UNIDADE | H010 | UNID, QTD | **CONFERE** (03 UNID, 04 QTD). |
| CONSOLIDOU_INATIVOU | 0200 | COD_ITEM, COD_ANT_ITEM | **DIFERE em COD_ANT_ITEM** (mesmo motivo acima: não preencher no 0200; informar no 0205). |
| CONSOLIDOU_INATIVOU | 0205 | COD_ANT_ITEM, DT_INI, DT_FIM | **CONFERE** quanto aos campos. Ressalva do guia: o 0205 serve à alteração de codificação "desde que não o descaracterize"; o guia também proíbe reutilizar código já atribuído a outro produto (0200, alínea "b"). |
| CONSOLIDOU_INATIVOU | 0221 | COD_ITEM_ATOMICO, QTD_CONTIDA | **CONFERE** quanto a nome e campos ("Correlação entre códigos de itens comercializados"; 02 COD_ITEM_ATOMICO, 03 QTD_CONTIDA). Confirmado o conceito: correlação com o item "atômico" (menor unidade de comercialização), inclusive kits e cestas. Restrições do guia: só se TIPO_ITEM do 0200 pai = "00 – Mercadoria para Revenda"; obrigatoriedade "só poderá ser estabelecida a partir de 2024" e é definida pela UF do declarante. A ressalva atual do arquivo está correta no sentido; pode ser trocada pelo texto confirmado (ver mudanças). |
| CONSOLIDOU_INATIVOU | H010 | COD_ITEM, UNID, QTD, VL_UNIT, VL_ITEM | **CONFERE** (02 a 06). O guia exige ainda: "O código de item/produto a ser informado no Inventário deverá ser aquele utilizado no mês inventariado" (0200, alínea "c"). |
| CONSOLIDOU_INATIVOU | C170 | COD_ITEM | **CONFERE** (campo 03). |
| MUDOU_NCM | 0200 | COD_NCM | **CONFERE** (campo 08; obrigatório para industriais e equiparados e, nas demais, em itens importados, exportados ou em ST, conforme o guia). |
| MUDOU_NCM | C170 | COD_ITEM | **CONFERE** (campo 03; o C170 não tem campo de NCM, o NCM vem do 0200). |
| MUDOU_TRATAMENTO | C170 | CST_ICMS, CFOP | **CONFERE** (10 CST_ICMS, 11 CFOP). Sobre o CST de IBS/CBS: **não existe** no leiaute. O guia 3.2.2, Seção 10, diz que a EFD ICMS/IPI "não se presta à apuração dos novos tributos, CBS, IBS e IS"; os valores entram só no total do documento (ex.: C100 VL_DOC, exceto 2026) e não no valor da operação dos analíticos (ex.: C190 VL_OPR). A ressalva atual ("não foi confirmado") deve virar afirmação. |
| ITEM_ATIVO_IMOBILIZADO | 0300 | COD_IND_BEM, IDENT_MERC, DESCR_ITEM, COD_PRNC, COD_CTA, NR_PARC | **CONFERE** ("Cadastro de bens ou componentes do ativo imobilizado"; campos 02 a 07). |
| ITEM_ATIVO_IMOBILIZADO | G110/G125 | COD_IND_BEM, DT_MOV, TIPO_MOV | **DIFERE parcialmente.** Os três campos são do **G125** ("Movimentação de bem ou componente do ativo": 02 COD_IND_BEM, 03 DT_MOV, 04 TIPO_MOV com SI, IM, IA, CI, MC, BA, AT, PE, OT). O **G110** é "ICMS – Ativo Permanente – CIAP" (apuração: DT_INI, DT_FIN, SALDO_IN_ICMS, SOM_PARC, VL_TRIB_EXP, VL_TOTAL, IND_PER_SAI...) e não tem esses campos. |

### EFD-Contribuições (Guia Prático 1.35)

| Ajuste | Registro | Campos no arquivo | Resultado |
|---|---|---|---|
| MUDOU_CODIGO_DESCRICAO | 0200 | COD_ITEM, DESCR_ITEM, COD_ANT_ITEM | **CONFERE** quanto à existência (02, 03, 05 COD_ANT_ITEM, este não obrigatório). Por coerência com a EFD ICMS/IPI, a alteração de código vai no 0205. |
| MUDOU_CODIGO_DESCRICAO | 0205 | DESCR_ANT_ITEM, DT_INI, DT_FIM, COD_ANT_ITEM | **CONFERE** ("Alteração do Item"; 02 a 05). |
| MUDOU_UNIDADE | 0190 | UNID, DESCR | **CONFERE**. |
| MUDOU_UNIDADE | 0220 | UNID_CONV, FAT_CONV | **DIFERE: o registro 0220 não existe na EFD-Contribuições.** O guia 1.35 não tem registro 0220 (nem 0221). Remover a linha. |
| MUDOU_NCM | 0200 | COD_NCM | **CONFERE** (campo 08). |
| MUDOU_TRATAMENTO | C170 | CST_PIS, CST_COFINS | **CONFERE** (25 CST_PIS, 31 CST_COFINS). |
| MUDOU_TRATAMENTO | M100/M500 | VL_CRED | **CONFERE** ("Crédito de PIS/Pasep relativo ao período" e "Crédito de Cofins relativo ao período"; campo 08 VL_CRED em ambos). |
| ITEM_ATIVO_IMOBILIZADO | F120/F130 | IDENT_BEM_IMOB, NAT_BC_CRED | **CONFERE** (F120: créditos com base nos encargos de depreciação e amortização; F130: com base no valor de aquisição; 02 NAT_BC_CRED, 03 IDENT_BEM_IMOB em ambos). |

### NF-e (NT 2025.002-RTC v1.53, 30/10/2026; MOC Anexo I)

| Ajuste | Caminho | Campos | Resultado |
|---|---|---|---|
| MUDOU_NCM | det/prod | NCM | **CONFERE** (MOC Anexo I: I05 NCM, "Código NCM com 8 dígitos"; cópia de 10/11/2026, não reaberta hoje). |
| MUDOU_TRATAMENTO | det/imposto/IBSCBS | CST, cClassTrib | **CONFERE**: grupo UB12 IBSCBS (pai M01 imposto, 0-1); UB13 CST "Código de Situação Tributária do IBS e CBS" (N, 3, tabela CST do IBS/CBS); UB14 cClassTrib "Código de Classificação Tributária do IBS e CBS" (N, 6, tabela cClassTrib). |

## Parte A: mudanças sugeridas em impactoSped.ts (lista; não aplicadas)

1. `FONTES_LEIAUTE.EFD_ICMS_IPI`: `versaoConferida: 'Guia Prático 3.2.2 (11/02/2026); leiaute 020 (NT 2025.001, Ato Cotepe 79/2025, válido em 2026)'`, `status: 'CONFIRMADO'`, `url: 'http://sped.rfb.gov.br/arquivo/show/8112'`.
2. `FONTES_LEIAUTE.EFD_CONTRIBUICOES`: `versaoConferida: 'Guia Prático 1.35 (18/06/2021), última versão publicada no portal do SPED'`, `status: 'CONFIRMADO'`, `url: 'http://sped.rfb.gov.br/item/show/5836'` (manter nota de que o código de versão do leiaute 2026 não foi conferido).
3. `FONTES_LEIAUTE.NFE`: `fonte` → `'Portal Nacional da NF-e: NT 2025.002-RTC (grupo IBSCBS) e MOC Anexo I'`, `versaoConferida: 'NT 2025.002-RTC v1.53 (30/10/2026)'`, `status: 'CONFIRMADO'`, `url: 'https://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?conteudo=BMcHSMEoepU='`.
4. Linha 54 (MUDOU_CODIGO_DESCRICAO, EFD ICMS/IPI 0200): campos `['COD_ITEM', 'DESCR_ITEM']`; verificar `'Item com o novo código/descrição; o campo 05 COD_ANT_ITEM não é preenchido no 0200 (o código anterior vai no 0205)'`.
5. Linha 55 (0205 ICMS/IPI): verificar → `'Histórico da alteração (descrição ou código anterior) com DT_INI e DT_FIM; campos 02 e 05 mutuamente excludentes, um registro por alteração, sem sobreposição de períodos'`.
6. Linha 56 (0200 Contribuições): campos `['COD_ITEM', 'DESCR_ITEM']`; código anterior no 0205.
7. Linha 65 (0220 ICMS/IPI): verificar → acrescentar `'; obrigatório também quando a UNID_INV do 0200 muda em relação à EFD anterior; fator novo exige código de unidade novo'`.
8. Linha 70 (`R('EFD_CONTRIBUICOES', '0220', ...)`): **remover** (registro inexistente na EFD-Contribuições).
9. Linha 77 (CONSOLIDOU_INATIVOU, 0200): campos `['COD_ITEM']`; verificar `'Código mantido; o código anterior vai no 0205 (não reutilizar código já atribuído a outro item)'`.
10. Linha 79 (0221): ressalva → `'Correlação entre códigos de itens comercializados e o item atômico (Guia Prático 3.2.2): só para TIPO_ITEM 00 (revenda); obrigatoriedade e forma definidas pela UF do declarante. Para consolidação simples de código, o registro é o 0205'`.
11. Linha 80 (H010): verificar → acrescentar `'; o código do item no inventário é o utilizado no mês inventariado'`.
12. Linha 99 (C170 ICMS/IPI, MUDOU_TRATAMENTO): ressalva → `'A EFD ICMS/IPI não tem campo de CST de IBS/CBS: não se presta à apuração de CBS, IBS e IS (Guia Prático 3.2.2, Seção 10)'`.
13. Linha 98 (NFE IBSCBS): verificar → `'CST (UB13) e cClassTrib (UB14) do grupo IBSCBS (UB12) do item'`.
14. Linha 109: separar em `R('EFD_ICMS_IPI', 'G125', ['COD_IND_BEM', 'DT_MOV', 'TIPO_MOV'], 'Movimentação do bem ou componente do ativo')` e, se quiser manter o CIAP, `R('EFD_ICMS_IPI', 'G110', ['SALDO_IN_ICMS', 'SOM_PARC'], 'Apuração do CIAP no período')`.
15. Todos os registros com resultado CONFERE (ou corrigidos pelos itens acima) podem passar a `conferido: true` (hoje o helper `R` fixa `false`; exige parâmetro novo). O comentário do topo (linhas 5 a 8) e o texto `'(leiaute não confirmado nesta entrega)'` da linha 220 devem ser atualizados para citar as versões acima.

## Parte B: LC 214/2025, art. 57

Fonte: texto compilado do Planalto, https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm (aberto em 26/11/2026, já com as alterações da LC 227/2026).

**O art. 57 é o artigo certo.** Ele abre a Seção XIII, "Dos Bens e Serviços de Uso ou Consumo Pessoal" (Capítulo da não cumulatividade, logo após a Seção XII, arts. 47 a 56), e traz o conceito e a vedação:

- Caput: "Consideram-se de uso ou consumo pessoal:"
  - inciso I: lista de bens e serviços (joias, pedras e metais preciosos; obras de arte e antiguidades; bebidas alcoólicas; derivados do tabaco; armas e munições; bens e serviços recreativos, esportivos e estéticos; e, alínea "g", incluída pela LC 227/2026, os relacionados à aquisição ou manutenção desses bens);
  - inciso II (redação da LC 227/2026): bens e serviços adquiridos pelo contribuinte e fornecidos de forma não onerosa ou abaixo do valor de mercado ao próprio contribuinte pessoa física, a sócios, acionistas, administradores e conselheiros, aos empregados e a cônjuges, companheiros e parentes até o terceiro grau.
- § 1º: para o inciso II, entre outros, imóvel residencial e veículo, com os bens e serviços de aquisição e manutenção (inclusive seguro e combustível).
- § 2º: family office.
- § 3º: não são de uso ou consumo pessoal os "utilizados preponderantemente na atividade econômica do contribuinte", conforme os incisos I a V (ex.: bens do inciso I comercializados ou usados na fabricação de bens a comercializar; uniformes; EPI; alimentação, saúde e creche no estabelecimento durante a jornada; plano de saúde por acordo ou convenção coletiva; benefícios educacionais; vale-transporte, refeição e alimentação; outros pelo regulamento).
- § 4º, § 6º e § 7º: revogados pela LC 227/2026.
- **§ 5º (vedação): "Em relação aos bens e serviços de uso ou consumo pessoal de que trata este artigo, fica vedada a apropriação de créditos."**
- § 8º: regulamento disporá sobre a identificação da pessoa física destinatária.
- § 9º (incluído pela LC 227/2026): na alienação de bem que não permitiu crédito (§ 5º), o contribuinte pode excluir da base de cálculo o valor de aquisição, até o valor da alienação, se o bem for identificado inequivocamente.

A remissão vem do **art. 47, caput**: o contribuinte do regime regular apropria créditos de IBS e CBS sobre as aquisições, "excetuadas exclusivamente aquelas consideradas de uso ou consumo pessoal, nos termos do art. 57 desta Lei Complementar, e as demais hipóteses previstas nesta Lei Complementar". O § 1º, II, do art. 47 condiciona o crédito a documento fiscal eletrônico idôneo.

### Redação sugerida para cenarios.ts (linhas 53 e 54; não aplicada)

- Linha 53 (IMOBILIZADO):
  `'Crédito amplo (LC 214/2025, art. 47, caput), exceto bens e serviços de uso ou consumo pessoal, cujo crédito é vedado (art. 57, § 5º; conceito no caput e exceções no § 3º); a regra específica de apropriação do ativo imobilizado não foi conferida nesta base'`
- Linha 54 (demais finalidades):
  `'Crédito amplo (LC 214/2025, art. 47, caput), exceto bens e serviços de uso ou consumo pessoal, cujo crédito é vedado (art. 57, § 5º). Uso ou consumo pessoal = itens do art. 57, caput, I (joias, bebidas alcoólicas, tabaco, armas, bens recreativos, esportivos e estéticos etc.) e II (fornecidos sem ônus ou abaixo do mercado a sócios, administradores, empregados e parentes), salvo os usados preponderantemente na atividade econômica (art. 57, § 3º). Classificar o item'`
- `fundamento` (linha 44 e retorno da linha 55): quando o art. 47 estiver na base, usar `'LC 214/2025, art. 47, caput, e art. 57, caput e §§ 3º e 5º (redação da LC 227/2026)'`.

## Resumo

- Abriram todas as fontes oficiais (SPED, NF-e e Planalto). Versões: EFD ICMS/IPI Guia 3.2.2 (11/02/2026), leiaute 020 (2026); EFD-Contribuições Guia 1.35 (código de versão do leiaute 2026 não confirmado); NT 2025.002-RTC v1.53 (30/10/2026).
- Das 27 linhas do checklist, 23 conferem e 4 diferem: o 0220 da EFD-Contribuições não existe; o COD_ANT_ITEM não é preenchido no 0200 da EFD ICMS/IPI (o código anterior vai no 0205), o que afeta 2 linhas; e o "G110/G125" mistura os registros, pois os campos citados são todos do G125. O 0205 (alteração do item) e o 0221 (item atômico, kit) estão confirmados.
- A EFD ICMS/IPI não tem CST de IBS/CBS (Seção 10 do guia). Na NF-e, o grupo é IBSCBS (UB12), com CST (UB13) e cClassTrib (UB14).
- Art. 57 da LC 214 é o artigo certo: o caput dá o conceito, o § 3º as exceções e o § 5º veda o crédito; a remissão vem do art. 47, caput.
