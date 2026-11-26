/** Desempenho da importação (QA com Postgres real, 30 mil itens): gravação em bloco, ANALYZE depois de importar, relatório enxuto. */
import { describe, expect, it } from 'vitest';
import { SanImportacaoService, TABELAS_ANALISADAS, MAX_IGNORADOS_LISTADOS, BLOCO_REIMPORTACAO } from './importacao.service';
import type { ImportadorPort, ItemImportado } from './portas';
import { criarPrismaFalso } from './prisma-falso';
import { SanProjetoService } from './projeto.service';

const USER = { email: 'consultor@fal.test' };
const ARQ = { buffer: Buffer.from('x'), nome: 'cadastro.xlsx' };
const item = (codigo: string, linha: number, extra: Partial<ItemImportado> = {}): ItemImportado => ({
  codigo, estabelecimento: null, descricao: `Produto ${codigo}`, unidade: 'UN', ncm: '31010000', grupo: 'Adubos', ativo: true, saldo: null,
  ultimaMovimentacao: null, fabricante: null, referencia: null, finalidade: null, campos: {}, linha, ...extra,
});
type Sql = { sql: string; values: unknown[] };

/**
 * Prisma em memória + o SQL bruto que a importação usa, emulado com a mesma semântica do Postgres
 * (UPDATE ... FROM jsonb_to_recordset com conferência de versão; ANALYZE só registrado).
 */
function montar(opcoes: { analyzeFalha?: boolean; mexerNaVersao?: (db: Record<string, Record<string, unknown>[]>) => void } = {}) {
  const { prisma, db } = criarPrismaFalso({
    projetoDiagnostico: [{ id: 'D1', servico_consultoria: 'saneamento-estoques', empresa_ids: ['E1'], periodo_inicio: new Date('2026-12-31T00:00:00Z') }],
    empresa: [{ id: 'E1', erp: 'SAP', cnae_principal: '4683400', cnae_descricao: 'Defensivos', cnaes_secundarios: [], dados_publicos_em: new Date('2026-10-01T00:00:00Z') }],
  });
  const brutos: string[] = [];
  const analyze: string[] = [];
  prisma.$executeRaw = async (q: Sql) => {
    brutos.push(q.sql);
    opcoes.mexerNaVersao?.(db);
    const linhas = JSON.parse(String(q.values[0])) as Record<string, unknown>[];
    let n = 0;
    for (const l of linhas) {
      const i = db.sanItem.find((x) => x.id === l.id);
      if (!i) continue;
      if (q.sql.includes('"trabalho" = v.trabalho')) {
        if (i.versao !== l.versao) continue;
        for (const k of ['trabalho', 'lido', 'descricao', 'grupo', 'finalidade', 'tambem_usado_como', 'conjunto_chave', 'ativo']) i[k] = l[k];
        i.versao += 1;
      } else i.lido = l.lido;
      n++;
    }
    return n;
  };
  prisma.$executeRawUnsafe = async (sql: string) => { analyze.push(sql); if (opcoes.analyzeFalha) throw new Error('sem permissão'); return 0; };
  const fila: { itens: ItemImportado[] } = { itens: [] };
  const importador: ImportadorPort = { ler: async () => ({ itens: fila.itens, mapeamento: {}, relatorio: { aceitas: fila.itens.length, rejeitadas: 0, pendentes: 0, linhasRejeitadas: [], linhasPendentes: [] } }) };
  const projetos = new SanProjetoService(prisma as never);
  const importacao = new SanImportacaoService(prisma as never, projetos, importador);
  return { prisma, db, fila, projetos, importacao, brutos, analyze };
}

async function projetoCom(c: ReturnType<typeof montar>, n: number) {
  const p = await c.projetos.criar('D1', USER);
  await c.projetos.confirmarAtividades(p.id, 1, USER);
  const originais = Array.from({ length: n }, (_, i) => item(`C${String(i).padStart(5, '0')}`, i + 1));
  c.fila.itens = originais;
  await c.importacao.confirmar(p.id, ARQ, undefined, [], USER);
  return { projetoId: p.id, originais };
}

describe('MÉDIO 2: ANALYZE depois da importação', () => {
  it('roda ANALYZE nas tabelas San* de nomes fixos ao fim da importação e da reimportação, fora da transação', async () => {
    const c = montar();
    const { projetoId, originais } = await projetoCom(c, 10);
    expect(c.analyze).toEqual(TABELAS_ANALISADAS.map((t) => `ANALYZE "${t}"`));
    expect(TABELAS_ANALISADAS).toEqual(['SanItem', 'SanCelula', 'SanDecisao']);
    c.analyze.length = 0;
    c.fila.itens = originais.map((i) => ({ ...i, descricao: `${i.descricao} NOVA` }));
    await c.importacao.confirmar(projetoId, ARQ, undefined, { filtro: 'ALTERADOS' }, USER);
    expect(c.analyze).toHaveLength(3);
  });

  it('nada gravado (reimportação sem novos nem incorporados) = sem ANALYZE', async () => {
    const c = montar();
    const { projetoId, originais } = await projetoCom(c, 5);
    c.analyze.length = 0;
    c.fila.itens = originais;
    await c.importacao.confirmar(projetoId, ARQ, undefined, [], USER);
    expect(c.analyze).toEqual([]);
  });

  it('falha no ANALYZE não derruba a importação', async () => {
    const c = montar({ analyzeFalha: true });
    const { projetoId } = await projetoCom(c, 3);
    expect(c.analyze).toHaveLength(3);
    expect(c.db.sanItem.filter((i) => i.projeto_id === projetoId)).toHaveLength(3);
  });
});

describe('MÉDIO 3: reimportação grava em bloco', () => {
  it('3 mil alterados: um UPDATE por bloco (não um por item), versão conferida, protegido mantido, histórico gravado', async () => {
    const c = montar();
    const n = 3_000; // o Prisma em memória é O(n²) nos filtros "in": 30 mil levariam minutos sem medir nada do Postgres
    const { projetoId, originais } = await projetoCom(c, n);
    const protegido = c.db.sanItem.find((i) => i.codigo === 'C02990')!;
    c.db.sanDecisao.push({ id: 'dprot', projeto_id: projetoId, item_id: protegido.id, caso_id: null, campo: 'descricao', antes: null, depois: 'x', usuario: 'u', tipo: 'aprovar', quando: new Date() });
    c.fila.itens = originais.map((i) => ({ ...i, descricao: `${i.descricao} NOVA`, grupo: 'Fertilizantes' }));
    const t0 = performance.now();
    const r = await c.importacao.confirmar(projetoId, ARQ, undefined, { filtro: 'ALTERADOS' }, USER);
    const ms = performance.now() - t0;
    expect(r.incorporados).toBe(n);
    expect(c.brutos).toHaveLength(Math.ceil(n / BLOCO_REIMPORTACAO));
    expect(c.brutos.every((s) => s.includes('i."versao" = v.versao'))).toBe(true);
    const p = c.db.sanItem.find((i) => i.id === protegido.id)!;
    expect(p.trabalho.descricao).not.toContain('NOVA');
    expect(p.grupo).toBe('Fertilizantes');
    expect(c.db.sanItem.every((i) => i.versao === 2)).toBe(true);
    expect(c.db.sanDecisao.filter((d) => d.tipo === 'importar')).toHaveLength(n * 2 - 1);
    // eslint-disable-next-line no-console
    console.log(`[medição] reimportação de ${n} itens (Prisma em memória, SQL em bloco): ${Math.round(ms)} ms, ${c.brutos.length} UPDATE de itens`);
  }, 240_000);

  it('item alterado por outra pessoa no meio: 409 e nada gravado', async () => {
    let mexeu = false;
    const c = montar({ mexerNaVersao: (db) => { if (!mexeu) { mexeu = true; db.sanItem[0].versao = 99; } } });
    const { projetoId, originais } = await projetoCom(c, 20);
    c.fila.itens = originais.map((i) => ({ ...i, descricao: `${i.descricao} NOVA` }));
    const antes = c.db.sanDecisao.length;
    const e = await c.importacao.confirmar(projetoId, ARQ, undefined, { filtro: 'ALTERADOS' }, USER).catch((x) => x);
    expect(e.getStatus?.()).toBe(409);
    expect(c.db.sanDecisao.length).toBe(antes);
    expect(c.db.sanItem.filter((i) => i.trabalho.descricao.endsWith('NOVA'))).toHaveLength(0);
  });

  it('só campos protegidos: a última leitura avança em bloco e a base de trabalho não muda', async () => {
    const c = montar();
    const { projetoId, originais } = await projetoCom(c, 4);
    for (const i of c.db.sanItem) c.db.sanDecisao.push({ id: `d${i.id}`, projeto_id: projetoId, item_id: i.id, caso_id: null, campo: 'descricao', antes: null, depois: 'x', usuario: 'u', tipo: 'aprovar', quando: new Date() });
    c.fila.itens = originais.map((i) => ({ ...i, descricao: 'OUTRA' }));
    const r = await c.importacao.confirmar(projetoId, ARQ, undefined, { filtro: 'ALTERADOS' }, USER);
    expect(r.incorporados).toBe(0);
    expect(r.totalIgnorados).toBe(4);
    expect(c.brutos).toHaveLength(1);
    expect(c.db.sanItem.every((i) => (i.lido as { descricao: string }).descricao === 'OUTRA' && i.trabalho.descricao !== 'OUTRA')).toBe(true);
  });

  it('relatório enxuto: lista no máximo 200 campos mantidos e traz o total; o histórico não carrega o relatório', async () => {
    const c = montar();
    const { projetoId, originais } = await projetoCom(c, 300);
    for (const i of c.db.sanItem) c.db.sanDecisao.push({ id: `d${i.id}`, projeto_id: projetoId, item_id: i.id, caso_id: null, campo: 'descricao', antes: null, depois: 'x', usuario: 'u', tipo: 'aprovar', quando: new Date() });
    c.fila.itens = originais.map((i) => ({ ...i, descricao: 'OUTRA' }));
    const r = await c.importacao.confirmar(projetoId, ARQ, undefined, { filtro: 'ALTERADOS' }, USER);
    expect(r.ignorados).toHaveLength(MAX_IGNORADOS_LISTADOS);
    expect(r.totalIgnorados).toBe(300);
    const args: { select?: Record<string, boolean> }[] = [];
    const orig = c.prisma.sanImportacao.findMany;
    c.prisma.sanImportacao.findMany = (a: { select?: Record<string, boolean> }) => { args.push(a); return orig(a); };
    const hist = await c.importacao.listar(projetoId);
    expect(hist).toHaveLength(2);
    expect(Object.keys(args[0].select!).sort()).toEqual(['aceitas', 'arquivo', 'createdAt', 'id', 'pendentes', 'projeto_id', 'rejeitadas', 'usuario']);
  });
});
