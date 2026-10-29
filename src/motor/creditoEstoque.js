/**
 * Crédito presumido de CBS sobre o estoque de 31/12/2026.
 * LC 214/2025, art. 381 (e arts. 382 e 383), regulamentado pelo Decreto 12.955/2026, arts. 605 a 609.
 *
 * QUEM TEM DIREITO (art. 381, caput e incisos; Decreto, art. 605)
 *  Contribuinte do regime regular da CBS, em uma destas hipóteses sobre o estoque existente em 1º/1/2027:
 *   I   — estava no regime CUMULATIVO de PIS/Cofins em 31/12/2026, quanto aos bens em estoque sem crédito
 *         de PIS/Cofins por causa desse regime;
 *   II  — bens comprados sujeitos a substituição tributária ou a incidência monofásica das leis citadas
 *         (Lei 10.147, art. 1º, I; Lei 10.485, arts. 1º, 3º, II e 5º; MP 2.158-35, art. 43; Lei 9.532, art. 53;
 *         Lei 12.402, art. 6º, II);
 *   III — a parcela do estoque sujeita à vedação parcial de crédito dos §§ 7º a 9º do art. 3º das Leis
 *         10.637 e 10.833.
 *  Só bens NOVOS comprados de pessoa jurídica domiciliada no País, ou importados, para revenda, produção de bens para
 *  venda ou prestação de serviços a terceiros (§1º, I). Ficam de fora: compra com alíquota zero, isenção,
 *  suspensão ou não incidência de PIS/Cofins (II); uso e consumo pessoal (III); ativo imobilizado e imóveis
 *  (IV); bens de terceiros (Decreto, art. 606, §1º).
 *
 * QUANTO (art. 381, §3º; Decreto, art. 607, §3º)
 *  Compra no País: 9,25% do valor do estoque. Importação: o PIS/Cofins-Importação efetivamente pago, sem o
 *  adicional de alíquota do art. 8º, §21, da Lei 10.865.
 *  Valor do estoque (Decreto, art. 609): custo de aquisição pelas regras do IRPJ, separando nacional de
 *  importado; em produto acabado e em elaboração, só o custo de aquisição das matérias-primas e embalagens.
 *
 * QUANDO E COMO USAR (art. 381, §4º; art. 383)
 *  Apurar e apropriar até o último dia de junho de 2027; usar em 12 parcelas mensais iguais e sucessivas a
 *  partir do período seguinte ao da apropriação; só compensa com CBS (nada de outros tributos nem
 *  ressarcimento). O direito de usar expira 5 anos depois do último dia do período de apuração em que o
 *  crédito foi apropriado. O inventário é feito só em 31/12/2026, com documentação fiscal idônea guardada por
 *  no mínimo 5 anos (Decreto, arts. 606 e 608).
 */

export const ALIQUOTA_ESTOQUE_NACIONAL = 0.0925;
export const PARCELAS_ESTOQUE = 12;
/** Último mês (AAAA-MM) em que o crédito pode ser apropriado. */
export const ULTIMO_MES_APROPRIACAO = "2027-06";
export const PRIMEIRO_MES_APROPRIACAO = "2027-01";
export const ANOS_PARA_USAR = 5;

export const HIPOTESES_ESTOQUE = [
  { id: "I", nome: "I — Regime cumulativo de PIS/Cofins em 31/12/2026", detalhe: "Bens sem crédito de PIS/Cofins por causa do regime cumulativo (art. 381, I)." },
  { id: "II", nome: "II — Compra com substituição tributária ou monofásica", detalhe: "Bens comprados nas hipóteses das leis do art. 381, II (ex.: autopeças, máquinas e veículos da Lei 10.485; medicamentos e perfumaria da Lei 10.147)." },
  { id: "III", nome: "III — Parcela com vedação parcial de crédito", detalhe: "Só a parcela do valor sujeita à vedação dos §§ 7º a 9º do art. 3º das Leis 10.637 e 10.833 (art. 381, III). Informe só essa parcela." },
  { id: "nenhuma", nome: "Nenhuma das hipóteses (crédito normal de PIS/Cofins já aproveitado)", detalhe: "Quem aproveitou o crédito de PIS/Cofins na compra não tem crédito presumido sobre esse estoque." },
];

export const DESTINOS_ESTOQUE = [
  { id: "revenda", nome: "Revenda", elegivel: true },
  { id: "producao", nome: "Produção de bens para venda", elegivel: true },
  { id: "servicos", nome: "Prestação de serviços a terceiros", elegivel: true },
  { id: "uso_consumo", nome: "Uso e consumo pessoal", elegivel: false, motivo: "Bem de uso e consumo pessoal fica de fora (art. 381, §1º, III; art. 57)." },
  { id: "imobilizado", nome: "Ativo imobilizado", elegivel: false, motivo: "Bem do ativo imobilizado fica de fora (art. 381, §1º, IV, a)." },
  { id: "imovel", nome: "Imóvel", elegivel: false, motivo: "Imóvel fica de fora (art. 381, §1º, IV, b)." },
];

const num = (v) => (typeof v === "number" ? v : Number(v) || 0);
const arred2 = (v) => Math.round(v * 100) / 100;

/** "2027-06" → { ano: 2027, mes: 6 } */
function lerMes(aaaamm) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(aaaamm || ""));
  return m ? { ano: Number(m[1]), mes: Number(m[2]) } : null;
}
const formatarMes = ({ ano, mes }) => `${ano}-${String(mes).padStart(2, "0")}`;
function somarMeses({ ano, mes }, n) {
  const idx = ano * 12 + (mes - 1) + n;
  return { ano: Math.floor(idx / 12), mes: (idx % 12) + 1 };
}
const ultimoDiaDoMes = ({ ano, mes }) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();

/**
 * Motivo pelo qual o item não gera crédito, ou null se gera. A ordem segue o texto da lei: regime (caput), estoque
 * de terceiros (Decreto, art. 606, §1º) e depois o §1º do art. 381, inciso por inciso (I bens novos de pessoa
 * jurídica ou importados, II compra com PIS/Cofins zerado, III uso e consumo, IV imobilizado e imóveis).
 */
export function motivoDeInelegibilidade(item, contexto = {}) {
  if (contexto.regimeRegular === false) return "Só o contribuinte do regime regular da CBS tem o crédito (art. 381, caput). Optante do Simples fora do regime regular não apropria.";
  if (item.bemDeTerceiros) return "Estoque de terceiros não entra no inventário (Decreto 12.955, art. 606, §1º).";
  if (item.bemUsado) return "Só bens novos geram o crédito (art. 381, §1º, I).";
  if (item.compradoDePessoaFisica && item.origem !== "importado") {
    return "Só bens adquiridos de pessoa jurídica domiciliada no País, ou importados, geram o crédito (art. 381, §1º, I; Decreto 12.955, art. 607). Compra de pessoa física, como o produtor rural PF, fica de fora.";
  }
  if (item.aquisicaoSemPisCofins) return "Compra com alíquota zero, isenção, suspensão ou não incidência de PIS/Cofins não gera o crédito (art. 381, §1º, II).";
  const destino = DESTINOS_ESTOQUE.find((d) => d.id === item.destino);
  if (!destino) return "Informe o destino do bem (revenda, produção ou serviços).";
  if (!destino.elegivel) return destino.motivo;
  if (!HIPOTESES_ESTOQUE.some((h) => h.id === item.hipotese) || item.hipotese === "nenhuma") {
    return "Fora das hipóteses do art. 381: quem tomou o crédito de PIS/Cofins na compra não tem crédito presumido sobre esse estoque.";
  }
  if (item.hipotese === "I" && contexto.cumulativoEm31122026 === false) return "A hipótese I exige estar no regime cumulativo de PIS/Cofins em 31/12/2026 (art. 381, I).";
  if (item.origem === "importado" && !(num(item.pisCofinsImportacaoPago) > 0)) return "Importação: informe o PIS/Cofins-Importação efetivamente pago (sem o adicional de alíquota), que é o valor do crédito.";
  if (!(num(item.valor) > 0) && item.origem !== "importado") return "Informe o custo de aquisição do estoque.";
  return null;
}

/** Crédito presumido de um item elegível (sem arredondar). */
export function creditoDoItem(item) {
  if (item.origem === "importado") return Math.max(0, num(item.pisCofinsImportacaoPago));
  return Math.max(0, num(item.valor)) * ALIQUOTA_ESTOQUE_NACIONAL;
}

/**
 * Calcula o crédito presumido, o cronograma de 12 parcelas e (opcionalmente) o abatimento da CBS devida.
 *
 * @param itens   [{ descricao, origem: "nacional"|"importado", valor, pisCofinsImportacaoPago, hipotese,
 *                   destino, bemUsado, bemDeTerceiros, aquisicaoSemPisCofins }]
 * @param opcoes  { regimeRegular = true, cumulativoEm31122026 = null, mesApropriacao = "2027-06",
 *                  cbsMensal = null — CBS estimada a pagar por mês (número fixo) para ver o abatimento }
 */
export function calcCreditoEstoque(itens = [], opcoes = {}) {
  const contexto = { regimeRegular: opcoes.regimeRegular !== false, cumulativoEm31122026: opcoes.cumulativoEm31122026 ?? null };
  const avisos = [];

  let mesApr = lerMes(opcoes.mesApropriacao || ULTIMO_MES_APROPRIACAO);
  const limite = lerMes(ULTIMO_MES_APROPRIACAO);
  const inicio = lerMes(PRIMEIRO_MES_APROPRIACAO);
  if (!mesApr || formatarMes(mesApr) > formatarMes(limite)) {
    avisos.push(`O crédito precisa ser apropriado até o último dia de junho de 2027 (art. 381, §4º, I): usado ${ULTIMO_MES_APROPRIACAO}.`);
    mesApr = limite;
  } else if (formatarMes(mesApr) < formatarMes(inicio)) {
    mesApr = inicio;
  }

  const linhas = itens.map((item, i) => {
    const motivo = motivoDeInelegibilidade(item, contexto);
    const credito = motivo ? 0 : creditoDoItem(item);
    return {
      indice: i, descricao: item.descricao || `Item ${i + 1}`, origem: item.origem || "nacional",
      hipotese: item.hipotese, valorEstoque: num(item.valor), elegivel: !motivo, motivo, credito: arred2(credito),
    };
  });

  const total = arred2(linhas.reduce((s, l) => s + l.credito, 0));
  const valorElegivel = arred2(linhas.filter((l) => l.elegivel && l.origem !== "importado").reduce((s, l) => s + l.valorEstoque, 0));
  const valorFora = arred2(linhas.filter((l) => !l.elegivel).reduce((s, l) => s + l.valorEstoque, 0));

  // 12 parcelas mensais iguais a partir do período seguinte ao da apropriação. Em centavos inteiros: os centavos que
  // não dividem por 12 vão, um a um, para as primeiras parcelas (nenhuma difere de outra em mais de R$ 0,01).
  const totalCentavos = Math.round(total * 100);
  const centavosBase = Math.floor(totalCentavos / PARCELAS_ESTOQUE);
  const centavosExtras = totalCentavos - centavosBase * PARCELAS_ESTOQUE;
  const parcelaBase = centavosBase / 100;
  const cbsMensal = opcoes.cbsMensal != null && opcoes.cbsMensal !== "" ? Math.max(0, num(opcoes.cbsMensal)) : null;
  let saldoDisponivel = 0;
  let acumuladoCompensado = 0;
  const cronograma = Array.from({ length: PARCELAS_ESTOQUE }, (_, k) => {
    const mes = somarMeses(mesApr, k + 1);
    const parcela = (centavosBase + (k < centavosExtras ? 1 : 0)) / 100;
    saldoDisponivel = arred2(saldoDisponivel + parcela);
    let compensado = null;
    if (cbsMensal !== null) {
      compensado = arred2(Math.min(saldoDisponivel, cbsMensal));
      saldoDisponivel = arred2(saldoDisponivel - compensado);
      acumuladoCompensado = arred2(acumuladoCompensado + compensado);
    }
    return {
      mes: formatarMes(mes), parcela,
      cbsAPagar: cbsMensal, compensado, cbsLiquida: cbsMensal !== null ? arred2(cbsMensal - compensado) : null,
      saldoAposCompensar: cbsMensal !== null ? saldoDisponivel : null,
    };
  });

  // Art. 383: 5 anos contados do último dia do período de apuração em que ocorreu a apropriação.
  const fimPeriodoApropriacao = { ano: mesApr.ano, mes: mesApr.mes, dia: ultimoDiaDoMes(mesApr) };
  const venceEm = `${fimPeriodoApropriacao.ano + ANOS_PARA_USAR}-${String(fimPeriodoApropriacao.mes).padStart(2, "0")}-${String(fimPeriodoApropriacao.dia).padStart(2, "0")}`;

  if (cbsMensal !== null && saldoDisponivel > 0) {
    avisos.push("Com a CBS mensal informada, o crédito não é usado por inteiro nas 12 parcelas: o saldo continua disponível para compensar CBS futura até o vencimento do direito (art. 383), sem ressarcimento.");
  }

  return {
    mesApropriacao: formatarMes(mesApr), linhas, total, valorElegivel, valorFora,
    parcelaMensal: parcelaBase, cronograma, venceEm,
    compensadoNoCronograma: cbsMensal !== null ? acumuladoCompensado : null,
    saldoNaoCompensado: cbsMensal !== null ? saldoDisponivel : null,
    avisos,
  };
}
