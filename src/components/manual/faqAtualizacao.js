/**
 * Conteúdo novo do FAQ (atualização de 28/10/2026): novidades da Reforma com fonte oficial, importação de XML,
 * ferramentas abertas, Base legal, Radar e Saneamento, e complementos de seções que já existiam.
 *
 * Regra da casa: cada resposta que cita lei, decreto, ato ou número traz a fonte em `f`, e só entra o que foi lido
 * em fonte oficial. O que não foi confirmado aparece como "não localizamos". Ao mudar um número, atualize também
 * FAQ_ATUALIZADO_EM e a seção de novidades.
 */
export const FAQ_ATUALIZADO_EM = "29/10/2026";

export const SECAO_NOVIDADES = {
  titulo: "Novidades da Reforma (atualizado em 29/10/2026)",
  rotulo: "Novidades da Reforma",
  nota: "O que mudou com efeito em cálculo e alíquotas, com a fonte oficial de cada ponto. As alíquotas de 2027 em diante seguem como estimativa até a resolução do Senado. Confira sempre a data desta seção.",
  itens: [
    {
      p: "Qual é a alíquota da CBS em 2027?",
      r: "Ainda não é definitiva. Em 28/10/2026 o TCU aprovou o cálculo da alíquota de referência da CBS de 2027: 11,3468%, que a lei manda arredondar para o décimo de ponto percentual mais próximo, isto é, 11,3%. Ela só passa a valer por resolução do Senado; se o Senado não fixar a alíquota até 22 de dezembro, valem as calculadas pelo TCU enquanto a resolução não sair. Em 2027 e 2028 a CBS cobrada é a alíquota fixada menos 0,1 ponto percentual, o que dá 11,2% se a referência ficar em 11,3%.",
      f: "LC 214/2025, arts. 347 e 349 (§2º e §14); TCU, página “CBS 2027” (processo TC 006.529/2026-7); Agência Senado, 28/10/2026.",
    },
    {
      p: "Quais são os prazos do TCU e do Senado?",
      r: "Pela lei, o TCU envia os cálculos ao Senado até 15 de setembro e o Senado fixa as alíquotas até 31 de outubro do ano anterior ao da vigência; se a fixação passar de 22 de dezembro, valem os cálculos do TCU até a resolução. Em 2026 a Agência Senado informa o envio do TCU até 30 de outubro e a decisão do Senado até 15 de dezembro. O procedimento se repete todos os anos.",
      f: "LC 214/2025, art. 349, §§1º e 2º; Agência Senado, 26/10/2026.",
    },
    {
      p: "E a alíquota do IBS?",
      r: "Em 2026 é de 0,1% (art. 343). Em 2027 e 2028 é de 0,05% estadual mais 0,05% municipal, total de 0,1% (art. 344), aplicada com a redução própria de cada regime diferenciado. As alíquotas de referência do IBS de 2029 a 2033, para Estados, Municípios e Distrito Federal, serão fixadas por resolução do Senado no ano anterior, com cálculo do TCU a partir de proposta do Comitê Gestor do IBS.",
      f: "LC 214/2025, arts. 343, 344 e 349 (II e §3º, II).",
    },
    {
      p: "O que são o 18,7% de IBS e o 27,91% que aparecem nas estimativas?",
      r: "São premissas do Comitê Gestor do IBS na Resolução CGIBS nº 14/2026, usadas para estimar a arrecadação do IBS em 2027 e o limite de 50% destinado ao financiamento do próprio Comitê. O quadro da resolução parte de uma alíquota total inicial de 26,5%, chega a 27,91% e atribui 18,7% ao IBS. Não são alíquotas de referência, e a resolução não fixa percentual de CBS: o 9,21% de CBS que circula é apenas a diferença entre os dois valores.",
      f: "Resolução CGIBS nº 14, de 29/07/2026 (anexo, quadro 2); Agência Senado, 26/10/2026.",
    },
    {
      p: "Existe um teto para a soma de IBS e CBS?",
      r: "A lei usa o limite de 26,5% como gatilho de revisão, não como trava automática: na avaliação quinquenal de 2030, se a soma das alíquotas de referência estimadas para 2033 passar de 26,5%, o Poder Executivo deve enviar ao Congresso um projeto de lei complementar com medidas para reduzir o percentual a 26,5% ou menos.",
      f: "LC 214/2025, art. 475, §§9º a 12.",
    },
    {
      p: "Como funciona 2026, o ano de teste?",
      r: "Em 2026 o IBS (0,1%) e a CBS (0,9%) são cobrados como teste. O valor recolhido é compensado com PIS e Cofins devidos no mesmo período, e fica dispensado o recolhimento de quem cumprir as obrigações acessórias, sem prejuízo do pagamento integral de PIS e Cofins. Essas alíquotas não se aplicam às operações de optantes do Simples Nacional. Na prática, o IBS/CBS de 2026 não soma carga nova para quem está em dia com as obrigações acessórias: na tela Transição, 2026 deve ficar como Informativo, com Efeito financeiro 0.",
      f: "LC 214/2025, arts. 343, 346 e 348; Constituição, ADCT, art. 125.",
    },
    {
      p: "Como ficam PIS, Cofins, IPI, ICMS e ISS durante a transição?",
      r: "A partir de 2027 as contribuições PIS e Cofins são extintas (com a instituição da CBS) e o IPI tem as alíquotas reduzidas a zero, exceto para produtos com industrialização incentivada na Zona Franca de Manaus. O ICMS e o ISS seguem integrais em 2027 e 2028; de 2029 a 2032 suas alíquotas são fixadas em 9/10, 8/10, 7/10 e 6/10 das previstas na legislação de cada ente, e a partir de 2033 os dois impostos são extintos. Na tela Transição esses são os fatores de cada ano: PIS/Cofins e IPI valem 1 em 2026 e 0 depois; ICMS e ISS valem 1, 1, 1, 0,9, 0,8, 0,7, 0,6 e 0, de 2026 a 2033.",
      f: "Constituição, ADCT, arts. 126, 128 e 129.",
    },
    {
      p: "Qual a diferença entre alíquota de referência, alíquota padrão e alíquota efetiva?",
      r: "Alíquota de referência é a que o Senado fixa por resolução para a CBS e para o IBS de cada esfera. Alíquota padrão é a que cada ente (União, Estado, Município) fixa em lei própria; se não houver lei, vale a de referência. Alíquota efetiva é a que sobra depois da redução do regime diferenciado: no InTAX, a alíquota nominal do ano multiplicada por (1 − redução da classe cClassTrib).",
      f: "LC 214/2025, arts. 14 e 349.",
    },
    {
      p: "O que é o redutor de compras governamentais?",
      r: "É um percentual que reduz, de modo uniforme, as alíquotas de CBS e de IBS nas aquisições da administração pública direta, de autarquias e de fundações públicas, inclusive importações (o art. 472 fala em pessoa jurídica de direito público interno, e o art. 473, §4º, trata o consórcio público de direito público como o município da sede); o Senado fixa o redutor de cada ano no ano anterior, com cálculo do TCU. Para 2027 o TCU calculou 44,16%, ainda sem resolução do Senado. Não vale para compra presencial dispensada de licitação, para bens e serviços com alíquota nacionalmente uniforme (como os combustíveis) nem para fornecedor do Simples Nacional ou MEI. Empresas públicas e sociedades de economia mista não constam do texto do art. 349, III. No InTAX, marque a operação de venda como “Venda a órgão público”: as alíquotas de IBS e CBS saem multiplicadas por (1 − redutor do ano). O 44,16% está cadastrado em 2027 na tela Transição, como estimativa; para os anos seguintes o InTAX repete o último redutor cadastrado, porque nenhum outro foi calculado. A destinação da arrecadação ao ente comprador (art. 473) não altera o valor que o fornecedor apura.",
      f: "LC 214/2025, arts. 349 (III e §1º), 370, 472 e 473; TCU, página “CBS 2027”.",
    },
    {
      p: "Como o InTAX trata as alíquotas de 2029 a 2033, que ainda não existem?",
      r: "Como cenários, sempre declarados na tela. A lei só fixa a CBS e o IBS de referência de cada ano em outubro do ano anterior (por resolução do Senado, com cálculo do TCU), então para 2029 a 2033 não há alíquota oficial. O InTAX oferece quatro cenários: (1) “Gatilho de 26,5%” (padrão): a CBS fica na referência de 2027 calculada pelo TCU (11,3%) e o IBS de 2033 é o que falta para a soma chegar a 26,5%, o gatilho de revisão do art. 475, §11 (15,2%); o 26,5% não é o “Teto de Referência” dos arts. 367 a 369, que é outro conceito, e não trava nada; (2) “Estimativas oficiais somadas (estresse)”: CBS de 11,3% mais o IBS de 18,7% da premissa do Comitê Gestor, soma de 30,0%, com alerta de que passa do gatilho; (3) “Tabela cadastrada”, sem ajuste; (4) “Personalizado”, com os números que você informar. Em todos, o IBS de 2029 a 2032 segue a escala do ADCT (10%, 20%, 30% e 40% do IBS cheio, porque o ICMS e o ISS caem para 9/10, 8/10, 7/10 e 6/10) e chega a 100% em 2033. O cenário vale para o Painel, a Calculadora, a tela Transição e o PDF, é uma escolha sua (fica guardada no navegador) e nunca altera um ano que o administrador tenha gravado como Oficial. Não é previsão: o resultado é uma faixa para planejar.",
      f: "LC 214/2025, arts. 349, 353 a 365 e 475 (§§9º a 11); Constituição, ADCT, arts. 128 e 130; TCU, página “CBS 2027”; Resolução CGIBS nº 14/2026.",
    },
    {
      p: "O que muda para o produtor rural?",
      r: "O produtor rural, pessoa física ou jurídica, com receita anual inferior a R$ 3,6 milhões e o produtor rural integrado não são contribuintes de IBS e CBS, e esse valor é atualizado todo ano pelo IPCA. Quem compra dele no regime regular apropria crédito presumido, com percentuais definidos por ato conjunto do Ministro da Fazenda e do Comitê Gestor do IBS, divulgados até setembro para vigorar em 1º de janeiro seguinte. Em 28/10/2026 a página do TCU ainda listava esses percentuais como pendentes e não localizamos o ato de 2027; por isso o crédito presumido do InTAX é estimativa, calculada com os percentuais informados em cada operação.",
      f: "LC 214/2025, arts. 164, 167 e 168 (§4º); TCU, página “CBS 2027”.",
    },
    {
      p: "Quando o produtor rural pessoa física precisa de CNPJ e de documento fiscal?",
      r: "O Decreto nº 13.075/2026 (de 21/07/2026, publicado no DOU de 22/07/2026) adiou para 1º de janeiro de 2027 a obrigatoriedade de inscrição no CNPJ e de emissão de documento fiscal para a pessoa física contribuinte ou responsável tributário e para o produtor rural pessoa física a que se refere o art. 239 do regulamento da CBS.",
      f: "Decreto nº 13.075/2026; Decreto nº 12.955/2026, arts. 105 (§4º-A) e 115 (§3º).",
    },
    {
      p: "O que é o crédito presumido de CBS sobre o estoque de 1º de janeiro de 2027?",
      r: "Quem estiver no regime regular da CBS pode apropriar crédito presumido sobre o estoque de bens materiais existente em 1º de janeiro de 2027 em três hipóteses: (1) empresa que em 31/12/2026 estava no regime cumulativo de PIS e Cofins, para os bens sem apuração de crédito; (2) bens que tiveram substituição tributária ou tributação monofásica na aquisição, nos casos listados; (3) parcela do estoque sujeita à vedação parcial de crédito de PIS e Cofins. Para bens comprados no mercado interno o crédito é de 9,25% do valor do estoque; vale só para bens novos, comprados de pessoa jurídica domiciliada no País (a compra de pessoa física, como a de produtor rural PF, não gera o crédito) ou importados, para revenda, produção ou prestação de serviços, e não para uso e consumo, ativo imobilizado e imóveis. O crédito deve ser apurado e apropriado até 30/06/2027, usado em 12 parcelas mensais iguais e compensado somente com débitos de CBS. Exige inventário em 31 de dezembro de 2026, com todos os itens respaldados por documentação fiscal idônea, guardada por no mínimo 5 anos. Nos bens importados o crédito é o PIS/Cofins-Importação efetivamente pago, sem o adicional de alíquota. O valor do estoque é o custo de aquisição pelas regras do IRPJ, separando nacional de importado; em produto acabado e em elaboração entram só os custos de aquisição das matérias-primas e embalagens. O InTAX calcula esse crédito na ferramenta Crédito presumido de estoque (menu Consultas e cálculos): informa o crédito total, o cronograma das 12 parcelas e, se você informar a CBS mensal estimada, quanto é compensado a cada mês.",
      f: "LC 214/2025, arts. 381 a 383; Decreto nº 12.955/2026, arts. 605 a 609.",
    },
    {
      p: "O crédito presumido do estoque é uma escolha da empresa ou da lei?",
      r: "É da lei. Quem pode apropriar (contribuinte do regime regular da CBS, nas três hipóteses do art. 381), quais bens entram (novos, para revenda, produção ou serviços), quanto vale (9,25% do estoque nacional ou o PIS/Cofins-Importação pago) e como se usa (até junho de 2027, em 12 parcelas, só contra CBS) estão no texto da LC 214 e do Decreto 12.955; nem a empresa nem o InTAX escolhem esses pontos. O que cabe à empresa é informar fatos: o regime em que estava em 31/12/2026, o inventário feito nesse dia e como cada grupo de bens foi comprado. A partir daí o enquadramento é conferido contra a lei, e cada item que fica de fora mostra o artigo que o exclui. Resta à empresa decidir apenas se exerce o direito. O valor a apropriar deve ser validado pelo especialista tributário.",
      f: "LC 214/2025, arts. 381 e 383; Decreto nº 12.955/2026, arts. 605 a 609.",
    },
    {
      p: "O que muda para quem está no Simples Nacional?",
      r: "Em 2026 as alíquotas de teste de IBS e CBS não se aplicam às operações de optantes do Simples. A partir de 2027 o optante pode escolher recolher IBS e CBS pelo regime regular, mantendo o DAS sem a parcela correspondente a esses tributos; quem compra dele no regime regular só credita o que efetivamente entrou no DAS. Segundo a Receita Federal, a Resolução CGSN nº 194/2026 (DOU de 28/09/2026) fixou a opção pelo regime regular para o primeiro semestre de 2027 entre 1º/09 e 30/10/2026, com possibilidade de cancelamento entre 03/11 e 20/12/2026; o pedido de ingresso no Simples para 2027 podia ser feito até 15/10/2026. Confira o texto da resolução no portal do Simples Nacional e use a ferramenta Simples × Híbrido para comparar os dois caminhos.",
      f: "LC 214/2025, arts. 47 (§9º) e 348 (III, “c”); LC 123/2006, art. 13, §9º; Receita Federal, notícia “Simples Nacional 2027” (Resolução CGSN nº 194/2026).",
    },
    {
      p: "Como ficam os combustíveis, inclusive o etanol?",
      r: "Combustíveis têm regime específico (LC 214, arts. 172 a 180): IBS e CBS são cobrados uma única vez na cadeia, com alíquota em reais por unidade de medida (litro ou quilo), uniforme em todo o país e diferente por produto. A CBS de 2027 foi divulgada pela Portaria MF nº 3.074, de 09/10/2026 (DOU de 09/10/2026, edição 192-B), com base no Decreto nº 13.133/2026, e produz efeitos a partir de 08/01/2027, o 91º dia depois da publicação: gasolina R$ 0,7925 por litro; etanol anidro R$ 0,1922; óleo diesel R$ 0,3515; biodiesel B100 R$ 0,1480 (exceto o de matéria-prima da agricultura familiar); etanol hidratado R$ 0,1922; querosene de aviação R$ 0,0712; GLP R$ 0,1677 por quilo (exceto uso doméstico em recipientes de até 13 kg); óleo combustível R$ 0,3403 por quilo. A base de cálculo é o volume a 20 °C. Em 2027 e 2028 o IBS é 0,1% do valor da operação e pode ser deduzido da CBS a recolher (arts. 344 e 347, §2º). A alíquota específica do IBS começa em 2029, não pode passar de 10%, 20%, 30% e 40% da carga dos tributos estaduais e municipais extintos de 2029 a 2032, chega a 100% em 2033 e ainda não foi divulgada pelo Comitê Gestor. Os biocombustíveis têm alíquota entre 40% e 90% da do combustível fóssil comparado (art. 175, §1º). Quem compra para revender não credita; quem compra para consumir, como o diesel da lavoura, credita o valor registrado na nota (arts. 47, §§4º e 5º, e 180). Gás natural processado, biometano e GNV não constam da portaria, e o GLP em botijão doméstico de até 13 kg e o B100 de matéria-prima da agricultura familiar ficam fora das alíquotas do anexo. A venda de distribuidor ou posto, com o tributo já cobrado antes, usa o cClassTrib 620006 e não tem débito. No InTAX, a operação marcada com um combustível é calculada por quantidade × alíquota por unidade; as alíquotas ficam em Catálogos > Combustíveis, o IBS por unidade de 2029 em diante fica pendente (o motor avisa em vez de inventar um número) e, sem alíquota nova, a CBS repete a do último ano divulgado.",
      f: "LC 214/2025, arts. 47, 172 a 180, 344 e 347; Decreto nº 13.133/2026; Portaria MF nº 3.074/2026 (DOU de 09/10/2026, edição 192-B, anexo); Portaria Conjunta MF/CGIBS nº 14/2026.",
    },
    {
      p: "O Imposto Seletivo já tem alíquotas?",
      r: "Ainda não. O Imposto Seletivo incide sobre bens e serviços prejudiciais à saúde ou ao meio ambiente (como bebidas alcoólicas e produtos fumígenos) e as alíquotas são fixadas por lei ordinária; para bens minerais extraídos o máximo é 0,25%. Em 28/10/2026 a página do TCU listava o ponto como pendente e a Agência Câmara informava, em 22/10/2026, que o governo enviaria o projeto de lei ao Congresso nos próximos dias. A Calculadora aberta usa 0,25% como premissa apenas para a mineração. No simulador com notas, a operação tem o campo Imposto Seletivo %: se a empresa é contribuinte do IS (fabricante no primeiro fornecimento, importador ou extrativista), você informa a alíquota que quer simular e o InTAX a trata como a lei manda. O IS incide uma única vez a partir de 2027, não gera crédito para quem compra (art. 410), fica dentro do valor da operação e, por isso, também compõe a base de IBS e CBS; a base do próprio IS exclui os tributos do art. 12, §2º (IBS, CBS, IPI e, até 2032, ICMS, ISS, PIS e Cofins) e o próprio IS (arts. 12, §1º, V, 415, V, e 417). Em bens minerais e fumígenos a base legal é o valor de referência, definido por ato do Poder Executivo (art. 414, III): o InTAX usa o valor da operação como aproximação e avisa na tela. O NCM que está no Anexo XVII (veículos, aeronaves e embarcações, fumígenos, bebidas alcoólicas e açucaradas, bens minerais) é reconhecido e avisa. Fumígenos e bebidas alcoólicas terão também alíquota específica por unidade, que o InTAX não modela.",
      f: "LC 214/2025, arts. 12, 409, 410, 412, 414, 415, 417, 422 e 424 (Anexo XVII); TCU, página “CBS 2027”; Agência Câmara, 22/10/2026.",
    },
    {
      p: "O InTAX calcula a Zona Franca de Manaus e a devolução personalizada (cashback)?",
      r: "Não. A Zona Franca de Manaus tem regras que mudam conforme a operação: habilitação na Suframa e, para a indústria, projeto técnico-econômico aprovado; suspensão na importação, alíquota zero em certas operações e créditos presumidos de IBS e CBS (arts. 442 a 455). Sem esses dados da empresa e da operação o resultado seria um palpite, então o InTAX não a calcula. A devolução personalizada (cashback) é paga a pessoas físicas de famílias de baixa renda do CadÚnico, pela União (CBS) e pelos entes (IBS), com base em percentuais do tributo do consumo documentado no CPF (arts. 112, 113, 117 e 118): é um repasse ao consumidor e não muda o IBS e a CBS que a empresa apura. Nos fornecimentos de energia, água, esgoto, gás canalizado e telecomunicações a devolução é concedida no momento da cobrança (art. 116, §1º), efeito no caixa do fornecedor que o regulamento disciplina e que o InTAX também não modela.",
      f: "LC 214/2025, arts. 112, 113, 116 a 118 e 439 a 455.",
    },
    {
      p: "Quais operações têm redução de 60% e onde está a regra?",
      r: "O art. 128 da LC 214 reduz em 60% as alíquotas de IBS e CBS nas operações com: serviços de educação; serviços de saúde; dispositivos médicos; dispositivos de acessibilidade; medicamentos; alimentos para consumo humano; produtos de higiene pessoal e limpeza consumidos majoritariamente por famílias de baixa renda; produtos agropecuários, aquícolas, pesqueiros, florestais e extrativistas vegetais in natura; insumos agropecuários e aquícolas; produções nacionais artísticas, culturais, de eventos, jornalísticas e audiovisuais; comunicação institucional; atividades desportivas; e bens e serviços relacionados à soberania e à segurança nacional. Cada item tem regras próprias nos artigos seguintes: medicamentos nos arts. 133 e 146 (alíquota zero para os destinados a doenças raras e a outras hipóteses), produtos in natura no art. 137, insumos agropecuários no art. 138 e bares e restaurantes no art. 275 (redução de 40%, sem crédito para o adquirente, art. 276).",
      f: "LC 214/2025, arts. 128, 133, 137, 138, 146, 275 e 276.",
    },
    {
      p: "A redução de 60% dos insumos agropecuários vale para qualquer item do Anexo IX?",
      r: "Não. Vale só para os produtos do Anexo IX, com as classificações de NCM/SH e NBS ali indicadas, que, quando exigido, estejam registrados como insumos agropecuários ou aquícolas no órgão competente do Ministério da Agricultura e Pecuária. Estar na NCM do anexo é necessário, mas não suficiente: confira também o texto do item e o registro do produto.",
      f: "LC 214/2025, art. 138, caput e §1º.",
    },
    {
      p: "O que mudou na tabela oficial de cClassTrib?",
      r: "Em 01/10/2026 a tabela oficial (Informe Técnico 2025.002, versão 1.70) passou a ter 173 classes, 170 vigentes em 28/10/2026, cada uma com o percentual de redução de IBS e de CBS. Entre as novas estão códigos para operações realizadas por autônomos (000006, 200055 e 200056), bagagens de viajantes e remessas internacionais (400003 e 400004) e regimes aduaneiros (550026 a 550029). O catálogo do InTAX foi alinhado a essa versão em 29/10/2026 (percentuais corrigidos e 9 classes novas). Os catálogos são parametrizáveis: compare-os com o Portal da Conformidade Fácil a cada atualização oficial e confira códigos e percentuais antes de confiar na redução de cada classe.",
      f: "Portal da Conformidade Fácil (SVRS), tabela de Classificação Tributária, consulta de 28/10/2026.",
    },
    {
      p: "Como fica a base de cálculo do IBS e da CBS até 2032?",
      r: "De 1º/1/2026 a 31/12/2032 o ICMS, o ISS, o PIS e a Cofins incidentes na operação não integram a base de cálculo do IBS e da CBS (também ficam de fora o IBS e a CBS da própria operação, o IPI e os descontos incondicionais). O valor da operação já traz esses tributos embutidos, então o motor (versão 1.4.0) tira da base a parte que ainda é cobrada no ano: o PIS/Cofins some em 2027, e o ICMS e o ISS caem de 2029 a 2032. Exemplo: uma venda de R$ 1.000 com ICMS de 18% tem base de R$ 820 em 2027, e o IBS/CBS de 2027 (CBS de 11,2% e IBS de 0,1%) é R$ 92,66, não R$ 113,00. A partir de 2033 a base é o valor da operação. Antes da versão 1.4.0 o InTAX aplicava as alíquotas sobre o valor inteiro e superestimava o IBS/CBS desses anos; simulações salvas antes disso guardam o resultado da época.",
      f: "LC 214/2025, art. 12, §2º, I a V.",
    },
    {
      p: "Como funciona o crédito presumido do transportador autônomo de carga?",
      r: "Quem contrata frete de transportador autônomo pessoa física que não é contribuinte (ou MEI) e está no regime regular apropria um crédito presumido de IBS e de CBS, desde que suporte a cobrança do frete: se o frete está embutido no preço da mercadoria comprada, ainda que destacado na nota, não há crédito. O crédito é o valor pago ao autônomo × C ÷ (1 + C), em que C é o percentual definido todo ano, até setembro, em ato conjunto do Ministro da Fazenda e do CGIBS, para valer em 1º de janeiro seguinte (com IBS e CBS juntos, o divisor leva a soma dos dois percentuais, porque a lei tem um só valor líquido). Não localizamos em fonte oficial o ato com o percentual de 2027: no InTAX você informa o percentual na operação (crédito presumido código 02) e o resultado fica marcado como estimativa. O crédito só compensa o tributo devido, não pode ser ressarcido, e é apropriado à medida que os pagamentos ao autônomo são confirmados. No CT-e, o tomador informa a apropriação por evento (tipo 211110).",
      f: "LC 214/2025, art. 169; Decreto 12.955/2026, arts. 250 a 255; Portal Nacional do CT-e, NT 2026.004 (evento 211110).",
    },
    {
      p: "Quais são os créditos presumidos do catálogo oficial e como o InTAX os calcula?",
      r: "O catálogo oficial de cCredPres (Portal da Conformidade Fácil) tem quatro códigos: 1, produtor rural não contribuinte (art. 168); 2, frete de transportador autônomo (art. 169); 3, resíduos para reciclagem (art. 170); 4, bem móvel usado de pessoa física para revenda (art. 171). Nos códigos 1 e 2 o crédito é valor × C ÷ (1 + C), com C do ato conjunto anual (ainda pendente para 2027); com IBS e CBS juntos, C é a soma dos dois percentuais. No 3 o percentual está na lei (CBS de 7%; IBS de 1,3% em 2029, 2,6% em 2030, 3,9% em 2031, 5,2% em 2032 e 13% de 2033 em diante) e no 4 é a alíquota de IBS e de CBS do próprio bem. Só o do produtor rural admite ressarcimento. A compra com crédito presumido não gera também o crédito normal de IBS/CBS, e o XML traz o código com dois dígitos (02).",
      f: "LC 214/2025, arts. 168 a 171; Decreto 12.955/2026, arts. 247, 253 e 254; Portal da Conformidade Fácil (SVRS), Tabela Crédito Presumido, conferida em 29/10/2026.",
    },
    {
      p: "O frete de carga tem alíquota reduzida? Qual é o local da operação?",
      r: "Não encontramos redução específica para o frete de carga: o capítulo do transporte (arts. 285 a 287) reduz em 40% o transporte coletivo de passageiros rodoviário, ferroviário e hidroviário intermunicipal e interestadual e o aéreo regional de passageiros ou de carga, e zera o urbano ferroviário e hidroviário. O fato gerador do transporte é o início da prestação (art. 10, §1º, I), e o local da operação do frete de carga é o da entrega ao destinatário que consta do documento fiscal (art. 11, VII). Para o transporte de bens a zonas de processamento de exportação há a classe 200001 no catálogo de cClassTrib. No InTAX o CT-e é lido pelo importador de XML, e o que não tem XML entra por planilha.",
      f: "LC 214/2025, arts. 10 (§1º, I), 11 (VII) e 285 a 287; Portal da Conformidade Fácil (SVRS), tabela de Classificação Tributária.",
    },
    {
      p: "Como a transportadora do Simples é tributada?",
      r: "Pela LC 123, art. 18, §5º-E, o transporte interestadual e intermunicipal de cargas no Simples é tributado pelo Anexo III, sem a parcela correspondente ao ISS e com a parcela do ICMS prevista no Anexo I. O comparador Simples × Híbrido do InTAX ainda não faz essa composição (as tabelas de 2027 que ele usa trazem só a repartição de IBS e CBS de cada Anexo): para transportadora, use-o só como ordem de grandeza e confirme com o especialista. A opção pelo regime regular do IBS/CBS para o primeiro semestre de 2027 vai até 30/10/2026.",
      f: "LC 123/2006, art. 18, §5º-E; Receita Federal, notícia “Simples Nacional 2027” (Resolução CGSN nº 194/2026).",
    },
    {
      p: "O InTAX já reflete todas essas atualizações?",
      r: "Parcialmente. As alíquotas por ano e as reduções vêm da tela Transição e dos catálogos, que a equipe precisa manter atualizados: os campos Fonte, Observação e Status mostram a origem de cada número, e o InTAX não busca valores sozinho. Em 29/10/2026 a tela Transição (2026 informativo e CBS de 2027 e 2028 pelo cálculo do TCU) e o catálogo de cClassTrib (tabela v1.70) foram atualizados, e o motor (versão 1.4.0) calcula a base do IBS/CBS sem o ICMS, o ISS, o PIS e a Cofins de 2026 a 2032, o redutor de compras governamentais, o regime específico dos combustíveis (alíquota por litro), o Imposto Seletivo pela alíquota informada na operação, os quatro créditos presumidos do catálogo oficial (produtor rural, transportador autônomo, resíduos e bem usado) e o crédito presumido de estoque (ferramenta própria); de 2029 a 2033 o InTAX trabalha com cenários de alíquotas. O importador de XML lê NF-e, NFC-e e CT-e, e a importação por planilha cobre o que não tem XML. Continuam fora do cálculo a Zona Franca de Manaus, a devolução personalizada, as alíquotas específicas do IS, o IBS por litro dos combustíveis de 2029 em diante (ainda não divulgado), os percentuais do crédito presumido do produtor rural e do transportador autônomo (o ato conjunto de 2027 não foi localizado), o transporte de cargas no comparador do Simples e a regra de elegibilidade do crédito por tipo de compra (hoje o percentual de crédito elegível é informado na operação). A Base legal guarda o texto das normas e o Radar da Reforma lista as novidades da semana, mas nenhum dos dois altera o cálculo sozinho.",
    },
    {
      p: "Onde acompanhar os atos oficiais?",
      r: "Planalto: leis complementares, decretos e o texto compilado da LC 214. TCU: página da reforma tributária e cálculo das alíquotas de referência (sites.tcu.gov.br/reforma-tributaria). Agência Senado e Agência Câmara: resoluções e projetos. Comitê Gestor do IBS: resoluções, portarias conjuntas e o Regulamento do IBS (cgibs.gov.br). Receita Federal: regulamento da CBS, atos conjuntos e Simples Nacional. Portal da Conformidade Fácil: tabelas de classificação tributária e de crédito presumido (dfe-portal.svrs.rs.gov.br/CFF). Portal Nacional da NF-e: notas técnicas.",
    },
  ],
};

export const SECAO_IMPORTACAO_XML = {
  titulo: "Importação de XML (NF-e, CT-e) e de planilhas",
  nota: "Transforma notas fiscais eletrônicas (NF-e, NFC-e e CT-e) e planilhas em operações do simulador, com validação item a item e confirmação sua antes de gravar.",
  itens: [
    {
      p: "Para que serve a Importação de XML?",
      r: "Lê as notas fiscais eletrônicas da empresa, valida cada item e, depois da sua confirmação, transforma os itens aprovados em operações do simulador, trazendo do XML valores, NCM, CFOP, cClassTrib, CST, cCredPres e os percentuais de IBS e CBS informados na nota.",
    },
    {
      p: "O InTAX lê CT-e?",
      r: "Sim: o CT-e (modelo 57) e o CT-e OS (modelo 67) são lidos como um item de serviço por documento. A empresa emitente (a transportadora) entra como saída e a empresa tomadora do serviço, como entrada, se as duas estiverem cadastradas no grupo. O sistema lê o valor da prestação, o ICMS (percentual efetivo = ICMS ÷ valor), as UFs de início e de fim (a de fim é o local da entrega), o CFOP e, quando o documento traz, o grupo de IBS e CBS (CST e cClassTrib; sem ele, assume a tributação integral 000001, com alerta). O CT-e não traz PIS e Cofins: o InTAX os presume pelo regime da empresa (Presumido 0,65% e 3%; Real 1,65% e 7,6%; Simples zero), com alerta, e você ajusta na operação. O crédito presumido do transportador autônomo não vem no CT-e: o tomador o informa por evento (tipo 211110), que o InTAX aplica aos itens de entrada do mesmo CT-e ainda não confirmados. O cancelamento por evento também é reconhecido. MDF-e e NFS-e são reconhecidos, mas não têm extração: para eles use a importação por planilha.",
      f: "Portal Nacional do CT-e: pacote de schemas PL_CTe_400_NT2026.004 RTC_1.00 e Notas Técnicas 2025.001, 2026.002 e 2026.004.",
    },
    {
      p: "Como importo operações por planilha?",
      r: "Na empresa, abra Importar planilha (no grupo, a mesma tela aceita a coluna Empresa). Baixe o modelo ou envie a sua planilha em .xlsx ou .csv, com até 50 mil linhas e o cabeçalho na primeira linha. Você indica qual coluna é cada campo (o InTAX sugere pelo nome), escolhe as opções (empresa e direção para todas as linhas, unidade dos percentuais, preenchimento pela tabela da legislação do PIS e da Cofins das vendas e do ICMS interestadual, e crédito elegível das compras) e confere o resultado: o sistema mostra as linhas com erro e como as primeiras foram lidas, e só grava depois do seu clique. Enviar a mesma planilha de novo não duplica nada: a linha igual à já importada é ignorada, e a linha em que você corrigiu valor, data, descrição, documento, CFOP, NCM/NBS, UF ou quantidade entra como nova (apague a antiga em Operações). Percentual ou classificação corrigidos numa linha já importada não alteram a operação gravada, e a conferência avisa: edite a operação ou apague a antiga e importe de novo. Com uma empresa escolhida para todas as linhas, a coluna Empresa da planilha não é lida. Os percentuais vão em pontos (18 é 18%); célula formatada como percentual no Excel (1,65%) é lida certa nas duas unidades. O ICMS interno e o ISS você informa, porque dependem da UF e do município.",
    },
    {
      p: "Como envio ao cliente a lista do que preciso receber para cada serviço?",
      r: "Em Serviços e análises, cada um dos cinco serviços (Diagnóstico tributário, Validação de cadastro, Saneamento de estoques, Classificação de serviços e Validação de NFS-e) tem o botão Lista de solicitações (Excel). Ele abre uma janela para a data-base, a data de envio e o responsável e o contato da FAL (o nome e o contato ficam guardados neste navegador) e baixa um Excel com a logo da FAL Agro, os dados da empresa na Capa e os documentos que aquele serviço precisa. Cada linha é um documento (arquivo, relatório, extração do ERP, contrato ou comprovante), com o formato esperado, a prioridade (Alta, Média ou Baixa) e o prazo calculado a partir da data de envio (7, 14 ou 21 dias, que podem ser ajustados na Capa). As colunas de uma planilha, como o NCM e o código do produto, aparecem no detalhe do documento e não como linhas. O cliente atualiza Situação, Entregue em e Observações, e o painel de Andamento da Capa mostra o total, o percentual concluído e os itens em atraso. Mudando a data-base na Capa, os textos com o período e o ano se ajustam sozinhos. O arquivo é gerado no navegador e nada é gravado no sistema.",
    },
    {
      p: "Quais são os limites de um lote?",
      r: "Até 5.000 arquivos por lote, 2 MB por arquivo XML e 500 itens por nota. O sistema recusa arquivos que não sejam .xml ou que passem desses limites.",
    },
    {
      p: "O que o sistema valida em cada item?",
      r: "Quatro camadas. Documental: XML bem formado, tipo de documento reconhecido, chave de acesso válida, protocolo, cStat, ambiente, cancelamento e data de emissão. Cadastral: empresa localizada, CNPJ cruzado, NCM e NBS, CFOP, UFs, descrição e valor. Tributária: CST, cClassTrib e cCredPres nos catálogos e dentro da vigência, grupo RTC e comparação do cClassTrib com o que os anexos da LC 214 indicam para o NCM. Operacional: perspectiva já importada no histórico e quantidade negativa. A tela de validação do item mostra, por camada, o código e a mensagem de cada verificação.",
    },
    {
      p: "O que é perspectiva e por que uma nota pode gerar mais de uma linha?",
      r: "Uma mesma nota pode ser importada pelo lado do emitente (saída) e pelo lado do destinatário (entrada), quando as duas empresas estão cadastradas no grupo. Cada perspectiva é importada uma única vez: o histórico impede a reimportação.",
    },
    {
      p: "Que resultados um item pode ter?",
      r: "Importável, importável com alerta, bloqueado, cancelado ou duplicado. Só os itens importáveis, com ou sem alerta, podem ser confirmados.",
    },
    {
      p: "Como confirmo a importação?",
      r: "Marque os itens importáveis e confirme. O sistema cria as operações, grava o histórico de importação e marca os itens como confirmados. Itens bloqueados, cancelados ou duplicados não entram, e a duplicidade é conferida de novo na confirmação.",
    },
    {
      p: "Posso importar a mesma nota duas vezes?",
      r: "Não. Arquivos repetidos (mesmo conteúdo ou mesma chave de acesso) são marcados como duplicados e, para cada nota, cada perspectiva só entra uma vez no histórico.",
    },
    {
      p: "O que fazer quando um lote termina com falhas?",
      r: "Use Reprocessar na tela do lote. Ele retoma só o que ficou pendente ou falhou, sem reenviar os arquivos que já foram concluídos e sem duplicar itens ou operações.",
    },
  ],
};

export const SECAO_FERRAMENTAS = {
  titulo: "Ferramentas abertas e consultas",
  nota: "Calculadora, Simples × Híbrido, Consulta NCM e Validador de cadastro ficam abertos, sem login, e servem para uma primeira leitura. O diagnóstico completo usa as notas reais da empresa.",
  itens: [
    {
      p: "Como a Calculadora estima a carga?",
      r: "Usa o mesmo motor do simulador sobre duas operações sintéticas, vendas e compras, com as alíquotas e os fatores de transição cadastrados na tela Transição. A alíquota atual média por regime e a redução por perfil são premissas do segmento, marcadas para validação pelo especialista tributário. O resultado é uma ordem de grandeza e nunca promessa de economia.",
    },
    {
      p: "Para que serve a ferramenta Crédito presumido de estoque?",
      r: "É uma ferramenta de uso interno (menu Consultas e cálculos) para o crédito presumido de CBS sobre o estoque de 31/12/2026. Você informa o regime da empresa, o mês de apropriação (janeiro a junho de 2027) e os grupos de estoque do inventário, cada um com origem, custo de aquisição, hipótese do art. 381 e destino do bem. A ferramenta confere cada item contra a lei, mostra o motivo de cada exclusão, soma o crédito, monta as 12 parcelas e a data em que o direito de usar vence, e permite baixar o cronograma em CSV. O rascunho fica guardado só neste navegador. É estimativa gerencial: valide com o especialista tributário antes de apropriar.",
      f: "LC 214/2025, arts. 381 a 383; Decreto nº 12.955/2026, arts. 605 a 609.",
    },
    {
      p: "O que compara o Simples × Híbrido?",
      r: "Compara ficar no Simples puro com optar pelo regime regular de IBS e CBS mantendo o DAS, e mostra o preço em que as duas opções empatam. Se você informar as compras mensais de fornecedores do regime regular, o híbrido abate o IBS e a CBS dessas compras (alíquota regular × valor; a compra de fornecedor do Simples dá um crédito menor, só o que entrou no DAS dele, e não entra na conta). As tabelas de 2027 e 2028 (alíquotas, parcelas a deduzir e repartição de CBS e IBS dos Anexos I a V) vêm dos Anexos XVIII a XXII da LC 214, na redação da LC 227/2026. Ainda não faz a composição do transporte intermunicipal e interestadual de cargas (Anexo III sem o ISS e com o ICMS do Anexo I, LC 123, art. 18, §5º-E). A alíquota de CBS do regime regular é editável na tela, porque ainda depende da resolução do Senado.",
      f: "LC 214/2025, Anexos XVIII a XXII e art. 47; LC 123/2006, arts. 13 (§9º) e 18 (§5º-E).",
    },
    {
      p: "Como a Consulta NCM mostra o tratamento de um produto?",
      r: "Mostra se o NCM aparece nos anexos da LC 214 já mapeados (alíquota zero, redução ou regra geral) e confere o código na tabela oficial vigente do Siscomex. Estar em um anexo é condição necessária, mas não suficiente: o texto do item e os requisitos, como o registro no órgão competente, também valem.",
    },
    {
      p: "O que o Validador de cadastro faz?",
      r: "Lê a planilha de produtos do ERP e aponta NCM inválido, produto sem classificação e benefício possivelmente perdido. Na versão aberta a análise cobre uma amostra de até 300 produtos e mostra o resumo; o detalhe completo é liberado depois do cadastro do contato.",
    },
    {
      p: "Para que serve a Classificação de serviços?",
      r: "Correlaciona item da LC 116, NBS, indicador de operação e cClassTrib, a partir da tabela oficial do Anexo VIII do RTC (Receita Federal e Comitê Gestor da NFS-e). Ajuda a achar o cClassTrib de um serviço e a converter entre LC 116 e NBS.",
    },
    {
      p: "O que o Validador de NFS-e confere?",
      r: "Valida a estrutura de um XML de DPS ou NFS-e do Padrão Nacional em três camadas: estrutura (XML bem formado e raiz reconhecida), prontidão para autorização (campos obrigatórios do grupo IBS/CBS no formato exigido pelo XSD oficial) e conformidade tributária (cruzamento com o catálogo do InTAX, que é inferência e só gera aviso, nunca erro bloqueante). O XML enviado não é gravado. Não substitui o validador oficial do Portal Nacional da NFS-e.",
    },
  ],
};

export const SECAO_BASE_LEGAL = {
  titulo: "Base legal, Radar e Saneamento de estoques",
  nota: "Módulos de apoio: texto das normas, acompanhamento semanal e limpeza do cadastro de itens.",
  itens: [
    {
      p: "O que é a Base legal?",
      r: "É o texto integral das normas da Reforma, dividido por artigo e anexo e capturado de fonte oficial (Planalto): EC 132/2023, LC 214/2025 compilada, LC 227/2026, LC 235/2026, Decreto 12.955/2026, Constituição (com o ADCT), LC 123, LC 87, LC 116, LC 225 e LC 236, CTN e Lei 5.764/1971. Cada dispositivo guarda as versões anteriores quando o texto oficial muda.",
    },
    {
      p: "Como a Base legal se mantém atualizada?",
      r: "Depois de cada Radar e toda segunda-feira o sistema confere se o texto oficial mudou e se há norma nova citada. Qualquer diferença vira um aviso para o administrador; nada entra na base sem aprovação humana.",
    },
    {
      p: "O assistente da Base legal pode errar?",
      r: "Ele responde somente com o texto das normas carregadas, cita o dispositivo e valida a citação; quando o texto carregado não basta, ele avisa. As perguntas ficam registradas para revisão da equipe. Continua sendo apoio, não parecer: confirme no texto do dispositivo.",
    },
    {
      p: "O que a Base legal ainda não tem?",
      r: "Resoluções e portarias do Comitê Gestor do IBS, como o Regulamento do IBS (Resolução CGIBS nº 6/2026), e atos da Receita Federal ainda não estão na Base legal, porque a fonte não é o Planalto. Consulte-os nos sites oficiais.",
    },
    {
      p: "O que é o Radar da Reforma?",
      r: "É um resumo semanal das novidades da Reforma, gerado com busca na web e organizado em fonte, categoria, resumo, impacto, prazo, ação recomendada e prioridade. Quando um dado não é confirmado, o campo vem como “A confirmar”. O Radar não altera o cálculo e não substitui a leitura do ato oficial: confira sempre na fonte antes de agir. A newsletter só sai com aprovação humana.",
    },
    {
      p: "Como funciona o Saneamento de estoques?",
      r: "É um passo a passo por empresa: triagem da base, checagens por grupo de itens, decisões e, ao final, relatório e política de uso. Decisões, tarefas e revisão fiscal ficam vinculadas ao código do item.",
    },
    {
      p: "Por que o inventário de 31/12/2026 importa para o saneamento?",
      r: "Quem pretende apropriar o crédito presumido de CBS sobre o estoque precisa de inventário em 31 de dezembro de 2026, com documentação fiscal idônea para todos os itens. Um cadastro saneado, com NCM, descrição e unidade corretos, facilita comprovar o estoque.",
      f: "Decreto nº 12.955/2026, arts. 606 e 608.",
    },
  ],
};

/** Itens que entram no fim de seções que já existiam (chave = título da seção). */
export const ITENS_EXTRAS = {
  "Transição 2026–2033": [
    {
      p: "Como preencher o ano de 2026?",
      r: "Como ano de teste: IBS 0,1% e CBS 0,9%, com Caráter Informativo e Efeito financeiro 0, porque a lei compensa o valor com PIS e Cofins ou dispensa o recolhimento de quem cumpre as obrigações acessórias. Os fatores de PIS/Cofins, IPI, ICMS e ISS ficam em 1. Desde 29/10/2026 o InTAX já traz 2026 assim.",
      f: "LC 214/2025, arts. 343, 346 e 348; Constituição, ADCT, art. 125.",
    },
    {
      p: "Como preencher a CBS de 2027 e 2028?",
      r: "A CBS efetiva do ano é a alíquota fixada menos 0,1 ponto percentual. Informe o valor já descontado, registre na coluna Fonte a origem (por exemplo, “TCU em 28/10/2026: 11,3% menos 0,1 p.p.”) e deixe o Status como Estimativa até a resolução do Senado. O IBS desses dois anos é de 0,05% estadual mais 0,05% municipal. Desde 29/10/2026 o InTAX já traz 11,2% de CBS nesses dois anos, como estimativa do TCU.",
      f: "LC 214/2025, arts. 344 e 347.",
    },
    {
      p: "Como preencher IBS e CBS de 2029 a 2033?",
      r: "Ainda não existem alíquotas de referência oficiais para esses anos: o Senado fixa cada uma no ano anterior. Use uma premissa explícita, como a estimativa do Comitê Gestor para o IBS, registre-a na Fonte e na Observação e marque o Status como Estimativa. De 2029 a 2032 o InTAX usa uma fração da alíquota de referência do IBS que complementa a redução de ICMS e ISS (1/10, 2/10, 3/10 e 4/10); confira a premissa na Observação de cada ano. Lembre que uma soma de referência acima de 26,5% em 2033 aciona a revisão prevista no art. 475.",
      f: "LC 214/2025, arts. 349 e 475; Constituição, ADCT, art. 128.",
    },
    {
      p: "Como registrar a fonte e o status de cada ano?",
      r: "Use os campos Fonte (ato e dispositivo, com a data), Status (Oficial ou Estimativa) e Observação (a premissa, por exemplo a divisão entre estado e município). Isso mostra, para quem lê o resultado, quais números são lei e quais são hipótese.",
    },
  ],
  "Painel Executivo": [
    {
      p: "O que faz o botão Salvar simulação?",
      r: "Grava uma cópia imutável da entrada e do resultado da rodada de cálculo, com a versão do motor e das regras. Serve para provar depois com quais premissas um número foi produzido; as simulações salvas aparecem na lista do Painel.",
    },
    {
      p: "O que faz o botão Exportar PDF?",
      r: "Gera um relatório do Painel em PDF, com os indicadores e a projeção da transição de 2026 a 2033.",
    },
    {
      p: "O que é o quadro “Classificação: como no XML × conforme a LC 214”?",
      r: "Para as operações importadas de XML, compara o cClassTrib informado na nota com o que os anexos da LC 214 indicam para o NCM e mostra o efeito no resultado se a lei fosse aplicada. É orientativo: só considera NCMs que apontam uma única classe nos anexos mapeados e não substitui a classificação fiscal do contribuinte.",
    },
    {
      p: "Por que o Painel traz uma ressalva sobre o crédito presumido?",
      r: "Porque os percentuais do crédito presumido do produtor rural e do transportador autônomo são definidos e divulgados todos os anos, até setembro, por ato conjunto do Ministro da Fazenda e do Comitê Gestor do IBS, com vigência em 1º de janeiro seguinte. Enquanto não confirmados, o valor é estimativa e pode não corresponder ao real.",
      f: "LC 214/2025, arts. 168 (§4º) e 169 (§4º).",
    },
  ],
  "Catálogos fiscais": [
    {
      p: "Como atualizo o catálogo de cClassTrib?",
      r: "Compare com a tabela oficial do Portal da Conformidade Fácil, inclua os códigos novos e confira o percentual de redução de IBS e de CBS de cada classe. As classes de não incidência, imunidade, isenção e suspensão podem estar gravadas com redução de 100% (tributo zero), enquanto a tabela oficial traz redução 0% e indica que o tributo não é exigido; no cálculo o resultado é o mesmo. Registre a data e a versão do informe técnico usado.",
      f: "Portal da Conformidade Fácil (SVRS), tabela de Classificação Tributária.",
    },
  ],
};
