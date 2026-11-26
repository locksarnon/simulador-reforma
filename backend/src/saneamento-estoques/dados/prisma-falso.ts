/** Prisma em memória só para os testes do Saneamento de Estoques (suporta o que os serviços usam; $transaction desfaz tudo se lançar). */
type Linha = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const UNICOS: Record<string, string[][]> = {
  sanProjeto: [['diagnostico_id']], sanItem: [['projeto_id', 'estabelecimento', 'codigo']], sanCaso: [['projeto_id', 'chave']],
  sanVersao: [['projeto_id', 'numero']], sanCelula: [['item_id', 'camada']], sanAtividade: [['projeto_id', 'codigo']],
};
const PADROES: Record<string, () => Linha> = {
  sanProjeto: () => ({ versao: 1, estabelecimentos: [], parametros: {}, modulos: { conciliacao: false, blocosKG: false, arquivoErp: false }, atividades_confirmadas_em: null, atividades_confirmadas_por: null }),
  sanAtividade: () => ({ mantida: true }),
  sanItem: () => ({ versao: 1, estabelecimento: '', lido: null, tambem_usado_como: [], descricao: '' }),
  sanCelula: () => ({ situacao: 'PENDENTE', revisar: false, revisar_causa: null, caso_id: null, grupo: '' }),
  sanCaso: () => ({ situacao: 'PROPOSTO', versao: 1, motivo: null, decidido_por: null, decidido_em: null, parecer_ia: null, responsavel: null, evidencia: [], atual: {}, proposta: {}, impactos: [], afeta: [] }),
  sanDecisao: () => ({ caso_id: null }),
  sanImpactoSped: () => ({ avaliar_anteriores: false }),
};
const RELACOES: Record<string, Record<string, [string, string]>> = {
  sanItem: { celulas: ['sanCelula', 'item_id'] }, sanProjeto: { atividades: ['sanAtividade', 'projeto_id'] }, sanVersao: { snapshot: ['sanVersaoSnapshot', 'versao_id'] },
};

export function criarPrismaFalso(sementes: Record<string, Linha[]> = {}) {
  let seq = 0;
  let tempo = Date.parse('2026-11-26T12:00:00Z');
  const db: Record<string, Linha[]> = {};
  const modelos = ['projetoDiagnostico', 'empresa', 'ncm', 'sanProjeto', 'sanAtividade', 'sanImportacao', 'sanItem', 'sanCelula', 'sanCaso', 'sanDecisao', 'sanVersao', 'sanVersaoSnapshot', 'sanImpactoSped', 'sanVinculoCodigo'];
  for (const m of modelos) db[m] = (sementes[m] ?? []).map((l) => ({ ...l }));
  const erroUnico = () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
  // Atalhos para as bases de 30 mil itens: 'in' por conjunto e busca por id por índice (refeito quando a lista muda de tamanho ou é trocada).
  const conjuntos = new WeakMap<unknown[], Set<unknown>>();
  const comoConjunto = (l: unknown[]) => { let c = conjuntos.get(l); if (!c) { c = new Set(l); conjuntos.set(l, c); } return c; };
  const indices = new WeakMap<Linha[], Map<string, Linha>>();
  const candidatos = (nome: string, where: Linha | undefined): Linha[] => {
    const lista = db[nome];
    if (typeof where?.id !== 'string') return lista;
    let m = indices.get(lista);
    if (!m || m.size !== lista.length) { m = new Map(lista.map((l) => [l.id, l])); indices.set(lista, m); }
    const l = m.get(where.id);
    return l ? [l] : [];
  };

  const comparar = (v: any, cond: any, modelo: string): boolean => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (cond === null || typeof cond !== 'object' || cond instanceof Date) return JSON.stringify(v ?? null) === JSON.stringify(cond ?? null) || (v instanceof Date && cond instanceof Date && +v === +cond);
    if ('in' in cond && !comoConjunto(cond.in).has(v)) return false;
    if ('not' in cond && (cond.not === null ? v == null : comparar(v, cond.not, modelo))) return false;
    if ('contains' in cond && !String(v ?? '').toLowerCase().includes(String(cond.contains).toLowerCase())) return false;
    if ('hasSome' in cond && !(v ?? []).some((x: unknown) => cond.hasSome.includes(x))) return false;
    if ('has' in cond && !(v ?? []).includes(cond.has)) return false;
    if ('lte' in cond && !(v <= cond.lte)) return false;
    if ('gt' in cond && !(v > cond.gt)) return false;
    return true;
  };
  const casa = (l: Linha, where: Linha | undefined, modelo: string): boolean => {
    if (!where) return true;
    return Object.entries(where).every(([k, cond]) => {
      if (cond === undefined) return true;
      if (k === 'OR') return (cond as Linha[]).some((w) => casa(l, w, modelo));
      if (k === 'NOT') return !casa(l, cond as Linha, modelo);
      const rel = RELACOES[modelo]?.[k];
      if (rel) return db[rel[0]].some((o) => o[rel[1]] === l.id && casa(o, (cond as Linha).some, rel[0]));
      return comparar(l[k], cond, modelo);
    });
  };
  const aplicarDados = (l: Linha, data: Linha) => {
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      if (v && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v) && 'increment' in v) l[k] = (l[k] ?? 0) + v.increment;
      else l[k] = v instanceof Date ? v : v === null || typeof v !== 'object' ? v : JSON.parse(JSON.stringify(v));
    }
  };
  const ordenar = (lista: Linha[], orderBy: Linha | Linha[] | undefined) => {
    const ob = ([] as Linha[]).concat(orderBy ?? []);
    return [...lista].sort((a, b) => {
      for (const o of ob) {
        const [k, dir] = Object.entries(o)[0] as [string, string];
        const x = a[k] ?? ''; const y = b[k] ?? '';
        if (x < y) return dir === 'desc' ? 1 : -1;
        if (x > y) return dir === 'desc' ? -1 : 1;
      }
      return 0;
    });
  };
  const completar = (modelo: string, data: Linha): Linha => {
    const l: Linha = { ...(PADROES[modelo]?.() ?? {}) };
    aplicarDados(l, data);
    l.id ??= modelo === 'sanVersaoSnapshot' ? undefined : `${modelo.slice(0, 3)}${++seq}`;
    l.createdAt ??= new Date((tempo += 1000));
    l.updatedAt = new Date(tempo);
    if (modelo === 'sanDecisao') l.quando ??= new Date((tempo += 1000));
    for (const u of UNICOS[modelo] ?? []) if (db[modelo].some((o) => u.every((k) => o[k] === l[k]))) throw erroUnico();
    return l;
  };
  const projetar = (modelo: string, l: Linha, args: Linha) => {
    const copia = { ...l };
    for (const [rel, [m, fk]] of Object.entries(RELACOES[modelo] ?? {})) {
      if (args.include?.[rel] || args.select?.[rel]) {
        const ls = db[m].filter((o) => o[fk] === l.id).map((o) => ({ ...o }));
        copia[rel] = rel === 'snapshot' ? ls[0] ?? null : ls;
      }
    }
    return copia;
  };

  const modelo = (nome: string) => ({
    findUnique: async (a: Linha) => { const l = candidatos(nome, a.where).find((x) => casa(x, a.where, nome)); return l ? projetar(nome, l, a) : null; },
    findFirst: async (a: Linha) => { const [l] = ordenar(candidatos(nome, a.where).filter((x) => casa(x, a.where, nome)), a.orderBy); return l ? projetar(nome, l, a) : null; },
    findMany: async (a: Linha = {}) => {
      let r = ordenar(candidatos(nome, a.where).filter((x) => casa(x, a.where, nome)), a.orderBy);
      if (a.cursor) { const i = r.findIndex((x) => x.id === a.cursor.id); r = i < 0 ? [] : r.slice(i + (a.skip ?? 0)); }
      if (a.take !== undefined) r = r.slice(0, a.take);
      return r.map((l) => projetar(nome, l, a));
    },
    count: async (a: Linha = {}) => candidatos(nome, a.where).filter((x) => casa(x, a.where, nome)).length,
    create: async (a: Linha) => { const l = completar(nome, a.data); db[nome].push(l); return { ...l }; },
    createMany: async (a: Linha) => {
      let n = 0;
      for (const d of a.data as Linha[]) {
        try { const l = completar(nome, d); db[nome].push(l); n++; } catch (e) { if (!a.skipDuplicates || (e as { code?: string }).code !== 'P2002') throw e; }
      }
      return { count: n };
    },
    createManyAndReturn: async (a: Linha) => {
      const r: Linha[] = [];
      for (const d of a.data as Linha[]) { const l = completar(nome, d); db[nome].push(l); r.push({ ...l }); }
      return r;
    },
    update: async (a: Linha) => { const l = candidatos(nome, a.where).find((x) => casa(x, a.where, nome)); if (!l) throw new Error('Registro não encontrado'); aplicarDados(l, a.data); return { ...l }; },
    updateMany: async (a: Linha) => { const ls = candidatos(nome, a.where).filter((x) => casa(x, a.where, nome)); ls.forEach((l) => aplicarDados(l, a.data)); return { count: ls.length }; },
    deleteMany: async (a: Linha) => { const antes = db[nome].length; db[nome] = db[nome].filter((x) => !casa(x, a.where, nome)); return { count: antes - db[nome].length }; },
    groupBy: async (a: Linha) => {
      const grupos = new Map<string, Linha>();
      for (const l of candidatos(nome, a.where).filter((x) => casa(x, a.where, nome))) {
        const k = JSON.stringify(a.by.map((b: string) => l[b]));
        const g = grupos.get(k) ?? { ...Object.fromEntries(a.by.map((b: string) => [b, l[b]])), _count: { _all: 0 } };
        g._count._all++;
        grupos.set(k, g);
      }
      return [...grupos.values()];
    },
  });

  const prisma: Linha = Object.fromEntries(modelos.map((m) => [m, modelo(m)]));
  prisma.$transaction = async (fn: (tx: unknown) => Promise<unknown>) => {
    const foto = JSON.stringify(db, function (this: Record<string, unknown>, k: string, v: unknown) { const bruto = this[k]; return bruto instanceof Date ? { __d: +bruto } : v; });
    try { return await fn(prisma); } catch (e) {
      const antes = JSON.parse(foto, (_k: string, v: any) => (v && typeof v === 'object' && '__d' in v ? new Date(v.__d) : v));
      for (const m of modelos) db[m] = antes[m];
      throw e;
    }
  };
  return { prisma, db };
}
