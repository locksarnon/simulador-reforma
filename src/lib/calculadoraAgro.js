import { calcSistemaAtual, calcIbsCbs } from "../../base44/shared/taxEngine";

/**
 * Calculadora InTAX (ferramenta-isca) — estimativa de ordem de grandeza.
 *
 * Reaproveita as funções do MESMO motor do simulador (calcSistemaAtual/calcIbsCbs) sobre
 * duas operações sintéticas (vendas e compras), com alíquotas de transição
 * lidas do banco. Tudo que é PREMISSA (alíquota atual média por regime/perfil,
 * redução por perfil, textos dos cartões) está neste arquivo, num só lugar,
 * para o especialista revisar. Nada aqui é promessa de economia: o resultado
 * é sempre apresentado como estimativa e convida ao diagnóstico com notas reais.
 */
export const CONTATO = {
  whatsapp: "+55 66 99718-5304",
  whatsappLink: "https://wa.me/5566997185304",
  email: "contato@falagro.com.br",
};

export const PREMISSAS_VERSAO = "0.1 — premissas a validar pelo especialista tributário";

export const REGIMES = [
  { id: "simples", label: "Simples Nacional" },
  { id: "presumido", label: "Lucro Presumido" },
  { id: "real", label: "Lucro Real" },
  { id: "produtor_pf", label: "Produtor rural pessoa física" },
];

const SIM_NAO = (id, texto, ajuda, sim = {}, nao = {}) => ({ id, texto, ajuda, sim, nao });

/**
 * reducao_vendas: redução média de IBS/CBS aplicada às vendas do perfil.
 * icms_padrao: ICMS efetivo médio sobre vendas no sistema atual (premissa).
 * compras_pct: compras/insumos como % do faturamento (valor inicial editável).
 */
export const PERFIS = [
  {
    id: "produtor_pj", grupo: "Regimes diferenciados", lei: "Título IV, Cap. VII (Arts. 164–168)", label: "Produtor rural — pessoa jurídica", emoji: "🌾",
    descricao: "Produtor rural que pode ser não contribuinte se a receita anual for inferior a R$ 3,6 milhões.",
    regimes: ["presumido", "real", "simples"], reducao_vendas: 0, icms_padrao: 0, compras_pct: 0.55,
    perguntas: [
      SIM_NAO("receita_3_6", "Sua receita anual passa de R$ 3,6 milhões?", "Abaixo desse valor, o produtor pode ficar fora do IBS/CBS.", {}, { fora_ibs: true }),
      SIM_NAO("vende_industria", "Você vende para indústrias ou cooperativas?", "Quem compra do produtor fora do IBS/CBS usa crédito presumido.", { comprador_valoriza_credito: true }),
      SIM_NAO("exporta", "Você exporta parte da produção?", "Exportação é desonerada, com manutenção de créditos.", { exporta: true }),
    ],
  },
  {
    id: "produtor_pf", grupo: "Regimes diferenciados", lei: "Título IV, Cap. VII (Arts. 164–168)", label: "Produtor rural — pessoa física", emoji: "🧑‍🌾",
    descricao: "Produtor rural que atua em nome próprio; pode ser não contribuinte abaixo de R$ 3,6 milhões.",
    regimes: ["produtor_pf"], reducao_vendas: 0, icms_padrao: 0, compras_pct: 0.5,
    perguntas: [
      SIM_NAO("receita_3_6", "Sua receita anual passa de R$ 3,6 milhões?", "Abaixo desse valor, o produtor pode ficar fora do IBS/CBS.", {}, { fora_ibs: true }),
      SIM_NAO("vende_industria", "Você vende para indústrias ou cooperativas?", "Quem compra do produtor fora do IBS/CBS usa crédito presumido.", { comprador_valoriza_credito: true }),
      SIM_NAO("exporta", "Você exporta parte da produção?", "Exportação é desonerada, com manutenção de créditos.", { exporta: true }),
    ],
  },
  {
    id: "sementeira", grupo: "Regimes diferenciados", lei: "Art. 128, IX · Anexo IX", label: "Insumos agropecuários e aquícolas — sementes e mudas", emoji: "🌱",
    descricao: "Produção e venda de sementes e mudas (redução de 60%).",
    regimes: ["presumido", "real", "simples"], reducao_vendas: 0.6, icms_padrao: 0.04, compras_pct: 0.6,
    perguntas: [
      SIM_NAO("vende_produtor", "Você vende principalmente para produtores rurais?", "Insumos agropecuários têm tratamento favorecido.", { cliente_produtor: true }),
      SIM_NAO("compra_de_pf", "Você compra sementes ou grãos de produtor rural pessoa física?", "Compra de PF gera crédito presumido, não crédito cheio.", { compra_de_pf: true }),
      SIM_NAO("exporta", "Você exporta?", "Exportação é desonerada, com manutenção de créditos.", { exporta: true }),
    ],
  },
  {
    id: "racao", grupo: "Regimes diferenciados", lei: "Art. 128, IX · Anexo IX", label: "Insumos agropecuários e aquícolas — rações e suplementos", emoji: "🐄",
    descricao: "Fabricação de rações e suplementos para animais (redução de 60%).",
    regimes: ["presumido", "real", "simples"], reducao_vendas: 0.6, icms_padrao: 0.07, compras_pct: 0.7,
    perguntas: [
      SIM_NAO("compra_de_pf", "Você compra grãos direto de produtores rurais?", "Compra de produtor PF gera crédito presumido.", { compra_de_pf: true }),
      SIM_NAO("vende_produtor", "Você vende para produtores ou cooperativas, e não para revenda?", "Define quem aproveita o crédito na cadeia.", { cliente_produtor: true }),
      SIM_NAO("multi_uf", "Você opera em mais de um estado?", "Com o IBS, a tributação passa a ser no destino.", { multi_uf: true }),
    ],
  },
  {
    id: "etanol", grupo: "Regimes específicos", lei: "Título V, Cap. I (Arts. 172–180)", label: "Combustíveis — etanol e biocombustíveis", emoji: "⛽",
    descricao: "Usinas e destilarias (IBS/CBS uma única vez na cadeia).",
    regimes: ["presumido", "real"], reducao_vendas: 0, icms_padrao: 0.12, compras_pct: 0.6,
    perguntas: [
      SIM_NAO("vende_distribuidora", "Você vende para distribuidoras de combustíveis?", "A cadeia de combustíveis tem regras específicas.", { cadeia_combustiveis: true }),
      SIM_NAO("compra_de_pf", "Você compra cana de produtor rural (próprio ou de terceiros)?", "Compra de produtor PF gera crédito presumido.", { compra_de_pf: true }),
      SIM_NAO("exporta", "Você exporta?", "Exportação é desonerada, com manutenção de créditos.", { exporta: true }),
    ],
  },
  {
    id: "mineradora", grupo: "Imposto Seletivo", lei: "Livro II, Art. 409 e Art. 422, § 2º", label: "Bens minerais — extração", emoji: "⛏️",
    descricao: "Extração de minério (Imposto Seletivo de até 0,25%, inclusive sobre o exportado).",
    regimes: ["presumido", "real"], reducao_vendas: 0, icms_padrao: 0.05, compras_pct: 0.4,
    imposto_seletivo_pct: 0.0025, // alíquota MÁXIMA prevista na extração (a definir em lei) — premissa
    perguntas: [
      SIM_NAO("exporta", "Você exporta parte do minério?", "O Imposto Seletivo incide na extração mesmo quando o produto é exportado.", { exporta: true }),
      SIM_NAO("contratos_longo", "Tem contratos de longo prazo com preço fixo?", "Contratos que atravessam 2027 precisam de cláusula de revisão tributária.", { contratos_longo: true }),
      SIM_NAO("logistica_propria", "Opera logística própria (frota, ferrovia, porto)?", "Combustível, peças e manutenção passam a gerar crédito.", { logistica_propria: true }),
    ],
  },
  {
    id: "restaurante", grupo: "Regimes específicos", lei: "Título V, Cap. VII, Seção I (Arts. 273–280)", label: "Bares e restaurantes", emoji: "🍽️",
    descricao: "Inclui lanchonetes e bebidas não alcoólicas preparadas no local (redução de 40%; sem crédito ao cliente).",
    regimes: ["simples", "presumido", "real"], reducao_vendas: 0.4, icms_padrao: 0.03, compras_pct: 0.35,
    perguntas: [
      SIM_NAO("b2c", "A maior parte das vendas é para consumidor final (pessoa física)?", "Consumidor final não usa crédito: o preço pesa mais que o tributo destacado.", { b2c: true }),
      SIM_NAO("fornecedor_simples", "Compra com frequência de fornecedores do Simples Nacional?", "Fornecedor do Simples gera menos crédito.", { fornecedor_simples: true }),
      SIM_NAO("split_cartao", "A maioria dos recebimentos é em cartão ou Pix?", "É onde o split payment mais mexe no caixa.", { split_cartao: true }),
    ],
  },
  {
    id: "farmacia", grupo: "Regimes diferenciados", lei: "Art. 133 · Art. 146", label: "Medicamentos — comércio", emoji: "💊",
    descricao: "Drogarias e farmácias de manipulação (redução de 60%; lista com alíquota zero).",
    regimes: ["simples", "presumido", "real"], reducao_vendas: 0.6, icms_padrao: 0.1, compras_pct: 0.7,
    perguntas: [
      SIM_NAO("medicamentos", "A maior parte das vendas é de medicamentos (não perfumaria ou higiene)?", "Medicamentos têm redução, e alguns têm alíquota zero.", { medicamentos: true }),
      SIM_NAO("vende_empresas", "Vende também para empresas, planos de saúde ou hospitais?", "Cliente empresa aproveita crédito.", { b2b: true }),
      SIM_NAO("fornecedor_simples", "Compra com frequência de distribuidores do Simples Nacional?", "Fornecedor do Simples gera menos crédito.", { fornecedor_simples: true }),
    ],
  },
  {
    id: "mercado", grupo: "Regimes diferenciados", lei: "Art. 128, VI · Título III, Cap. II", label: "Alimentos para consumo humano e cesta básica — comércio", emoji: "🛒",
    descricao: "Mercearias e supermercados (redução de 60%; cesta básica com alíquota zero).",
    regimes: ["simples", "presumido", "real"], reducao_vendas: 0, icms_padrao: 0.1, compras_pct: 0.78,
    perguntas: [
      SIM_NAO("cesta_basica", "Boa parte das vendas é de alimentos da cesta básica?", "Muitos itens da cesta básica têm alíquota zero.", { cesta_basica: true }),
      SIM_NAO("vende_empresas", "Vende também no atacado, para revenda?", "Cliente empresa aproveita crédito.", { b2b: true }),
      SIM_NAO("fornecedor_simples", "Compra com frequência de fornecedores do Simples Nacional?", "Fornecedor do Simples gera menos crédito.", { fornecedor_simples: true }),
    ],
  },
  {
    id: "atacado", grupo: "Regime regular", lei: "Livro I, Título I", label: "Regime regular — atacado e distribuição", emoji: "📦",
    descricao: "Atacadistas e distribuidores, sem regime diferenciado.",
    regimes: ["simples", "presumido", "real"], reducao_vendas: 0, icms_padrao: 0.1, compras_pct: 0.85,
    perguntas: [
      SIM_NAO("vende_empresas", "Vende principalmente para outras empresas (revenda)?", "Seus clientes vão olhar o crédito que você gera.", { b2b: true }),
      SIM_NAO("multi_uf", "Opera em mais de um estado?", "Com o IBS, a tributação passa a ser no destino.", { multi_uf: true }),
      SIM_NAO("icms_st", "Trabalha com substituição tributária (ICMS-ST) hoje?", "O ICMS-ST desaparece gradualmente na transição.", { icms_st: true }),
    ],
  },
];

export const PORTES = [
  { id: "micro", label: "Micro (até R$ 360 mil/ano)" },
  { id: "pequena", label: "Pequena (até R$ 4,8 mi/ano)" },
  { id: "media", label: "Média (até R$ 300 mi/ano)" },
  { id: "grande", label: "Grande (acima de R$ 300 mi/ano)" },
  { id: "escritorio_contabil", label: "Escritório de contabilidade" },
];

const SIMPLES_DAS_PADRAO = 0.08;

const semaforo = (delta) => (delta <= -0.5 ? "verde" : delta <= 1 ? "amarelo" : "vermelho");
const pct2 = (v) => `${(v * 100).toFixed(2).replace(".", ",")}%`;
const pct1 = (v) => `${(v * 100).toFixed(1).replace(".", ",")}%`;
export const brl = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** Taxas do sistema atual (sobre saída) por regime; ICMS vem do perfil. */
function taxasAtuais(regime, perfil, cargaInformada) {
  let t;
  if (regime === "produtor_pf") t = { pis: 0, cofins: 0, icms: 0 };
  else if (regime === "presumido") t = { pis: 0.0065, cofins: 0.03, icms: perfil.icms_padrao };
  else if (regime === "real") t = { pis: 0.0165, cofins: 0.076, icms: perfil.icms_padrao };
  else t = { pis: 0, cofins: 0, icms: 0 }; // Simples: DAS tratado à parte
  if (cargaInformada != null && regime !== "simples" && regime !== "produtor_pf") {
    // Se o usuário informou a carga atual, ajusta o ICMS para fechar o total.
    const resto = Math.max(0, cargaInformada - t.pis - t.cofins);
    t.icms = resto;
  }
  return t;
}

/**
 * @param entrada { perfil, regime, faturamentoAnual, comprasPct, creditoPct, exportaPct, respostas, cargaInformada }
 * @param parametros linhas de TransicaoAno (GET /public/parametros-transicao)
 */
export function estimar(entrada, parametros) {
  const perfil = PERFIS.find((p) => p.id === entrada.perfil);
  const flags = {};
  perfil.perguntas.forEach((q) => Object.assign(flags, entrada.respostas?.[q.id] === "sim" ? q.sim : q.nao));

  const regime = entrada.regime;
  const fatAnual = entrada.faturamentoAnual;
  const exportaPct = flags.exporta ? Math.min(0.95, Math.max(0, (entrada.exportaPct ?? 0) / 100)) : 0;
  const vendasInternas = fatAnual * (1 - exportaPct);
  const compras = fatAnual * Math.min(0.95, Math.max(0, entrada.comprasPct / 100));
  const creditoPct = Math.min(1, Math.max(0, entrada.creditoPct / 100));
  const cargaInf = entrada.cargaInformada != null && entrada.cargaInformada !== "" ? Number(entrada.cargaInformada) / 100 : null;

  const anos = [...parametros].sort((a, b) => a.ano - b.ano);

  // ── Simples: DAS à parte + comparação "se optar pelo regime regular" ──
  const dasPct = cargaInf ?? SIMPLES_DAS_PADRAO;
  const tx = taxasAtuais(regime === "simples" ? "presumido" : regime, perfil, regime === "simples" ? null : cargaInf);
  const reducao = flags.fora_ibs ? 1 : (entrada.reducao ?? perfil.reducao_vendas);
  const creditoEfetivo = flags.fora_ibs ? 0 : creditoPct;

  // "Carga" aqui = tributo a PAGAR (débitos das vendas − créditos das compras),
  // a definição intuitiva para o empresário. (A consolidação do simulador
  // completo também soma o tributo embutido em compras não creditáveis, que
  // aqui só confundiria.) As contas usam as mesmas funções do motor.
  const serie = anos.map((ap) => {
    const saida = {
      direcao: "Saída", valor_bruto: vendasInternas,
      pis_pct: tx.pis, cofins_pct: tx.cofins, icms_pct: tx.icms, credito_elegivel_pct: 0, split_pct: 0,
    };
    const entradaOp = {
      direcao: "Entrada", valor_bruto: compras,
      pis_pct: regime === "real" ? tx.pis : 0, cofins_pct: regime === "real" ? tx.cofins : 0,
      icms_pct: tx.icms, credito_elegivel_pct: creditoEfetivo, split_pct: 0,
    };
    const sS = calcSistemaAtual(saida);
    const sE = calcSistemaAtual(entradaOp);

    // Sistema atual: tributo das vendas − crédito das compras.
    const atualPagar = Math.max(0, sS.tributosBrutos - sE.creditosAtuais);

    // Remanescente na transição (mesmos fatores anuais do motor).
    const c = creditoEfetivo;
    const remS = (sS.pis + sS.cofins) * ap.pis_cofins_fator + sS.ipi * ap.ipi_fator_geral
      + (sS.icmsProprio + sS.fcp + sS.icmsSt) * ap.icms_fator + sS.iss * ap.iss_fator;
    const remCred = ((sE.pis + sE.cofins) * ap.pis_cofins_fator + sE.ipi * ap.ipi_fator_geral
      + (sE.icmsProprio + sE.fcp) * ap.icms_fator) * c;

    // IBS/CBS: débito das vendas − crédito das compras, com o efeito financeiro do ano.
    const dS = calcIbsCbs(saida, ap, { pct_reducao_ibs: reducao, pct_reducao_cbs: reducao });
    const dE = calcIbsCbs(entradaOp, ap, {});
    const debitoNovo = dS.debitoIbs + dS.debitoCbs;
    const creditoNovo = dE.creditoIbs + dE.creditoCbs;
    const ibsCbsFin = Math.max(0, debitoNovo - creditoNovo) * (ap.efeito_financeiro || 0);
    // Excedente de crédito: não é "economia" — fica acumulado até ser compensado ou ressarcido.
    const saldoCredor = Math.max(0, creditoNovo - debitoNovo) * (ap.efeito_financeiro || 0);

    // Imposto Seletivo (ex.: extração mineral): incide sobre o faturamento total, inclusive exportado.
    const impostoSeletivo = ap.ano >= 2027 ? fatAnual * (perfil.imposto_seletivo_pct || 0) : 0;
    const futuro = Math.max(0, remS - remCred) + ibsCbsFin + impostoSeletivo;
    const atual = regime === "simples" ? vendasInternas * dasPct : atualPagar;
    const base = fatAnual || 1;
    return {
      ano: ap.ano,
      cargaAtual: atual, cargaTransicao: regime === "simples" ? Math.max(atual, 0) : futuro,
      cargaRegular: futuro,
      pctAtual: (atual / base) * 100,
      pctTransicao: ((regime === "simples" ? atual : futuro) / base) * 100,
      pctRegular: (futuro / base) * 100,
      saldoCredor,
    };
  });

  const linha = (ano) => serie.find((s) => s.ano === ano) || serie[serie.length - 1];
  const a2027 = linha(2027);
  const a2033 = linha(2033);
  const atual = a2033.pctAtual;
  const delta2027 = a2027.pctTransicao - atual;
  const delta2033 = a2033.pctTransicao - atual;
  const deltaReais2033 = (a2033.cargaTransicao - a2033.cargaAtual);

  // ── Cartões de impacto (semáforo) ──
  const cards = [];
  cards.push({
    cor: semaforo(delta2033),
    titulo: delta2033 <= -0.5 ? "A carga tende a cair até 2033" : delta2033 <= 1 ? "Impacto moderado na carga" : "A carga tende a subir até 2033",
    texto: `Estimativa de ${pct1(atual / 100)} hoje para ${pct1(a2033.pctTransicao / 100)} em 2033 sobre o faturamento (${delta2033 >= 0 ? "+" : ""}${delta2033.toFixed(1).replace(".", ",")} p.p.).`,
  });
  if (a2033.saldoCredor > vendasInternas * 0.005) {
    cards.push({
      cor: "amarelo",
      titulo: "Você tende a acumular crédito",
      texto: `Em 2033, os créditos das compras superam o tributo das vendas em cerca de ${brl(a2033.saldoCredor)}/ano. Esse saldo não é economia: fica acumulado até compensar ou ser ressarcido, o que pesa no caixa.`,
    });
  }
  if (regime === "simples") {
    cards.push({ cor: "amarelo", titulo: "Simples: o impacto está no crédito dos seus clientes", texto: "Clientes empresas aproveitam pouco crédito de quem está no Simples. Vale comparar permanecer no Simples com o regime regular." });
  }
  if (flags.fora_ibs) cards.push({ cor: "amarelo", titulo: "Você tende a ficar fora do IBS/CBS", texto: "Abaixo do teto de receita, o produtor pode não ser contribuinte — mas deixa de gerar crédito cheio para o comprador. Simule se compensa optar por ser contribuinte." });
  if (flags.comprador_valoriza_credito) cards.push({ cor: "verde", titulo: "Seu comprador pode valorizar o crédito", texto: "Se vende para indústria ou cooperativa, ser contribuinte pode melhorar sua competitividade. Depende do peso do crédito para o comprador." });
  if (flags.compra_de_pf) cards.push({ cor: "amarelo", titulo: "Compras de produtor PF: crédito presumido", texto: "Essas compras geram crédito presumido, não o crédito cheio. Revise a cadeia de fornecedores no mapa de créditos." });
  if (flags.exporta) cards.push({ cor: "verde", titulo: "Exportação é desonerada", texto: "O tributo não incide na exportação e os créditos são mantidos, com ressarcimento. Atenção ao prazo de devolução, que afeta o caixa." });
  if (flags.multi_uf) cards.push({ cor: "amarelo", titulo: "Tributação no destino", texto: "Operando em mais de um estado, o IBS passa a seguir o destino da venda. Reveja preços e logística por região." });
  if (perfil.imposto_seletivo_pct) {
    cards.push({ cor: "amarelo", titulo: "Imposto Seletivo na extração", texto: `Estimado em até ${pct2(perfil.imposto_seletivo_pct)} do faturamento (${brl(fatAnual * perfil.imposto_seletivo_pct)}/ano), inclusive sobre o que é exportado. A alíquota final ainda depende de lei; provisione no custo.` });
  }
  if (flags.b2c) cards.push({ cor: "amarelo", titulo: "Consumidor final não aproveita crédito", texto: "Se vende principalmente para pessoa física, o preço final é o que importa. Revise a precificação e a margem por item antes de 2027." });
  if (flags.b2b) cards.push({ cor: "verde", titulo: "Clientes empresas valorizam o crédito", texto: "Ao vender para empresas, o crédito que você gera entra na decisão de compra. Mostre o custo líquido depois do crédito." });
  if (flags.fornecedor_simples) cards.push({ cor: "amarelo", titulo: "Fornecedores do Simples geram menos crédito", texto: "Compare fornecedores pelo custo líquido depois do crédito, não só pelo preço da nota." });
  if (flags.split_cartao) cards.push({ cor: "amarelo", titulo: "Split payment no cartão e no Pix", texto: "É onde a retenção do tributo na liquidação mais afeta o caixa. Projete o capital de giro e revise prazos com fornecedores." });
  if (flags.cesta_basica) cards.push({ cor: "verde", titulo: "Itens da cesta básica com alíquota zero", texto: "Muitos alimentos básicos têm alíquota zero. Confirme cada item pelo NCM na Consulta NCM: a lista é específica." });
  if (flags.medicamentos) cards.push({ cor: "verde", titulo: "Medicamentos têm tratamento favorecido", texto: "Há redução e, para alguns itens, alíquota zero. Perfumaria e higiene seguem regra diferente: separe as categorias no cadastro." });
  if (flags.icms_st) cards.push({ cor: "amarelo", titulo: "O ICMS-ST sai de cena aos poucos", texto: "Reveja a formação de preço e o estoque de mercadorias com ST retido durante a transição." });
  if (flags.contratos_longo) cards.push({ cor: "vermelho", titulo: "Contratos de longo prazo com preço fixo", texto: "Contratos que atravessam 2027 sem cláusula de revisão tributária concentram risco de margem. Renegocie antes." });
  if (flags.logistica_propria) cards.push({ cor: "verde", titulo: "Logística própria passa a gerar crédito", texto: "Combustível, peças, pneus e manutenção entram no crédito. Organize as notas de insumos para não perder crédito." });
  if (flags.cadeia_combustiveis) cards.push({ cor: "amarelo", titulo: "Cadeia de combustíveis tem regras próprias", texto: "Confirme o enquadramento das suas vendas a distribuidoras nas regras específicas para biocombustíveis." });
  cards.push({ cor: "amarelo", titulo: "Split payment e caixa", texto: "A partir da fase de testes, parte do tributo será retida na liquidação do pagamento. Projete o capital de giro antes de 2027." });

  const acoes = [
    "Sanear o cadastro de produtos (NCM e classificação) antes de 2027 — é a base de tudo.",
    flags.compra_de_pf || flags.fora_ibs
      ? "Mapear seus fornecedores e o tipo de crédito de cada um (cheio, presumido ou nenhum)."
      : "Mapear o crédito que você perde hoje e passará a aproveitar.",
    "Revisar preços e cláusulas tributárias dos contratos que atravessam 2027.",
  ];

  const premissas = [
    `Faturamento anual estimado: ${brl(fatAnual)}; compras de ${pct1(entrada.comprasPct / 100)} do faturamento, com ${pct1(creditoPct)} vindas de fornecedores que geram crédito.`,
    regime === "simples"
      ? `Carga atual: DAS médio de ${pct1(dasPct)} sobre o faturamento${cargaInf != null ? " (informado por você)" : " (premissa padrão)"}. O regime regular é mostrado só como comparação.`
      : `Carga atual: PIS/Cofins do regime ${REGIMES.find((r) => r.id === regime).label} e ICMS médio de ${pct1(tx.icms)}${cargaInf != null ? " (ajustado à carga que você informou)" : " (premissa do segmento)"}.`,
    `Redução média de IBS/CBS nas vendas: ${flags.fora_ibs ? "fora do IBS/CBS (receita abaixo do teto)" : pct1(reducao)}.`,
    ...(perfil.imposto_seletivo_pct ? [`Imposto Seletivo: ${pct2(perfil.imposto_seletivo_pct)} do faturamento a partir de 2027 (alíquota máxima prevista; a definir em lei).`] : []),
    "Alíquotas do IBS/CBS e fatores de transição: parâmetros do InTAX (as alíquotas finais do IBS ainda serão fixadas).",
    `Premissas ${PREMISSAS_VERSAO}.`,
  ];

  return {
    perfil: perfil.id, perfilLabel: perfil.label, regime, reducao, base: { fatAnual, compras, vendasInternas },
    serie, atual, y2027: a2027, y2033: a2033, delta2027, delta2033, deltaReais2033,
    regularComparacao: regime === "simples" ? { pct2033: a2033.pctRegular, delta: a2033.pctRegular - atual } : null,
    cards, acoes, premissas, flags,
  };
}

/** Conteúdo do PDF (montado aqui para PDF na hora e anexo de e-mail serem idênticos). */
export function montarRelatorio(entrada, r) {
  const perfil = PERFIS.find((p) => p.id === r.perfil);
  return {
    titulo: "Quanto a reforma tributária muda para o seu negócio?",
    subtitulo: `${perfil.label} · ${REGIMES.find((x) => x.id === r.regime).label} · faturamento estimado ${brl(r.base.fatAnual)}/ano`,
    secoes: [
      {
        titulo: "Resumo",
        paragrafos: [
          `Carga estimada hoje: ${pct1(r.atual / 100)} das vendas. Em 2027: ${pct1(r.y2027.pctTransicao / 100)}. Em 2033: ${pct1(r.y2033.pctTransicao / 100)} (${r.delta2033 >= 0 ? "+" : ""}${r.delta2033.toFixed(1).replace(".", ",")} p.p., cerca de ${brl(Math.abs(r.deltaReais2033))}/ano ${r.deltaReais2033 >= 0 ? "a mais" : "a menos"}).`,
        ],
      },
      {
        titulo: "Linha do tempo da carga estimada",
        tabela: {
          cabecalho: ["Ano", "Carga (R$)", "Carga (%)"],
          linhas: r.serie.map((s) => [String(s.ano), brl(s.cargaTransicao), pct1(s.pctTransicao / 100)]),
        },
      },
      { titulo: "Pontos de atenção", itens: r.cards.map((c) => `${c.titulo}: ${c.texto}`) },
      { titulo: "3 ações prioritárias", itens: r.acoes },
      { titulo: "Premissas desta estimativa", itens: r.premissas },
      {
        titulo: "Fale com a FAL Agro",
        paragrafos: ["Esta é uma estimativa por médias. Se quiser ver o cálculo com as suas notas fiscais reais, nota a nota, e tirar dúvidas sobre o seu caso, é só chamar:"],
        itens: [`WhatsApp: ${CONTATO.whatsapp}`, `E-mail: ${CONTATO.email}`],
      },
    ],
  };
}
