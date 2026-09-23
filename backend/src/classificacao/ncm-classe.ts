/**
 * Cruzamento NCM x cClassTrib — lógica pura, sem banco, compartilhada pela
 * importação de XML, pela Consulta NCM e pelo validador de cadastro.
 *
 * A base (CorrelacaoNcm) vem dos Anexos da LC 214/2025 e às vezes só traz o
 * prefixo do NCM (ex: "38.24"). Por isso o casamento é por PREFIXO, e a
 * confiança depende de quantos dígitos o anexo especifica. Um NCM que não
 * aparece em nenhum anexo NÃO prova tributação padrão: pode haver outra base
 * legal (produtor rural, regime específico...). O resultado é sempre uma
 * SUGESTÃO para revisão humana, nunca um veredito.
 */

export type CorrelacaoNcmRow = {
  ncm: string;
  c_class_trib: string | null;
  anexo: string;
  item_lei: number | null;
  descricao_produto: string | null;
};

export type ClasseInfo = {
  c_class_trib: string;
  descricao_oficial?: string | null;
  cst?: string | null;
  pct_reducao_ibs?: number | null;
  pct_reducao_cbs?: number | null;
};

export type Confianca = 'alta' | 'media' | 'baixa';

export type AvaliacaoNcm = {
  encontrado: boolean;
  ambiguo: boolean;
  classes: string[];
  esperado: string | null;
  confianca: Confianca | null;
  especificidade: number;
  matches: CorrelacaoNcmRow[];
};

export const soDigitos = (s: unknown) => String(s ?? '').replace(/\D/g, '');

/** Lista ordenada do prefixo mais longo para o mais curto (busca mais específica primeiro). */
export function prepararLista(rows: CorrelacaoNcmRow[]): (CorrelacaoNcmRow & { _d: string })[] {
  return rows
    .map((r) => ({ ...r, _d: soDigitos(r.ncm) }))
    .filter((r) => r._d.length >= 2 && r.c_class_trib)
    .sort((a, b) => b._d.length - a._d.length);
}

export function avaliarNcm(ncm: string | null | undefined, lista: (CorrelacaoNcmRow & { _d: string })[]): AvaliacaoNcm {
  const d = soDigitos(ncm);
  const vazio: AvaliacaoNcm = {
    encontrado: false, ambiguo: false, classes: [], esperado: null, confianca: null, especificidade: 0, matches: [],
  };
  if (d.length < 2) return vazio;

  let especificidade = 0;
  const topo: CorrelacaoNcmRow[] = [];
  for (const r of lista) {
    if (!d.startsWith(r._d)) continue;
    if (especificidade === 0) especificidade = r._d.length;
    if (r._d.length < especificidade) break;
    topo.push(r);
  }
  if (topo.length === 0) return vazio;

  const classes = [...new Set(topo.map((m) => m.c_class_trib as string))];
  return {
    encontrado: true,
    ambiguo: classes.length > 1,
    classes,
    esperado: classes.length === 1 ? classes[0] : null,
    confianca: especificidade >= 8 ? 'alta' : especificidade >= 6 ? 'media' : 'baixa',
    especificidade,
    matches: topo.slice(0, 5),
  };
}

export type Comparacao =
  | 'CONFERE'
  | 'PADRAO_SEM_EXCECAO'
  | 'BENEFICIO_POSSIVELMENTE_PERDIDO'
  | 'REDUCAO_MAIOR_QUE_ESPERADO'
  | 'CLASSE_DIVERGENTE'
  | 'SEM_AMPARO_NO_ANEXO'
  | 'AMBIGUO_REVISAR';

const red = (m: Map<string, ClasseInfo>, c: string) =>
  Math.max(Number(m.get(c)?.pct_reducao_ibs ?? 0), Number(m.get(c)?.pct_reducao_cbs ?? 0));

/**
 * Compara o cClassTrib DECLARADO (na nota ou no cadastro) com o esperado pelo
 * NCM. Nunca bloqueia: devolve um código e uma mensagem para alerta.
 */
export function compararComDeclarado(
  declarado: string | null | undefined,
  av: AvaliacaoNcm,
  classes: Map<string, ClasseInfo>,
): { codigo: Comparacao; severidade: 'ok' | 'info' | 'alerta' | 'alta'; mensagem: string } {
  const d = (declarado || '').trim();

  if (!av.encontrado) {
    if (d && red(classes, d) > 0) {
      return {
        codigo: 'SEM_AMPARO_NO_ANEXO', severidade: 'alerta',
        mensagem: `cClassTrib ${d} concede redução, mas o NCM não consta nos anexos da LC 214 consultados. Pode ser válido por outra base legal (produtor rural, regime específico) — confirme.`,
      };
    }
    return {
      codigo: 'PADRAO_SEM_EXCECAO', severidade: 'ok',
      mensagem: 'NCM sem tratamento diferenciado nos anexos consultados (tributação padrão).',
    };
  }

  if (av.ambiguo) {
    const dentro = d && av.classes.includes(d);
    return {
      codigo: 'AMBIGUO_REVISAR', severidade: dentro ? 'ok' : 'info',
      mensagem: `O NCM cobre produtos com tratamentos diferentes (${av.classes.join(', ')}). ${dentro ? 'A classe informada é uma das possíveis.' : 'Revise conforme o produto.'}`,
    };
  }

  const esperado = av.esperado as string;
  if (d === esperado) {
    return { codigo: 'CONFERE', severidade: 'ok', mensagem: `cClassTrib ${d} confere com o esperado para o NCM.` };
  }

  const rd = red(classes, d);
  const re = red(classes, esperado);
  const pctFmt = (v: number) => `${Math.round(v * 100)}%`;
  if (!d || rd < re) {
    return {
      codigo: 'BENEFICIO_POSSIVELMENTE_PERDIDO', severidade: 'alta',
      mensagem: `O NCM aparece na LC 214 com ${esperado} (redução de ${pctFmt(re)}), mas foi informado ${d || 'nenhum cClassTrib'} (${pctFmt(rd)}). Possível benefício não aproveitado.`,
    };
  }
  if (rd > re) {
    return {
      codigo: 'REDUCAO_MAIOR_QUE_ESPERADO', severidade: 'alerta',
      mensagem: `Informado ${d} (redução de ${pctFmt(rd)}), mas o esperado para o NCM é ${esperado} (${pctFmt(re)}). Risco de autuação se não houver amparo.`,
    };
  }
  return {
    codigo: 'CLASSE_DIVERGENTE', severidade: 'info',
    mensagem: `Informado ${d}; esperado ${esperado} (mesma redução de ${pctFmt(re)}). Confira o enquadramento.`,
  };
}

/** Confiança em texto amigável. */
export const textoConfianca = (c: Confianca | null) =>
  c === 'alta' ? 'Alta (NCM completo no anexo)' : c === 'media' ? 'Média (subposição)' : c === 'baixa' ? 'Baixa (só posição)' : '—';
