/**
 * Primeiro lote de perguntas frequentes (rascunhos para revisão do especialista).
 * Cada trecho é conferido, palavra por palavra, contra o texto carregado na Base legal
 * antes de gravar (ver `cartoes.service`). Nada aparece para os consultores antes de ser revisado.
 */
export type CartaoInicial = {
  tema: string;
  pergunta: string;
  sinonimos: string;
  resposta: string;
  ressalvas?: string;
  fundamentos: { norma: string; caminho: string; trecho: string }[];
};

const LC214 = 'lcp-214-2025';

export const CARTOES_INICIAIS: CartaoInicial[] = [
  {
    tema: 'Produtor rural',
    pergunta: 'Qual o limite de receita para o produtor rural não ser contribuinte do IBS e da CBS?',
    sinonimos: 'agricultor teto faturamento limite não contribuinte fora do IBS CBS 3,6 milhões produtor integrado',
    resposta:
      'O produtor rural, pessoa física ou jurídica, que tiver receita inferior a R$ 3.600.000,00 no ano-calendário, e o produtor rural integrado, não são considerados contribuintes do IBS e da CBS. Esse valor é atualizado anualmente pela variação do IPCA.',
    fundamentos: [
      { norma: LC214, caminho: 'art-164', trecho: 'auferir receita inferior a R$ 3.600.000,00 (três milhões e seiscentos mil reais) no ano-calendário' },
      { norma: LC214, caminho: 'art-167', trecho: 'será atualizado anualmente com base na variação do IPCA' },
    ],
  },
  {
    tema: 'Produtor rural',
    pergunta: 'O que acontece se o produtor rural ultrapassar o limite de receita durante o ano?',
    sinonimos: 'excesso limite passou do teto vira contribuinte desenquadramento 20% mês seguinte',
    resposta:
      'Se, durante o ano-calendário, o produtor exceder o limite, ele passa a ser contribuinte a partir do segundo mês subsequente ao do excesso. Se o excesso não for superior a 20% do limite, esses efeitos só ocorrem no ano-calendário seguinte.',
    fundamentos: [
      { norma: LC214, caminho: 'art-164', trecho: 'passará a ser contribuinte a partir do segundo mês subsequente à ocorrência do excesso' },
      { norma: LC214, caminho: 'art-164', trecho: 'não seja superior a 20% (vinte por cento) do limite' },
    ],
  },
  {
    tema: 'Produtor rural',
    pergunta: 'Como se aplica o limite de receita ao produtor rural que iniciou a atividade no meio do ano?',
    sinonimos: 'início de atividade proporcional meses limite produtor novo abriu durante o ano',
    resposta:
      'No início de atividade, o limite é proporcional ao número de meses em que o produtor exerceu atividade, contando frações de mês como mês inteiro.',
    fundamentos: [{ norma: LC214, caminho: 'art-164', trecho: 'será proporcional ao número de meses em que o produtor houver exercido atividade' }],
  },
  {
    tema: 'Produtor rural',
    pergunta: 'O produtor rural que participa de outra empresa agropecuária soma as receitas para o limite?',
    sinonimos: 'participação societária grupo soma receitas sócio holding várias empresas limite 3,6 milhões',
    resposta:
      'Sim. Se o produtor rural, pessoa física ou jurídica, tiver participação societária em outra pessoa jurídica que desenvolva atividade agropecuária, o limite é verificado sobre a soma das receitas de todas essas pessoas no ano-calendário.',
    fundamentos: [{ norma: LC214, caminho: 'art-164', trecho: 'o limite previsto no caput deste artigo será verificado em relação à soma das receitas auferidas no ano-calendário por todas essas pessoas' }],
  },
  {
    tema: 'Produtor rural',
    pergunta: 'Associações e cooperativas de produtores rurais também ficam fora do IBS e da CBS?',
    sinonimos: 'cooperativa associação produtores pessoa jurídica não contribuinte limite receita cooperados',
    resposta:
      'A associação ou cooperativa de produtores rurais é considerada pessoa jurídica para o limite, e fica abrangida quando sua receita é inferior a R$ 3.600.000,00 no ano-calendário e é integrada exclusivamente por produtores rurais pessoas físicas cuja receita também seja inferior a esse valor.',
    fundamentos: [
      { norma: LC214, caminho: 'art-164', trecho: 'considera-se pessoa jurídica inclusive a associação ou cooperativa de produtores rurais' },
      { norma: LC214, caminho: 'art-164', trecho: 'seja integrada exclusivamente por produtores rurais pessoas físicas' },
    ],
  },
  {
    tema: 'Produtor rural',
    pergunta: 'O produtor rural pode optar por ser contribuinte do IBS e da CBS mesmo estando abaixo do limite?',
    sinonimos: 'opção contribuinte regime regular inscrever irretratável renúncia produtor abaixo do limite',
    resposta:
      'Sim. O produtor rural ou o produtor rural integrado pode optar, a qualquer tempo, por se inscrever como contribuinte no regime regular. Os efeitos começam no primeiro dia do mês seguinte ao pedido, e a opção é irretratável para todo o ano-calendário. A renúncia é possível na forma do regulamento e produz efeito a partir do primeiro dia do ano seguinte.',
    fundamentos: [
      { norma: LC214, caminho: 'art-165', trecho: 'poderão optar, a qualquer tempo, por se inscrever como contribuinte do IBS e da CBS no regime regular' },
      { norma: LC214, caminho: 'art-165', trecho: 'será irretratável para todo o ano-calendário' },
      { norma: LC214, caminho: 'art-166', trecho: 'a partir do primeiro dia do ano-calendário seguinte à renúncia da opção' },
    ],
  },
  {
    tema: 'Produtor rural',
    pergunta: 'Quem compra de produtor rural não contribuinte pode aproveitar crédito?',
    sinonimos: 'crédito presumido compra produtor rural pessoa física fornecedor não contribuinte indústria cooperativa adquirente',
    resposta:
      'Sim, mas como crédito presumido. O contribuinte do regime regular pode apropriar créditos presumidos de IBS e CBS nas aquisições de produtor rural (ou produtor integrado) não contribuinte. O documento fiscal da aquisição deve discriminar o valor da operação, o valor do crédito presumido e o valor líquido.',
    fundamentos: [
      { norma: LC214, caminho: 'art-168', trecho: 'poderá apropriar créditos presumidos dos referidos tributos relativos às aquisições de bens e serviços de produtor rural' },
      { norma: LC214, caminho: 'art-168', trecho: 'o valor do crédito presumido' },
    ],
  },
  {
    tema: 'Créditos',
    pergunta: 'Quando e sobre o que o contribuinte pode apropriar créditos de IBS e CBS?',
    sinonimos: 'crédito amplo apropriação aquisições uso e consumo pessoal documento fiscal regime regular não cumulatividade',
    resposta:
      'O contribuinte do regime regular pode apropriar créditos do IBS e da CBS quando ocorre a extinção do débito relativo às operações em que é adquirente, exceto as de uso ou consumo pessoal e as demais hipóteses vedadas na lei. A apropriação é feita separadamente para IBS e para CBS (sem compensar um com o outro) e depende de documento fiscal eletrônico idôneo.',
    fundamentos: [
      { norma: LC214, caminho: 'art-47', trecho: 'excetuadas exclusivamente aquelas consideradas de uso ou consumo pessoal' },
      { norma: LC214, caminho: 'art-47', trecho: 'vedadas, em qualquer hipótese, a compensação de créditos de IBS com valores devidos de CBS' },
      { norma: LC214, caminho: 'art-47', trecho: 'está condicionada à comprovação da operação por meio de documento fiscal eletrônico idôneo' },
    ],
  },
  {
    tema: 'Créditos',
    pergunta: 'Comprar de fornecedor do Simples Nacional gera crédito de IBS e CBS?',
    sinonimos: 'simples nacional fornecedor optante crédito aquisição compra empresa do simples',
    resposta: 'Sim. A regra de apropriação de créditos se aplica, inclusive, às aquisições de bem ou serviço fornecido por optante pelo Simples Nacional.',
    ressalvas: 'O valor do crédito segue as regras do próprio Simples e da LC 123; confirme o cálculo antes de projetar economia.',
    fundamentos: [{ norma: LC214, caminho: 'art-47', trecho: 'aplica-se, inclusive, nas aquisições de bem ou serviço fornecido por optante pelo Simples Nacional' }],
  },
  {
    tema: 'Split payment',
    pergunta: 'O que é o split payment e quem recolhe o IBS e a CBS nele?',
    sinonimos: 'split payment segregação recolhimento pagamento liquidação financeira instituição de pagamento cartão pix retenção',
    resposta:
      'No split payment, os prestadores de serviço de pagamento eletrônico e as instituições operadoras de sistemas de pagamento segregam e recolhem o IBS e a CBS ao Comitê Gestor do IBS e à RFB no momento da liquidação financeira da transação. Há o procedimento padrão e o procedimento simplificado, que é opcional e usa um percentual preestabelecido do valor das operações.',
    fundamentos: [
      { norma: LC214, caminho: 'art-31', trecho: 'no momento da liquidação financeira da transação (split payment)' },
      { norma: LC214, caminho: 'art-33', trecho: 'O procedimento simplificado do split payment será opcional' },
    ],
  },
  {
    tema: 'Split payment',
    pergunta: 'Como o split payment funciona em vendas parceladas e com antecipação de recebíveis?',
    sinonimos: 'parcelado parcelas antecipação recebíveis cartão de crédito split fornecedor liquidação',
    resposta:
      'Na venda parcelada pelo fornecedor, a segregação e o recolhimento são feitos de forma proporcional na liquidação de todas as parcelas. A antecipação de recebíveis não altera a obrigação de segregar e recolher. O split payment também não afasta a responsabilidade do sujeito passivo pelo eventual saldo a recolher.',
    fundamentos: [
      { norma: LC214, caminho: 'art-34', trecho: 'de forma proporcional, na liquidação financeira de todas as parcelas' },
      { norma: LC214, caminho: 'art-34', trecho: 'a liquidação antecipada de recebíveis não altera a obrigação de segregação e de recolhimento' },
    ],
  },
  {
    tema: 'Split payment',
    pergunta: 'Quando o split payment começa a funcionar?',
    sinonimos: 'implementação gradual início vigência split payment ato conjunto varejo facultativo',
    resposta:
      'A lei prevê implementação gradual, definida por ato conjunto do Comitê Gestor do IBS e da RFB, que também pode prever hipóteses em que a adoção será facultativa. O split payment deve entrar em funcionamento de forma simultânea, nas operações com adquirentes que não são contribuintes do regime regular, para os principais instrumentos de pagamento eletrônico do varejo.',
    ressalvas: 'As datas efetivas dependem dos atos conjuntos RFB/CGIBS; confira a versão vigente na Base legal e no Radar.',
    fundamentos: [
      { norma: LC214, caminho: 'art-35', trecho: 'estabelecerá a implementação gradual do split payment' },
      { norma: LC214, caminho: 'art-35', trecho: 'poderá prever hipóteses em que a adoção do split payment será facultativa' },
    ],
  },
  {
    tema: 'Local da operação',
    pergunta: 'Qual é o local da operação para definir a quem pertence o IBS na venda de mercadorias?',
    sinonimos: 'destino local da operação entrega disponibilização bem móvel material estado município venda interestadual',
    resposta:
      'Na operação com bem móvel material, considera-se local da operação o local da entrega ou disponibilização do bem ao destinatário. Para serviço prestado fisicamente sobre a pessoa ou fruído presencialmente, é o local da prestação; para transporte de carga, o local da entrega ou disponibilização constante no documento fiscal.',
    fundamentos: [
      { norma: LC214, caminho: 'art-11', trecho: 'bem móvel material, o local da entrega ou disponibilização do bem ao destinatário' },
      { norma: LC214, caminho: 'art-11', trecho: 'serviço de transporte de carga, o local da entrega ou disponibilização do bem ao destinatário constante no documento fiscal' },
    ],
  },
  {
    tema: 'Alíquotas reduzidas',
    pergunta: 'Quais produtos têm alíquota zero na Cesta Básica Nacional?',
    sinonimos: 'cesta básica alíquota zero alimentos anexo I NCM arroz feijão leite reduzidas a zero',
    resposta:
      'As alíquotas do IBS e da CBS ficam reduzidas a zero nas vendas de produtos destinados à alimentação humana relacionados no Anexo I da LC 214, com a respectiva classificação NCM/SH, que compõem a Cesta Básica Nacional de Alimentos. Para saber se um item específico está incluído, confira o NCM na lista do Anexo I.',
    fundamentos: [{ norma: LC214, caminho: 'art-125', trecho: 'Ficam reduzidas a zero as alíquotas do IBS e da CBS incidentes sobre as vendas de produtos destinados à alimentação humana relacionados no Anexo I' }],
  },
  {
    tema: 'Alíquotas reduzidas',
    pergunta: 'Quais operações têm redução de 60% nas alíquotas de IBS e CBS?',
    sinonimos: 'redução 60% medicamentos alimentos insumos agropecuários educação saúde produtos agropecuários in natura higiene',
    resposta:
      'A LC 214 reduz em 60% as alíquotas de IBS e CBS nas operações com, entre outros: serviços de educação, serviços de saúde, dispositivos médicos, medicamentos, alimentos destinados ao consumo humano, produtos agropecuários, aquícolas, pesqueiros, florestais e extrativistas vegetais in natura, e insumos agropecuários e aquícolas — desde que observadas as definições e demais disposições do Capítulo.',
    ressalvas: 'A lista completa e as condições estão no Art. 128; algumas categorias dependem dos anexos e do enquadramento por NCM.',
    fundamentos: [
      { norma: LC214, caminho: 'art-128', trecho: 'ficam reduzidas em 60% (sessenta por cento) as alíquotas do IBS e da CBS incidentes sobre operações com' },
      { norma: LC214, caminho: 'art-128', trecho: 'insumos agropecuários e aquícolas' },
    ],
  },
  {
    tema: 'Alíquotas reduzidas',
    pergunta: 'Quais profissionais têm redução de 30% nas alíquotas de IBS e CBS?',
    sinonimos: 'profissionais liberais conselho profissional 30% advogados contadores engenheiros médicos veterinários agrônomos',
    resposta:
      'A prestação de serviços por profissionais que exerçam atividades intelectuais de natureza científica, literária ou artística, submetidas à fiscalização por conselho profissional, tem redução de 30%. A lista inclui, entre outros, administradores, advogados, arquitetos, contabilistas, economistas, engenheiros e agrônomos, e médicos veterinários e zootecnistas.',
    fundamentos: [{ norma: LC214, caminho: 'art-127', trecho: 'Ficam reduzidas em 30% (trinta por cento) as alíquotas do IBS e da CBS incidentes sobre a prestação de serviços pelos seguintes profissionais' }],
  },
  {
    tema: 'Bares e restaurantes',
    pergunta: 'Qual a redução de alíquota para bares e restaurantes e o comprador toma crédito?',
    sinonimos: 'restaurante lanchonete alimentação fora do lar 40% crédito adquirente regime específico bebidas',
    resposta:
      'Bares e restaurantes, inclusive lanchonetes, estão em regime específico de IBS e CBS, com as alíquotas reduzidas em 40%. O adquirente da alimentação e das bebidas fornecidas por eles não pode apropriar créditos de IBS e CBS.',
    fundamentos: [
      { norma: LC214, caminho: 'art-273', trecho: 'ficam sujeitas a regime específico de incidência do IBS e da CBS' },
      { norma: LC214, caminho: 'art-275', trecho: 'ficam reduzidas em 40% (quarenta por cento)' },
      { norma: LC214, caminho: 'art-276', trecho: 'Fica vedada a apropriação de créditos do IBS e da CBS pelos adquirentes de alimentação e bebidas fornecidas pelos bares e restaurantes' },
    ],
  },
  {
    tema: 'Imposto Seletivo',
    pergunta: 'O que é tributado pelo Imposto Seletivo e qual o limite para bens minerais?',
    sinonimos: 'imposto seletivo mineração extração bens minerais 0,25% fumígenos bebidas veículos prejudiciais saúde meio ambiente',
    resposta:
      'O Imposto Seletivo incide sobre a produção, extração, comercialização ou importação de bens e serviços prejudiciais à saúde ou ao meio ambiente (por exemplo veículos, embarcações e aeronaves, fumígenos, bebidas alcoólicas e açucaradas, bens minerais e concursos de prognósticos). Nas operações com bens minerais extraídos, a alíquota respeita o máximo de 0,25%.',
    ressalvas: 'As alíquotas dos demais itens dependem de lei ordinária.',
    fundamentos: [
      { norma: LC214, caminho: 'art-409', trecho: 'incidente sobre a produção, extração, comercialização ou importação de bens e serviços prejudiciais à saúde ou ao meio ambiente' },
      { norma: LC214, caminho: 'art-422', trecho: 'respeitarão o percentual máximo de 0,25% (vinte e cinco centésimos por cento), nas operações com bens minerais extraídos' },
    ],
  },
];
