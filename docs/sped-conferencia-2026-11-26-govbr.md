# Conferência do checklist SPED no novo portal do SPED (gov.br/sped), 26/11/2026

Escopo: só leitura e relatório. Nenhum código alterado, sem commit. Complementa `docs/sped-conferencia-2026-11-26.md`, que usou o portal antigo (sped.rfb.gov.br). Arquivo conferido (somente leitura): `backend/src/saneamento-estoques/fiscal/impactoSped.ts` na versão do commit 9f49644 (que já traz as mudanças sugeridas ontem).

Cópias dos PDFs baixados (para auditoria): `C:\Users\ARNONL~1\AppData\Local\Temp\claude\f88c57cf231927e5\4ed04a36-7d3c-4735-b30a-78d85b3e21fa\scratchpad\sped-govbr\` (pasta temporária).

## 1. O que abriu

| Fonte | URL | Resultado |
|---|---|---|
| Portal do SPED, Escriturações Digitais | https://www.gov.br/sped/pt-br/assuntos/escrituracoes-digitais | Abriu (navegador embutido) |
| Página da EFD ICMS IPI (aba "Manuais e Documentos Técnicos") | https://www.gov.br/sped/pt-br/assuntos/escrituracoes-digitais/efd-icms-ipi | Abriu; lista os guias 3.1.9 a 3.2.4, as NT 2023.001 a 2026.001 e a Nota Orientativa 2026.001 |
| Guia Prático EFD ICMS/IPI **3.2.4**, "Atualização: 30 de julho de 2026" (366 p.) | https://www.gov.br/sped/pt-br/assuntos/escrituracoes-digitais/efd-icms-ipi/manuais-e-documentos-tecnicos/guia-pratico-efd-versao-3-2-4.pdf/@@display-file/file | Baixado e lido (texto extraído) |
| Guia Prático EFD ICMS/IPI 3.2.3 (366 p.) | .../manuais-e-documentos-tecnicos/guia-pratico-efd-versao-3-2-3.pdf/@@display-file/file | Baixado; MD5 confere com o Ato COTEPE/ICMS 69/2026 |
| Guia Prático EFD ICMS/IPI 3.2.2, "Atualização: 11 de fevereiro de 2026" | .../manuais-e-documentos-tecnicos/guia-pratico-da-efd-icms-ipi-3-2.2/@@display-file/file | Baixado; comparado registro a registro com o 3.2.4 |
| NT EFD ICMS IPI **2026.001 v1.0 (leiaute versão 021)**, maio/2026 (146 p.) | .../manuais-e-documentos-tecnicos/nt-2026-001-v1-0.pdf/@@display-file/file | Baixado e lido; MD5 confere com o Ato COTEPE/ICMS 69/2026 |
| NT EFD ICMS IPI 2025.001 v1.0 (leiaute versão 020) | .../manuais-e-documentos-tecnicos/nt-2025-001-v1-0.pdf/@@display-file/file | Listada no portal (não reaberta; conferida ontem) |
| Nota Orientativa EFD ICMS IPI 2026.001 v1.0 (NFGás, modelo 76), julho/2026 | .../manuais-e-documentos-tecnicos/nota-orientativa-efd-icms-ipi-2026-001-v1-0.pdf/@@display-file/file | Lida; trata só do C500 (NFGás). Sem efeito no checklist |
| Comunicados da EFD ICMS IPI (11 itens, via API do portal) | https://www.gov.br/sped/pt-br/assuntos/comunicados/efd-icms-ipi | Lidos os de guia, NT e PVA (ver seção 2) |
| CONFAZ: Ato COTEPE/ICMS 86/2026 (DOU 10/09/2026) | https://www.confaz.fazenda.gov.br/legislacao/atos/2026/AC086_26 | Lido |
| CONFAZ: Ato COTEPE/ICMS 69/2026 | https://www.confaz.fazenda.gov.br/legislacao/atos/2026/AC069_26 | Lido |
| CONFAZ: Ato COTEPE/ICMS 39/2026 (DOU 23/03/2026) | https://www.confaz.fazenda.gov.br/legislacao/atos/2026/AC039_26 | Lido |
| CONFAZ: Ato COTEPE/ICMS 79/2025 | https://www.confaz.fazenda.gov.br/legislacao/atos/2025/AC079_25 | Lido |
| DOU (in.gov.br), Ato COTEPE/ICMS 86/2026 | link do comunicado | **Não abriu** (502 no curl; navegador embutido recusou o domínio). Usado o texto do CONFAZ |
| Página da EFD-Contribuições (abas Manuais e Documentos Técnicos) | https://www.gov.br/sped/pt-br/assuntos/escrituracoes-digitais/efd-contribuicoes | Abriu; conteúdo das abas listado pela API do portal (71 itens) |
| Guia Prático EFD-Contribuições **1.35**, atualização 18/06/2021 (433 p.) | https://www.gov.br/sped/pt-br/assuntos/escrituracoes-digitais/efd-contribuicoes/manuais/guia_pratico_efd_contribuicoes_versao_1_35-18_06_2021.pdf | Baixado e lido; é o único guia publicado na pasta "Manuais" |
| NT EFD-Contribuições 11/2026 (Reforma Tributária) | .../efd-contribuicoes/documentos-tecnicos/nota-tecnica-11-2026-descontinuidade-da-efd-contribuicoes-orientacoes-para-os-contribuintes | Baixada e lida |
| NT EFD-Contribuições 12/2026 (LC 224/2025) | .../efd-contribuicoes/documentos-tecnicos/nota-tecnica-12-2026-reducao-linear-de-incentivos-e-beneficios-lc-224 | Baixada e lida (início) |
| NT EFD-Contribuições **13/2026** (transição para a CBS, 2027), publicada em 05/11/2026 | .../efd-contribuicoes/documentos-tecnicos/nota-tecnica-013_2026-alteracoes-efd-contribuicoes-para-rtc-2027.pdf | Baixada e lida |
| NT EFD-Contribuições 09/2024 e 10/2025 (leiaute 2025) | .../documentos-tecnicos/nota-tecnica-efd-contribuicoes-no-009.docx e nota-tecnica-010_2025-...docx | Lidas (busca do código de versão) |
| Comunicados da EFD-Contribuições | https://www.gov.br/sped/pt-br/assuntos/comunicados/efd-contribuicoes | Lidos os da NT 13/2026, PGE 6.2.0, NT 11/2026 e PGE 6.1.2 |
| Sped Tabelas, sistema Pis Cofins | https://www.sped.fazenda.gov.br/spedtabelas/AppConsulta/publico/aspx/ConsultaTabelasExternas.aspx?CodSistema=SpedPisCofins | Abriu; não traz tabela de versão do leiaute |

## 2. Versões

### EFD ICMS/IPI

- **O Guia Prático não é mais o 3.2.2.** Há o **3.2.3** e o **3.2.4** no portal.
  - 3.2.2: comunicado de 25/03/2026, "com vigência a partir de janeiro/2026"; adotado pelo Ato COTEPE/ICMS 39/2026 (DOU 23/03/2026, vigência na publicação).
  - 3.2.3: comunicado de 28/06/2026, "com vigência a partir de janeiro/2027"; adotado pelo **Ato COTEPE/ICMS 69, de 23/06/2026**, junto com a NT 2026.001 v1.0, "produzindo efeitos a partir de 1º de janeiro de 2027".
  - **3.2.4** ("Atualização: 30 de julho de 2026"): comunicado de 10/09/2026; adotado pelo **Ato COTEPE/ICMS 86, de 9/09/2026** (DOU 10/09/2026), que "entra em vigor na data da sua publicação". Única alteração sobre o 3.2.3: inclusão da Nota Orientativa 2026.001 (NFGás, modelo 76). O PVA 6.2.0 (comunicado de 28/10/2026) contempla "as versões 3.2.3 e 3.2.4".
  - Conclusão: o guia vigente é o **3.2.4**. Ele cobre as duas competências: as regras novas valem a partir do leiaute 2027, e o próprio guia ressalva o exercício 2026 onde há diferença (ex.: C100 VL_DOC, C170 QTD).
- **Leiaute (COD_VER do 0000), tabela 3.1.1 da NT 2026.001:**
  - 2026: código **020** (versão 119), início 01/01/2026 (NT 2025.001, Ato COTEPE/ICMS 79/2025, efeitos a partir de 01/01/2026; reconfirmado hoje no CONFAZ).
  - 2027: código **021** (versão 120), início 01/01/2027 (NT 2026.001 v1.0, Ato COTEPE/ICMS 69/2026). O Anexo I da NT o chama de "leiaute 021 – Válido de 01/01/2027 a 31/12/2027".
- **O que muda no leiaute 021** (NT 2026.001, Anexo I; guia 3.2.4, Cap. II, Subseção 16): campos CNPJ e chaves de documento eletrônico de N para C (CNPJ alfanumérico; inclui o 0000 campo 07); novo campo IND_BENEFICIO em C197, C597, D197, D737 (09) e em E111, E220, 1921 (05), para a repercussão de benefícios onerosos de ICMS (LC 214/2025, arts. 384 a 405); novo campo 12 COD_PROD no C180. **Nenhum registro do checklist muda.** Não há IBS nem CBS no texto da NT 2026.001 (busca sem resultado).
- MD5: os arquivos da NT 2026.001 (8d1fc1dc...) e do guia 3.2.3 (d1d5ff23...) conferem com as chaves do Ato 69/2026. Os PDFs do 3.2.4 (aaec2278...) e do 3.2.2 (8dbecfa8...) baixados hoje **não** conferem com as chaves dos Atos 86/2026 (8DEF2862...) e 39/2026 (6B81378E...). O conteúdo é o do guia indicado na capa. Fica o registro, sem explicação oficial encontrada.

### EFD-Contribuições

- **O Guia Prático continua o 1.35 (18/06/2021).** É o único guia na pasta "Manuais" do novo portal; não há versão posterior publicada.
- Documentos técnicos novos: **NT 11/2026** (atualizada em 26/03/2026), **NT 12/2026** (LC 224/2025) e **NT 13/2026** (publicada em 05/11/2026; transição para a CBS em 2027).
- **COD_VER do 0000 vigente em 2026: continua NÃO CONFIRMADO.** A tabela 3.1.1 do guia 1.35 vai até o código **006** (versão 3.2.0, período de apuração inicial 01/01/2020). As NT 09/2024 e 10/2025 trazem "alterações previstas para o leiaute da EFD-Contribuições para o ano de 2025", mas não publicam código novo. O Sped Tabelas não tem tabela de versão. Nenhuma fonte oficial aberta hoje informa o código de 2026.
- NT 11/2026: "Não haverá alteração do leiaute da EFD-Contribuições para que o contribuinte escriture o valor destacado da CBS, IBS e IS (Imposto Seletivo) nos documentos fiscais, relativo aos fatos geradores ocorridos em 2026"; esses valores "não devem ser somados aos valores dos itens ou dos documentos fiscais no ano de 2026". A partir de janeiro de 2027, a EFD-Contribuições deixa de ser usada para novos fatos geradores de PIS e Cofins, mas fica ativa para os saldos credores e retificações (prazo mínimo de 5 anos).
- NT 13/2026 (alterações **previstas**, sem leiaute final publicado):
  - 2026: validação cruzada dos registros 1100/1500 com registros automáticos 1950/1959.
  - 2027: ficam só os registros dos fatos geradores anteriores à extinção e do regime de caixa (LC 214, art. 408). **F120 e F130 mantêm estrutura e validações** para o crédito presumido de CBS sobre depreciação, amortização e cota mensal (LC 214, art. 380). **F150 passa a receber o estoque de abertura da CBS em 01/01/2027** (art. 381; 9,25% sobre o estoque, 1/12 ao mês, escrituração única entre janeiro e junho de 2027), com F159 e registro 1980 automático.
  - O comunicado de 05/11/2026 diz que o PGE de 2026 está previsto para o fim de novembro de 2026 e o de 2027 para a segunda quinzena de dezembro de 2026.

## 3. Por registro (versão vigente encontrada)

Legenda: CONFERE / DIFERE (texto correto e fonte) / NÃO CONFIRMADO. O checklist conferido é o do commit 9f49644, que já tem as correções de ontem.

### EFD ICMS/IPI: Guia Prático 3.2.4 (comparado registro a registro com o 3.2.2), leiaute 020 (2026) e 021 (2027)

| Registro | No checklist | Resultado |
|---|---|---|
| 0190 | UNID, DESCR | **CONFERE** (3.2.4: "Identificação das unidades de medida"; 02 UNID, 03 DESCR). Sem mudança no 021. |
| 0200 | COD_ITEM, DESCR_ITEM; COD_ANT_ITEM "não preenchido" | **CONFERE.** 3.2.4: "Campo 05 (COD_ANT_ITEM) - Não preencher. Se houver a informação, esta deve ser prestada no registro 0205." Obrigatoriedade do campo 05: "N (informar no 0205)". Seguem também a alínea "b" (proibida a reutilização de código) e a alínea "c" (o inventário usa o código do mês inventariado). 06 UNID_INV e 08 COD_NCM sem mudança. |
| 0205 | DESCR_ANT_ITEM, DT_INI, DT_FIM, COD_ANT_ITEM | **CONFERE.** 3.2.4: campos 02 a 05; "Os campos 02 e 05 são mutuamente excludentes"; um registro por alteração; sem sobreposição de períodos; vale "desde que não o descaracterize". Texto idêntico ao 3.2.2. |
| 0220 | UNID_CONV, FAT_CONV | **CONFERE.** 3.2.4: 02 UNID_CONV, 03 FAT_CONV; obrigatório quando a UNID_INV do 0200 muda em relação à EFD anterior; o fator não pode mudar entre arquivos para o mesmo código de unidade. Idêntico ao 3.2.2. |
| 0221 | COD_ITEM_ATOMICO, QTD_CONTIDA | **CONFERE.** 3.2.4: só se TIPO_ITEM do 0200 pai = "00 – Mercadoria para Revenda"; obrigatoriedade "só poderá ser estabelecida a partir de 2024" e definida pela UF. Idêntico ao 3.2.2. A ressalva no código cita "Guia Prático 3.2.2" e deve passar a citar o 3.2.4. |
| H010 | COD_ITEM, UNID, QTD, VL_UNIT, VL_ITEM | **CONFERE** (02 a 06). Idêntico ao 3.2.2. |
| C170 | UNID/QTD; COD_ITEM; CST_ICMS/CFOP | **CONFERE** (03 COD_ITEM, 05 QTD, 06 UNID, 10 CST_ICMS, 11 CFOP). Única mudança do 3.2.2 para o 3.2.4 (item 15 das alterações do 3.2.3) é na orientação do campo 05 QTD: "Durante o ano de 2026, este campo não deverá ser informado em caso de escrituração de documento fiscal emitido por terceiro com a finalidade de nota de crédito do tipo redução de valores, conforme Ajuste SINIEF nº 49/2025, em que seja indicado valor zerado na quantidade de item"; a validação passa a aceitar zero também para COD_SIT 9 e 10. Não afeta o checklist. |
| 0300 | COD_IND_BEM, IDENT_MERC, DESCR_ITEM, COD_PRNC, COD_CTA, NR_PARC | **CONFERE** (02 a 07). Idêntico ao 3.2.2. |
| G110 | SALDO_IN_ICMS, SOM_PARC | **CONFERE** ("ICMS – Ativo Permanente – CIAP"; 04 SALDO_IN_ICMS, 05 SOM_PARC). |
| G125 | COD_IND_BEM, DT_MOV, TIPO_MOV | **CONFERE** ("Movimentação de bem ou componente do ativo imobilizado"; 02, 03, 04 com SI, IM, IA, CI, MC, BA, AT, PE, OT). |
| Campo de IBS/CBS | (ressalva do C170) | **CONFERE: não existe.** 3.2.4, Cap. I, Seção 10: "A EFD ICMS / IPI não se presta à apuração dos novos tributos, CBS, IBS e IS." Esses tributos entram no valor total do documento (C100 campo 12 VL_DOC, exceto no exercício 2026) e não entram no VL_OPR do C190. O leiaute 021 (2027) também não tem campo de IBS/CBS; só cria o IND_BENEFICIO, ligado ao fundo de compensação de benefícios de ICMS (LC 214, arts. 384 a 405). A ressalva no código cita "Guia Prático 3.2.2, Seção 10" e deve passar a citar o 3.2.4 (texto idêntico). |

### EFD-Contribuições: Guia Prático 1.35 (vigente; sem versão posterior)

| Registro | No checklist | Resultado |
|---|---|---|
| 0200 | COD_ITEM, DESCR_ITEM (código anterior no 0205) | **CONFERE** (02 COD_ITEM, 03 DESCR_ITEM; 05 COD_ANT_ITEM existe com obrigatoriedade "N"). |
| 0205 | DESCR_ANT_ITEM, DT_INI, DT_FIM, COD_ANT_ITEM | **CONFERE** (02 a 05). |
| 0220 | (removido do checklist ontem) | **CONFIRMADO que não existe:** o guia 1.35 não tem 0220 (nem 0221); o Bloco 0 de itens vai de 0190, 0200, 0205, 0206 a 0208. O checklist atual já não tem a linha. |
| C170 | CST_PIS, CST_COFINS | **CONFERE** (25 CST_PIS, 31 CST_COFINS). Em 2026 sem campo de CBS/IBS (NT 11/2026). |
| F120/F130 | IDENT_BEM_IMOB, NAT_BC_CRED | **CONFERE** (02 NAT_BC_CRED, 03 IDENT_BEM_IMOB). A NT 13/2026 prevê manter estrutura e validações em 2027 para o crédito presumido de CBS (art. 380 da LC 214). |
| M100/M500 | VL_CRED | **CONFERE** (campo 08 VL_CRED nos dois). Pela NT 11/2026, em 2027 não há apuração de novos fatos geradores. |

## 4. URLs oficiais novas (para FONTES_LEIAUTE)

- EFD ICMS/IPI, página: https://www.gov.br/sped/pt-br/assuntos/escrituracoes-digitais/efd-icms-ipi
- Guia Prático EFD ICMS/IPI 3.2.4: https://www.gov.br/sped/pt-br/assuntos/escrituracoes-digitais/efd-icms-ipi/manuais-e-documentos-tecnicos/guia-pratico-efd-versao-3-2-4.pdf/@@display-file/file
- Guia Prático EFD ICMS/IPI 3.2.2: https://www.gov.br/sped/pt-br/assuntos/escrituracoes-digitais/efd-icms-ipi/manuais-e-documentos-tecnicos/guia-pratico-da-efd-icms-ipi-3-2.2/@@display-file/file
- NT 2025.001 v1.0 (leiaute 020, 2026): https://www.gov.br/sped/pt-br/assuntos/escrituracoes-digitais/efd-icms-ipi/manuais-e-documentos-tecnicos/nt-2025-001-v1-0.pdf/@@display-file/file
- NT 2026.001 v1.0 (leiaute 021, 2027): https://www.gov.br/sped/pt-br/assuntos/escrituracoes-digitais/efd-icms-ipi/manuais-e-documentos-tecnicos/nt-2026-001-v1-0.pdf/@@display-file/file
- Ato COTEPE/ICMS 86/2026 (guia 3.2.4): https://www.confaz.fazenda.gov.br/legislacao/atos/2026/AC086_26
- Ato COTEPE/ICMS 69/2026 (NT 2026.001 e guia 3.2.3, efeitos a partir de 01/01/2027): https://www.confaz.fazenda.gov.br/legislacao/atos/2026/AC069_26
- Ato COTEPE/ICMS 79/2025 (NT 2025.001, efeitos a partir de 01/01/2026): https://www.confaz.fazenda.gov.br/legislacao/atos/2025/AC079_25
- EFD-Contribuições, página: https://www.gov.br/sped/pt-br/assuntos/escrituracoes-digitais/efd-contribuicoes
- Guia Prático EFD-Contribuições 1.35: https://www.gov.br/sped/pt-br/assuntos/escrituracoes-digitais/efd-contribuicoes/manuais/guia_pratico_efd_contribuicoes_versao_1_35-18_06_2021.pdf
- NT 11/2026: https://www.gov.br/sped/pt-br/assuntos/escrituracoes-digitais/efd-contribuicoes/documentos-tecnicos/nota-tecnica-11-2026-descontinuidade-da-efd-contribuicoes-orientacoes-para-os-contribuintes
- NT 13/2026: https://www.gov.br/sped/pt-br/assuntos/escrituracoes-digitais/efd-contribuicoes/documentos-tecnicos/nota-tecnica-013_2026-alteracoes-efd-contribuicoes-para-rtc-2027.pdf

Observação: a NT 2026.001 ainda cita o endereço antigo `http://sped.rfb.gov.br/pasta/show/1573` para o guia. Neste relatório só foram usados os endereços novos; os antigos não foram retestados.

## 5. Mudanças exatas sugeridas em impactoSped.ts (não aplicadas)

1. **Comentário do topo** (linhas 5 a 9): trocar por
   `* Fontes oficiais conferidas em 26/11/2026 no portal gov.br/sped (docs/sped-conferencia-2026-11-26.md e docs/sped-conferencia-2026-11-26-govbr.md):`
   `* Guia Prático da EFD ICMS/IPI 3.2.4 (30/07/2026, Ato COTEPE/ICMS 86/2026); leiaute 020 em 2026 (NT 2025.001, Ato COTEPE/ICMS 79/2025)`
   `* e 021 a partir de 01/01/2027 (NT 2026.001, Ato COTEPE/ICMS 69/2026); Guia Prático da EFD-Contribuições 1.35 (18/06/2021), último publicado,`
   `* com as NT 11/2026 e 13/2026 (o código de versão do leiaute vigente em 2026 não foi confirmado); NT 2025.002-RTC v1.53 (30/10/2026) e MOC Anexo I da NF-e. ...` (o resto igual).
2. **`FONTES_LEIAUTE.EFD_ICMS_IPI`**:
   `url: 'https://www.gov.br/sped/pt-br/assuntos/escrituracoes-digitais/efd-icms-ipi/manuais-e-documentos-tecnicos/guia-pratico-efd-versao-3-2-4.pdf/@@display-file/file'`,
   `versaoConferida: 'Guia Prático 3.2.4 (30/07/2026; Ato COTEPE/ICMS 86/2026); leiaute 020 em 2026 (NT 2025.001, Ato COTEPE/ICMS 79/2025) e 021 a partir de 01/01/2027 (NT 2026.001, Ato COTEPE/ICMS 69/2026)'`, `status: 'CONFIRMADO'`.
3. **`FONTES_LEIAUTE.EFD_CONTRIBUICOES`**:
   `url: 'https://www.gov.br/sped/pt-br/assuntos/escrituracoes-digitais/efd-contribuicoes/manuais/guia_pratico_efd_contribuicoes_versao_1_35-18_06_2021.pdf'`,
   `versaoConferida: 'Guia Prático 1.35 (18/06/2021), último publicado no portal do SPED (gov.br/sped); NT 11/2026 e NT 13/2026'`, `status: 'CONFIRMADO'`,
   `nota: 'código de versão do leiaute vigente em 2026 (COD_VER do 0000) não confirmado: a tabela 3.1.1 do Guia 1.35 vai até o código 006 (a partir de 01/01/2020) e as NT 09/2024 e 10/2025 não publicam código novo. A partir de 01/2027 não há apuração de novos fatos geradores (NT 11/2026)'`.
4. **`VERSAO_LEIAUTE_POR_ANO.EFD_ICMS_IPI`**: `{ '2026': '020 (NT 2025.001, Ato COTEPE/ICMS 79/2025)', '2027': '021 (NT 2026.001, Ato COTEPE/ICMS 69/2026)' }`.
5. **`RESSALVA_0205`** e seu comentário (linhas 65 e 66): trocar "Guia Prático da EFD ICMS/IPI 3.2.2" por "Guia Prático da EFD ICMS/IPI 3.2.4" (texto do registro idêntico).
6. **Linha 97 (0221)**, ressalva: trocar "(Guia Prático 3.2.2)" por "(Guia Prático 3.2.4)".
7. **Linha 117 (C170 ICMS/IPI, MUDOU_TRATAMENTO)**, ressalva:
   `'A EFD ICMS/IPI não tem campo de CST de IBS/CBS (nem no leiaute 021, de 2027): não se presta à apuração de CBS, IBS e IS (Guia Prático 3.2.4, Cap. I, Seção 10)'`.
8. **Linha 129 (F120/F130)**, ressalva sugerida (opcional, fonte é NT de alterações previstas):
   `'Para fatos geradores a partir de 01/2027, F120 e F130 ficam para o crédito presumido de CBS sobre depreciação, amortização e cota mensal (LC 214/2025, art. 380; NT EFD-Contribuições 13/2026, alterações previstas)'`.
9. **Linhas `EFD_CONTRIBUICOES` de C170 e M100/M500** (opcional): ressalva `'Até a competência 12/2026; a partir de 01/2027 não há apuração de novos fatos geradores de PIS/Cofins (NT EFD-Contribuições 11/2026)'`.
10. Sem mudança de campos ou registros: todas as linhas do checklist (commit 9f49644) conferem com o guia 3.2.4 e com o 1.35.

Fora do checklist, mas ligado ao saneamento de estoques: pela NT 13/2026, o **F150 da EFD-Contribuições recebe o crédito presumido de CBS sobre o estoque de abertura em 01/01/2027** (art. 381 da LC 214). Ele exige o inventário de 31/12/2026 na EFD ICMS/IPI e uma memória de cálculo por item, com escrituração única entre janeiro e junho de 2027. Fica para avaliar se entra como linha nova; não foi sugerido aqui como mudança no código.

## Resumo

- O novo portal abriu. **EFD ICMS/IPI:** o guia vigente é o **3.2.4** (30/07/2026, Ato COTEPE/ICMS 86/2026, em vigor desde 10/09/2026), e não mais o 3.2.2. O leiaute é **020 em 2026** e **021 a partir de 01/01/2027** (NT 2026.001, Ato COTEPE/ICMS 69/2026). O 021 muda CNPJ e chaves para alfanumérico e cria o IND_BENEFICIO e o COD_PROD do C180; nenhum registro do checklist muda.
- **EFD-Contribuições:** o guia continua o **1.35** (18/06/2021). O **COD_VER de 2026 segue não confirmado**: a tabela oficial vai até 006 (2020) e as NT de 2024/2025 não publicam código novo. Há as NT 11/2026 (sem leiaute de CBS/IBS em 2026; sem novos fatos geradores a partir de 2027) e 13/2026 (F120/F130 mantidos em 2027 para o crédito presumido de CBS; F150 para o estoque de abertura).
- Os registros conferem: 0190, 0200 (COD_ANT_ITEM "Não preencher"), 0205, 0220, 0221, H010, C170, 0300, G110 e G125 no guia 3.2.4, com texto idêntico ao 3.2.2. A única mudança, no C170 QTD (nota de crédito de 2026), não afeta o checklist. Na EFD-Contribuições conferem 0200, 0205, C170, F120/F130 e M100/M500, e o 0220 não existe. A EFD ICMS/IPI não tem campo de IBS/CBS, nem no leiaute 021.
- Mudanças no código: só as citações de fonte e versão (URLs gov.br, 3.2.2 para 3.2.4, leiaute 021 em 2027, nota do COD_VER) e duas ressalvas opcionais de 2027. Nenhuma mudança de campo.
