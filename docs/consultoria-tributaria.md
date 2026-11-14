# Consultoria Tributária — organização dos menus

Escopo atual: navegação. O menu reúne Carteira de Consultoria, Projetos e Serviços Tributários. Carteira e Projetos reutilizam as telas existentes de diagnóstico; o catálogo separa Pessoa Física e Pessoa Jurídica.

| Acesso existente | Onde fica na nova navegação |
| --- | --- |
| Clientes com diagnóstico | Consultoria Tributária → Carteira de Consultoria |
| Projetos de diagnóstico | Consultoria Tributária → Projetos |
| Painel Executivo, Comparação de regimes, Cenários e Transição | Serviços Tributários → Pessoa Jurídica → Reforma Tributária → Simulador da Reforma Tributária |
| Calculadora de Crédito Presumido de Estoque | Serviços Tributários → Pessoa Jurídica → Créditos e Oportunidades Tributárias → Crédito presumido de estoque |

As rotas antigas continuam disponíveis. Importações, Operações, validadores, Classificador, Saneamento e Histórico permanecem nas telas atuais. BPO, cadastros, projetos e banco não sofrem alterações.

Serviços novos são sinalizados como Em desenvolvimento. A comparação de regimes para o exercício fica em Planejamento Tributário, separada da comparação de regimes na transição, que já funciona. A calculadora de estoque continua acessível enquanto o roteiro completo é desenvolvido.

As definições para vínculos, Perfil fiscal, automações e roteiros ficam para o desenvolvimento de cada serviço.

## Organização aprovada para implantação

A reorganização dos menus já foi publicada. O conteúdo abaixo é proposta para revisão; não autoriza mudança no cadastro, automação, migração ou deploy.

### Cadastro, carteira e coleta de documentos

- Manter um cadastro único. Em **Ficha completa → Serviços contratados**, permitir vincular mais de um serviço, filtrado por PF ou PJ. Manter os vínculos existentes de Diagnóstico pontual sem reclassificação automática.
- O **contrato** define a carteira; a **procuração** define o acesso às fontes. Procuração válida de cliente de Consultoria não ativa BPO. Quem contrata os dois aparece nas duas carteiras, sem cadastro duplicado.
- O repositório do contribuinte é compartilhado. A Consultoria acessa os documentos pelo projeto, sem precisar abrir uma tela do BPO. Conferir titular, autorização, período e versão. Vínculo CPF–CNPJ não dá acesso cruzado; bases de trabalho, regras e resultados de PF e PJ são independentes.
- **Pelo cadastro:** ao criar o cliente, permitir selecionar um ou mais serviços do cardápio aplicável a PF ou PJ. A seleção é opcional. Para cliente já cadastrado, oferecer a mesma ação em **Ficha completa → Serviços contratados**.
- **Pelo serviço:** na Carteira BPO ou na tela do serviço de Consultoria, a ação **Vincular cliente** busca no cadastro único. Se o cliente ainda não existir, abrir o cadastro com o serviço pré-selecionado, sujeito à validação de PF/PJ.
- Os dois caminhos gravam o mesmo vínculo e atualizam a carteira correspondente sem duplicar contratos ativos. Diferenciar contratação de abertura de projeto; serviços em desenvolvimento não iniciam execução.

### Lista de solicitações por objetivo

#### Período de análise

Todo trabalho terá dois campos obrigatórios: **De** e **Até**, com datas inclusivas. O InTAX valida que **De** não é posterior a **Até** e usa o intervalo, junto com o contribuinte e os estabelecimentos do escopo, para buscar documentos no repositório e gerar a lista de solicitações.

- **Documentos por data**, como XML: buscar pela data relevante para o objetivo da análise (emissão, recebimento ou pagamento, conforme o caso).
- **Documentos por competência**, como MIT e EFD: buscar as competências que cruzam o intervalo. Ex.: **De 15/01 a 10/03** busca janeiro, fevereiro e março; o recorte dos lançamentos segue as datas do trabalho.
- **Documentos anuais**, como ECD, ECF e LCDPR: buscar os arquivos dos exercícios abrangidos, sem exigir que tenham sido entregues dentro do intervalo. Vincular cada recibo ao arquivo correspondente.
- **Evidências complementares fora do intervalo**, como saldo de abertura, inventário na data de corte ou ECF do ano anterior: incluir somente quando o objetivo exigir e indicar o motivo na lista.

A tela mostra **o período solicitado, o período coberto pelos arquivos validados e as lacunas**. Se o consultor alterar **De** ou **Até**, o InTAX refaz a busca e atualiza as pendências sem apagar documentos, registros de recebimento ou resultados anteriores.

Cada item tem **nome, formato, titular, estabelecimento, período, conteúdo esperado, condição de aplicabilidade e situação**. Uma linha por documento ou conjunto homogêneo do mesmo tipo, titular e período. Recibos sempre em linha própria, ligados à respectiva entrega. O InTAX busca antes no repositório, registra o que encontrou e emite somente pendências. Estados: não localizado, recebido, validado, divergente e não aplicável. ZIP é embalagem; PDF não substitui arquivo digital quando o teste depende dos registros.

#### 1. PF — Enquadramento e opção de IBS/CBS do produtor rural

Objetivo: comprovar enquadramento e, quando houver opção, comparar cenários.

- [ ] Demonstrativo de receitas rurais por atividade e mês — XLSX/CSV.
- [ ] Comprovante de inscrição estadual — PDF por estabelecimento.
- [ ] NF-e de saída da produção — XML autorizado.
- [ ] Notas de entrada emitidas pelo comprador para documentar vendas do produtor — XML autorizado; deduplicar com NF-e de saída.
- [ ] NF-e de aquisição de insumos e mercadorias — XML autorizado.
- [ ] NF-e de aquisição de máquinas e equipamentos — XML autorizado.
- [ ] CT-e de fretes tomados — XML, quando aplicável.
- [ ] NFS-e de serviços contratados — XML, quando disponível; documento oficial alternativo identificado como tal.
- [ ] Comprovante de opção pelo regime regular — PDF, se já exercida.
- [ ] Documentos de participação societária — quando pertinentes.
- [ ] Demonstrativo de receitas das empresas vinculadas — quando pertinente.
- [ ] Relatório de preços e prazos praticados — XLSX, se houver simulação.

As entradas são solicitadas conforme o objetivo. Uma análise restrita ao enquadramento não fica bloqueada por documentos necessários apenas à simulação.

#### 2. PF — Homologação fiscal do ERP do produtor rural

Objetivo: validar a emissão para operações do produtor PF.

- [ ] Exportação dos parâmetros fiscais do ERP e módulos — XLSX/CSV/JSON, com versão e ambiente.
- [ ] Capturas das telas de parametrização fiscal do produtor — PNG/JPG ou PDF legível, quando úteis para identificar regras, campos ou mensagens. Identificar ERP, versão, ambiente, estabelecimento do produtor, cenário e data da captura. Recortar dados pessoais e credenciais que não sejam necessários.
- [ ] Cadastro de produtos — XLSX/CSV.
- [ ] Cadastro de serviços — XLSX/CSV, se aplicável.
- [ ] XML de referência — por tipo de operação.
- [ ] XML emitido em homologação — por cenário.
- [ ] Retorno de autorização ou rejeição — XML ou log.
- [ ] XML do reteste — quando houver correção.

#### 3. PF — Revisão do livro-caixa rural (LCDPR)

Objetivo: conferir receitas, despesas e resultado por CPF, imóvel e ano.

- [ ] LCDPR integral — TXT oficial: bloco 0 (0000, 0010, 0030, 0040, 0045 quando aplicável e 0050); bloco Q (Q100 e Q200); bloco 9 (9999).
- [ ] Comprovante de entrega do LCDPR — se já entregue.
- [ ] Extrato bancário — OFX/CSV por conta e período; PDF como evidência complementar.
- [ ] NF-e de venda — XML.
- [ ] NF-e de aquisição — XML.
- [ ] Comprovante de pagamento ou recebimento — por lançamento pendente.
- [ ] Contrato de troca, parceria ou arrendamento — por operação, se necessário.

Se não houver LCDPR, usar lista alternativa para livro-caixa sem marcá-lo como LCDPR validado. No planejamento PF, presunção versus resultado apurado é critério interno, não outro serviço.

#### 4. PJ — Simulador da Reforma Tributária

Objetivo: projetar carga, margem e caixa na transição.

- [ ] NF-e de entrada — XML.
- [ ] NF-e de saída — XML.
- [ ] CT-e — XML, conforme o escopo.
- [ ] NFS-e — XML, conforme o escopo.
- [ ] Planilha de Operações do InTAX — XLSX, como alternativa inicial quando pertinente.
- [ ] DRE gerencial mensal — XLSX/CSV.
- [ ] Relatório de custos e margens — XLSX/CSV.
- [ ] Contas a receber — XLSX/CSV.
- [ ] Contas a pagar — XLSX/CSV.
- [ ] Ato concessivo — PDF, quando houver benefício relevante.

#### 5. PJ — Homologação fiscal do ERP para IBS/CBS

Objetivo: validar regras e emissão por CNPJ, estabelecimento e cenário.

- [ ] Matriz de regras fiscais do ERP — XLSX/CSV/JSON.
- [ ] Capturas das telas de parametrização fiscal da empresa — PNG/JPG ou PDF legível, quando úteis para identificar regras, campos ou mensagens. Identificar ERP, versão, ambiente, CNPJ/estabelecimento, cenário e data da captura. Recortar dados pessoais e credenciais que não sejam necessários.
- [ ] Cadastro de estabelecimentos — XLSX/CSV.
- [ ] Cadastro de produtos — XLSX/CSV.
- [ ] Cadastro de serviços — XLSX/CSV, se aplicável.
- [ ] XML de referência — por operação.
- [ ] XML de homologação — por cenário.
- [ ] Retorno do autorizador — XML ou log.
- [ ] XML do reteste — quando houver correção.

**Critério para os dois roteiros de homologação:** a captura pode agilizar a triagem, mostrar o caminho da configuração e orientar o teste ou reteste. O InTAX pode sugerir os campos e valores visíveis para conferência, sem inferir valores ilegíveis ou ocultos. A captura fica ligada ao cenário como evidência complementar; não dá baixa nos itens de exportação, XML emitido ou retorno do autorizador quando exigidos. Sem o documento de teste exigido, o cenário fica pendente de homologação.

**A desenvolver — leitura de prints do ERP (PF e PJ).** Na revisão do código da VPS (`7970311`), não foi encontrada leitura automática de capturas para homologação. O armazenamento de anexos existente não extrai nem interpreta os campos da tela.

1. Receber PNG, JPG ou PDF e associar o original ao contribuinte, cenário, versão do ERP e ambiente do teste.
2. Extrair rótulos, valores visíveis e mensagens de erro com OCR; usar a camada de texto quando houver. Avaliar com amostras de ERPs antes de decidir se é necessária interpretação visual adicional.
3. Exibir os campos sugeridos ao lado do trecho da captura que os sustenta. Marcar campo cortado, ilegível ou associação incerta como **Revisão necessária**. O consultor confirma ou corrige antes de usar o dado no teste.
4. Guardar a extração e a revisão ligadas ao cenário. Compartilhar o leitor entre PF e PJ, com isolamento das evidências, configurações e regras de homologação. A leitura não altera parâmetros no ERP nem aprova emissão.

**Aceite:** testar capturas legíveis, cortadas e de baixa resolução, inclusive telas com vários campos semelhantes. O sistema deve mostrar o que conseguiu ler, indicar o que não pôde confirmar e manter pendentes XML e retornos oficiais exigidos.

#### 6. PJ — Créditos de PIS e Cofins

Objetivo: identificar oportunidades, evidências e valores já aproveitados.

- [ ] EFD-Contribuições transmitida — TXT integral, uma por competência.
- [ ] Recibo da EFD-Contribuições — vinculado ao TXT.
- [ ] NF-e de entrada — XML.
- [ ] NF-e de saída — XML.
- [ ] CT-e — XML, conforme a checagem.
- [ ] NFS-e — XML ou exportação oficial, conforme a checagem.
- [ ] Cadastro de itens e serviços — XLSX/CSV.
- [ ] Mapa de utilização de créditos — XLSX/CSV, quando existir.
- [ ] PER/DCOMP transmitido — quando houver.
- [ ] Recibo do PER/DCOMP — correspondente.
- [ ] Razão contábil — quando a checagem de insumos exigir.
- [ ] Descrição do processo produtivo — quando a checagem de insumos exigir.
- [ ] Memória de apuração da exclusão de base — quando essa checagem for aplicável.

#### 7. PJ — Crédito presumido de estoque

Objetivo: comprovar, calcular e acompanhar o crédito presumido de **CBS** do estoque de abertura de **01/01/2027**, inventariado em **31/12/2026**. A data legal é fixa; o filtro De/Até serve para localizar as evidências, inclusive aquisições antigas ainda em estoque.

- [ ] Livro de Inventário com o registro do estoque de abertura — versão escriturada, com descrição, classificação fiscal, quantidade e valor unitário.
- [ ] Inventário detalhado do ERP em 31/12/2026 — XLSX/CSV por estabelecimento, item, unidade e local; segregar bens nacionais, importados e de terceiros. Solicitar evidência da contagem e conciliação de diferenças como controle do escritório.
- [ ] NF-e de aquisição dos bens inventariados — XML autorizado, com vínculo por item e quantidade remanescente; todos os itens do inventário devem ter documentação fiscal idônea.
- [ ] EFD-ICMS/IPI com Bloco H — TXT, quando aplicável; conferir H005/H010 e data do inventário.
- [ ] Recibo da EFD-ICMS/IPI — separado.
- [ ] ECF com os registros de estoque — TXT, conforme obrigatoriedade e disponibilidade.
- [ ] Recibo da ECF — separado.
- [ ] EFD-Contribuições dos períodos pertinentes — TXT para evidenciar regime, tratamento das aquisições e créditos já apurados.
- [ ] Recibo da EFD-Contribuições histórica — separado.
- [ ] Evidência do enquadramento no regime regular da CBS — conforme fonte disponível.
- [ ] Memória do custo de aquisição segundo os critérios do IRPJ — por item; para produtos acabados e em processo, apenas custo de aquisição das matérias-primas e embalagens. Pedir composição de produção em linha própria quando aplicável.
- [ ] Razão de movimentações no corte — XLSX/CSV, quando necessário.
- [ ] Declaração de importação (DI ou Duimp, conforme a operação) — arquivo ou extrato oficial, quando houver importados.
- [ ] Comprovante do PIS/Pasep-Importação efetivamente pago — quando aplicável.
- [ ] Comprovante da Cofins-Importação efetivamente paga — discriminar o adicional excluído, quando aplicável.
- [ ] Memória da parcela sem direito ao crédito anterior — quando houver vedação parcial.
- [ ] Decisão judicial ou administrativa — quando sustentar tratamento diferenciado; avaliar F159.
- [ ] XML das devoluções de bens do estoque de abertura a partir de 01/01/2027 — vincular à aquisição e ao item.
- [ ] EFD-Contribuições de 2027 com F150 — TXT da escrituração usada para apropriar.
- [ ] Recibo da EFD-Contribuições de 2027 — separado; conferir consolidação do registro 1980.
- [ ] Evidência da apropriação e do uso na Apuração Assistida da CBS — quando disponível.

**Controles:** testar a hipótese legal por item (cumulatividade sem crédito por esse motivo; monofásico/ST expressamente listado; ou fração com vedação parcial). Excluir bens de terceiros, usados, aquisições nacionais de PF, entradas com alíquota zero, isenção, suspensão ou não incidência de PIS/Cofins, uso e consumo pessoal, imobilizado e imóveis. Aplicar 9,25% sobre o custo elegível nacional; para importados, usar o efetivamente pago sem o adicional vedado. Não duplicar com créditos anteriores. Devolução antes da transmissão ajusta o F150; depois, tratar na Apuração Assistida, conforme orientação aplicável.

**Entrega e calendário:** gerar memória individualizada por item, com elegíveis, excluídos e pendentes, fundamento e vínculo documental. Conferir F150 em uma única escrituração entre janeiro e junho de 2027, apropriação até 30/06/2027 e utilização em 12 parcelas mensais sucessivas a partir do período seguinte, exclusivamente contra débitos de CBS, sem ressarcimento. Controlar guarda documental mínima de cinco anos desde o inventário, separadamente do prazo de utilização do crédito previsto no art. 613.

Fontes: [LC 214/2025, arts. 381–382](https://legis.senado.gov.br/norma/40180341/publicacao/40181429), [Decreto 12.955/2026, arts. 605–613](https://sintse.tse.jus.br/documentos/2026/Abr/30/diario-oficial-da-uniao-secao-1/decreto-no-12-955-de-29-de-abril-de-2026-regulamenta-a-contribuicao-social-sobre-bens-e-servicos-cbs) e [Nota Técnica EFD-Contribuições 013/2026, anexos III–V](https://www.gov.br/sped/pt-br/assuntos/comunicados/efd-contribuicoes/efd-contribuicoes-publicacao-da-nota-tecnica-13-2026). Conferir versões vigentes do leiaute e orientações da Apuração Assistida antes de implementar.

#### 8. PJ — Conciliação de tributos pagos

Objetivo: conciliar débito declarado, pagamento e vinculação.

- [ ] MIT detalhado — retorno estruturado, quando aplicável.
- [ ] DCTFWeb transmitida — documento oficial.
- [ ] Recibo da DCTFWeb — documento oficial.
- [ ] DCTF histórica transmitida — quando aplicável ao período.
- [ ] Recibo da DCTF histórica — documento oficial.
- [ ] Guia emitida — uma linha por tipo aplicável.
- [ ] Comprovante de pagamento — separado da guia.
- [ ] Extrato de vinculação — quando necessário.
- [ ] PER/DCOMP transmitido — quando houver.
- [ ] Recibo do PER/DCOMP — correspondente.
- [ ] Demonstrativo de parcelamento ou suspensão — um item por evidência aplicável.

#### 9. PJ — Revisão de saldos de IRPJ e CSLL

Objetivo: reconstituir o saldo por tributo e conferir o que já foi utilizado.

- [ ] ECD transmitida — TXT, quando aplicável.
- [ ] Recibo da ECD — documento oficial.
- [ ] ECF transmitida — TXT.
- [ ] Recibo da ECF — documento oficial.
- [ ] MIT detalhado — por competência, quando aplicável.
- [ ] DCTF ou DCTFWeb transmitida — gerar o item correspondente ao período.
- [ ] Recibo da declaração — separado.
- [ ] Memória de apuração de IRPJ — XLSX.
- [ ] Memória de apuração de CSLL — XLSX.
- [ ] Balancete de suspensão ou redução — quando usado.
- [ ] Comprovante de pagamento — por tributo e período.
- [ ] Comprovante de retenção — por fonte pagadora.
- [ ] PER/DCOMP transmitido — quando houver.
- [ ] Recibo do PER/DCOMP — correspondente.
- [ ] Balancete contábil — quando necessário para avançar sem ECD.
- [ ] Razão contábil — quando necessário para avançar sem ECD.

#### 10. PJ — Escolha do regime tributário para o exercício

Objetivo: comparar regimes elegíveis para um ano específico, com carga e caixa projetados. A comparação já existente no Simulador permanece **Comparação de regimes na transição**. A Virada de exercício é outro trabalho.

- [ ] MIT detalhado — quando aplicável.
- [ ] EFD-Contribuições transmitida — TXT, quando aplicável.
- [ ] Recibo da EFD-Contribuições — documento oficial.
- [ ] PGDAS-D transmitido — quando aplicável.
- [ ] Recibo do PGDAS-D — documento oficial.
- [ ] Memória de apuração de IRPJ — quando necessária.
- [ ] Memória de apuração de CSLL — quando necessária.
- [ ] Receita mensal por atividade e estabelecimento — XLSX/CSV.
- [ ] DRE mensal — XLSX/CSV.
- [ ] Balancete mensal — XLSX/CSV.
- [ ] Resumo mensal de folha e encargos — XLSX/CSV.
- [ ] Projeções do exercício — XLSX ou premissas preenchidas no projeto.

#### 11. PJ — Análise de virada de exercício

Objetivo: conciliar saldos de fechamento e preparar a abertura mesmo sem troca de regime.

- [ ] ECD transmitida — TXT, se disponível.
- [ ] Recibo da ECD — documento oficial.
- [ ] ECF transmitida — TXT, se disponível.
- [ ] Recibo da ECF — documento oficial.
- [ ] Balancete de fechamento — XLSX.
- [ ] Balanço patrimonial — XLSX/PDF.
- [ ] DRE de fechamento — XLSX/PDF.
- [ ] Inventário de encerramento — XLSX/CSV ou escrituração aplicável.
- [ ] Posição de abertura — XLSX/CSV.
- [ ] Mapa de saldos fiscais a transportar — XLSX.
- [ ] Comprovante de opção tributária — quando houver.
- [ ] Ato concessivo — quando houver.
- [ ] Decisão com efeito no próximo exercício — quando houver.

#### 12. PF e PJ — Revisão de Cruzamentos Fiscais

Objetivo: executar **todos os testes aplicáveis** ao perfil, regime e período. Uma fonte faltante deixa seus testes pendentes e não bloqueia os demais. Catálogos PF e PJ separados, sem procuração ou base emprestada do contribuinte vinculado.

| Família | Cruzamentos mínimos |
| --- | --- |
| Contábil e federal PJ | ECD × ECF; ECF × DCTF histórica ou MIT/DCTFWeb para IRPJ/CSLL; EFD-Contribuições × débitos declarados de PIS/Cofins; EFD-ICMS/IPI × IPI declarado; apuração × arrecadação × PER/DCOMP. |
| Receita e documentos PJ | EFD-Contribuições × ECD/ECF; NF-e, NFC-e e CT-e × EFD-ICMS/IPI; EFD-ICMS/IPI × EFD-Contribuições; NFS-e × receitas/declarações aplicáveis. Alinhar caixa ou competência, cancelamentos e abrangência antes de comparar valores. |
| Simples | PGDAS-D × documentos fiscais × recebimentos; DEFIS × PGDAS-D e contabilidade nos campos equivalentes. |
| Estoque | Bloco H × inventário e razão de estoque × documentos fiscais, incluindo devoluções, transferências, perdas, ajustes e produção. Usar Bloco K quando aplicável. |
| Folha e retenções | eSocial × DCTFWeb; EFD-Reinf × DCTFWeb; informes e dados autorizados de fontes pagadoras × DIRPF. DIRF para os períodos históricos aplicáveis. |
| Financeiro e terceiros | Extratos e liquidações × faturamento ou renda; DIMP, DECRED, e-Financeira, DIMOB, DOI e DMED apenas quando aplicáveis e disponíveis com autorização. Movimentação bruta não equivale a receita. |
| Rural PF | LCDPR × XML de vendas × XML de compras × extratos/comprovantes × atividade rural na DIRPF, por CPF, imóvel e participação. |
| Outros controles PF | DIRPF × informes/pré-preenchida; patrimônio e rendimentos imobiliários × DIMOB/DOI/evidência equivalente; deduções médicas × DMED disponível, recibos e reembolsos. |

A lista de solicitações é a união, sem duplicatas, das fontes requeridas pelos testes aplicáveis. Reutilizar os itens dos serviços 3, 6, 8, 9 e 11 quando necessários. Acrescentar individualmente, conforme o teste:

- [ ] NFC-e emitidas — XML.
- [ ] Eventos de cancelamento e demais eventos requeridos — XML.
- [ ] DEFIS transmitida — documento oficial.
- [ ] Recibo da DEFIS — documento oficial.
- [ ] PGDAS-D transmitido — documento oficial.
- [ ] Recibo do PGDAS-D — documento oficial.
- [ ] Totalizadores do eSocial — XML/exportação oficial.
- [ ] Totalizadores da EFD-Reinf — XML/exportação oficial.
- [ ] DIRF histórica — arquivo ou relatório oficial, quando aplicável.
- [ ] Recibo da DIRF — se disponível e pertinente.
- [ ] Extrato bancário — OFX/CSV por conta e período.
- [ ] Relatório de liquidação da adquirente — CSV/XLSX.
- [ ] DIMP — apenas quando aplicável e acessível.
- [ ] DECRED — apenas quando aplicável e acessível.
- [ ] Dados autorizados da e-Financeira — quando acessíveis.
- [ ] Dados autorizados da DIMOB — quando acessíveis.
- [ ] Dados autorizados da DOI — quando acessíveis.
- [ ] Dados autorizados da DMED — quando acessíveis.
- [ ] DIRPF transmitida — cópia da declaração.
- [ ] Recibo da DIRPF — documento oficial.
- [ ] Dados autorizados da pré-preenchida — exportação disponível.
- [ ] Informe de rendimentos — por fonte pagadora.
- [ ] Contrato de locação — por imóvel.
- [ ] Instrumento de compra e venda — por operação.
- [ ] Recibo de despesa médica — por prestador e beneficiário.
- [ ] Demonstrativo de reembolso médico — quando houver.

**Resultado:** cobertura por contribuinte, competência e cruzamento; para cada divergência, campos comparados, valores, diferença, evidências e próxima ação. Separar parâmetro público da RFB de controle próprio. Começar o levantamento oficial por [10.002](https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/declaracoes-e-demonstrativos/revisao-de-declaracao-malha/pj-parametro-10.002), [10.003](https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/declaracoes-e-demonstrativos/revisao-de-declaracao-malha/pj-parametro-10.003) e [10.009](https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/declaracoes-e-demonstrativos/revisao-de-declaracao-malha/pj-parametro-10.009). Não presumir acesso a bases de terceiros; registrar a limitação e aceitar evidência alternativa quando prevista.

### Perfil fiscal e próximo passo

Incluir o **Perfil fiscal automático de PJ** no mesmo escopo das mudanças de cadastro e contratação. Mostrar a seção na Ficha completa mesmo para cliente que só contrata Consultoria. O Perfil fiscal lê evidências autorizadas do repositório; contratar um serviço ou cadastrar uma procuração não preenche por si só o regime, não ativa rotinas do BPO e não dispara consultas externas só por abrir a ficha. Os trabalhos usam o perfil do período de análise como referência; simulações não alteram o histórico.

Manter o Perfil fiscal automático dentro da Ficha completa de PJ, sem edição manual. Guardar fonte e histórico por competência: MIT para forma de tributação; EFD-Contribuições no Presumido para caixa/competência de PIS/Cofins, com caixa apenas inferido para IRPJ/CSLL; evidência própria para confirmar competência desses tributos. No Real Anual, método mensal depende de evidência do MIT ou da apuração. ECF confere o ano fechado e não preenche por suposição o ano corrente.

1. **Entrega de organização:** catálogo, carteira, cadastro e vínculos, período, lista de documentos e Perfil Fiscal.
2. **Após revisão:** varrer os manuais por documento e versão. Para cada teste, definir registros e chaves, vigência, validações, retificação, conciliação e critérios de conclusão.
3. **Após aprovação:** desenvolver serviço a serviço. Homologar preservação de cadastros, permissões, projetos, históricos e rotinas BPO. Não excluir projetos antigos nem mudar vínculos automaticamente.
