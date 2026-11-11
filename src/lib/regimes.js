import { estimar, REGIMES } from "@/lib/calculadoraAgro";

/**
 * "Onde cada regime vence": roda o MESMO motor da calculadora (estimar) uma vez para cada regime possível do perfil e compara a
 * carga sobre o consumo ano a ano (PIS/Cofins, ICMS, IBS/CBS e o DAS do Simples). IRPJ, CSLL e folha não entram: a tela avisa.
 */
export const DAS_PADRAO = 8;

export const EMPATE = "empate";
const rotulo = (id) => (id === EMPATE ? "Empate" : REGIMES.find((r) => r.id === id)?.label || id);
const TOLERANCIA_PP = 0.005;

/**
 * As perguntas do perfil respondidas pelos números informados: "a receita passa de R$ 3,6 milhões?" sai do faturamento e
 * "exporta?" sai do percentual exportado. As demais ficam "não" (não mudam a conta da carga).
 */
export function respostasDerivadas(perfil, base) {
  const r = {};
  for (const q of perfil?.perguntas || []) {
    if (q.id === "receita_3_6") r[q.id] = Number(base.faturamentoAnual) > 3_600_000 ? "sim" : "nao";
    else if (q.id === "exporta") r[q.id] = Number(base.exportaPct) > 0 ? "sim" : "nao";
    else r[q.id] = "nao";
  }
  return r;
}

/** Roda o motor para cada regime e devolve as séries, o vencedor de cada ano (ou "empate") e as linhas para o gráfico. */
export function compararRegimes(base, perfil, parametros, { dasPct = DAS_PADRAO, cenarioTexto } = {}) {
  const ids = (perfil?.regimes || []).filter((r) => r !== "produtor_pf");
  const respostas = { ...respostasDerivadas(perfil, base), ...(base.respostas || {}) };
  const resultados = ids.map((id) => ({
    id, label: rotulo(id),
    r: estimar({ ...base, respostas, perfil: perfil.id, regime: id, cargaInformada: id === "simples" ? dasPct : null }, parametros, { cenarioTexto }),
  }));
  const anos = resultados[0]?.r.serie.map((s) => s.ano) || [];
  const linhas = anos.map((ano) => {
    const l = { ano };
    for (const x of resultados) {
      const s = x.r.serie.find((y) => y.ano === ano);
      l[x.id] = s ? Number(s.pctTransicao.toFixed(2)) : null;
      l[`${x.id}_reais`] = s ? s.cargaTransicao : null;
      l[`${x.id}_credor`] = s ? s.saldoCredor || 0 : 0;
    }
    return l;
  });
  const vencedorPorAno = Object.fromEntries(linhas.map((l) => {
    const validos = ids.filter((id) => l[id] !== null);
    if (!validos.length) return [l.ano, null];
    const menor = Math.min(...validos.map((id) => l[id]));
    const empatados = validos.filter((id) => l[id] - menor <= TOLERANCIA_PP);
    return [l.ano, empatados.length > 1 ? EMPATE : empatados[0]];
  }));
  return { regimes: resultados.map(({ id, label }) => ({ id, label })), resultados, anos, linhas, vencedorPorAno };
}

/**
 * O regime de menor carga no ano escolhido para cada combinação de compras (% do faturamento) e crédito (% das compras que geram
 * crédito), mantendo o resto igual. É o mapa de "onde cada regime vence".
 */
export function mapaDeVencedores(base, perfil, parametros, { ano = 2033, dasPct = DAS_PADRAO, compras = [10, 30, 50, 70, 90], creditos = [0, 25, 50, 75, 100] } = {}) {
  return compras.map((c) => ({
    compras: c,
    celulas: creditos.map((cr) => {
      const { linhas, vencedorPorAno } = compararRegimes({ ...base, comprasPct: c, creditoPct: cr }, perfil, parametros, { dasPct });
      const l = linhas.find((x) => x.ano === ano) || linhas[linhas.length - 1];
      return { credito: cr, vencedor: vencedorPorAno[l?.ano] ?? null, cargas: l };
    }),
  }));
}

/** Os anos em que o vencedor muda, em frases curtas: "2027: Lucro Presumido", "2031: Lucro Real". */
export function viradas(vencedorPorAno) {
  const anos = Object.keys(vencedorPorAno).map(Number).sort((a, b) => a - b);
  const out = [];
  let anterior = null;
  for (const a of anos) {
    if (vencedorPorAno[a] !== anterior) out.push({ ano: a, regime: vencedorPorAno[a] });
    anterior = vencedorPorAno[a];
  }
  return out;
}

export { rotulo as rotuloDoRegime };
