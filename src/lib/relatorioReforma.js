/**
 * Conteúdo do relatório da Calculadora InTAX: "como era × como fica" no regime
 * escolhido, o que a estimativa JÁ considerou e o que AINDA NÃO considerou.
 * Textos e artigos da LC 214/2025 conferidos no texto da lei; itens marcados
 * `confirmar` dependem de regra/prazo ainda a validar pelo especialista.
 */
import { PERFIS, REGIMES } from "@/lib/calculadoraAgro";

const pct = (v) => `${Math.round(v * 100)}%`;

const COMUNS = {
  tributos: {
    tema: "Tributos sobre consumo",
    era: "PIS, Cofins, ICMS, ISS e IPI, cada um com regras e ente arrecadador próprios.",
    fica: "IBS (estados e municípios) e CBS (União), com Imposto Seletivo só para itens específicos.",
    base: "EC 132/2023 · LC 214/2025, Livro I",
  },
  local: {
    tema: "Onde o tributo é devido",
    era: "ICMS predominantemente na origem; ISS, em regra, no município do prestador.",
    fica: "No destino: para bens, o local da entrega ou disponibilização ao destinatário.",
    base: "Art. 11",
  },
  cronograma: {
    tema: "Quando muda",
    era: "Sistema atual integral até 2026.",
    fica: "2026 teste (CBS 0,9% e IBS 0,1%); 2027 CBS plena e fim do PIS/Cofins; 2029–2032 ICMS/ISS caem 10% ao ano; 2033 só IBS/CBS.",
    base: "LC 214/2025, Título VIII · parâmetros do InTAX",
  },
};

const POR_REGIME = {
  real: {
    tema: "Créditos (Lucro Real)",
    era: "PIS/Cofins não cumulativos (1,65% + 7,6%) com créditos só nas hipóteses previstas em lei; ICMS com crédito próprio.",
    fica: "IBS/CBS não cumulativos: crédito amplo sobre as compras, exceto uso e consumo pessoal, apropriado quando o fornecedor recolhe.",
    base: "Art. 47 e Art. 57",
  },
  presumido: {
    tema: "Créditos (Lucro Presumido)",
    era: "PIS/Cofins cumulativos (0,65% + 3%), sem crédito das compras.",
    fica: "Passa ao regime regular do IBS/CBS, com crédito amplo: o efeito depende de quanto você compra de fornecedores que geram crédito.",
    base: "Art. 47",
  },
  simples: {
    tema: "Simples Nacional",
    era: "DAS unificado; o cliente empresa aproveita pouco ou nenhum crédito de quem está no Simples.",
    fica: "Mantém o DAS, com possibilidade de recolher IBS/CBS pelo regime regular (fora do DAS) para o cliente empresa aproveitar crédito integral.",
    base: "LC 123/2006 · LC 214/2025",
    confirmar: "Prazos e regras da opção precisam de confirmação (o Radar apontou 30/09/2026 como data-limite).",
  },
  produtor_pf: {
    tema: "Produtor rural pessoa física",
    era: "Sem PIS/Cofins na venda direta; ICMS frequentemente diferido; imposto de renda na pessoa física.",
    fica: "Não contribuinte de IBS/CBS com receita anual inferior a R$ 3,6 milhões; o comprador contribuinte usa crédito presumido. Acima do teto (ou por opção) passa a contribuinte.",
    base: "Arts. 164 a 168",
  },
};

const POR_PERFIL = {
  produtor_pj: {
    tema: "Produtor rural pessoa jurídica",
    era: "Regime conforme o enquadramento (Presumido/Real/Simples); diferimentos e isenções de ICMS na cadeia agrícola.",
    fica: "Não contribuinte abaixo de R$ 3,6 milhões de receita anual; acima disso, regime regular com crédito amplo. Pode optar por ser contribuinte (Art. 165).",
    base: "Arts. 164 a 168",
  },
  sementeira: {
    tema: "Insumos agropecuários",
    era: "Benefícios de PIS/Cofins e de ICMS que variam por produto e por estado.",
    fica: "Redução de 60% de IBS/CBS para insumos agropecuários e aquícolas da lista do Anexo IX.",
    base: "Art. 128, IX · Anexo IX",
  },
  racao: {
    tema: "Insumos agropecuários (rações)",
    era: "Benefícios de PIS/Cofins e de ICMS que variam por produto e por estado.",
    fica: "Redução de 60% para os itens do Anexo IX. Compras de produtor rural não contribuinte geram crédito presumido.",
    base: "Art. 128, IX · Anexo IX",
  },
  etanol: {
    tema: "Combustíveis",
    era: "Regimes próprios de PIS/Cofins e de ICMS na cadeia de combustíveis.",
    fica: "Regime específico: IBS/CBS incidem uma única vez na cadeia; etanol anidro e hidratado estão listados.",
    base: "Título V, Cap. I (Art. 172)",
  },
  mineradora: {
    tema: "Bens minerais",
    era: "Sem Imposto Seletivo; tributos sobre consumo conforme a operação.",
    fica: "Imposto Seletivo na extração com alíquota máxima de 0,25%, inclusive sobre o exportado e sem crédito; IBS/CBS com crédito amplo.",
    base: "Art. 409, Art. 410 e Art. 422, § 2º",
  },
  restaurante: {
    tema: "Bares e restaurantes",
    era: "Tributação conforme o regime da empresa, com ISS ou ICMS conforme o caso.",
    fica: "Regime específico: redução de 40%; o cliente não apropria crédito; bebidas alcoólicas ficam fora do regime.",
    base: "Arts. 273 a 276",
  },
  farmacia: {
    tema: "Medicamentos",
    era: "Regras próprias por produto (monofásico ou substituição tributária, conforme o item e o estado).",
    fica: "Medicamentos com redução de 60% e lista com alíquota zero; perfumaria e higiene seguem regras próprias.",
    base: "Art. 133 e Art. 146 · Anexo VIII",
  },
  mercado: {
    tema: "Alimentos",
    era: "Isenções e reduções de ICMS e PIS/Cofins que variam por item e por estado.",
    fica: "Cesta Básica Nacional com alíquota zero; demais alimentos para consumo humano com redução de 60%.",
    base: "Título III, Cap. II · Art. 128, VI",
  },
  atacado: {
    tema: "Comércio atacadista",
    era: "ICMS interestadual e substituição tributária em muitos segmentos.",
    fica: "Regime regular com crédito amplo; a substituição tributária do ICMS sai gradualmente na transição.",
    base: "Art. 47 · Título VIII",
  },
};

/** Tabela "como era × como fica" do regime escolhido. */
export function comoEraComoFica(perfilId, regime) {
  const linhas = [COMUNS.tributos, POR_REGIME[regime], POR_PERFIL[perfilId], COMUNS.local, COMUNS.cronograma].filter(Boolean);
  const regimeRot = REGIMES.find((r) => r.id === regime)?.label || regime;
  return { regimeRot, linhas };
}

/** O que a estimativa já considerou (derivado das respostas e dos parâmetros). */
export function pontosTratados(r) {
  const f = r.flags || {};
  const perfil = PERFIS.find((p) => p.id === r.perfil);
  const l = [
    "Cronograma 2026–2033 com as alíquotas e fatores de transição cadastrados no InTAX (IBS 18,7% e CBS 9,21% de referência, provisórios).",
    "Créditos das compras conforme o percentual informado, compensados com os débitos das vendas.",
    f.fora_ibs
      ? "Produtor abaixo do teto de R$ 3,6 milhões tratado como não contribuinte (sem IBS/CBS nas vendas e sem crédito nas compras)."
      : `Redução de IBS/CBS nas vendas: ${pct(r.reducao ?? perfil?.reducao_vendas ?? 0)}${perfil?.lei ? ` (${perfil.lei})` : ""}.`,
  ];
  if (f.exporta) l.push("Exportação desonerada: parcela exportada fora da base de IBS/CBS.");
  if (perfil?.imposto_seletivo_pct) l.push(`Imposto Seletivo de ${(perfil.imposto_seletivo_pct * 100).toFixed(2).replace(".", ",")}% do faturamento a partir de 2027 (alíquota máxima prevista).`);
  if (r.regime === "simples") l.push("Simples: DAS comparado com o regime regular do IBS/CBS.");
  if ((r.y2033?.saldoCredor || 0) > 0) l.push("Saldo credor (crédito maior que o débito) sinalizado como acúmulo, e não como economia.");
  return l;
}

/** O que a estimativa AINDA NÃO considera, com o motivo de importar. */
export function pontosNaoTratados(r) {
  const f = r.flags || {};
  const l = [
    { t: "Classificação produto a produto (NCM e cClassTrib)", p: "A estimativa usa uma redução média. Cada produto pode ter tratamento diferente; o diagnóstico com as notas calcula nota a nota." },
    { t: "Split payment e efeito no caixa", p: "Parte do tributo será retida na liquidação do pagamento (Arts. 31 a 35). Não entra na carga estimada, mas pesa no capital de giro." },
    { t: "Saldos credores de PIS/Cofins e ICMS na transição", p: "Créditos acumulados no sistema atual têm regras próprias de aproveitamento (Título VIII) e podem valer dinheiro." },
    { t: "Estoques e contratos que atravessam 2027", p: "Mercadoria comprada no sistema antigo e vendida no novo, e contratos de preço fixo sem cláusula de revisão tributária." },
    { t: "Incentivos fiscais estaduais de ICMS", p: "Benefícios do ICMS terminam ao longo da transição; o efeito depende do seu estado e do incentivo. A validar com o especialista." },
  ];
  if (f.compra_de_pf || f.fora_ibs || r.perfil === "racao" || r.perfil === "etanol" || r.perfil === "sementeira") {
    l.push({ t: "Crédito presumido nas compras de produtor rural", p: "Compras de produtor não contribuinte geram crédito presumido, com regra e percentual próprios (Art. 168), ainda não modelados." });
  }
  if (f.logistica_propria) l.push({ t: "Crédito presumido de transportador autônomo", p: "Contratação de autônomo pessoa física gera crédito presumido (Art. 169), não modelado." });
  if (f.icms_st) l.push({ t: "Fim gradual do ICMS-ST", p: "Substituição tributária sai aos poucos: revise preço e estoque com ST retido." });
  if (r.regime === "simples") l.push({ t: "Opção pelo regime regular dentro do Simples", p: "Prazos, regras e o efeito para o cliente empresa precisam de simulação própria (o Radar aponta 30/09/2026 como data-limite; confirmar)." });
  if (r.perfil === "restaurante") l.push({ t: "Hotelaria, transporte e demais regimes do mesmo capítulo", p: "Quem também presta esses serviços tem regras e reduções próprias (Arts. 281 a 291)." });
  if (r.perfil === "etanol") l.push({ t: "Regras monofásicas da cadeia de combustíveis", p: "O regime específico (Arts. 172 a 180) tem sujeição passiva e créditos próprios, simplificados nesta estimativa." });
  if (r.perfil === "mineradora") l.push({ t: "Alíquota final do Imposto Seletivo", p: "O teto de 0,25% é o máximo; a alíquota efetiva depende de lei ordinária." });
  return l;
}

/** Pacote enviado à IA (só fatos já calculados — a IA não recalcula nada). */
export function fatosParaIa(r, dados) {
  const perfil = PERFIS.find((p) => p.id === r.perfil);
  return {
    perfil: perfil?.label,
    base_legal_do_perfil: perfil?.lei,
    regime: REGIMES.find((x) => x.id === r.regime)?.label,
    faturamento_anual_reais: Math.round(r.base.fatAnual),
    carga_pct_do_faturamento: {
      hoje: Number(r.atual.toFixed(1)),
      em_2027: Number(r.y2027.pctTransicao.toFixed(1)),
      em_2033: Number(r.y2033.pctTransicao.toFixed(1)),
    },
    variacao_2033_pontos_percentuais: Number(r.delta2033.toFixed(1)),
    reducao_de_ibs_cbs_aplicada_pct: Math.round((r.reducao ?? 0) * 100),
    compras_pct_do_faturamento: dados.comprasPct,
    compras_com_credito_pct: dados.creditoPct,
    respostas_marcadas: Object.entries(r.flags || {}).filter(([, v]) => v).map(([k]) => k),
    alertas: r.cards.map((c) => c.titulo),
    ja_considerado: pontosTratados(r),
    ainda_nao_considerado: pontosNaoTratados(r).map((x) => x.t),
    como_era_x_como_fica: comoEraComoFica(r.perfil, r.regime).linhas.map((x) => ({ tema: x.tema, era: x.era, fica: x.fica })),
  };
}

/** Seções do PDF/relatório: comparativo, o que foi considerado e o que falta. */
export function secoesReforma(r) {
  const c = comoEraComoFica(r.perfil, r.regime);
  return [
    { titulo: `Como era × como fica (${c.regimeRot})`, blocos: c.linhas },
    { titulo: "O que esta estimativa já considera", itens: pontosTratados(r) },
    { titulo: "O que ainda não está considerado", itens: pontosNaoTratados(r).map((x) => `${x.t}: ${x.p}`) },
  ];
}
