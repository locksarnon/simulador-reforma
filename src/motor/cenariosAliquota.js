/**
 * Cenários de alíquotas de referência para 2029–2033.
 *
 * O QUE A LEI JÁ FIXOU E O QUE AINDA NÃO
 *  - 2026: IBS 0,1% e CBS 0,9%, só informativo (EC 132, ADCT art. 125; LC 214, arts. 343, 346 e 348).
 *  - 2027–2028: IBS 0,05% estadual + 0,05% municipal (ADCT art. 127; LC 214, art. 344) e CBS =
 *    alíquota de referência − 0,1 p.p. (ADCT art. 127, parágrafo único; LC 214, art. 347). A
 *    referência de 2027 é fixada pelo Senado, com base no cálculo do TCU, até 31/10/2026 no prazo geral
 *    (LC 214, art. 349, §1º), prorrogado em 45 dias em 2026 (art. 353, §2º), ou seja, até 15/12/2026: o TCU
 *    aprovou 11,3468% em 28/10/2026, que o §14 arredonda para 11,3%.
 *  - 2029–2033: NADA foi fixado. A CBS e o IBS de referência de cada ano só saem em outubro do ano
 *    anterior (LC 214, art. 349, II e §1º). O que existe são regras de cálculo (arts. 353 a 365),
 *    a escala de transição do ICMS/ISS (ADCT art. 128: 9/10, 8/10, 7/10 e 6/10) e o gatilho de
 *    26,5% para a soma das duas alíquotas de referência em 2033 (art. 475, §§ 9º a 11).
 *
 * Por isso a ferramenta não "tem" uma alíquota para 2029–2033: tem CENÁRIOS, todos declarados
 * como tais. Cada cenário define só duas coisas — a CBS de referência e o IBS de referência
 * "cheio" (o de 2033, já sem ICMS/ISS). O IBS cobrado em cada ano é a fração cheia correspondente
 * ao que o ICMS/ISS perde naquele ano (ADCT arts. 128 e 130, II e III): 10%, 20%, 30%, 40% e 100%.
 *
 * Linhas com status "Oficial" nunca são alteradas pelo cenário: quando o Senado fixar um ano, o
 * administrador grava a linha como "Oficial" na tela Transição e o cenário passa a respeitá-la.
 */

/** Gatilho da LC 214, art. 475, §11: soma das alíquotas de referência estimadas para 2033. */
export const GATILHO_SOMA_REFERENCIA = 0.265;
/** Primeiro ano em que as alíquotas de referência ainda não foram (nem têm data para ser) fixadas. */
export const ANO_INICIO_CENARIO = 2029;

/** ADCT art. 127, parágrafo único, e LC 214, art. 347: a CBS de 2027–2028 é a referência menos 0,1 p.p. */
const REDUCAO_CBS_2027_2028 = 0.001;
/** TCU, 28/10/2026 (11,3468%, arredondada pelo art. 349, §14) — só usada se a linha de 2027 não existir. */
const CBS_REFERENCIA_PADRAO = 0.113;
/** Premissa metodológica do CGIBS (Resolução 14/2026) — só usada se a linha de 2033 não existir. */
const IBS_CHEIO_PADRAO = 0.187;
/** Partilha estados × municípios: premissa do InTAX (a LC 214 não fixa a partilha das alíquotas de referência). */
const PARTE_UF_PADRAO = 0.79;
const LIMITE_MAXIMO_PERSONALIZADO = 0.6;

const num = (v) => (typeof v === "number" ? v : Number(v) || 0);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const arred = (v) => Math.round(v * 1e6) / 1e6;
const virgula = (v, casas) => (v * 100).toFixed(casas).replace(".", ",");

/** "11,3%" — uma casa para as alíquotas de referência (o art. 349, §14, arredonda ao décimo de ponto). */
export const pctRef = (v, casas = 1) => `${virgula(v, casas)}%`;

/**
 * Definição dos cenários. `resolver` recebe as referências lidas da tabela cadastrada e devolve
 * { cbs, ibsCheio } — ou null quando o cenário é "deixe a tabela como está".
 */
export const CENARIOS_ALIQUOTA = [
  {
    id: "gatilho",
    nome: "Gatilho de 26,5% (padrão)",
    curto: "Gatilho de 26,5%",
    resumo: "CBS na referência de 2027 e IBS no que falta para a soma fechar em 26,5%.",
    descricao:
      "A CBS de 2029 a 2033 fica na referência de 2027 calculada pelo TCU (11,3%) e o IBS de referência de 2033 é o que sobra para a soma das duas chegar a 26,5%, o gatilho de revisão da LC 214 (art. 475, §11): se a avaliação quinquenal estimar uma soma acima disso, o Executivo deve propor medidas para voltar a 26,5% ou menos. É o cenário que fica dentro do que a própria lei usa como meta. Não é o “Teto de Referência” dos arts. 367 a 369 (outro conceito, ligado à arrecadação) e não aplica a eventual redução da CBS do art. 368.",
    fonte: "LC 214/2025, arts. 349, 353 a 365 e 475 (§§ 9º a 11); EC 132/2023, ADCT arts. 128 e 130; TCU (CBS 2027)",
    resolver: ({ cbsReferencia2027 }) => ({ cbs: cbsReferencia2027, ibsCheio: Math.max(0, GATILHO_SOMA_REFERENCIA - cbsReferencia2027) }),
  },
  {
    id: "somadas",
    nome: "Estimativas oficiais somadas (estresse)",
    curto: "Estimativas somadas",
    resumo: "CBS de 11,3% (TCU) e IBS de 18,7% (premissa do CGIBS): soma de 30,0%.",
    descricao:
      "Soma as duas estimativas institucionais que existem hoje: a CBS de referência de 2027 calculada pelo TCU, mantida até 2033, e o IBS de 18,7% da premissa metodológica do Comitê Gestor (Resolução CGIBS nº 14/2026). A soma passa de 26,5% e dispara o alerta do art. 475, §11: use como cenário de estresse, não como previsão.",
    fonte: "TCU (CBS 2027, 28/10/2026); Resolução CGIBS 14/2026; LC 214/2025, art. 475, §11",
    resolver: ({ cbsReferencia2027, ibsCheioCadastrado }) => ({ cbs: cbsReferencia2027, ibsCheio: ibsCheioCadastrado }),
  },
  {
    id: "cadastrada",
    nome: "Tabela cadastrada em Transição",
    curto: "Tabela cadastrada",
    resumo: "Usa as alíquotas gravadas na tela Transição, sem ajuste.",
    descricao:
      "Não altera nada: 2029 a 2033 saem exatamente como estão cadastrados na tela Transição (hoje, CBS de 9,21% e IBS de 18,7%, soma de 27,9%, valores derivados da premissa do CGIBS e sem fixação oficial). Serve para reproduzir simulações antigas e para quando o administrador cadastrar os valores que o Senado fixar.",
    fonte: "Tabela TransicaoAno (campo Fonte de cada linha)",
    resolver: () => null,
  },
  {
    id: "personalizado",
    nome: "Personalizado",
    curto: "Personalizado",
    resumo: "Você informa a CBS e o IBS de referência (cheio) de 2033.",
    descricao:
      "Você informa a CBS de referência e o IBS de referência cheio (o de 2033). O IBS dos anos de transição segue a escala do ADCT (10%, 20%, 30%, 40% e 100%). Útil para testar o efeito de uma alíquota que a sua assessoria espera ou de uma fixação do Senado ainda não cadastrada.",
    fonte: "Premissa do usuário; escala do IBS: EC 132/2023, ADCT arts. 128 e 130",
    resolver: (ref, sel) => ({
      cbs: sel.cbs != null ? sel.cbs : ref.cbsReferencia2027,
      ibsCheio: sel.ibs != null ? sel.ibs : Math.max(0, GATILHO_SOMA_REFERENCIA - ref.cbsReferencia2027),
    }),
  },
];

export const CENARIO_PADRAO_ID = "gatilho";

/** Ids de versões anteriores (guardados no navegador) e o cenário que passaram a ser. */
const ID_ANTIGO = { teto: "gatilho", sem_teto: "somadas" };

/** Seleção válida a partir de qualquer coisa que tenha sido guardada (localStorage, URL, estado antigo). */
export function normalizarSelecao(sel) {
  const pedido = ID_ANTIGO[sel?.id] || sel?.id;
  const id = CENARIOS_ALIQUOTA.some((c) => c.id === pedido) ? pedido : CENARIO_PADRAO_ID;
  const lim = (v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(LIMITE_MAXIMO_PERSONALIZADO, Math.max(0, n)) : null;
  };
  return { id, cbs: lim(sel?.cbs), ibs: lim(sel?.ibs) };
}

const linhaDoAno = (linhas, ano) => linhas.find((l) => Number(l.ano) === ano);

/**
 * Redutor das compras governamentais (arts. 349, III, e 472): o de cada ano só é fixado no ano anterior, então
 * os anos depois do último cadastrado não têm valor. Em vez de deixar a venda a órgão público sem redução do
 * nada (um salto que nenhuma lei prevê), repete o último redutor cadastrado — premissa que a tela mostra.
 * Zero significa "sem redutor cadastrado".
 */
function repetirRedutor(linhas) {
  const ordenadas = [...linhas].sort((a, b) => num(a.ano) - num(b.ano));
  let ultimo = null;
  const repetir = new Map();
  for (const l of ordenadas) {
    const v = num(l.redutor_compra_gov);
    if (v > 0) ultimo = { ano: num(l.ano), valor: v };
    else if (ultimo) repetir.set(num(l.ano), ultimo);
  }
  const resumo = ultimo ? { valor: ultimo.valor, ano: ultimo.ano } : null;
  if (repetir.size === 0) return { linhas, redutor: resumo };
  return {
    redutor: resumo,
    linhas: linhas.map((l) => (repetir.has(num(l.ano))
      ? { ...l, redutor_compra_gov: repetir.get(num(l.ano)).valor, redutor_repetido_de: repetir.get(num(l.ano)).ano }
      : l)),
  };
}

/** Referências lidas da tabela cadastrada (a base de todos os cenários). */
export function referenciasDaTabela(linhas = []) {
  const l27 = linhaDoAno(linhas, 2027);
  const l33 = linhaDoAno(linhas, 2033);
  const fracao33 = l33 ? clamp01(1 - num(l33.icms_fator)) : 1;
  return {
    cbsReferencia2027: l27 ? arred(num(l27.cbs_efetiva) + REDUCAO_CBS_2027_2028) : CBS_REFERENCIA_PADRAO,
    cbsCadastrada: l33 ? num(l33.cbs_efetiva) : null,
    ibsCheioCadastrado: l33 ? (fracao33 > 0 ? arred(num(l33.ibs_efetivo) / fracao33) : num(l33.ibs_efetivo)) : IBS_CHEIO_PADRAO,
  };
}

/**
 * Aplica o cenário às linhas de TransicaoAno (mesmo formato de entrada e de saída).
 * Só mexe em CBS, IBS e partilha UF/município dos anos ≥ 2029 que não sejam "Oficial".
 *
 * @returns { linhas, resumo } — `resumo` descreve o cenário aplicado (soma de referência, alerta do gatilho).
 */
export function resolverTransicao(linhas, selecaoBruta) {
  const base = Array.isArray(linhas) ? linhas : [];
  const sel = normalizarSelecao(selecaoBruta);
  const cenario = CENARIOS_ALIQUOTA.find((c) => c.id === sel.id);
  const ref = referenciasDaTabela(base);
  const valores = cenario.resolver(ref, sel);

  const cbsRef = valores ? valores.cbs : (ref.cbsCadastrada ?? ref.cbsReferencia2027);
  const ibsCheio = valores ? valores.ibsCheio : ref.ibsCheioCadastrado;
  const soma = cbsRef + ibsCheio;

  const { redutor } = repetirRedutor(base);
  const resumo = {
    id: cenario.id, nome: cenario.nome, curto: cenario.curto, resumo: cenario.resumo,
    descricao: cenario.descricao, fonte: cenario.fonte,
    cbsReferencia: cbsRef, ibsReferenciaCheia: ibsCheio, somaReferencia: soma,
    gatilho: GATILHO_SOMA_REFERENCIA, acimaDoGatilho: soma > GATILHO_SOMA_REFERENCIA + 1e-9,
    excesso: Math.max(0, soma - GATILHO_SOMA_REFERENCIA), anoInicio: ANO_INICIO_CENARIO,
    redutorCompraGov: redutor,
    selecao: sel,
  };

  if (!valores) return { linhas: repetirRedutor(base).linhas, resumo };

  const novas = base.map((l) => {
    if (num(l.ano) < ANO_INICIO_CENARIO || String(l.status || "").toLowerCase() === "oficial") return l;
    const fracao = clamp01(1 - num(l.icms_fator));
    const ibs = ibsCheio * fracao;
    const uf = num(l.ibs_uf_aliquota);
    const mun = num(l.ibs_mun_aliquota);
    const parteUf = uf + mun > 0 ? uf / (uf + mun) : PARTE_UF_PADRAO;
    return {
      ...l,
      cbs_efetiva: arred(valores.cbs),
      ibs_efetivo: arred(ibs),
      ibs_uf_aliquota: arred(ibs * parteUf),
      ibs_mun_aliquota: arred(ibs * (1 - parteUf)),
      fonte: `Cenário "${cenario.nome}"`,
      status: "Cenário",
      cenario_id: cenario.id,
    };
  });
  return { linhas: repetirRedutor(novas).linhas, resumo };
}

/** Texto do alerta quando a soma das alíquotas de referência passa do gatilho; null se não passa. */
export function alertaGatilho(resumo) {
  if (!resumo?.acimaDoGatilho) return null;
  return `Soma das alíquotas de referência de 2033: ${pctRef(resumo.somaReferencia)} (CBS ${pctRef(resumo.cbsReferencia)} + IBS ${pctRef(resumo.ibsReferenciaCheia)}), ${(resumo.excesso * 100).toFixed(1).replace(".", ",")} p.p. acima do gatilho de ${pctRef(resumo.gatilho)} da LC 214, art. 475, §11. Se a avaliação quinquenal (a primeira, com dados de 2030) estimar uma soma acima disso, o Executivo precisa enviar ao Congresso um projeto de lei complementar para reduzi-la: trate este cenário como estresse, não como previsão.`;
}

/** Uma linha para rodapés e PDFs: o cenário e os números que ele usa. */
export function descricaoCurta(resumo) {
  if (!resumo) return "";
  return `Cenário de alíquotas 2029–2033: ${resumo.nome}. CBS de referência ${pctRef(resumo.cbsReferencia)} + IBS de referência cheio ${pctRef(resumo.ibsReferenciaCheia)} = ${pctRef(resumo.somaReferencia)}. Estimativa do InTAX: o Senado só fixa esses valores em outubro do ano anterior (LC 214, art. 349).`;
}
