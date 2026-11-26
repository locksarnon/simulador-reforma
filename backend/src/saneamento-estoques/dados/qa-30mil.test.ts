/** Achados do QA com base sintética de 30 mil itens (Postgres real): cada teste prova uma correção. */
import { describe, expect, it, vi } from 'vitest';
import { textoDaBaseAtual } from '../entregaveis/excel';
import { AnalisadorNomesUnidades } from '../motor/nomes-unidades';
import type { ItemTrabalho, ResultadoCamada } from '../tipos';
import { orcamentoDoLote, SanCasosService } from './casos.service';
import { SanImpactosService } from './impactos.service';
import { SanImportacaoService } from './importacao.service';
import { SanOrquestracaoService } from './orquestracao.service';
import { motorDeAnalisadores, type ImportadorPort, type ItemImportado } from './portas';
import { criarPrismaFalso } from './prisma-falso';
import { SanProjetoService } from './projeto.service';
import { MAX_CASOS, validarResultado } from './validacao';
import { SanVersoesService } from './versoes.service';

const USER = { email: 'consultor@fal.test' };
const ARQ = { buffer: Buffer.from('x'), nome: 'cadastro.xlsx' };
const item = (codigo: string, extra: Partial<ItemImportado> = {}, linha = 1): ItemImportado => ({
  codigo, estabelecimento: null, descricao: `Produto ${codigo}`, unidade: 'UN', ncm: '31010000', grupo: 'Adubos', ativo: true, saldo: null,
  ultimaMovimentacao: null, fabricante: null, referencia: null, finalidade: null, campos: {}, linha, ...extra,
});
const trab = (id: string, unidade: string, descricao = `Produto ${id}`): ItemTrabalho => ({
  id, codigo: id, estabelecimento: null, descricao, unidade, ncm: null, grupo: null, ativo: true, saldo: null, ultimaMovimentacao: null, fabricante: null, referencia: null, finalidade: null, campos: {},
});
const ctx = { dataBase: '2026-12-31', atividades: [], erp: null, corteMovimentacao: null };
const codigo = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return ((e as { response?: { codigo?: string } }).response?.codigo) ?? (e as { getStatus?: () => number }).getStatus?.() ?? 'SEM_CODIGO'; } };
const status = async (p: Promise<unknown>) => { try { await p; return 200; } catch (e) { return (e as { getStatus?: () => number }).getStatus?.() ?? 500; } };

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
  const orq = new SanOrquestracaoService(prisma as never, projetos, casos, motorDeAnalisadores([new AnalisadorNomesUnidades()]));
  return { prisma, db, fila, projetos, casos, importacao, orq, versoes: new SanVersoesService(prisma as never), impactos: new SanImpactosService(prisma as never) };
}
type Ctx = ReturnType<typeof montar>;
async function pronto(c: Ctx, itens: ItemImportado[]) {
  const p = await c.projetos.criar('D1', USER);
  await c.projetos.confirmarAtividades(p.id, 1, USER);
  c.fila.itens = itens;
  await c.importacao.confirmar(p.id, ARQ, undefined, [], USER);
  return { projetoId: p.id, ids: Object.fromEntries(c.db.sanItem.map((i) => [i.codigo, i.id])) as Record<string, string> };
}

// ── ALTO 1 ───────────────────────────────────────────────────────────────────

describe('ALTO 1: camada NOMES_UNIDADES por conjunto', () => {
  it('mesma unidade escrita e mesma proposta = um caso com vários itens (grafia, conversão com fator, conversão a informar, sem regra)', () => {
    const itens = [
      ...['a', 'b', 'c', 'd'].map((x) => trab(x, 'KG')), ...['e', 'f', 'g'].map((x) => trab(x, 'KGS')), // grafia KGS → KG
      ...['h', 'i'].map((x) => trab(x, 'TONELADA')), // conversão definida (1.000)
      trab('j', 'BB', 'SEMENTE SOJA'), trab('k', 'BB', 'SEMENTE MILHO'), // conversão a informar
      trab('l', 'SACA', 'MILHO SACO 60 KG'), trab('m', 'SACA', 'SOJA SACO 60 KG'), trab('n', 'SACA', 'ADUBO SACO 50 KG'), // fator lido da descrição: 60 × 50
      trab('o', 'ROLO'), trab('p', 'ROLO'), // sem regra
    ];
    const r = new AnalisadorNomesUnidades().analisar(itens, ctx);
    const de = (tipo: string) => r.casos.filter((c) => c.tipo === tipo);
    expect(de('UNIDADE_GRAFIA')).toHaveLength(1);
    expect(de('UNIDADE_GRAFIA')[0]).toMatchObject({ itens: ['e', 'f', 'g'], proposta: { unidade: 'KG' }, atual: { unidade: 'KGS' } });
    expect(de('UNIDADE_GRAFIA')[0].atual).not.toHaveProperty('codigo'); // no conjunto, cada item tem o seu código
    const conv = de('UNIDADE_CONVERSAO');
    expect(conv).toHaveLength(4);
    expect(conv.find((c) => c.atual.unidade === 'TONELADA')).toMatchObject({ itens: ['h', 'i'], proposta: { fatorConversao: 1000, fatorSituacao: 'DEFINIDO' } });
    expect(conv.find((c) => c.atual.unidade === 'BB')).toMatchObject({ itens: ['j', 'k'], proposta: { fatorConversao: null, fatorSituacao: 'INFORMAR', exigeFator: 'SIM' } });
    expect(conv.filter((c) => c.atual.unidade === 'SACA').map((c) => [c.itens, c.proposta.fatorConversao])).toEqual(expect.arrayContaining([[['l', 'm'], 60], [['n'], 50]]));
    expect(de('UNIDADE_SEM_REGRA')).toHaveLength(1);
    expect(de('UNIDADE_SEM_REGRA')[0].itens).toEqual(['o', 'p']);
    // caso de um item só continua com o código em "atual"
    expect(conv.find((c) => c.itens.length === 1)!.atual).toMatchObject({ codigo: 'n', unidade: 'SACA' });
    expect(de('UNIDADE_GRAFIA')[0].evidencia).toEqual(expect.arrayContaining([{ rotulo: 'Itens do conjunto', valor: '3' }]));
  });

  it('base de 30 mil itens: os casos de unidade cabem folgados abaixo do teto (antes eram 20.214, um por item)', () => {
    const unidades = ['KG', 'KG', 'KG', 'KGS', 'TONELADA', 'BB', 'SACA', 'ROLO', 'UN', 'UND', 'LT', 'L'];
    const itens = Array.from({ length: 30_000 }, (_, i) => trab(`I${i}`, unidades[i % unidades.length], i % 7 === 0 ? `ADUBO NPK SACO ${(i % 3) * 10 + 20}KG` : `PARAFUSO SEXTAVADO ACO ${i}`));
    const r = new AnalisadorNomesUnidades().analisar(itens, ctx);
    const deUnidade = r.casos.filter((c) => c.tipo.startsWith('UNIDADE_'));
    const itensEmCasos = deUnidade.reduce((s, c) => s + c.itens.length, 0);
    expect(itensEmCasos).toBeGreaterThan(15_000); // os itens continuam todos cobertos
    expect(deUnidade.length).toBeLessThan(20); // um caso por conjunto
    expect(r.casos.length).toBeLessThan(MAX_CASOS);
  });

  it('caminho interno não cai no teto do POST: validarResultado com semTeto aceita mais de 20 mil casos; o POST continua recusando', () => {
    const casos = Array.from({ length: MAX_CASOS + 1 }, (_, i) => ({ camada: 'QUALIDADE', tipo: 'T', itens: [`i${i}`], problema: 'p', justificativa: 'j', evidencia: [], atual: {}, proposta: {}, impactos: [], origem: 'REGRA', afeta: [] }));
    const r = { camada: 'QUALIDADE', analisados: 1, semDados: null, semProblema: [], casos } as unknown as ResultadoCamada;
    expect(() => validarResultado(r)).toThrow(/Casos demais/);
    expect(validarResultado(r, { semTeto: true }).casos).toHaveLength(MAX_CASOS + 1);
  });

  it('executar a camada usa o caminho interno (sem teto) e grava os conjuntos', async () => {
    const c = montar();
    const { projetoId } = await pronto(c, [item('A', { unidade: 'KG' }), item('B', { unidade: 'KG' }), item('C', { unidade: 'KGS' }), item('D', { unidade: 'KGS' })]);
    const espia = vi.spyOn(c.casos, 'registrarResultado');
    const r = await c.orq.executarCamada(projetoId, 'NOMES_UNIDADES');
    expect(espia.mock.calls[0][2]).toEqual({ completo: true, interno: true });
    expect(r.casosNovos).toBeGreaterThan(0);
    const grafia = c.db.sanCaso.filter((x) => x.tipo === 'UNIDADE_GRAFIA');
    expect(grafia).toHaveLength(1);
    expect(grafia[0]).toMatchObject({ situacao: 'PROPOSTO' });
    expect(grafia[0].itens).toHaveLength(2);
  });

  it('aprovar o caso agregado aplica a todos os itens e grava o histórico por item', async () => {
    const c = montar();
    const { projetoId, ids } = await pronto(c, [item('A', { unidade: 'KG' }), item('B', { unidade: 'KG' }), item('C', { unidade: 'KGS' }), item('D', { unidade: 'KGS' }), item('E', { unidade: 'KGS' })]);
    await c.orq.executarCamada(projetoId, 'NOMES_UNIDADES');
    const caso = c.db.sanCaso.find((x) => x.tipo === 'UNIDADE_GRAFIA')!;
    await c.casos.aprovar(caso.id, { versao: caso.versao }, USER);
    for (const k of ['C', 'D', 'E']) {
      expect(c.db.sanItem.find((i) => i.id === ids[k])!.trabalho.unidade).toBe('KG');
      expect(c.db.sanDecisao.filter((d) => d.item_id === ids[k] && d.caso_id === caso.id && d.campo === 'unidade')).toEqual([expect.objectContaining({ antes: 'KGS', depois: 'KG', tipo: 'aprovar' })]);
      expect(c.db.sanCelula.find((x) => x.item_id === ids[k] && x.camada === 'NOMES_UNIDADES')).toMatchObject({ situacao: 'APROVADO', caso_id: caso.id });
    }
    expect(c.db.sanItem.find((i) => i.id === ids.A)!.versao).toBe(1); // fora do caso, intocado
  });

  it('conversão a informar no conjunto: o fator vale para todos; o item com exceção própria fica com a exceção (herdado × exceção)', async () => {
    const c = montar();
    const { projetoId, ids } = await pronto(c, ['A', 'B', 'C'].map((k, n) => item(k, { unidade: 'BB', descricao: `SEMENTE ${k}` }, n + 1)));
    await c.orq.executarCamada(projetoId, 'NOMES_UNIDADES');
    const conjunto = c.db.sanCaso.find((x) => x.tipo === 'UNIDADE_CONVERSAO')!;
    expect(conjunto.itens).toHaveLength(3);
    expect(await codigo(c.casos.aprovar(conjunto.id, { versao: 1 }, USER))).toBe('FATOR_AUSENTE'); // sem fator, nada é aplicado
    // Exceção do item C: outro conteúdo
    await c.casos.registrarResultado(projetoId, {
      camada: 'NOMES_UNIDADES', analisados: 1, semDados: null, semProblema: [],
      casos: [{ camada: 'NOMES_UNIDADES', tipo: 'EXCECAO_MANUAL', itens: [ids.C], problema: 'Exceção do item C', evidencia: [], atual: { unidade: 'BB' }, proposta: { unidade: 'KG', unidadeCompra: 'BB', fatorConversao: 500 }, justificativa: 'Big bag de 500 kg', fundamento: null, impactos: [], origem: 'REGRA', afeta: [] }],
    });
    const excecao = c.db.sanCaso.find((x) => x.tipo === 'EXCECAO_MANUAL')!;
    expect(c.db.sanCelula.find((x) => x.item_id === ids.C && x.camada === 'NOMES_UNIDADES')!.caso_id).toBe(excecao.id);
    const r = await c.casos.aprovar(conjunto.id, { versao: 1, proposta: { ...conjunto.proposta, fatorConversao: 1000 } }, USER);
    expect(r).toMatchObject({ jaAplicado: false, itensComExcecao: 1 });
    for (const k of ['A', 'B']) expect(c.db.sanItem.find((i) => i.id === ids[k])!.trabalho).toMatchObject({ unidade: 'KG', campos: { unidadeCompra: 'BB', fatorConversao: 1000 } });
    expect(c.db.sanItem.find((i) => i.id === ids.C)!.trabalho.unidade).toBe('BB'); // a exceção ainda não foi decidida: o conjunto não a sobrepõe
    expect(c.db.sanDecisao.filter((d) => d.item_id === ids.C)).toHaveLength(0);
    expect(c.db.sanCelula.find((x) => x.item_id === ids.C && x.camada === 'NOMES_UNIDADES')).toMatchObject({ caso_id: excecao.id, situacao: 'PROPOSTO' });
    await c.casos.aprovar(excecao.id, { versao: excecao.versao }, USER);
    expect(c.db.sanItem.find((i) => i.id === ids.C)!.trabalho).toMatchObject({ unidade: 'KG', campos: { fatorConversao: 500 } });
  });
});

// ── MÉDIO 2 ──────────────────────────────────────────────────────────────────

describe('MÉDIO 2: reimportação grande', () => {
  async function base(n: number) {
    const c = montar();
    const originais = Array.from({ length: n }, (_, i) => item(`C${String(i).padStart(4, '0')}`, {}, i + 1));
    const { projetoId, ids } = await pronto(c, originais);
    // Um item lá no fim da lista tem decisão no campo descricao (protegido).
    const protegido = ids[`C${String(n - 5).padStart(4, '0')}`];
    c.db.sanDecisao.push({ id: 'dprot', projeto_id: projetoId, item_id: protegido, caso_id: null, campo: 'descricao', antes: null, depois: 'x', usuario: 'u', tipo: 'aprovar', quando: new Date() });
    c.fila.itens = originais.map((i) => ({ ...i, descricao: `${i.descricao} NOVA`, grupo: 'Fertilizantes' }));
    return { c, projetoId, ids, protegido };
  }

  it('totais completos, diferenças paginadas e a marca "protegido" aparece em qualquer página', async () => {
    const { c, projetoId, protegido } = await base(450);
    const p1 = await c.importacao.previa(projetoId, ARQ);
    expect(p1).toMatchObject({ alterados: 450, totais: { alterados: 450, novos: 0, ausentes: 0, alteradosComProtegido: 1, alteradosIncorporaveis: 450, camposProtegidos: 1 } });
    expect(p1.diferencas).toHaveLength(200);
    expect(p1.paginaDiferencas).toMatchObject({ pagina: 1, total: 450, paginas: 3 });
    const p3 = await c.importacao.previa(projetoId, ARQ, undefined, { pagina: '3' });
    expect(p3.diferencas).toHaveLength(50);
    expect(p3.diferencas.find((d) => d.itemId === protegido)!.campos.find((x) => x.campo === 'descricao')!.protegido).toBe(true);
    const so = await c.importacao.previa(projetoId, ARQ, undefined, { filtro: 'COM_PROTEGIDO' });
    expect(so.diferencas.map((d) => d.itemId)).toEqual([protegido]);
    expect(await status(c.importacao.previa(projetoId, ARQ, undefined, { filtro: 'QUALQUER' }))).toBe(400);
  });

  it('incorporar por filtro, sem listar ids: todos os alterados (o campo protegido fica como estava)', async () => {
    const { c, projetoId, protegido } = await base(450);
    const r = await c.importacao.confirmar(projetoId, ARQ, undefined, { filtro: 'ALTERADOS' }, USER);
    expect(r.incorporados).toBe(450);
    expect(r.ignorados).toEqual([{ itemId: protegido, campo: 'descricao', motivo: 'Campo já decidido: a decisão foi mantida.' }]);
    const p = c.db.sanItem.find((i) => i.id === protegido)!;
    expect(p.trabalho).toMatchObject({ descricao: expect.not.stringContaining('NOVA'), grupo: 'Fertilizantes' });
    expect(c.db.sanItem.filter((i) => i.id !== protegido).every((i) => i.trabalho.descricao.endsWith('NOVA'))).toBe(true);
    expect(c.db.sanDecisao.filter((d) => d.tipo === 'importar')).toHaveLength(450 * 2 - 1);
  });

  it('filtro "sem protegidos" e exceções pontuais', async () => {
    const { c, projetoId, ids, protegido } = await base(30);
    const r = await c.importacao.confirmar(projetoId, ARQ, undefined, { filtro: 'ALTERADOS_SEM_PROTEGIDO', exceto: [ids.C0000] }, USER);
    expect(r.incorporados).toBe(28);
    expect(c.db.sanItem.find((i) => i.id === protegido)!.trabalho.grupo).toBe('Adubos');
    expect(c.db.sanItem.find((i) => i.id === ids.C0000)!.trabalho.grupo).toBe('Adubos');
    expect(await status(c.importacao.confirmar(projetoId, ARQ, undefined, { filtro: 'TUDO' } as never, USER))).toBe(400);
  });
});

// ── MÉDIO 5 ──────────────────────────────────────────────────────────────────

const dup = (itens: string[], decisao: string) => ({
  camada: 'DUPLICIDADE', analisados: 2, semDados: null, semProblema: [],
  casos: [{ camada: 'DUPLICIDADE', tipo: 'DUPLICIDADE_EXATA', itens, problema: 'Duplicidade', evidencia: [], atual: {}, proposta: { decisao, manter: 'A', consolidar: 'B' }, justificativa: 'j', fundamento: null, impactos: [], origem: 'REGRA', afeta: [] }],
}) as never;

describe('MÉDIO 5: aprovar "solicitar informação" e lote', () => {
  it('DUPLICIDADE_EXATA com decisão SOLICITAR_INFORMACAO não vira APROVADO: 400 claro, fica fora do lote, e "Pedir informação" leva a AGUARDANDO_INFORMACAO', async () => {
    const c = montar();
    const { projetoId, ids } = await pronto(c, [item('A'), item('B', {}, 2)]);
    await c.casos.registrarResultado(projetoId, dup([ids.A, ids.B], 'SOLICITAR_INFORMACAO'));
    const caso = c.db.sanCaso[0];
    expect(await codigo(c.casos.aprovar(caso.id, { versao: 1 }, USER))).toBe('DECISAO_PEDE_INFORMACAO');
    expect(c.db.sanCaso[0].situacao).toBe('PROPOSTO');
    const p = await c.casos.lotePrevia(projetoId, { filtro: { camada: 'DUPLICIDADE' } });
    expect(p.aprovaveis).toHaveLength(0);
    expect(p.excecoes[0].motivo).toMatch(/solicitar informação/);
    const l = await c.casos.loteAprovar(projetoId, { filtro: { camada: 'DUPLICIDADE' }, versoes: { [caso.id]: 1 } }, USER);
    expect(l.aprovados).toBe(0);
    await c.casos.pedirInformacao(caso.id, { versao: 1, motivo: 'Confirmar com o cliente' });
    expect(c.db.sanCaso[0].situacao).toBe('AGUARDANDO_INFORMACAO');
    expect(c.db.sanCelula.filter((x) => x.camada === 'DUPLICIDADE').every((x) => x.situacao === 'AGUARDANDO_INFORMACAO')).toBe(true);
    // Escolhida outra decisão, aprova normalmente.
    await c.casos.reabrir(caso.id, { versao: c.db.sanCaso[0].versao }, USER);
    const r = await c.casos.aprovar(caso.id, { versao: c.db.sanCaso[0].versao, proposta: { ...caso.proposta, decisao: 'MANTER_DISTINTOS' } }, USER);
    expect(r.caso.situacao).toBe('APROVADO');
  });

  it('aprovação em bloco: um alerta de 450 itens grava as marcas de histórico em poucas chamadas (nada de uma consulta por item)', async () => {
    const c = montar();
    const lista = Array.from({ length: 450 }, (_, i) => item(`I${i}`, {}, i + 1));
    const { projetoId } = await pronto(c, lista);
    const itens = c.db.sanItem.map((i) => i.id);
    await c.casos.registrarResultado(projetoId, dup(itens, 'MANTER_DISTINTOS'));
    const caso = c.db.sanCaso[0];
    const createMany = vi.spyOn(c.prisma.sanDecisao, 'createMany');
    const create = vi.spyOn(c.prisma.sanDecisao, 'create');
    const count = vi.spyOn(c.prisma.sanDecisao, 'count');
    await c.casos.aprovar(caso.id, { versao: 1 }, USER);
    expect(create).not.toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled();
    expect(createMany.mock.calls.length).toBeLessThanOrEqual(3); // um por bloco de 200
    expect(c.db.sanDecisao.filter((d) => d.caso_id === caso.id && d.campo === 'caso:DUPLICIDADE_EXATA')).toHaveLength(450); // um registro por item
  });
});

// ── BAIXOS ───────────────────────────────────────────────────────────────────

describe('BAIXOS', () => {
  it('lote: id de caso inexistente aparece como exceção (não some em silêncio)', async () => {
    const c = montar();
    const { projetoId, ids } = await pronto(c, [item('A'), item('B', {}, 2)]);
    await c.casos.registrarResultado(projetoId, dup([ids.A, ids.B], 'MANTER_DISTINTOS'));
    const p = await c.casos.lotePrevia(projetoId, { ids: [c.db.sanCaso[0].id, 'nao-existe'] });
    expect(p.aprovaveis).toHaveLength(1);
    expect(p.inexistentes).toBe(1);
    expect(p.excecoes).toEqual([{ casoId: 'nao-existe', motivo: 'Caso inexistente neste projeto.' }]);
  });

  it('lote/aprovar: orcamentoMs inválido é 400 e o informado é limitado ao teto do servidor', async () => {
    expect(orcamentoDoLote(undefined)).toBe(60_000);
    expect(orcamentoDoLote(5000)).toBe(5000);
    expect(orcamentoDoLote('5000')).toBe(5000);
    expect(orcamentoDoLote(10_000_000)).toBe(60_000);
    for (const v of ['x', -1, 0, Number.NaN, {}, '1e9']) expect(() => orcamentoDoLote(v)).toThrow(/orcamentoMs/);
    const c = montar();
    const { projetoId, ids } = await pronto(c, [item('A'), item('B', {}, 2)]);
    await c.casos.registrarResultado(projetoId, dup([ids.A, ids.B], 'MANTER_DISTINTOS'));
    expect(await status(c.casos.loteAprovar(projetoId, { ids: [c.db.sanCaso[0].id], versoes: { [c.db.sanCaso[0].id]: 1 }, orcamentoMs: 'x' }, USER))).toBe(400);
  });

  it('GET impactos-sped paginado: página, próximo, total e contagem por tipo do filtro inteiro', async () => {
    const c = montar();
    const linhas = Array.from({ length: 7 }, (_, i) => ({ obrigacao: 'EFD_ICMS_IPI', registro: '0200', motivo: `m${i}`, tipo_ajuste: i < 5 ? 'CADASTRAL_FUTURO' : 'REGULARIZACAO_SALDO' }));
    await c.impactos.registrarImpactos('P1', linhas);
    const p1 = await c.impactos.listarImpactos('P1', { limite: '3' });
    expect(p1.linhas).toHaveLength(3);
    expect(p1).toMatchObject({ total: 7, totalGeral: 7, porTipo: { CADASTRAL_FUTURO: 5, REGULARIZACAO_SALDO: 2, ESCRITURACAO_ENTREGUE: 0 } });
    const p2 = await c.impactos.listarImpactos('P1', { limite: '3', cursor: p1.proximo! });
    const p3 = await c.impactos.listarImpactos('P1', { limite: '3', cursor: p2.proximo! });
    expect([...p1.linhas, ...p2.linhas, ...p3.linhas].map((l) => l.motivo)).toEqual(linhas.map((l) => l.motivo));
    expect(p3.proximo).toBeNull();
    const tipo = await c.impactos.listarImpactos('P1', { tipo_ajuste: 'REGULARIZACAO_SALDO' });
    expect(tipo).toMatchObject({ total: 2, totalGeral: 7 });
    expect(await status(c.impactos.listarImpactos('P1', { tipo_ajuste: 'OUTRO' }))).toBe(400);
  });

  it('Excel de revisão diz a última versão liberada (ou que ainda não há nenhuma)', async () => {
    expect(textoDaBaseAtual(null)).toBe('Base atual, para revisão (nenhuma versão liberada ainda)');
    const c = montar();
    const { projetoId } = await pronto(c, [item('A')]);
    expect((await c.versoes.exportarAtual(projetoId)).ultimaLiberada).toBeNull();
    await c.versoes.criar(projetoId, { rotulo: 'Entrega de janeiro' }, USER);
    const d = await c.versoes.exportarAtual(projetoId);
    expect(d.ultimaLiberada).toMatchObject({ numero: 1, rotulo: 'Entrega de janeiro' });
    expect(textoDaBaseAtual(d.ultimaLiberada)).toMatch(/^Base atual, para revisão \(inclui o que mudou depois da última versão liberada: Versão 1 — Entrega de janeiro, liberada em \d{2}\/\d{2}\/\d{4}\)$/);
  });
});
