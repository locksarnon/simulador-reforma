/**
 * Conferência de uma operação do simulador com a calculadora oficial: monta o pedido (base do art. 12 pelos componentes e,
 * de 2027 em diante, as alíquotas nominais do motor) e lê o resultado. Lógica pura.
 */
export type EntradaOperacao = {
  data?: string; ano: number; cst?: string; cClassTrib?: string; ncm?: string; nbs?: string; valorBruto: number;
  pisPct?: number; cofinsPct?: number; icmsPct?: number; fcpPct?: number; issPct?: number;
  fatores: { pisCofins: number; icms: number; iss: number };
  aliquotas?: { cbs: number; ibsUf: number; ibsMun: number };
  semAlcance?: string | null;
};
export type ConferenciaOperacao = {
  estado: 'COMPARAVEL' | 'FORA_DO_ALCANCE' | 'ERRO'; motivo: string | null; erros: { codigo: string; mensagem: string }[];
  oficial: { vBC: number; vCBS: number; vIBS: number; vIBSUF: number; vIBSMun: number } | null;
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const MUNICIPIO_REFERENCIA = 4106902;

export function pedidoDaOperacao(e: EntradaOperacao) {
  const componentes: Record<string, number> = { vProd: r2(e.valorBruto) };
  const vPIS = r2(e.valorBruto * (e.pisPct ?? 0) * e.fatores.pisCofins);
  const vCOFINS = r2(e.valorBruto * (e.cofinsPct ?? 0) * e.fatores.pisCofins);
  const vICMS = r2(e.valorBruto * ((e.icmsPct ?? 0) + (e.fcpPct ?? 0)) * e.fatores.icms);
  const vISSQN = r2(e.valorBruto * (e.issPct ?? 0) * e.fatores.iss);
  // O ICMS só entra na base de bem e o ISS só na de serviço (a calculadora ignora o que não vale para a natureza).
  if (vPIS) componentes.vPIS = vPIS;
  if (vCOFINS) componentes.vCOFINS = vCOFINS;
  if (e.nbs) { if (vISSQN) componentes.vISSQN = vISSQN; } else if (vICMS) componentes.vICMS = vICMS;
  const ncm = e.ncm && /^\d{8}$/.test(e.ncm.replace(/\D/g, '')) ? e.ncm.replace(/\D/g, '') : undefined;
  const nbs = e.nbs && /^\d{9}$/.test(e.nbs.replace(/\D/g, '')) ? e.nbs.replace(/\D/g, '') : undefined;
  return {
    id: 'simulador', versao: '1.0.0', dhFatoGerador: `${(e.data ?? `${e.ano}-06-15`).slice(0, 10)}T12:00:00-03:00`, municipio: MUNICIPIO_REFERENCIA, tpDoc: nbs ? 65 : 55,
    itens: [{
      numero: 1, ...(ncm ? { ncm } : {}), ...(nbs ? { nbs } : {}), cst: e.cst, cClassTrib: e.cClassTrib, gComponentesBC: componentes,
      ...(e.ano >= 2027 && e.aliquotas ? { aliquotasNominais: { cbs: e.aliquotas.cbs, ibsEstadual: e.aliquotas.ibsUf, ibsMunicipal: e.aliquotas.ibsMun } } : {}),
    }],
  };
}

type Objeto = { estadoItem?: string; erros?: { code?: string; title?: string; detail?: string }[]; tribCalc?: { IBSCBS?: { gIBSCBS?: Record<string, any> } } };
export function lerConferencia(o: Objeto | undefined): ConferenciaOperacao {
  if (!o) return { estado: 'ERRO', motivo: 'A calculadora oficial não devolveu o item.', erros: [], oficial: null };
  const erros = (o.erros ?? []).map((x) => ({ codigo: String(x.code ?? ''), mensagem: String(x.detail ?? x.title ?? '') }));
  if (o.estadoItem === 'NAO_IMPLEMENTADO') return { estado: 'FORA_DO_ALCANCE', motivo: 'A calculadora oficial ainda não calcula esta classificação.', erros, oficial: null };
  if (o.estadoItem === 'INCONSISTENCIA_ENTRADA') {
    const precisaNomenclatura = erros.some((x) => ['REG-015', 'REG-016'].includes(x.codigo));
    return { estado: 'FORA_DO_ALCANCE', motivo: precisaNomenclatura ? 'Informe o NCM (mercadoria) ou a NBS completa (serviço) na operação para conferir com a calculadora oficial.' : 'A calculadora oficial recusou o enquadramento desta operação.', erros, oficial: null };
  }
  if (o.estadoItem !== 'CALCULADO' && o.estadoItem !== 'CALCULO_SIMULADO') return { estado: 'ERRO', motivo: 'A calculadora oficial não conseguiu calcular.', erros, oficial: null };
  const g = o.tribCalc?.IBSCBS?.gIBSCBS;
  const n = (v: unknown) => Number(v ?? 0);
  return { estado: 'COMPARAVEL', motivo: null, erros, oficial: { vBC: n(g?.vBC), vCBS: n(g?.gCBS?.vCBS), vIBS: n(g?.vIBS), vIBSUF: n(g?.gIBSUF?.vIBSUF), vIBSMun: n(g?.gIBSMun?.vIBSMun) } };
}
