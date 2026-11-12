/**
 * Leitura do PDF da declaração do PGDAS-D (o próprio documento da Receita, pelo Integra Contador): receita do período (RPA),
 * RBT12, RBA, RBAA, limite e sublimite, receitas e folha de salários dos meses anteriores e o fator r. É dessa declaração que
 * saem o sublimite, o relatório de faturamento e o Fator R, sem nada digitado.
 */
export type LeituraPgdasd = {
  periodo: string | null; // AAAA-MM
  numero: string | null;
  regime: string | null; // Competência ou Caixa
  rpa: number | null;
  rbt12: number | null;
  rba: number | null;
  rbaa: number | null;
  limite: number | null;
  sublimite: number | null;
  receitas: { competencia: string; interno: number; externo: number }[];
  folha: { competencia: string; valor: number }[];
  fatorR: number | null;
  fatorRTexto: string | null;
  debitoTotal: number | null;
};

const num = (s: string | undefined) => (s ? Number(s.replace(/\./g, '').replace(',', '.')) : null);
const VALOR = '(\\d{1,3}(?:\\.\\d{3})*,\\d{2})';
const plano = (t: string) => t.replace(/\r/g, '').replace(/[ \t]+/g, ' ');

/** Primeiro valor "total" depois do rótulo (a linha traz interno, externo e total; o total é o terceiro). */
function totalApos(t: string, rotulo: RegExp): number | null {
  const i = t.search(rotulo);
  if (i < 0) return null;
  const trecho = t.slice(i, i + 400);
  const m = trecho.match(new RegExp(`${VALOR}\\s+${VALOR}\\s+${VALOR}`));
  if (m) return num(m[3]);
  const um = trecho.match(new RegExp(VALOR));
  return um ? num(um[1]) : null;
}

/** Pares "MM/AAAA valor" de uma seção (receitas ou folha). */
function pares(trecho: string) {
  return [...trecho.matchAll(new RegExp(`(\\d{2})\\/(\\d{4})\\s+${VALOR}`, 'g'))].map((m) => ({ competencia: `${m[2]}-${m[1]}`, valor: num(m[3]) ?? 0 }));
}

export function lerDeclaracaoPgdasd(texto: string): LeituraPgdasd {
  const t = plano(texto);
  const per = t.match(/Per[ií]odo de Apura[cç][aã]o:\s*\d{2}\/(\d{2})\/(\d{4})/);
  const secao = (de: RegExp, ate: RegExp) => { const i = t.search(de); if (i < 0) return ''; const resto = t.slice(i); const f = resto.slice(1).search(ate); return f < 0 ? resto : resto.slice(0, f + 1); };
  const interno = pares(secao(/2\.2\.1\)\s*Mercado Interno/i, /2\.2\.2\)/));
  const externo = pares(secao(/2\.2\.2\)\s*Mercado Externo/i, /2\.3\)/));
  const receitas = interno.map((x) => ({ competencia: x.competencia, interno: x.valor, externo: externo.find((e) => e.competencia === x.competencia)?.valor ?? 0 }))
    .sort((a, b) => a.competencia.localeCompare(b.competencia));
  const folhaTrecho = secao(/2\.3\)\s*Folha de Sal[aá]rios/i, /2\.4\)/);
  const folha = pares(folhaTrecho).sort((a, b) => a.competencia.localeCompare(b.competencia));
  const fr = t.match(/Fator r\s*=\s*([^\n]+)/i)?.[1]?.trim() ?? null;
  const frNum = fr?.match(/(\d+(?:,\d+)?)/)?.[1];
  const sub = t.match(new RegExp(`Sublimite de Receita Anual \\(R\\$\\):\\s*${VALOR}`))?.[1];
  const lim = t.match(new RegExp(`Limite de receita bruta proporcionalizado\\s+${VALOR}`))?.[1];
  const resumo = t.match(new RegExp(`Receita Bruta Auferida[\\s\\S]{0,400}?${VALOR}\\s+${VALOR}`));
  return {
    periodo: per ? `${per[2]}-${per[1]}` : null,
    // O PDF às vezes separa os dígitos do número com espaços.
    numero: (t.match(/N(?:[ºo°]|[uú]mero)\s*da\s*Declara[cç][aã]o:\s*([\d ]{10,})/)?.[1] ?? '').replace(/\D/g, '') || null,
    regime: t.match(/Regime de Apura[cç][aã]o:\s*(Compet[eê]ncia|Caixa)/i)?.[1] ?? null,
    rpa: totalApos(t, /Receita Bruta do PA \(RPA\)/i),
    rbt12: totalApos(t, /\(RBT12\)/),
    rba: totalApos(t, /\(RBA\)/),
    rbaa: totalApos(t, /\(RBAA\)/),
    limite: num(lim),
    sublimite: num(sub),
    receitas,
    folha,
    fatorR: frNum ? Number(frNum.replace(',', '.')) : null,
    fatorRTexto: fr,
    debitoTotal: resumo ? num(resumo[2]) : null,
  };
}

/** Sublimite, faturamento mês a mês e Fator R a partir da declaração mais recente. */
export function analiseSimples(l: LeituraPgdasd) {
  const LIMITE = 4_800_000;
  const sublimite = l.sublimite ?? 3_600_000;
  const rbt12 = l.rbt12 ?? 0;
  const rba = l.rba ?? 0;
  const pctSub = sublimite ? Math.round((rba / sublimite) * 1000) / 10 : 0;
  const pctLim = Math.round((rba / LIMITE) * 1000) / 10;
  const situacaoSublimite = rba > sublimite ? 'EXCEDEU' : pctSub >= 80 ? 'ATENCAO' : 'OK';
  const faturamento = [...l.receitas.map((r) => ({ competencia: r.competencia, interno: r.interno, externo: r.externo, total: r.interno + r.externo }))];
  if (l.periodo && l.rpa !== null && !faturamento.some((f) => f.competencia === l.periodo)) faturamento.push({ competencia: l.periodo, interno: l.rpa, externo: 0, total: l.rpa });
  const folha12 = l.folha.reduce((s, f) => s + f.valor, 0);
  const fatorCalc = rbt12 > 0 && l.folha.length ? Math.round((folha12 / rbt12) * 10000) / 100 : null;
  const fatorR = l.fatorR ?? fatorCalc;
  return {
    periodo: l.periodo, regime: l.regime,
    sublimite: { rbt12, rba, rbaa: l.rbaa, sublimite, limite: LIMITE, percentual_sublimite: pctSub, percentual_limite: pctLim, situacao: situacaoSublimite },
    faturamento: faturamento.sort((a, b) => a.competencia.localeCompare(b.competencia)),
    fator_r: { folha12, rbt12, percentual: fatorR, texto: l.fatorRTexto, anexo: fatorR === null ? null : fatorR >= 28 ? 'III' : 'V', folha: l.folha },
  };
}
