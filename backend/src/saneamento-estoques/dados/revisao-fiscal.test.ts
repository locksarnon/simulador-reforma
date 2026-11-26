/**
 * Revisão fiscal e de código do Saneamento (achados 1, 2, 3, 7 e 10 da revisão fiscal; A a G das revisões de código e do QA).
 * Banco falso em memória (o mesmo das demais suítes da camada de dados).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { construirModelo, origemDaFinalidade } from '../entregaveis/modelo';
import { montarRelatorio } from '../entregaveis/relatorio';
import { AnalisadorNomesUnidades } from '../motor';
import { rotuloTipoCaso } from '../rotulos';
import type { AnalisadorCamada, ItemTrabalho, ResultadoCamada } from '../tipos';
import { ajustesDosCasos, linhasDeImpactoDoCaso, tiposDeAjusteDoCaso } from './ajustes';
import { SanCasosService, estimativaDoCaso, orcamentoDoLote } from './casos.service';
import { semItensDeExcecao } from './constantes';
import { SanImportacaoService } from './importacao.service';
import { AnalisadorGruposFinalidade, finalidadesConfirmadas } from './motor.provider';
import { type ImportadorPort, type ItemImportado } from './portas';
import { criarPrismaFalso } from './prisma-falso';
import { SanProjetoService } from './projeto.service';
import { SaneamentoEstoquesController } from './saneamento-estoques.controller';
import { SanVersoesService } from './versoes.service';

const USER = { email: 'consultor@fal.test' };
const item = (codigo: string, extra: Partial<ItemImportado> = {}, linha = 1): ItemImportado => ({
  codigo, estabelecimento: null, descricao: `Produto ${codigo}`, unidade: 'UN', ncm: '31010000', grupo: 'Adubos', ativo: true, saldo: null,
  ultimaMovimentacao: null, fabricante: null, referencia: null, finalidade: null, campos: {}, linha, ...extra,
});
const ARQ = { buffer: Buffer.from('x'), nome: 'cadastro.xlsx' };

function montar() {
  const { prisma, db } = criarPrismaFalso({
    projetoDiagnostico: [{ id: 'D1', servico_consultoria: 'saneamento-estoques', empresa_ids: ['E1'], periodo_inicio: new Date('2026-12-31T00:00:00Z') }],
    empresa: [{ id: 'E1', erp: 'SAP', cnae_principal: '4683400', cnae_descricao: 'Defensivos', cnaes_secundarios: [], dados_publicos_em: new Date('2026-10-01T00:00:00Z') }],
  });
  const fila: { itens: ItemImportado[] } = { itens: [] };
  const importador: ImportadorPort = { ler: async () => ({ itens: fila.itens, mapeamento: {}, relatorio: { aceitas: fila.itens.length, rejeitadas: 0, pendentes: 0, linhasRejeitadas: [], linhasPendentes: [] } }) };
  const projetos = new SanProjetoService(prisma as never);
  const casos = new SanCasosService(prisma as never, projetos);
  const importacao = new SanImportacaoService(prisma as never, projetos, importador);
  return { prisma, db, fila, projetos, casos, importacao, versoes: new SanVersoesService(prisma as never) };
}
type Ctx = ReturnType<typeof montar>;
async function pronto(c: Ctx, itens: ItemImportado[] = [item('A1', {}, 1), item('A2', {}, 2), item('A3', {}, 3)]) {
  const p = await c.projetos.criar('D1', USER);
  await c.projetos.confirmarAtividades(p.id, 1, USER);
  c.fila.itens = itens;
  await c.importacao.confirmar(p.id, ARQ, undefined, [], USER);
  const ids = Object.fromEntries(c.db.sanItem.map((i) => [i.codigo, i.id]));
  return { projetoId: p.id, ids };
}
const caso = (camada: string, tipo: string, itens: string[], atual: Record<string, unknown>, proposta: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  camada, tipo, itens, problema: 'p', evidencia: [], atual, proposta, justificativa: 'justificativa do caso', fundamento: null, impactos: [], origem: 'REGRA' as const, afeta: [], ...extra,
});
const res = (camada: string, casos: ReturnType<typeof caso>[], extra: Partial<ResultadoCamada> = {}) => ({ camada: camada as never, analisados: 1, semDados: null, semProblema: [], casos: casos as never, ...extra });
const codigo = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return ((e as { response?: { codigo?: string } }).response?.codigo) ?? 'SEM_CODIGO'; } };
const status = async (p: Promise<unknown>) => { try { await p; return 200; } catch (e) { return (e as { getStatus?: () => number }).getStatus?.() ?? 500; } };
const casoDo = (c: Ctx, tipo: string, itemId?: string) => c.db.sanCaso.find((x) => x.tipo === tipo && (!itemId || x.itens.includes(itemId)))!;
const trab = (id: string, p: Partial<ItemTrabalho> = {}): ItemTrabalho => ({
  id, codigo: id, estabelecimento: null, descricao: 'ITEM', unidade: 'UN', ncm: null, grupo: 'Defensivos', ativo: true, saldo: null, ultimaMovimentacao: null,
  fabricante: null, referencia: null, finalidade: null, campos: {}, ...p,
});
const semGrupos: AnalisadorCamada = { camada: 'GRUPOS_FINALIDADE', analisar: (itens) => ({ camada: 'GRUPOS_FINALIDADE', analisados: itens.length, semDados: null, casos: [], semProblema: itens.map((i) => i.id) }) };
const CTX = { dataBase: '2026-12-31', atividades: ['REVENDA_INSUMOS'], erp: null, corteMovimentacao: null };

afterEach(() => vi.restoreAllMocks());

describe('ALTO 1 e MÉDIO 7: finalidade por grupo, exceções em caso próprio e finalidade informada pelo cliente', () => {
  const itens = [
    trab('h1', { descricao: 'HERBICIDA A' }), trab('h2', { descricao: 'HERBICIDA B' }), trab('h3', { descricao: 'HERBICIDA C' }),
    trab('l1', { descricao: 'LUVA NITRILICA' }), // a regra manda para uso e consumo
    trab('i1', { descricao: 'HERBICIDA D', finalidade: 'REVENDA' }), // informada pelo cliente, igual à do grupo
    trab('i2', { descricao: 'HERBICIDA E', finalidade: 'EMBALAGEM' }), // informada pelo cliente, diferente da do grupo
  ];
  it('o caso do grupo não leva os itens em exceção; cada finalidade diferente vira caso próprio, sem justificativa pronta', () => {
    const r = new AnalisadorGruposFinalidade(semGrupos, CTX.atividades).analisar(itens, CTX);
    const grupo = r.casos.find((c) => c.tipo === 'FINALIDADE_GRUPO')!;
    expect(grupo.itens.sort()).toEqual(['h1', 'h2', 'h3', 'i1']);
    expect(grupo.proposta).toEqual({ finalidade: 'REVENDA' });
    expect(grupo.atual).toEqual({ finalidade: 'varia por item' }); // i1 já veio com REVENDA, os demais sem finalidade
    expect(grupo.evidencia.find((e) => e.rotulo === 'Informada pelo cliente')?.valor).toMatch(/^1 item/);
    const ex = r.casos.filter((c) => c.tipo === 'FINALIDADE_EXCECAO');
    expect(ex.map((c) => [c.proposta.finalidade, c.itens]).sort()).toEqual([['EMBALAGEM', ['i2']], ['USO_CONSUMO', ['l1']]]);
    expect(ex.every((c) => c.justificativa === '')).toBe(true);
    expect(ex.find((c) => c.itens[0] === 'i2')!.evidencia.find((e) => e.rotulo === 'Item i2')?.valor).toBe('finalidade informada pelo cliente na base');
    // a finalidade informada não vira "sem problema" sozinha
    expect(r.semProblema).not.toContain('i1');
    expect(r.semProblema).not.toContain('i2');
  });
  it('só a finalidade confirmada por decisão aprovada desta camada fica sem problema (e a exceção aprovada não some)', () => {
    const conf = finalidadesConfirmadas([{ itens: ['i1', 'h1'], proposta: { finalidade: 'REVENDA' } }, { itens: ['i2'], proposta: { finalidade: 'EMBALAGEM' } }]);
    const r = new AnalisadorGruposFinalidade(semGrupos, CTX.atividades, conf).analisar(itens.map((i) => (i.id === 'h1' ? { ...i, finalidade: 'REVENDA' as const } : i)), CTX);
    expect(r.semProblema.sort()).toEqual(['h1', 'i1', 'i2']);
    expect(r.casos.find((c) => c.tipo === 'FINALIDADE_GRUPO')!.itens.sort()).toEqual(['h2', 'h3']);
    expect(r.casos.filter((c) => c.tipo === 'FINALIDADE_EXCECAO').map((c) => c.itens)).toEqual([['l1']]);
  });
  it('aprovar a exceção exige o motivo escrito; aprovado, o Excel diz a origem de cada finalidade', async () => {
    const c = montar();
    const { projetoId, ids } = await pronto(c, [item('A1', {}, 1), item('A2', { finalidade: 'REVENDA' }, 2), item('A3', {}, 3)]);
    await c.casos.registrarResultado(projetoId, res('GRUPOS_FINALIDADE', [
      caso('GRUPOS_FINALIDADE', 'FINALIDADE_GRUPO', [ids.A1, ids.A2], { finalidade: 'varia por item' }, { finalidade: 'REVENDA' }),
      caso('GRUPOS_FINALIDADE', 'FINALIDADE_EXCECAO', [ids.A3], { finalidade: null }, { finalidade: 'USO_CONSUMO' }, { justificativa: '' }),
    ]));
    const ex = casoDo(c, 'FINALIDADE_EXCECAO');
    expect(await codigo(c.casos.aprovar(ex.id, { versao: ex.versao }, USER))).toBe('MOTIVO_EXCECAO');
    expect(await codigo(c.casos.aprovar(ex.id, { versao: ex.versao, justificativa: 'abc' }, USER))).toBe('MOTIVO_EXCECAO');
    await c.casos.aprovar(ex.id, { versao: ex.versao, justificativa: 'Luva usada pela equipe do armazém' }, USER);
    const g = casoDo(c, 'FINALIDADE_GRUPO');
    await c.casos.aprovar(g.id, { versao: g.versao }, USER);
    expect(c.db.sanItem.find((i) => i.id === ids.A3)!.trabalho).toMatchObject({ finalidade: 'USO_CONSUMO' }); // o grupo não sobrescreveu
    const m = construirModelo(await c.versoes.exportarAtual(projetoId));
    const origem = (id: string) => origemDaFinalidade(m, m.porId.get(id)!);
    expect(origem(ids.A1)).toBe('Herdada do grupo');
    expect(origem(ids.A2)).toBe('Informada pelo cliente, confirmada no grupo');
    expect(origem(ids.A3)).toBe('Exceção ao grupo: Luva usada pela equipe do armazém');
  });
});

describe('ALTO 2: impacto em escrituração já entregue pela última competência entregue', () => {
  it('sem a competência o PDF diz "não avaliado"; com ela, a linha vira escrituração entregue e reclassifica ao mudar', async () => {
    const c = montar();
    const { projetoId, ids } = await pronto(c);
    await c.casos.registrarResultado(projetoId, res('NCM', [caso('NCM', 'NCM_FORMATO', [ids.A1], { ncm: '31010000' }, { ncm: '31051000' })]));
    expect(c.db.sanImpactoSped.length).toBeGreaterThan(0);
    expect(c.db.sanImpactoSped.every((l) => l.tipo_ajuste === 'CADASTRAL_FUTURO')).toBe(true);
    const textoPdf = (d: Awaited<ReturnType<SanVersoesService['exportarAtual']>>) => JSON.stringify(montarRelatorio(d));
    expect(textoPdf(await c.versoes.exportarAtual(projetoId))).toContain('Escrituração já entregue: não avaliado (competência entregue não informada).');
    expect(textoPdf(await c.versoes.exportarAtual(projetoId))).not.toContain('Escrituração já entregue: nenhuma linha.');

    const ctrl = new SaneamentoEstoquesController(c.projetos, {} as never, {} as never, c.casos, c.versoes, {} as never, {} as never);
    expect(await status(ctrl.configurar(projetoId, { versao: c.db.sanProjeto[0].versao, parametros: { competenciaEntregue: '2026-13' } }))).toBe(400);
    await ctrl.configurar(projetoId, { versao: c.db.sanProjeto[0].versao, parametros: { competenciaEntregue: '2026-12' } }); // data-base 2026-12-31
    expect(c.db.sanProjeto[0].parametros).toMatchObject({ competenciaEntregue: '2026-12' });
    expect(c.db.sanImpactoSped.every((l) => l.tipo_ajuste === 'ESCRITURACAO_ENTREGUE' && l.avaliar_anteriores === true)).toBe(true);
    await ctrl.configurar(projetoId, { versao: c.db.sanProjeto[0].versao, parametros: { competenciaEntregue: '2026-11' } });
    expect(c.db.sanImpactoSped.every((l) => l.tipo_ajuste === 'CADASTRAL_FUTURO')).toBe(true);
    expect(textoPdf(await c.versoes.exportarAtual(projetoId))).toContain('Escrituração já entregue: nenhuma linha (última competência entregue informada: 11/2026).');
  });
  it('a camada de obrigações também marca o ajuste (ajustesDosCasos)', () => {
    const casos = [{ camada: 'NCM', tipo: 'NCM_FORMATO', itens: ['x'], justificativa: 'j', situacao: 'APROVADO', atual: { ncm: '1' }, proposta: { ncm: '31051000' } }];
    expect(ajustesDosCasos(casos, { dataBase: '2026-12-31', competenciaEntregue: '2026-12' })[0].escrituracaoEntregue).toBe(true);
    expect(ajustesDosCasos(casos, { dataBase: '2026-12-31', competenciaEntregue: '2026-11' })[0].escrituracaoEntregue).toBeUndefined();
    expect(ajustesDosCasos(casos, { dataBase: '2026-12-31' })[0].escrituracaoEntregue).toBeUndefined();
  });
});

describe('MÉDIO 3 e BAIXO 10: ressalva no motivo e rótulos no lugar dos códigos internos', () => {
  it('a ressalva do registro chega ao motivo da linha persistida; o motivo usa o rótulo do caso', () => {
    const base = { id: 'c1', projeto_id: 'P', justificativa: 'j', situacao: 'APROVADO' };
    const trib = linhasDeImpactoDoCaso({ ...base, camada: 'TRIBUTARIO', tipo: 'ENQUADRAMENTO_CONJUNTO', itens: ['a'], atual: {}, proposta: { cClassTrib: '000001', cst: '000' } }, '2026-12-31');
    const c170 = trib.find((l) => l.obrigacao === 'EFD_ICMS_IPI' && l.registro === 'C170')!;
    expect(c170.motivo).toContain('Ressalva: A EFD ICMS/IPI não tem campo de CST de IBS/CBS');
    const cons = linhasDeImpactoDoCaso({ ...base, camada: 'DUPLICIDADE', tipo: 'DUPLICIDADE_EXATA', itens: ['a', 'b'], atual: {}, proposta: { decisao: 'PROPOR_CONSOLIDACAO', manter: '1', consolidar: '2' } }, '2026-12-31');
    expect(cons.find((l) => l.registro === '0221')!.motivo).toContain('Ressalva: Correlação entre códigos de itens comercializados e o item atômico');
    expect(cons.find((l) => l.registro === '0221')!.motivo).toContain('TIPO_ITEM 00');
    const un = linhasDeImpactoDoCaso({ ...base, camada: 'NOMES_UNIDADES', tipo: 'UNIDADE_CONVERSAO', itens: ['a'], atual: {}, proposta: { unidade: 'KG', fatorConversao: 50 } }, '2026-12-31');
    expect(String(un[0].evidencia)).toContain('Nomes e unidades · Conversão de unidade');
    expect(String(un[0].evidencia)).not.toMatch(/NOMES_UNIDADES|UNIDADE_CONVERSAO/);
    expect(ajustesDosCasos([{ ...base, camada: 'TRIBUTARIO', tipo: 'ENQUADRAMENTO_CONJUNTO', itens: ['a'], atual: {}, proposta: { cst: '000' } }])[0].motivo)
      .toBe('Tratamento tributário · Enquadramento do conjunto: j');
    expect(rotuloTipoCaso('ALGUM_TIPO_NOVO')).toBe('Algum tipo novo');
  });
});

describe('MÉDIO A: exceção viva vale mais que caso de regra de um item só', () => {
  it('o caso de regra de 1 item não nasce sobre item com exceção viva, e o que já existia não aplica', async () => {
    const c = montar();
    const { projetoId, ids } = await pronto(c);
    // caso de regra de 1 item (C) já existente, antes da exceção
    await c.casos.registrarResultado(projetoId, res('NOMES_UNIDADES', [caso('NOMES_UNIDADES', 'UNIDADE_GRAFIA', [ids.A3], { unidade: 'UN' }, { unidade: 'KG' })]));
    const antigo = casoDo(c, 'UNIDADE_GRAFIA', ids.A3);
    await c.casos.registrarResultado(projetoId, res('NOMES_UNIDADES', [caso('NOMES_UNIDADES', 'EXCECAO_MANUAL', [ids.A3], { unidade: 'UN' }, { unidade: 'CX' }, { justificativa: 'Item vendido só em caixa' })]));
    expect(await codigo(c.casos.aprovar(antigo.id, { versao: antigo.versao }, USER))).toBe('SO_EXCECOES');
    // reexecutar a camada: o caso de regra perde o item com exceção (e some, se ficar vazio)
    const antes = c.db.sanCaso.length;
    await c.casos.registrarResultado(projetoId, res('NOMES_UNIDADES', [caso('NOMES_UNIDADES', 'UNIDADE_GRAFIA', [ids.A3], { unidade: 'UN' }, { unidade: 'KG' }), caso('NOMES_UNIDADES', 'UNIDADE_GRAFIA', [ids.A1, ids.A3], { unidade: 'UN' }, { unidade: 'KG' })]));
    const novos = c.db.sanCaso.slice(antes);
    expect(novos.map((x) => x.itens)).toEqual([[ids.A1]]);
    expect(c.db.sanCelula.find((x) => x.item_id === ids.A3 && x.camada === 'NOMES_UNIDADES')!.caso_id).toBe(casoDo(c, 'EXCECAO_MANUAL').id);
    expect(c.db.sanItem.find((i) => i.id === ids.A3)!.trabalho).toMatchObject({ unidade: 'UN' });
  });
});

describe('MÉDIO B: conjunto × caso individual em edição e divergência item a item', () => {
  it('o "atual" do conjunto de conversão traz todos os campos que a proposta altera, com "varia por item"', () => {
    const it = (id: string, fator: number | null) => trab(id, { unidade: 'TON', descricao: `ADUBO ${id}`, campos: fator == null ? {} : { fatorConversao: fator, unidadeCompra: 'TON' } });
    const r = new AnalisadorNomesUnidades().analisar([it('a', 900), it('b', null)], { ...CTX, atividades: [] });
    const conv = r.casos.find((c) => c.tipo === 'UNIDADE_CONVERSAO' && c.itens.length === 2);
    expect(conv?.atual).toMatchObject({ fatorConversao: 'varia por item', unidadeCompra: 'varia por item' });
  });
  it('item com caso individual em rascunho no mesmo campo fica fora do conjunto; mudança posterior de outro caso avisa a divergência', async () => {
    const c = montar();
    const { projetoId, ids } = await pronto(c);
    await c.casos.registrarResultado(projetoId, res('NOMES_UNIDADES', [
      caso('NOMES_UNIDADES', 'UNIDADE_CONVERSAO', [ids.A1], { unidade: 'UN', fatorConversao: null }, { unidade: 'KG', unidadeCompra: 'UN', fatorConversao: 1000, fatorSituacao: 'DEFINIDO' }),
      caso('NOMES_UNIDADES', 'UNIDADE_CONVERSAO', [ids.A1, ids.A2], { unidade: 'UN', fatorConversao: 'varia por item' }, { unidade: 'KG', unidadeCompra: 'UN', fatorConversao: 1000, fatorSituacao: 'DEFINIDO' }),
    ]));
    const individual = c.db.sanCaso.find((x) => x.itens.length === 1)!;
    await c.casos.salvarRascunho(individual.id, { versao: individual.versao, proposta: { unidade: 'KG', unidadeCompra: 'UN', fatorConversao: 900, fatorSituacao: 'INFORMADO' } }, USER);
    const conj = c.db.sanCaso.find((x) => x.itens.length === 2)!;
    await c.casos.aprovar(conj.id, { versao: conj.versao }, USER);
    expect(c.db.sanItem.find((i) => i.id === ids.A1)!.trabalho).not.toMatchObject({ campos: { fatorConversao: 1000 } });
    expect(c.db.sanItem.find((i) => i.id === ids.A2)!.trabalho).toMatchObject({ campos: { fatorConversao: 1000 } });
    const ind = c.db.sanCaso.find((x) => x.id === individual.id)!;
    await c.casos.aprovar(ind.id, { versao: ind.versao }, USER);
    expect(c.db.sanItem.find((i) => i.id === ids.A1)!.trabalho).toMatchObject({ campos: { fatorConversao: 900 } });
  });
  it('"varia por item": diverge o item cujo campo outra decisão mudou depois da proposta', async () => {
    const c = montar();
    const { projetoId, ids } = await pronto(c);
    const prop = { unidade: 'KG', unidadeCompra: 'UN', fatorConversao: 1000, fatorSituacao: 'DEFINIDO' };
    await c.casos.registrarResultado(projetoId, res('NOMES_UNIDADES', [caso('NOMES_UNIDADES', 'UNIDADE_CONVERSAO', [ids.A1, ids.A2], { unidade: 'UN', fatorConversao: 'varia por item' }, prop)]));
    const conj = c.db.sanCaso[0];
    conj.createdAt = new Date(Date.now() - 60_000);
    await c.casos.registrarResultado(projetoId, res('NOMES_UNIDADES', [caso('NOMES_UNIDADES', 'EXCECAO_MANUAL', [ids.A3], { unidade: 'UN' }, { unidade: 'CX' }, { justificativa: 'outro item qualquer' })]));
    // outra decisão muda o fator de A1 depois da proposta do conjunto
    await c.casos.registrarResultado(projetoId, res('QUALIDADE', [caso('QUALIDADE', 'X', [ids.A1], {}, { fatorConversao: 900 })]));
    const outro = casoDo(c, 'X');
    await c.casos.aprovar(outro.id, { versao: outro.versao }, USER);
    const e = await c.casos.aprovar(conj.id, { versao: conj.versao }, USER).catch((x) => x);
    expect(e.response?.codigo).toBe('PROPOSTA_DESATUALIZADA');
    expect(e.response?.campos).toEqual([{ campo: 'fatorConversao', atual: 900, esperado: 'varia por item', item: 'A1' }]);
  });
});

describe('BAIXO C: impacto no SPED conta só os itens a que o caso se aplica', () => {
  it('o item com exceção viva não entra nas linhas nem nos ajustes do conjunto', async () => {
    const c = montar();
    const { projetoId, ids } = await pronto(c);
    await c.casos.registrarResultado(projetoId, res('NOMES_UNIDADES', [caso('NOMES_UNIDADES', 'UNIDADE_GRAFIA', [ids.A1, ids.A2, ids.A3], { unidade: 'UN' }, { unidade: 'KG' })]));
    await c.casos.registrarResultado(projetoId, res('NOMES_UNIDADES', [caso('NOMES_UNIDADES', 'EXCECAO_MANUAL', [ids.A3], { unidade: 'UN' }, { unidade: 'CX' }, { justificativa: 'Item vendido só em caixa' })]));
    const conj = casoDo(c, 'UNIDADE_GRAFIA');
    await c.casos.aprovar(conj.id, { versao: conj.versao }, USER);
    const linhas = c.db.sanImpactoSped.filter((l) => l.caso_id === conj.id);
    expect(linhas.length).toBeGreaterThan(0);
    expect(linhas.every((l) => String(l.evidencia).startsWith('Itens afetados: 2 '))).toBe(true);
    const todos = c.db.sanCaso.map((x) => ({ camada: x.camada, tipo: x.tipo, itens: x.itens, justificativa: x.justificativa, situacao: x.situacao, atual: x.atual, proposta: x.proposta }));
    const ajustes = ajustesDosCasos(todos).filter((a) => a.tipo === 'MUDOU_UNIDADE');
    expect(ajustes.filter((a) => a.motivo.startsWith('Nomes e unidades · Grafia da unidade')).map((a) => a.itemId).sort()).toEqual([ids.A1, ids.A2].sort());
    expect(semItensDeExcecao(todos).find((x) => x.tipo === 'UNIDADE_GRAFIA')!.itens).not.toContain(ids.A3);
  });
});

describe('BAIXO D e MÉDIO G: orçamento do lote', () => {
  it('orçamento menor que 1 ms é recusado (antes 0,5 virava 0)', () => {
    expect(() => orcamentoDoLote(0.5)).toThrow();
    expect(() => orcamentoDoLote(0)).toThrow();
    expect(orcamentoDoLote(1)).toBe(1);
    expect(orcamentoDoLote('1500')).toBe(1500);
    expect(orcamentoDoLote(10_000_000)).toBe(60_000);
    expect(estimativaDoCaso(5, 10)).toBe(50);
  });
  it('o próximo caso que não cabe no orçamento (pelo número de itens) fica para depois, em vez de estourar o limite', async () => {
    const c = montar();
    const nomes = ['B1', 'B2', 'C1', 'C2', 'C3', 'C4', 'C5'];
    const { projetoId, ids } = await pronto(c, nomes.map((n, i) => item(n, {}, i + 1)));
    await c.casos.registrarResultado(projetoId, res('NCM', [
      caso('NCM', 'NCM_FORMATO', [ids.B1], { ncm: '31010000' }, { ncm: '31051000' }),
      caso('NCM', 'NCM_FORMATO', [ids.B2], { ncm: '31010000' }, { ncm: '31051000' }),
      caso('NCM', 'NCM_FORMATO', ['C1', 'C2', 'C3', 'C4', 'C5'].map((n) => ids[n]), { ncm: '31010000' }, { ncm: '31051000' }),
    ]));
    const previa = await c.casos.lotePrevia(projetoId, { filtro: { camada: 'NCM' } });
    expect(previa.aprovaveis.map((a) => a.itens)).toEqual([1, 1, 5]);
    let relogio = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => relogio);
    const real = c.casos.aprovar.bind(c.casos);
    vi.spyOn(c.casos, 'aprovar').mockImplementation(async (id, e, u, i) => {
      const r = await real(id, e, u, i);
      relogio += 10 * c.db.sanCaso.find((x) => x.id === id)!.itens.length; // 10 ms por item
      return r;
    });
    const r = await c.casos.loteAprovar(projetoId, { filtro: { camada: 'NCM' }, versoes: Object.fromEntries(previa.aprovaveis.map((a) => [a.casoId, a.versao])), orcamentoMs: 40 });
    // antes: o caso de 5 itens começava aos 20 ms e o lote terminava aos 70 ms (acima dos 40)
    expect(r.aprovados).toBe(2);
    expect(r.restantes).toHaveLength(1);
    expect(relogio).toBeLessThanOrEqual(40);
  });
});

describe('BAIXO E: código repetido olha o código de trabalho dos outros itens', () => {
  it('não dá a B o código que A já recebeu por decisão aprovada', async () => {
    const c = montar();
    const { projetoId, ids } = await pronto(c);
    await c.casos.registrarResultado(projetoId, res('IDENTIFICACAO', [caso('IDENTIFICACAO', 'CODIGO_FORMATO', [ids.A1], { codigo: 'A1' }, { codigo: 'Z9' })]));
    const a = casoDo(c, 'CODIGO_FORMATO', ids.A1);
    await c.casos.aprovar(a.id, { versao: a.versao }, USER);
    await c.casos.registrarResultado(projetoId, res('IDENTIFICACAO', [caso('IDENTIFICACAO', 'CODIGO_ZEROS_ESQUERDA', [ids.A2], { codigo: 'A2' }, { codigo: 'Z9' })]));
    const b = casoDo(c, 'CODIGO_ZEROS_ESQUERDA', ids.A2);
    expect(await codigo(c.casos.aprovar(b.id, { versao: b.versao }, USER))).toBe('CODIGO_JA_EXISTE');
    expect(c.db.sanItem.find((i) => i.id === ids.A2)!.trabalho).toMatchObject({ codigo: 'A2' });
  });
});

describe('ALTO F: impacto de consolidação só com decisão de consolidar ou inativar', () => {
  const dup = (decisao: string) => ({ camada: 'DUPLICIDADE', tipo: 'DUPLICIDADE_EXATA', proposta: { decisao, manter: '1', consolidar: '2 | 3' } });
  it('manter distintos e solicitar informação não geram ajuste, mesmo com a chave "consolidar" na proposta', () => {
    expect(tiposDeAjusteDoCaso(dup('MANTER_DISTINTOS'))).toEqual([]);
    expect(tiposDeAjusteDoCaso(dup('SOLICITAR_INFORMACAO'))).toEqual([]);
    expect(tiposDeAjusteDoCaso(dup('RELACIONAR_APRESENTACOES'))).toEqual([]);
    expect(tiposDeAjusteDoCaso(dup('PROPOR_CONSOLIDACAO'))).toEqual(['CONSOLIDOU_INATIVOU']);
    expect(tiposDeAjusteDoCaso(dup('PROPOR_INATIVACAO'))).toEqual(['CONSOLIDOU_INATIVOU']);
    const linhas = ajustesDosCasos([{ ...dup('MANTER_DISTINTOS'), itens: ['a', 'b'], justificativa: 'j', situacao: 'APROVADO', atual: {} }]);
    expect(linhas).toEqual([]);
  });
  it('a camada de identificação só gera ajuste quando muda código ou descrição (ou vincula código antigo)', () => {
    expect(tiposDeAjusteDoCaso({ camada: 'IDENTIFICACAO', tipo: 'CODIGO_REPETIDO', proposta: {} })).toEqual([]);
    expect(tiposDeAjusteDoCaso({ camada: 'IDENTIFICACAO', tipo: 'CODIGO_ANTIGO', proposta: {} })).toEqual(['MUDOU_CODIGO_DESCRICAO']);
    expect(tiposDeAjusteDoCaso({ camada: 'IDENTIFICACAO', tipo: 'CODIGO_FORMATO', proposta: { codigo: '1' } })).toEqual(['MUDOU_CODIGO_DESCRICAO']);
  });
});
