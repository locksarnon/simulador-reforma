/** Aplicar várias regras de uma vez (uma prévia agregada, uma reanálise) e o estado das camadas (Cobertura e liberação de versão). */
import { describe, expect, it } from 'vitest';
import { SanCasosService } from '../dados/casos.service';
import { SanImportacaoService } from '../dados/importacao.service';
import { SanOrquestracaoService, desatualizacao, efeitosDosAprovados } from '../dados/orquestracao.service';
import { motorDeAnalisadores, type ImportadorPort, type ItemImportado } from '../dados/portas';
import { criarPrismaFalso } from '../dados/prisma-falso';
import { SanProjetoService } from '../dados/projeto.service';
import { SanVersoesService } from '../dados/versoes.service';
import { AnalisadorNcm } from '../motor/ncm';
import { AnalisadorNomesUnidades } from '../motor/nomes-unidades';
import { AnalisadorQualidade } from '../motor/qualidade';
import { SanDiretrizesService } from './diretrizes.service';

const USER = { email: 'consultor@fal.test', role: 'user' };
const ARQ = { buffer: Buffer.from('x'), nome: 'cadastro.xlsx' };
const item = (codigo: string, extra: Partial<ItemImportado> = {}, linha = 1): ItemImportado => ({
  codigo, estabelecimento: null, descricao: `Produto ${codigo}`, unidade: 'UN', ncm: '31010000', grupo: 'G1', ativo: true, saldo: null,
  ultimaMovimentacao: null, fabricante: null, referencia: null, finalidade: null, campos: {}, linha, ...extra,
});
const erro = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const x = e as { getStatus?: () => number; response?: { codigo?: string } }; return x.response?.codigo ?? x.getStatus?.() ?? String(e); } };

function montar() {
  const { prisma, db } = criarPrismaFalso({
    projetoDiagnostico: [{ id: 'D1', servico_consultoria: 'saneamento-estoques', empresa_ids: ['E1'], periodo_inicio: new Date('2026-12-31T00:00:00Z') }],
    empresa: [{ id: 'E1', erp: null, cnae_principal: '4683400', cnae_descricao: 'Defensivos', cnaes_secundarios: [], dados_publicos_em: new Date('2026-10-01T00:00:00Z') }],
  });
  const fila: { itens: ItemImportado[] } = { itens: [] };
  const importador: ImportadorPort = { ler: async () => ({ itens: fila.itens, mapeamento: {}, relatorio: { aceitas: fila.itens.length, rejeitadas: 0, pendentes: 0, linhasRejeitadas: [], linhasPendentes: [] } }) };
  const projetos = new SanProjetoService(prisma as never);
  const casos = new SanCasosService(prisma as never, projetos);
  const importacao = new SanImportacaoService(prisma as never, projetos, importador);
  const orq = new SanOrquestracaoService(prisma as never, projetos, casos, motorDeAnalisadores([new AnalisadorQualidade(), new AnalisadorNomesUnidades(), new AnalisadorNcm()]));
  const diretrizes = new SanDiretrizesService(prisma as never, orq, new SanVersoesService(prisma as never));
  return { prisma, db, fila, projetos, casos, importacao, orq, diretrizes };
}
type Ctx = ReturnType<typeof montar>;
async function pronto(c: Ctx) {
  const p = await c.projetos.criar('D1', USER);
  await c.projetos.confirmarAtividades(p.id, 1, USER);
  c.fila.itens = [
    item('1', { descricao: 'parafuso  sextavado 10mm', unidade: 'KGS', grupo: 'G1' }, 1),
    item('2', { descricao: 'ROLAMENTO 6205 ESQ', unidade: 'KG', grupo: 'G1' }, 2),
    item('3', { descricao: 'oleo lubrificante muito comprido para o campo', unidade: 'ROLO', grupo: 'G2' }, 3),
    item('4', { descricao: 'Material diversos', unidade: 'TONELADA', grupo: 'G2' }, 4),
  ];
  await c.importacao.confirmar(p.id, ARQ, undefined, [], USER);
  return p.id;
}
const nomes = (grupos: string[], nome: string) => ({ aspecto: 'NOMES', nome, abrangencia: { todos: false, grupos }, alteracoes: { capitalizacao: 'MAIUSCULAS' } });

describe('aplicar várias regras de uma vez', () => {
  it('prévia agregada (grupos, itens distintos, camadas) e uma só reanálise por camada; versões e histórico como na regra individual', async () => {
    const c = montar(); const pid = await pronto(c);
    await c.orq.executarCamada(pid, 'NOMES_UNIDADES');
    const a = await c.diretrizes.criarRegra(pid, nomes(['G1'], 'Nomes G1'), USER);
    const b = await c.diretrizes.criarRegra(pid, nomes(['G2'], 'Nomes G2'), USER);
    const f = await c.diretrizes.criarRegra(pid, { aspecto: 'ATRIBUTOS', nome: 'Atributos G1', abrangencia: { todos: false, grupos: ['G1'] } }, USER);
    const previa = await c.diretrizes.previaVarias(pid, [a.id, b.id, f.id].join(','));
    expect(previa).toMatchObject({ grupos: ['G1', 'G2'], itens: 4, camadas: ['QUALIDADE', 'NOMES_UNIDADES'], sobreposicoes: [], entreEscolhidas: [] });
    expect(previa.regras.map((r) => r.codigo)).toEqual(['A01', 'N01', 'N02']);

    let execucoes = 0;
    const original = c.orq.executarCamada.bind(c.orq);
    c.orq.executarCamada = (async (...args: Parameters<typeof original>) => { execucoes++; return original(...args); }) as typeof original;
    expect(await erro(c.diretrizes.aplicarVarias(pid, { regras: [{ id: a.id, versao: a.versao + 3 }, { id: b.id, versao: b.versao }] }, USER))).toBe('CONFLITO_VERSAO');
    expect(c.db.sanDiretrizRegra.every((r) => r.aplicacao === null || r.codigo === 'L01')).toBe(true); // nada gravado
    const r = await c.diretrizes.aplicarVarias(pid, { regras: [a, b, f].map((x) => ({ id: x.id, versao: x.versao })) }, USER);
    expect(r.aplicadas).toBe(3);
    expect(execucoes).toBe(2); // QUALIDADE e NOMES_UNIDADES, uma vez cada
    expect(r.reanalise.camadas.map((x: { camada: string; executada: boolean }) => [x.camada, x.executada])).toEqual([['QUALIDADE', true], ['NOMES_UNIDADES', true]]);
    expect(r.regras.every((x) => x.aplicada && !x.pendenteAplicar)).toBe(true);
    expect(c.db.sanDiretrizHistorico.filter((h) => h.acao === 'APLICAR')).toHaveLength(3);
    // A reanálise por escopo não conta como análise completa da camada.
    expect((c.db.sanProjeto[0].parametros as { execucoes?: Record<string, string> }).execucoes?.QUALIDADE).toBeUndefined();
  });

  it('regras escolhidas que disputam o mesmo grupo: recusa; sobreposição com regra de fora pede a transferência e transfere', async () => {
    const c = montar(); const pid = await pronto(c);
    const a = await c.diretrizes.criarRegra(pid, nomes(['G1'], 'Nomes G1'), USER);
    const fora = await c.diretrizes.aplicar(a.id, { versao: a.versao }, USER);
    const b = await c.diretrizes.criarRegra(pid, nomes(['G2'], 'Nomes G2'), USER);
    // N03 disputa G2 com N02 (escolhida junto) → recusa sem gravar.
    const d = await c.diretrizes.criarRegra(pid, nomes(['G2'], 'Outra G2'), USER);
    expect(await erro(c.diretrizes.aplicarVarias(pid, { regras: [{ id: b.id, versao: b.versao }, { id: d.id, versao: d.versao }] }, USER))).toBe('SOBREPOSICAO_ENTRE_REGRAS');
    // O par aparece uma vez só na mensagem (não "G2 (N03 e N02); G2 (N02 e N03)").
    const msg = await c.diretrizes.aplicarVarias(pid, { regras: [{ id: d.id, versao: d.versao }, { id: b.id, versao: b.versao }] }, USER).then(() => '', (e: { response?: { message?: string } }) => e.response?.message ?? '');
    expect(msg).toContain(`G2 (${[b.codigo, d.codigo].sort().join(' e ')}).`);
    expect(msg.match(/G2 \(/g)).toHaveLength(1);
    // N04 cobre G1, que é da N01 (fora da seleção): pede confirmar.
    const g = await c.diretrizes.criarRegra(pid, nomes(['G1'], 'Nova G1'), USER);
    {
      expect(await erro(c.diretrizes.aplicarVarias(pid, { regras: [{ id: b.id, versao: b.versao }, { id: g.id, versao: g.versao }] }, USER))).toBe('SOBREPOSICAO');
      const ok = await c.diretrizes.aplicarVarias(pid, { regras: [{ id: b.id, versao: b.versao }, { id: g.id, versao: g.versao }], confirmarTransferencia: true }, USER);
      expect(ok.aplicadas).toBe(2);
      expect(c.db.sanDiretrizRegra.find((x) => x.id === fora.id)!.abrangencia).toEqual({ todos: false, grupos: [] });
    }
  });

  it('pedido inválido: lista vazia, repetida, regra sem grupos', async () => {
    const c = montar(); const pid = await pronto(c);
    const a = await c.diretrizes.criarRegra(pid, nomes(['G1'], 'Nomes G1'), USER);
    expect(await erro(c.diretrizes.aplicarVarias(pid, { regras: [] }, USER))).toBe('SEM_REGRAS');
    expect(await erro(c.diretrizes.aplicarVarias(pid, { regras: [{ id: a.id, versao: a.versao }, { id: a.id, versao: a.versao }] }, USER))).toBe('REGRAS_REPETIDAS');
    expect(await erro(c.diretrizes.previaVarias(pid, 'nao-existe'))).toBe(404);
  });
});

describe('estado das camadas', () => {
  it('conta casos por camada e grava a data da análise completa', async () => {
    const c = montar(); const pid = await pronto(c);
    await c.orq.executarCamada(pid, 'NOMES_UNIDADES');
    const e = await c.orq.estadoDasCamadas(pid);
    const nu = e.camadas.find((x) => x.camada === 'NOMES_UNIDADES')!;
    expect(nu.abertos).toBeGreaterThan(0);
    expect(nu.executadaEm).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(e.abertos).toBe(c.db.sanCaso.filter((x) => x.situacao === 'PROPOSTO').length);
    expect(e.camadas.find((x) => x.camada === 'TRIBUTARIO')).toMatchObject({ executadaEm: null, desatualizada: null });
  });

  it('tributário fica desatualizado quando a finalidade ou o NCM mudam depois da análise dele', async () => {
    const c = montar(); const pid = await pronto(c);
    c.db.sanProjeto[0].parametros = { execucoes: { TRIBUTARIO: '2026-01-01T00:00:00.000Z' } };
    const itemId = c.db.sanItem[0].id;
    c.db.sanDecisao.push({ id: 'd1', projeto_id: pid, item_id: itemId, caso_id: null, campo: 'finalidade', antes: null, depois: 'REVENDA', usuario: 'x', tipo: 'aprovar', quando: new Date('2026-02-01T00:00:00Z') });
    c.db.sanDecisao.push({ id: 'd2', projeto_id: pid, item_id: itemId, caso_id: null, campo: 'ncm', antes: '1', depois: '1', usuario: 'x', tipo: 'rejeitar', quando: new Date('2026-03-01T00:00:00Z') });
    const e = await c.orq.estadoDasCamadas(pid);
    expect(e.camadas.find((x) => x.camada === 'TRIBUTARIO')!.desatualizada).toEqual({ por: ['GRUPOS_FINALIDADE'], desde: '2026-02-01T00:00:00.000Z' });
  });

  it('funções puras: desatualização e efeitos dos aprovados', () => {
    const m = new Map([['GRUPOS_FINALIDADE', '2026-05-01T00:00:00.000Z'], ['NCM', '2026-04-01T00:00:00.000Z']]);
    expect(desatualizacao('TRIBUTARIO', '2026-04-15T00:00:00.000Z', m)).toEqual({ por: ['GRUPOS_FINALIDADE'], desde: '2026-05-01T00:00:00.000Z' });
    expect(desatualizacao('TRIBUTARIO', '2026-06-01T00:00:00.000Z', m)).toBeNull();
    expect(desatualizacao('TRIBUTARIO', null, m)).toBeNull();
    expect(desatualizacao('NCM', '2026-01-01T00:00:00.000Z', m)).toBeNull();
    expect(efeitosDosAprovados([
      { camada: 'QUALIDADE', proposta: { decisao: 'PROPOR_INATIVACAO', ativo: false }, itens: ['a', 'b'] },
      { camada: 'DUPLICIDADE', proposta: { decisao: 'PROPOR_CONSOLIDACAO', manter: '1' }, itens: ['c', 'd'] },
      { camada: 'GRUPOS_FINALIDADE', proposta: { finalidade: 'REVENDA' }, itens: ['a', 'c', 'e'] },
      { camada: 'NOMES_UNIDADES', proposta: { descricao: 'X' }, itens: ['e'] },
    ])).toEqual({ unificacoes: 1, inativados: 2, finalidade: 3, descricao: 1, unidade: 0, ncm: 0, tributario: 0 });
  });
});
