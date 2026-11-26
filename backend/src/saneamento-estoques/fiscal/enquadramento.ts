/**
 * Enquadramento legal por NCM + finalidade + cenário, com texto da lei, artigo/anexo, CST, cClassTrib e vigência.
 * Função pura sobre um instantâneo de catálogos. Nada é inventado: sem base carregada (NCM inválido, classe fora de vigência,
 * NCM ambíguo ou citado só por capítulo/posição) o resultado é AGUARDANDO_INFORMACAO com o motivo.
 * Regra de ouro: tabela cClassTrib da SVRS (CST e vigência) > texto da LC 214 (anexo/item) > calculadora oficial (não usada aqui).
 */
import { Cenario, Finalidade, ItemTrabalho } from '../tipos';
import { CatalogosFiscais, ClasseFiscal } from './catalogos';
import { CenarioBase, Credito, cenariosAplicaveis, operacaoOriginalPadrao, regraCredito, regraCreditoDevolucao } from './cenarios';

/** Classe da tributação padrão (integral) na tabela da SVRS; resolvida pelo catálogo (se não estiver carregada, fica aguardando). */
export const CLASSE_PADRAO = '000001';

export type Enquadramento = {
  cenario: Cenario;
  finalidade: Finalidade | null;
  ncm: string | null;
  /** Texto da lei (descrição do item do anexo ou da classe na SVRS). */
  enquadramentoLegal: string | null;
  /** Ex.: "Anexo I, item 12 (LC 214/2025)". Só o que o catálogo traz. */
  artigo: string | null;
  cst: string | null;
  cClassTrib: string | null;
  vigencia: { inicio: string | null; fim: string | null } | null;
  /** Redução de alíquota da classe (fração; 0.6 = 60%). */
  reducao: { ibs: number; cbs: number } | null;
  credito: Credito | null;
  observacao: string;
  origem: 'HERDADO' | 'EXCECAO';
  status: 'DEFINIDO' | 'AGUARDANDO_INFORMACAO';
  motivoSeAguardando: string | null;
};

export type OpcoesEnquadramento = {
  /** Operação que a devolução espelha. Sem ela, usa a padrão da finalidade (revenda: venda; demais: a aquisição). */
  operacaoOriginal?: CenarioBase | null;
};

const ncm8 = (n: string | null | undefined) => String(n ?? '').replace(/\D/g, '');
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Versão da classe vigente na data-base (preferindo a ativa); null com o motivo quando não há. */
export function classeVigente(cat: CatalogosFiscais, cClassTrib: string, dataBase: string): { classe: ClasseFiscal | null; motivo: string | null } {
  const versoes = cat.versoesDaClasse(cClassTrib);
  if (versoes.length === 0) return { classe: null, motivo: `cClassTrib ${cClassTrib} não consta na tabela da SVRS carregada` };
  const vale = versoes.filter((v) => (!v.vigenciaInicio || v.vigenciaInicio <= dataBase) && (!v.vigenciaFim || dataBase <= v.vigenciaFim));
  const escolhida = vale.find((v) => v.ativa) ?? vale[0];
  if (!escolhida) return { classe: null, motivo: `cClassTrib ${cClassTrib} sem versão vigente em ${dataBase} na tabela da SVRS` };
  return { classe: escolhida, motivo: null };
}

function aguardando(cenario: Cenario, finalidade: Finalidade | null, ncm: string | null, motivo: string): Enquadramento {
  return {
    cenario, finalidade, ncm, enquadramentoLegal: null, artigo: null, cst: null, cClassTrib: null, vigencia: null, reducao: null, credito: null,
    observacao: motivo, origem: 'HERDADO', status: 'AGUARDANDO_INFORMACAO', motivoSeAguardando: motivo,
  };
}

export function enquadrar(
  ncm: string | null | undefined, finalidade: Finalidade | null, cenario: Cenario, dataBase: string, cat: CatalogosFiscais, opcoes: OpcoesEnquadramento = {},
): Enquadramento {
  const n = ncm8(ncm);
  if (n.length !== 8) return aguardando(cenario, finalidade, n || null, 'NCM ausente ou fora do formato de 8 dígitos');
  if (cat.ncmExiste(n) === false) return aguardando(cenario, finalidade, n, 'NCM não consta na tabela oficial carregada');
  if (!finalidade) return aguardando(cenario, null, n, 'Finalidade não confirmada');
  if (cenariosAplicaveis(finalidade).length === 0) return aguardando(cenario, finalidade, n, 'Material de terceiros: o tratamento depende da operação (remessa/retorno) e não foi conferido nesta base');

  let original: CenarioBase | null = null; let base: Cenario = cenario;
  if (cenario === 'DEVOLUCAO') {
    original = opcoes.operacaoOriginal ?? operacaoOriginalPadrao(finalidade);
    if (!original) return aguardando(cenario, finalidade, n, 'Informar a operação original da devolução');
    base = original;
  }
  if (!cenariosAplicaveis(finalidade).includes(base)) return aguardando(cenario, finalidade, n, `O cenário não se aplica à finalidade ${finalidade}`);

  const art47 = cat.dispositivoExiste('lcp-214-2025', 'art-47');
  const credito = cenario === 'DEVOLUCAO' ? regraCreditoDevolucao(original!, finalidade, art47) : regraCredito(base as CenarioBase, finalidade, art47);
  const notas: string[] = [];
  if (cenario === 'DEVOLUCAO') notas.push(`Devolução espelha a operação original (${original === 'VENDA' ? 'venda' : 'aquisição'}): mesmo CST e cClassTrib (interpretação interna, regra operacional; conferir)`);
  if (base === 'COMPRA_REVENDA' && finalidade !== 'REVENDA') notas.push('Aquisição para produção avaliada no cenário de compra (mesma regra de crédito)');

  const av = cat.avaliarNcm(n);
  let cClassTrib: string; let enquadramentoLegal: string; let artigo: string | null = null;
  if (av.encontrado && av.ambiguo) {
    return { ...aguardando(cenario, finalidade, n, `NCM com tratamentos diferentes nos anexos (${av.classes.join(', ')}): escolher conforme o produto`), credito };
  }
  if (av.encontrado) {
    if (av.especificidade < 6) {
      const m0 = av.matches[0];
      return { ...aguardando(cenario, finalidade, n, `O anexo especifica só a posição (${av.especificidade} dígitos; Anexo ${m0.anexo}, item ${m0.item_lei ?? '?'}): confirmar os requisitos do produto`), credito };
    }
    const m = av.matches[0];
    cClassTrib = av.esperado as string;
    artigo = `Anexo ${m.anexo}${m.item_lei != null ? `, item ${m.item_lei}` : ''} (LC 214/2025)`;
    enquadramentoLegal = `${artigo}${m.descricao_produto ? `: ${m.descricao_produto}` : ''}`;
    if (m.anexo === 'IX') notas.push('Anexo IX (insumos agropecuários): o benefício depende da destinação e dos requisitos da operação; ler o anexo');
    const refsJuntas = cat.referencias(n);
    if (refsJuntas.length > 0) notas.push(`O NCM também é citado por capítulo/posição no Anexo ${refsJuntas[0].anexo}${refsJuntas[0].item_lei != null ? `, item ${refsJuntas[0].item_lei}` : ''}: conferir os requisitos do anexo`);
    if (av.especificidade < 8) notas.push(`Enquadrado pelo prefixo de ${av.especificidade} dígitos do anexo`);
  } else {
    const refs = cat.referencias(n);
    if (refs.length > 0) {
      const r = refs[0];
      return { ...aguardando(cenario, finalidade, n, `O Anexo ${r.anexo}${r.item_lei != null ? `, item ${r.item_lei}` : ''} cita o capítulo ou a posição do NCM: ler o item e decidir pelos requisitos do produto`), credito };
    }
    cClassTrib = CLASSE_PADRAO;
    enquadramentoLegal = 'Sem enquadramento nos anexos consultados da LC 214/2025: tributação padrão';
    notas.push('Não exclui benefício por outra base legal (ex.: regime específico); confirmar quando houver indício');
  }

  const { classe, motivo } = classeVigente(cat, cClassTrib, dataBase);
  if (!classe) return { ...aguardando(cenario, finalidade, n, motivo!), credito };
  return {
    cenario, finalidade, ncm: n,
    enquadramentoLegal: `${enquadramentoLegal}${classe.descricao ? ` | cClassTrib ${classe.cClassTrib}: ${classe.descricao}` : ''}`,
    artigo, cst: classe.cst, cClassTrib: classe.cClassTrib,
    vigencia: { inicio: classe.vigenciaInicio, fim: classe.vigenciaFim },
    reducao: { ibs: classe.pctReducaoIbs, cbs: classe.pctReducaoCbs },
    credito,
    observacao: [classe.pctReducaoIbs || classe.pctReducaoCbs ? `Redução IBS ${pct(classe.pctReducaoIbs)} / CBS ${pct(classe.pctReducaoCbs)}` : '', ...notas].filter(Boolean).join('. '),
    origem: 'HERDADO', status: 'DEFINIDO', motivoSeAguardando: null,
  };
}

// ───────────── Conjunto e exceção ─────────────

/** Conjunto de trabalho = mesmo NCM + mesma finalidade. Item sem NCM de 8 dígitos ou sem finalidade fica em conjunto "SEM_…". */
export function chaveDoConjunto(item: Pick<ItemTrabalho, 'ncm' | 'finalidade'>): string {
  const n = ncm8(item.ncm);
  return `${n.length === 8 ? n : 'SEM_NCM'}|${item.finalidade ?? 'SEM_FINALIDADE'}`;
}

export function agruparConjuntos<T extends Pick<ItemTrabalho, 'ncm' | 'finalidade'>>(itens: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of itens) { const k = chaveDoConjunto(it); (m.get(k) ?? m.set(k, []).get(k)!).push(it); }
  return new Map([...m.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

export type ExcecaoItem = { motivo: string; cClassTrib: string; };

/**
 * Exceção do item sobre o enquadramento herdado do conjunto: exige motivo (mín. 5 caracteres) e um cClassTrib existente e vigente
 * na tabela da SVRS. Sem isso fica aguardando (nunca aplica em silêncio).
 */
export function aplicarExcecao(herdado: Enquadramento, excecao: ExcecaoItem | null | undefined, dataBase: string, cat: CatalogosFiscais): Enquadramento {
  if (!excecao) return herdado;
  const motivo = String(excecao.motivo ?? '').trim();
  if (motivo.length < 5) return { ...herdado, origem: 'EXCECAO', status: 'AGUARDANDO_INFORMACAO', motivoSeAguardando: 'Exceção exige motivo escrito' };
  const { classe, motivo: erro } = classeVigente(cat, String(excecao.cClassTrib).trim(), dataBase);
  if (!classe) return { ...herdado, origem: 'EXCECAO', status: 'AGUARDANDO_INFORMACAO', motivoSeAguardando: erro };
  return {
    ...herdado, origem: 'EXCECAO', status: 'DEFINIDO', motivoSeAguardando: null,
    cst: classe.cst, cClassTrib: classe.cClassTrib, vigencia: { inicio: classe.vigenciaInicio, fim: classe.vigenciaFim },
    reducao: { ibs: classe.pctReducaoIbs, cbs: classe.pctReducaoCbs },
    enquadramentoLegal: `Exceção do item: ${motivo} | cClassTrib ${classe.cClassTrib}${classe.descricao ? `: ${classe.descricao}` : ''}`,
    observacao: `Exceção ao conjunto (herdado: ${herdado.cClassTrib ?? 'sem classe'}): ${motivo}`,
  };
}

/** Resultado por item: herda o do conjunto; a exceção (se houver) sobrepõe. */
export function enquadramentoDoItem(herdado: Enquadramento, excecao: ExcecaoItem | null | undefined, dataBase: string, cat: CatalogosFiscais): Enquadramento {
  return aplicarExcecao(herdado, excecao, dataBase, cat);
}
