/**
 * Comparação das tabelas do InTAX com as da calculadora oficial da Receita. Lógica pura.
 * Régua: a tabela cClassTrib do Portal da Conformidade Fácil (SVRS) é a fonte; o banco da calculadora pode estar mais velho ou mais
 * novo que o do InTAX. Por isso a comparação NUNCA corrige sozinha: aponta, e a origem de cada lado fica registrada.
 */
export type ClasseOficial = { c_class_trib: string; cst: string; pct_reducao_cbs: number | null; pct_reducao_ibs: number | null; documentos: string[]; inicio_vigencia: string; fim_vigencia: string | null };
export type ClasseIntax = { c_class_trib: string; cst: string | null; pct_reducao_cbs: number; pct_reducao_ibs: number; status: string; vigencia_fim: Date | null };
export type VinculoOficial = { tipo: string; codigo: string; c_class_trib: string; anexo: string | null; item: string | null; excecoes: string[]; fim_vigencia: string | null };
export type CorrelacaoIntax = { ncm: string; c_class_trib: string | null; anexo: string; item_lei: number | null; excecao: boolean };
export type Divergencia = { grupo: string; chave: string; intax: string; oficial: string; observacao?: string };
export type ComparacaoTabelas = { data: string; contagens: Record<string, number>; resumo: Record<string, number>; lista: Divergencia[] };

const so = (s: unknown) => String(s ?? '').replace(/\D/g, '');
const GRUPOS_INFORMATIVOS = new Set(['cClassTrib só no InTAX', 'cClassTrib só na calculadora']);
const LIMITE_POR_GRUPO = 150;

export function compararTabelas(
  { oficial, intax, vinculos, correlacao }: { oficial: ClasseOficial[]; intax: ClasseIntax[]; vinculos: VinculoOficial[]; correlacao: CorrelacaoIntax[] },
  hoje: Date = new Date(),
): ComparacaoTabelas {
  const dia = hoje.toISOString().slice(0, 10);
  const vigenteOf = (c: ClasseOficial) => c.inicio_vigencia.slice(0, 10) <= dia && (!c.fim_vigencia || c.fim_vigencia.slice(0, 10) >= dia);
  const vigenteIn = (c: ClasseIntax) => c.status !== 'Inativo' && (!c.vigencia_fim || c.vigencia_fim.getTime() >= hoje.getTime());
  // A calculadora já carrega classes com início em 2027: conta como "vigente" para a comparação de conjunto.
  const of = new Map(oficial.filter((c) => vigenteOf(c) || c.inicio_vigencia.slice(0, 4) >= '2027').map((c) => [c.c_class_trib, c]));
  const inx = new Map(intax.filter(vigenteIn).map((c) => [c.c_class_trib, c]));
  const lista: Divergencia[] = [];
  const add = (grupo: string, chave: string, i: string, o: string, observacao?: string) => lista.push({ grupo, chave, intax: i, oficial: o, observacao });

  for (const [cd, c] of of) if (!inx.has(cd)) add('cClassTrib só na calculadora', cd, '—', `CST ${c.cst}`, `vigência desde ${c.inicio_vigencia.slice(0, 10)}`);
  for (const [cd, c] of inx) if (!of.has(cd)) add('cClassTrib só no InTAX', cd, `CST ${c.cst ?? '—'}`, '—', 'a versão da calculadora ainda não traz o código');
  for (const [cd, c] of inx) {
    const o = of.get(cd);
    if (!o) continue;
    if (c.cst && o.cst && c.cst !== o.cst) add('CST divergente', cd, c.cst, o.cst);
    // CST 400 e 410 são gravados no InTAX com 100% de redução (convenção própria: efeito zero); a calculadora grava 0%.
    if (['400', '410'].includes(c.cst ?? '')) continue;
    for (const [rot, i, ofi] of [['CBS', c.pct_reducao_cbs, o.pct_reducao_cbs], ['IBS', c.pct_reducao_ibs, o.pct_reducao_ibs]] as const) {
      if (ofi == null) continue;
      const pi = Math.round(i * 10000) / 100;
      if (Math.abs(pi - ofi) > 0.001) add(`Redução ${rot} divergente`, cd, `${pi}%`, `${ofi}%`, `CST ${c.cst}`);
    }
  }

  // Correlação NCM x anexos: o NCM do InTAX precisa ter amparo nos vínculos oficiais do mesmo cClassTrib (prefixo, sem as exceções).
  const ncmOf = vinculos.filter((v) => v.tipo === 'NCM' && !v.fim_vigencia);
  const porClasse = new Map<string, VinculoOficial[]>();
  for (const v of ncmOf) porClasse.set(v.c_class_trib, [...(porClasse.get(v.c_class_trib) ?? []), v]);
  const amparo = (ncm: string, cd: string) => {
    const regras = porClasse.get(cd);
    if (!regras) return of.has(cd) ? 'sem-anexo' : 'classe-ausente';
    const casa = regras.filter((v) => ncm.startsWith(so(v.codigo)));
    if (!casa.length) return 'fora';
    return casa.some((v) => !v.excecoes.some((e) => ncm.startsWith(so(e)))) ? 'ok' : 'excecao';
  };
  const intaxPares = new Set<string>();
  for (const c of correlacao) {
    if (!c.c_class_trib || c.excecao) continue;
    const n = so(c.ncm);
    intaxPares.add(`${c.c_class_trib}|${n}`);
    const a = amparo(n, c.c_class_trib);
    if (a === 'ok' || a === 'sem-anexo' || a === 'classe-ausente') continue;
    add('Correlação do InTAX sem amparo na calculadora', `${c.ncm} → ${c.c_class_trib}`, `Anexo ${c.anexo} item ${c.item_lei ?? ''}`, a === 'excecao' ? 'NCM é exceção na calculadora' : 'NCM fora dos vínculos');
  }
  const prefixosIntax = new Map<string, string[]>();
  for (const c of correlacao) if (c.c_class_trib && !c.excecao) prefixosIntax.set(c.c_class_trib, [...(prefixosIntax.get(c.c_class_trib) ?? []), so(c.ncm)]);
  for (const v of ncmOf) {
    const cod = so(v.codigo);
    const cobre = (prefixosIntax.get(v.c_class_trib) ?? []).some((p) => cod.startsWith(p) || p.startsWith(cod));
    if (!cobre && inx.has(v.c_class_trib)) add('Vínculo da calculadora ausente no InTAX', `${v.codigo} → ${v.c_class_trib}`, '—', `Anexo ${v.anexo ?? ''} item ${v.item ?? ''}`);
  }

  const resumo: Record<string, number> = {};
  for (const d of lista) resumo[d.grupo] = (resumo[d.grupo] ?? 0) + 1;
  // Vínculos repetidos (a calculadora lista o mesmo código em várias linhas) contam uma vez.
  const unicos = new Map<string, Divergencia>();
  for (const d of lista) unicos.set(`${d.grupo}|${d.chave}|${d.oficial}`, d);
  const porGrupo = new Map<string, Divergencia[]>();
  for (const d of unicos.values()) porGrupo.set(d.grupo, [...(porGrupo.get(d.grupo) ?? []), d]);
  const resumoUnico: Record<string, number> = {};
  for (const [g, l] of porGrupo) resumoUnico[g] = l.length;
  return {
    data: dia,
    contagens: { classes_calculadora: of.size, classes_intax: inx.size, correlacoes_intax: correlacao.length, vinculos_calculadora: ncmOf.length },
    resumo: resumoUnico,
    lista: [...porGrupo.entries()].sort(([a], [b]) => Number(GRUPOS_INFORMATIVOS.has(a)) - Number(GRUPOS_INFORMATIVOS.has(b))).flatMap(([, l]) => l.slice(0, LIMITE_POR_GRUPO)),
  };
}
