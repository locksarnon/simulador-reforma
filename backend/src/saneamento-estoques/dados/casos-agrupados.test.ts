/** Casos agrupados (leitura): casos iguais de um item viram uma linha; o conjunto fica sozinho; a decisão do grupo usa o lote de sempre. */
import { describe, expect, it } from 'vitest';
import { IDS_POR_GRUPO, SanCasosService } from './casos.service';
import { SanImportacaoService } from './importacao.service';
import type { ImportadorPort, ItemImportado } from './portas';
import { criarPrismaFalso } from './prisma-falso';
import { SanProjetoService } from './projeto.service';

const USER = { email: 'consultor@fal.test' };
const ARQ = { buffer: Buffer.from('x'), nome: 'cadastro.xlsx' };
const item = (codigo: string, grupo: string, linha: number): ItemImportado => ({
  codigo, estabelecimento: null, descricao: `Produto ${codigo}`, unidade: 'UN', ncm: '31010000', grupo, ativo: true, saldo: null,
  ultimaMovimentacao: null, fabricante: null, referencia: null, finalidade: null, campos: {}, linha,
});

function montar(n: number, grupos: number) {
  const { prisma, db } = criarPrismaFalso({
    projetoDiagnostico: [{ id: 'D1', servico_consultoria: 'saneamento-estoques', empresa_ids: ['E1'], periodo_inicio: new Date('2026-12-31T00:00:00Z') }],
    empresa: [{ id: 'E1', erp: 'SAP', cnae_principal: '4683400', cnae_descricao: 'Defensivos', cnaes_secundarios: [], dados_publicos_em: new Date('2026-10-01T00:00:00Z') }],
  });
  const itens = Array.from({ length: n }, (_, i) => item(`C${i}`, `G${i % grupos}`, i + 1));
  const importador: ImportadorPort = { ler: async () => ({ itens, mapeamento: {}, relatorio: { aceitas: itens.length, rejeitadas: 0, pendentes: 0, linhasRejeitadas: [], linhasPendentes: [] } }) };
  const projetos = new SanProjetoService(prisma as never);
  return { prisma, db, projetos, casos: new SanCasosService(prisma as never, projetos), importacao: new SanImportacaoService(prisma as never, projetos, importador) };
}
async function preparar(n: number, grupos: number) {
  const c = montar(n, grupos);
  const p = await c.projetos.criar('D1', USER);
  await c.projetos.confirmarAtividades(p.id, 1, USER);
  await c.importacao.confirmar(p.id, ARQ, undefined, [], USER);
  return { ...c, projetoId: p.id as string };
}
const caso = (itens: string[], o: Record<string, unknown> = {}) => ({
  camada: 'QUALIDADE', tipo: 'SEM_MOVIMENTACAO', itens, problema: `Item ${itens[0]} sem movimentação`, evidencia: [], atual: { ativo: true }, proposta: { ativo: false },
  justificativa: 'Sem movimento desde o corte.', fundamento: null, impactos: [], origem: 'REGRA', afeta: [], ...o,
});
const registrar = (c: Awaited<ReturnType<typeof preparar>>, camada: string, casos: ReturnType<typeof caso>[]) =>
  c.casos.registrarResultado(c.projetoId, { camada, analisados: c.db.sanItem.length, semDados: null, semProblema: [], casos: casos.map((x) => ({ ...x, camada })) } as never, { interno: true });

describe('casos agrupados', () => {
  it('mesmo tipo, mesma proposta e mesmo grupo: um grupo; proposta diferente ou outro grupo: grupos separados; conjunto: sozinho', async () => {
    const c = await preparar(12, 2); // G0: C0, C2, C4…; G1: C1, C3…
    const id = (cod: string) => c.db.sanItem.find((i) => i.codigo === cod)!.id as string;
    await registrar(c, 'QUALIDADE', [
      caso([id('C0')]), caso([id('C2')]), caso([id('C4')]), // G0, inativar
      caso([id('C6')], { proposta: { ativo: false, observacao: 'outra' } }), // G0, proposta diferente
      caso([id('C1')]), caso([id('C3')]), // G1, inativar
      caso([id('C8'), id('C10')], { tipo: 'SEM_MOVIMENTACAO', problema: 'Conjunto parado' }), // conjunto: sozinho
    ]);
    const r = await c.casos.agrupados(c.projetoId, { situacao: 'PROPOSTO,RASCUNHO' });
    expect(r.totalCasos).toBe(7);
    expect(r.totalGrupos).toBe(4);
    const [maior] = r.grupos;
    expect(maior).toMatchObject({ camada: 'QUALIDADE', tipo: 'SEM_MOVIMENTACAO', grupo: 'G0', casos: 3, itens: 3, conjunto: false, proposta: { ativo: false }, atual: { ativo: true }, situacoes: { PROPOSTO: 3 }, idsCompletos: true });
    expect(maior.problemaVaria).toBe(true); // o texto cita o item: o grupo mostra um exemplo
    expect(maior.ids).toHaveLength(3);
    const g1 = r.grupos.find((g) => g.grupo === 'G1')!;
    expect(g1.casos).toBe(2);
    const conjunto = r.grupos.find((g) => g.conjunto)!;
    expect(conjunto).toMatchObject({ casos: 1, itens: 2, grupo: null, problema: 'Conjunto parado' });
    expect(conjunto.chave.startsWith('c:')).toBe(true);
    expect(r.grupos.filter((g) => g.grupo === 'G0' && !g.conjunto)).toHaveLength(2); // a proposta diferente separa
    expect(r.tipos).toEqual([{ tipo: 'SEM_MOVIMENTACAO', n: 7 }]);
    // A chave não depende da ordem: ler de novo dá as mesmas chaves.
    const de_novo = await c.casos.agrupados(c.projetoId, { situacao: 'PROPOSTO,RASCUNHO' });
    expect(de_novo.grupos.map((g) => g.chave)).toEqual(r.grupos.map((g) => g.chave));
  });

  it('filtros: camada, tipo, grupo do item, situação e busca', async () => {
    const c = await preparar(8, 2);
    const id = (cod: string) => c.db.sanItem.find((i) => i.codigo === cod)!.id as string;
    await registrar(c, 'QUALIDADE', [caso([id('C0')]), caso([id('C2')]), caso([id('C1')])]);
    await registrar(c, 'NCM', [caso([id('C4')], { tipo: 'NCM_FORMATO', problema: 'NCM com 7 dígitos', atual: { ncm: '3101000' }, proposta: { ncm: '31010000' } })]);
    expect((await c.casos.agrupados(c.projetoId, {})).totalCasos).toBe(4);
    expect((await c.casos.agrupados(c.projetoId, { camada: 'NCM' })).grupos.map((g) => g.tipo)).toEqual(['NCM_FORMATO']);
    expect((await c.casos.agrupados(c.projetoId, { tipo: 'SEM_MOVIMENTACAO' })).totalCasos).toBe(3);
    const porGrupo = await c.casos.agrupados(c.projetoId, { grupo: 'G1' });
    expect(porGrupo.totalCasos).toBe(1);
    expect(porGrupo.grupos[0].grupo).toBe('G1');
    expect((await c.casos.agrupados(c.projetoId, { situacao: 'APROVADO' })).totalGrupos).toBe(0);
    const busca = await c.casos.agrupados(c.projetoId, { busca: 'digitos' }); // sem acento acha "dígitos"
    expect(busca.grupos.map((g) => g.tipo)).toEqual(['NCM_FORMATO']);
  });

  it('detalhe do grupo (chave): todos os ids e as linhas dos casos; o lote de sempre decide o grupo com as mesmas garantias', async () => {
    const c = await preparar(10, 1);
    const ids = c.db.sanItem.map((i) => i.id as string);
    await registrar(c, 'QUALIDADE', ids.map((i) => caso([i])));
    const lista = await c.casos.agrupados(c.projetoId, { situacao: 'PROPOSTO,RASCUNHO' });
    expect(lista.totalGrupos).toBe(1);
    const d = await c.casos.agrupados(c.projetoId, { situacao: 'PROPOSTO,RASCUNHO', chave: lista.grupos[0].chave });
    expect('grupo' in d && d.grupo.todosIds).toHaveLength(10);
    if (!('casos' in d) || !('grupo' in d)) throw new Error('detalhe esperado');
    expect(d.casos).toHaveLength(10);
    expect(d.casos[0]).toMatchObject({ situacao: 'PROPOSTO', qtdItens: 1, item: { grupo: 'G0' } });
    expect(d.casos[0].item?.codigo).toMatch(/^C\d+$/);
    // Prévia e aprovação pelo lote de sempre, com os ids do grupo.
    const previa = await c.casos.lotePrevia(c.projetoId, { ids: d.grupo.todosIds });
    expect(previa.aprovaveis).toHaveLength(10);
    const r = await c.casos.loteAprovar(c.projetoId, { ids: d.grupo.todosIds, versoes: Object.fromEntries(previa.aprovaveis.map((a) => [a.casoId, a.versao])) }, USER);
    expect(r.aprovados).toBe(10);
    // Decididos, saem do grupo em aberto; a chave pedida não existe mais com este filtro.
    expect((await c.casos.agrupados(c.projetoId, { situacao: 'PROPOSTO,RASCUNHO' })).totalGrupos).toBe(0);
    await expect(c.casos.agrupados(c.projetoId, { situacao: 'PROPOSTO,RASCUNHO', chave: lista.grupos[0].chave })).rejects.toThrow(/não encontrado/);
  });

  it('paginação: cursor numérico e próximo', async () => {
    const c = await preparar(6, 6); // 6 grupos, um caso cada
    await registrar(c, 'QUALIDADE', c.db.sanItem.map((i) => caso([i.id as string])));
    const p1 = await c.casos.agrupados(c.projetoId, { limite: 4 });
    expect(p1.grupos).toHaveLength(4);
    expect(p1.proximo).toBe('4');
    const p2 = await c.casos.agrupados(c.projetoId, { limite: 4, cursor: p1.proximo! });
    expect(p2.grupos).toHaveLength(2);
    expect(p2.proximo).toBeNull();
    expect(new Set([...p1.grupos, ...p2.grupos].map((g) => g.chave)).size).toBe(6);
  });

  it('escala Crestani: 30 mil itens e 55 mil casos de um item em poucos grupos, com ids limitados na lista', async () => {
    const c = await preparar(1, 1);
    // Itens e casos gravados direto (a importação e a gravação não são o que se mede aqui): unidade e NCM por item, mais os parados.
    c.db.sanItem.length = 0;
    for (let i = 0; i < 30_000; i++) c.db.sanItem.push({ id: `it${String(i).padStart(6, '0')}`, projeto_id: c.projetoId, codigo: `C${i}`, descricao: `Produto ${i}`, grupo: `G${i % 300}`, versao: 1, trabalho: {} });
    let k = 0;
    const novo = (camada: string, tipo: string, itemId: string, proposta: Record<string, unknown>) => ({
      id: `caso${String(++k).padStart(6, '0')}`, projeto_id: c.projetoId, camada, tipo, chave: `${camada}|${tipo}|${itemId}`, itens: [itemId], problema: `Problema do item ${itemId}`,
      evidencia: [], atual: {}, proposta, justificativa: 'x', fundamento: null, impactos: [], origem: 'REGRA', situacao: 'PROPOSTO', afeta: [], versao: 1, createdAt: new Date(), updatedAt: new Date(),
    });
    for (const i of c.db.sanItem) c.db.sanCaso.push(novo('NOMES_UNIDADES', 'UNIDADE_LIMITE', i.id, { unidade: 'UN' }));
    for (const i of c.db.sanItem.slice(0, 15_000)) c.db.sanCaso.push(novo('NCM', 'NCM_INCOMPATIVEL_DESCRICAO', i.id, { decisao: 'SOLICITAR_INFORMACAO' }));
    for (const i of c.db.sanItem.slice(0, 10_000)) c.db.sanCaso.push(novo('QUALIDADE', 'SEM_MOVIMENTACAO', i.id, { ativo: false }));
    const t0 = Date.now();
    const r = await c.casos.agrupados(c.projetoId, { situacao: 'PROPOSTO,RASCUNHO' });
    const ms = Date.now() - t0;
    console.log(`[casos agrupados] ${r.totalCasos} casos → ${r.totalGrupos} grupos em ${ms} ms (Prisma em memória)`);
    expect(r.totalCasos).toBe(55_000);
    expect(r.totalGrupos).toBe(900);
    expect(r.grupos[0].casos).toBe(100);
    expect(r.grupos.every((g) => g.ids.length <= IDS_POR_GRUPO)).toBe(true);
    expect(ms).toBeLessThan(15_000);
  }, 120_000);
});
