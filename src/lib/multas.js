/**
 * Calculadora de multas por atraso (estimativa). Cada regra vem do texto oficial vigente, conferido em 11/11/2026 (fontes em REGRAS).
 * A multa de declaração é lançada pela Receita: o valor daqui é estimativa e não substitui a notificação.
 * Datas "AAAA-MM-DD" (sem fuso).
 */
import { plural } from "./plural";
const DIA = 86_400_000;
const d = (s) => { const [a, m, dd] = String(s).split("-").map(Number); return { a, m, d: dd, t: Date.UTC(a, m - 1, dd) }; };

/** Dias de atraso: do dia seguinte ao vencimento até o dia do pagamento ou da entrega (inclusive). */
export function diasDeAtraso(prazo, data) {
  return Math.max(0, Math.round((d(data).t - d(prazo).t) / DIA));
}

/**
 * Meses-calendário ou fração, contados a partir do dia seguinte ao prazo até a entrega. Contagem do InTAX: cada período de um mês
 * começado conta como um (16/11 a 15/12 = 1; 16/12 = 2).
 */
export function mesesOuFracao(prazo, entrega) {
  if (diasDeAtraso(prazo, entrega) <= 0) return 0;
  const ini = d(new Date(d(prazo).t + DIA).toISOString().slice(0, 10));
  const fim = d(entrega);
  return Math.max(1, (fim.a - ini.a) * 12 + (fim.m - ini.m) + (fim.d >= ini.d ? 1 : 0));
}

const R = (v) => Math.round(v * 100) / 100;
const FATOR_REDUCAO = { nenhuma: 1, espontanea: 0.5, intimacao: 0.75 };

export const REGRAS = {
  pagamento: { titulo: "Pagamento de tributo federal em atraso (multa e juros de mora)", fonte: "Lei nº 9.430/1996, art. 61, caput e §§ 1º a 3º", url: "https://www.planalto.gov.br/ccivil_03/leis/l9430.htm" },
  dctfweb: { titulo: "DCTFWeb entregue em atraso", fonte: "IN RFB nº 2.237/2024, art. 11 (base: Lei nº 8.212/1991, art. 32-A)", url: "https://normas.receita.fazenda.gov.br/sijut2consulta/link.action?idAto=141910", minimo: 500, minimoSemMovimento: 200, reducaoPorte: true },
  reinf: { titulo: "EFD-Reinf entregue em atraso", fonte: "IN RFB nº 2.043/2021, art. 7º", url: "https://normas.receita.fazenda.gov.br/sijut2consulta/link.action?idAto=119859", minimo: 500, reducaoPorte: true },
  pgdas: { titulo: "PGDAS-D entregue em atraso", fonte: "LC nº 123/2006, art. 38-A (redação da LC nº 214/2025); Res. CGSN nº 140/2018, art. 98", url: "https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm", minimo: 50 },
  defis: { titulo: "DEFIS entregue em atraso (até 2026)", fonte: "LC nº 123/2006, art. 38; Res. CGSN nº 140/2018, art. 97-A (revogado a partir de 01/01/2027 pela Res. CGSN nº 190/2026)", url: "https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm", minimo: 200 },
  dasn: { titulo: "DASN-SIMEI (MEI) entregue em atraso", fonte: "LC nº 123/2006, art. 38, § 6º; Res. CGSN nº 140/2018, art. 118", url: "https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm", minimo: 50 },
  receita: { titulo: "ECD, ECF (fora do Lucro Real) ou EFD-Contribuições em atraso", fonte: "Lei nº 8.218/1991, art. 12, III (redação da Lei nº 13.670/2018); IN RFB nº 2.003/2021, art. 11; IN RFB nº 2.004/2021, art. 6º, II; IN RFB nº 1.252/2012, art. 10", url: "https://www.planalto.gov.br/ccivil_03/leis/l8218.htm" },
  ecfReal: { titulo: "ECF do Lucro Real em atraso", fonte: "Decreto-Lei nº 1.598/1977, art. 8º-A (incluído pela Lei nº 12.973/2014); IN RFB nº 2.004/2021, art. 6º, I", url: "https://www.planalto.gov.br/ccivil_03/decreto-lei/del1598.htm" },
};

/** Multa de mora (0,33% ao dia, até 20%) e, se informada a Selic acumulada, os juros (Selic + 1% no mês do pagamento). */
export function multaDePagamento({ valor, vencimento, pagamento, selicAcumuladaPct }) {
  const dias = diasDeAtraso(vencimento, pagamento);
  const pct = Math.min(0.0033 * dias, 0.2);
  const multa = R(valor * pct);
  const mesesDepois = (d(pagamento).a - d(vencimento).a) * 12 + (d(pagamento).m - d(vencimento).m);
  const jurosPct = !dias ? 0 : mesesDepois <= 0 ? 0 : (selicAcumuladaPct === "" || selicAcumuladaPct == null ? null : Number(selicAcumuladaPct) + 1);
  const juros = jurosPct === null ? null : R(valor * jurosPct / 100);
  return { dias, pct, multa, jurosPct, juros, total: juros === null ? null : R(valor + multa + juros), passos: [`${plural(dias, "dia", "dias")} de atraso × 0,33% = ${(Math.min(0.0033 * dias, 99) * 100).toFixed(2).replace(".", ",")}%${pct === 0.2 ? " (limitado a 20%)" : ""}`, jurosPct === null ? "Juros: informe a Selic acumulada do mês seguinte ao vencimento até o mês anterior ao pagamento (tabela da Receita Federal)." : `Juros: ${jurosPct.toFixed(2).replace(".", ",")}% (Selic acumulada + 1% no mês do pagamento)`] };
}

/** Declarações de 2% ao mês-calendário (DCTFWeb, EFD-Reinf, PGDAS-D, DEFIS, DASN-SIMEI). */
export function multaDeDeclaracao({ tipo, tributos, prazo, entrega, reducao = "nenhuma", porte = "DEMAIS", semMovimento = false }) {
  const r = REGRAS[tipo];
  const meses = mesesOuFracao(prazo, entrega);
  const pct = Math.min(0.02 * meses, 0.2);
  const bruta = R(Number(tributos || 0) * pct);
  const reduzida = R(bruta * FATOR_REDUCAO[reducao]);
  let minimo = semMovimento && r.minimoSemMovimento ? r.minimoSemMovimento : r.minimo;
  const passos = [`${plural(meses, "mês-calendário", "meses-calendário")} ou fração × 2% = ${(pct * 100).toFixed(0)}%${pct === 0.2 ? " (limite de 20%)" : ""} sobre os tributos declarados = ${brl(bruta)}`];
  if (reducao !== "nenhuma") passos.push(`Redução ${reducao === "espontanea" ? "pela metade (entrega antes de procedimento de ofício)" : "para 75% (entrega no prazo da intimação)"}: ${brl(reduzida)}`);
  if (r.reducaoPorte && porte !== "DEMAIS") { minimo = minimo * (porte === "MEI" ? 0.1 : 0.5); passos.push(`Mínimo reduzido em ${porte === "MEI" ? "90% (MEI)" : "50% (ME/EPP do Simples)"} (LC nº 123/2006, art. 38-B), se paga em 30 dias da notificação`); }
  const multa = meses ? Math.max(reduzida, minimo) : 0;
  if (meses && reduzida < minimo) passos.push(`Vale o mínimo de ${brl(minimo)}`);
  return { meses, pct, multa: R(multa), passos };
}

/** ECD, ECF fora do Lucro Real e EFD-Contribuições: 0,02% por dia sobre a receita bruta do período, até 1%. */
export function multaPorReceita({ receita, prazo, entrega, reducao = "nenhuma" }) {
  const dias = diasDeAtraso(prazo, entrega);
  const pct = Math.min(0.0002 * dias, 0.01);
  const bruta = R(Number(receita || 0) * pct);
  const multa = R(bruta * FATOR_REDUCAO[reducao]);
  return { dias, pct, multa, passos: [`${plural(dias, "dia", "dias")} × 0,02% = ${(pct * 100).toFixed(2).replace(".", ",")}%${pct === 0.01 ? " (limite de 1%)" : ""} da receita bruta = ${brl(bruta)}`, ...(reducao !== "nenhuma" ? [`Com a redução: ${brl(multa)}`] : [])] };
}

/** ECF do Lucro Real: 0,25% ao mês sobre o lucro antes de IRPJ/CSLL, até 10% e até R$ 100 mil ou R$ 5 milhões; vale a maior redução. */
export function multaEcfReal({ lucro, receitaAnoAnterior, prazo, entrega, reducao = "nenhuma" }) {
  const meses = mesesOuFracao(prazo, entrega);
  const dias = diasDeAtraso(prazo, entrega);
  const pct = Math.min(0.0025 * meses, 0.1);
  const teto = Number(receitaAnoAnterior || 0) <= 3_600_000 ? 100_000 : 5_000_000;
  const bruta = Math.min(R(Number(lucro || 0) * pct), teto);
  const fatores = [FATOR_REDUCAO[reducao] ?? 1, dias && dias <= 30 ? 0.1 : 1, dias && dias <= 60 ? 0.25 : 1];
  const fator = Math.min(...fatores);
  return { meses, pct, teto, multa: R(bruta * fator), passos: [`${plural(meses, "mês", "meses")} × 0,25% = ${(pct * 100).toFixed(2).replace(".", ",")}% do lucro líquido antes do IRPJ e da CSLL${bruta === teto ? `, limitado a ${brl(teto)}` : ""} = ${brl(bruta)}`, ...(fator < 1 ? [`Maior redução cabível: paga-se ${(fator * 100).toFixed(0)}% (as reduções não se somam: não confirmado na lei, o InTAX aplica só a maior)`] : [])] };
}

export const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
