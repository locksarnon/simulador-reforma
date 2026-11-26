/**
 * Roteiro do rascunho de parecer por serviço do catálogo de consultoria (CATALOGO_CONSULTORIA).
 * `foco` = o que o parecer precisa responder; `conferir` = o que o consultor costuma ter de checar; `borda` = o que a regra não decide
 * sozinha (é onde a IA mais ajuda). As normas citadas aqui são só pistas de onde olhar: o parecer só cita artigo se achar na fonte oficial.
 */
export type Roteiro = { foco: string; conferir: string[]; borda: string };

const PIS_COFINS = 'créditos de PIS/Cofins sobre produtos e serviços da operação (insumo × uso e consumo × manutenção depende do uso real; Leis 10.637/2002 e 10.833/2003)';
const HOMOLOGACAO = 'notas em que o ERP e a calculadora oficial divergem por motivo que depende do negócio (enquadramento, cClassTrib, exceções, operação mista)';
const CRUZAMENTO = 'diferença entre escriturações que pode ser prazo, devolução, ajuste ou erro de lançamento: a causa depende do documento';

export const ROTEIROS: Record<string, Roteiro> = {
  'pf-ibs-cbs': {
    foco: 'Enquadramento do produtor rural pessoa física na Reforma Tributária do Consumo e conveniência da opção de IBS/CBS.',
    conferir: ['Receita bruta do ano anterior e do ano em curso frente ao limite de enquadramento', 'Atividades exercidas e adquirentes (contribuintes ou não)', 'Créditos a que o produtor teria direito na opção', 'Prazos e forma da opção'],
    borda: 'comparar opção × não opção quando o resultado depende do perfil de compradores e de insumos',
  },
  'pf-homologacao': {
    foco: 'Se o ERP do produtor rural emite os documentos com os campos de IBS/CBS corretos.',
    conferir: ['Notas emitidas no período e CST/cClassTrib usados', 'Divergências entre a nota e a calculadora oficial', 'Versão do leiaute em uso'],
    borda: HOMOLOGACAO,
  },
  lcdpr: {
    foco: 'Se o livro-caixa do produtor rural (LCDPR) está completo e coerente com os documentos e com a apuração da atividade rural.',
    conferir: ['Lançamentos sem documento ou sem conta bancária', 'Receitas e despesas dedutíveis da atividade rural', 'Saldos de abertura e de fechamento', 'Prazo e forma de entrega'],
    borda: 'despesa de dedutibilidade duvidosa (uso misto, pessoal × atividade) e lançamento sem comprovação clara',
  },
  'credito-estoque-pf': {
    foco: 'Elegibilidade do produtor rural pessoa física ao crédito presumido sobre o estoque na transição e a conta do crédito.',
    conferir: ['Condição do contribuinte na data-base', 'Estoque existente, documentos de aquisição e NCM', 'Natureza do bem (revenda, insumo, uso e consumo)', 'Prazo para apurar e declarar'],
    borda: 'item de estoque cuja finalidade ou classificação muda a elegibilidade ao crédito',
  },
  'cruzamentos-pf': {
    foco: 'Divergências entre declarações, escriturações e documentos fiscais do produtor rural.',
    conferir: ['Receitas declaradas × documentos emitidos e recebidos', 'Datas de competência', 'Declarações retificadoras'],
    borda: CRUZAMENTO,
  },
  'simulador-reforma': {
    foco: 'Impacto estimado da Reforma Tributária do Consumo no cliente ao longo da transição (2026–2033) e o que o resultado depende de confirmar.',
    conferir: ['Premissas de alíquotas, regime e cenário', 'Receita e custo usados na simulação', 'Créditos considerados e seu efeito no caixa', 'Regras de transição aplicáveis ao setor'],
    borda: 'premissa que muda o resultado de forma relevante (alíquota de referência, benefício setorial, regime) e a conveniência de mudar de regime',
  },
  'pj-homologacao': {
    foco: 'Se o ERP da empresa emite as notas com o IBS/CBS corretos frente à calculadora oficial e o que corrigir primeiro.',
    conferir: ['Cenários (CST, cClassTrib, CFOP) reprovados e seu volume', 'Notas sem destaque de IBS/CBS', 'Itens que a calculadora ainda não calcula (conferir à parte)', 'Parametrização do cadastro de produtos'],
    borda: HOMOLOGACAO,
  },
  'saneamento-estoques': {
    foco: 'Estado do saneamento do cadastro e do estoque para IBS/CBS: o que está resolvido, o que depende de informação do cliente e o impacto no SPED.',
    conferir: ['Casos por camada e situação (aprovados, em aberto, aguardando informação)', 'Atividades confirmadas e finalidade dos grupos', 'Casos de NCM e de enquadramento ainda sem decisão', 'Impacto nos registros do SPED'],
    borda: `duplicidade possível de estoques, NCM ambíguo e ${PIS_COFINS}`,
  },
  'pis-cofins': {
    foco: 'Oportunidades e riscos de crédito de PIS e Cofins no período, com o fundamento de cada tese.',
    conferir: ['Regime de apuração (cumulativo ou não cumulativo) e sua prova', 'Natureza das despesas e dos bens tomados como crédito', 'Documentos e escrituração (EFD-Contribuições) de cada competência', 'Prazo para recuperar ou compensar'],
    borda: PIS_COFINS,
  },
  'credito-estoque': {
    foco: 'Elegibilidade e valor do crédito presumido sobre o estoque na data-base e o que falta para comprovar.',
    conferir: ['Estoque na data-base e documentos de aquisição', 'NCM e finalidade de cada família de itens', 'Itens de uso e consumo ou imobilizado fora do crédito', 'Prazo e forma de apuração e declaração'],
    borda: `${PIS_COFINS}; item de finalidade ambígua que muda a elegibilidade; duplicidade de estoques`,
  },
  'tributos-pagos': {
    foco: 'Conciliação entre o que foi apurado, pago e declarado, e o que pode ser recuperado ou regularizado.',
    conferir: ['Apurado × pago × declarado por tributo e competência', 'Guias, compensações e parcelamentos', 'Pagamentos a maior ou em duplicidade', 'Prazo de recuperação'],
    borda: 'pagamento a maior cuja origem pode ser erro de apuração, de classificação ou de prazo',
  },
  'irpj-csll': {
    foco: 'Saldos de IRPJ e CSLL (estimativas, saldo negativo, compensações) e o que é seguro aproveitar.',
    conferir: ['Forma de apuração do ano (presumido ou real; trimestral ou anual)', 'Estimativas pagas e compensações já feitas', 'Retenções na fonte e saldo negativo declarado na ECF', 'Prazos'],
    borda: 'saldo que depende de interpretação da base de cálculo ou de prova de retenção',
  },
  'regimes-exercicio': {
    foco: 'Qual regime tributário tende a ser melhor no próximo exercício e a sensibilidade do resultado às premissas.',
    conferir: ['Receita, margens e folha projetadas', 'Créditos de PIS/Cofins e, na transição, de IBS/CBS', 'Restrições de enquadramento e prazo da opção', 'Efeito no caixa'],
    borda: 'premissa de margem, créditos ou receita que inverte a conclusão entre dois regimes',
  },
  'virada-exercicio': {
    foco: 'O que precisa ser feito e conferido na virada do exercício (encerramento, saldos, opções e obrigações).',
    conferir: ['Saldos e inventário de fechamento', 'Opções de regime e prazos', 'Obrigações acessórias do período e do próximo', 'Mudanças de legislação que entram em vigor'],
    borda: 'ajuste de fechamento cujo tratamento fiscal depende da natureza da operação',
  },
  'conciliacao-escrituracoes': {
    foco: 'Divergências entre as escriturações (EFD-ICMS/IPI, EFD-Contribuições, ECD, ECF) e os documentos fiscais do cliente.',
    conferir: ['Totais por período entre as escriturações', 'Documentos escriturados em período diferente do emitido', 'Retificações e versões das escriturações'],
    borda: CRUZAMENTO,
  },
};

export const roteiroDe = (servico: string): Roteiro | null => ROTEIROS[servico] ?? null;
