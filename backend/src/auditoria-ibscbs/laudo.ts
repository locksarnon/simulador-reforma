/**
 * Laudo de homologação fiscal do ERP para IBS/CBS: agrupa as notas que o ERP emitiu em cenários (CST / cClassTrib / CFOP) e dá um
 * veredito por cenário a partir da conferência com a calculadora oficial. Lógica pura sobre as linhas da AuditoriaIbsCbs.
 */
import type { ResultadoItem } from './conferencia';

export type LinhaAuditoria = {
  empresa_id: string; chave: string; papel: string; situacao: string; data_emissao: Date | string | null; detalhes: unknown;
};
export type SituacaoCenario = 'REPROVADO' | 'APROVADO' | 'NAO_COBERTO' | 'SEM_DESTAQUE';
export type Achado = { tipo: 'ENQUADRAMENTO' | 'DIVERGENTE'; regra: string; texto: string; ocorrencias: number; exemplo: { chave: string; item: number } };
export type Cenario = {
  empresa_id: string; cst: string; cClassTrib: string; cfop: string; notas: number; itens: number;
  aprovados: number; reprovados: number; nao_cobertos: number; sem_destaque: number; situacao: SituacaoCenario; achados: Achado[];
};
export type Laudo = {
  cenarios: Cenario[];
  resumo: { cenarios: number; aprovados: number; reprovados: number; nao_cobertos: number; sem_destaque: number; notas: number; itens: number; homologacao_ignoradas: number };
};

const ROTULO_ACHADO = (i: ResultadoItem): Omit<Achado, 'ocorrencias' | 'exemplo'>[] => {
  if (i.situacao === 'ENQUADRAMENTO') return (i.erros.length ? i.erros : [{ codigo: '', mensagem: 'Enquadramento recusado pela calculadora oficial.' }])
    .map((e) => ({ tipo: 'ENQUADRAMENTO' as const, regra: e.codigo || 'Enquadramento', texto: e.mensagem }));
  return i.campos.map((c) => ({ tipo: 'DIVERGENTE' as const, regra: c.campo, texto: `${c.campo}: nota ${c.nota ?? '—'} × oficial ${c.oficial ?? '—'}` }));
};

export function montarLaudo(linhas: LinhaAuditoria[]): Laudo {
  const mapa = new Map<string, Cenario & { _notas: Set<string>; _achados: Map<string, Achado> }>();
  let homologacao = 0;
  const notasContadas = new Set<string>();
  for (const l of linhas) {
    if (l.papel !== 'EMITIDA') continue;
    if (l.situacao === 'HOMOLOGACAO') { homologacao++; continue; }
    const itens = (Array.isArray(l.detalhes) ? l.detalhes : []) as ResultadoItem[];
    notasContadas.add(l.chave);
    for (const i of itens) {
      const cst = i.cst ?? '—'; const ct = i.cClassTrib ?? 'sem grupo'; const cfop = i.cfop || '—';
      const k = `${l.empresa_id}|${cst}|${ct}|${cfop}`;
      let c = mapa.get(k);
      if (!c) { c = { empresa_id: l.empresa_id, cst, cClassTrib: ct, cfop, notas: 0, itens: 0, aprovados: 0, reprovados: 0, nao_cobertos: 0, sem_destaque: 0, situacao: 'APROVADO', achados: [], _notas: new Set(), _achados: new Map() }; mapa.set(k, c); }
      c._notas.add(l.chave);
      c.itens++;
      if (i.situacao === 'CONFERE') c.aprovados++;
      else if (i.situacao === 'SEM_GRUPO') c.sem_destaque++;
      else if (i.situacao === 'NAO_COBERTO' || i.situacao === 'FALHA') c.nao_cobertos++;
      else {
        c.reprovados++;
        for (const a of ROTULO_ACHADO(i)) {
          const ka = `${a.tipo}|${a.regra}|${a.tipo === 'ENQUADRAMENTO' ? a.texto : ''}`;
          const ja = c._achados.get(ka);
          if (ja) ja.ocorrencias++;
          else c._achados.set(ka, { ...a, ocorrencias: 1, exemplo: { chave: l.chave, item: i.numero } });
        }
      }
    }
  }
  const cenarios: Cenario[] = [...mapa.values()].map(({ _notas, _achados, ...c }) => {
    const situacao: SituacaoCenario = c.reprovados > 0 ? 'REPROVADO' : c.aprovados > 0 ? 'APROVADO' : c.nao_cobertos > 0 ? 'NAO_COBERTO' : 'SEM_DESTAQUE';
    return { ...c, notas: _notas.size, situacao, achados: [..._achados.values()].sort((a, b) => b.ocorrencias - a.ocorrencias) };
  });
  const ordem: Record<SituacaoCenario, number> = { REPROVADO: 0, SEM_DESTAQUE: 1, NAO_COBERTO: 2, APROVADO: 3 };
  cenarios.sort((a, b) => ordem[a.situacao] - ordem[b.situacao] || b.itens - a.itens);
  const conta = (s: SituacaoCenario) => cenarios.filter((c) => c.situacao === s).length;
  return {
    cenarios,
    resumo: { cenarios: cenarios.length, aprovados: conta('APROVADO'), reprovados: conta('REPROVADO'), nao_cobertos: conta('NAO_COBERTO'), sem_destaque: conta('SEM_DESTAQUE'), notas: notasContadas.size, itens: cenarios.reduce((s, c) => s + c.itens, 0), homologacao_ignoradas: homologacao },
  };
}
