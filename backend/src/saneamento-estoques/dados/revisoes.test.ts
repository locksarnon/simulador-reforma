import { describe, expect, it, vi } from 'vitest';
import { construirModelo } from '../entregaveis/modelo';
import { criarCatalogos } from '../fiscal';
import type { AnalisadorCamada, ResultadoCamada } from '../tipos';
import { SanCasosService } from './casos.service';
import { apagarSaneamento } from './exclusao';
import { SanImportacaoService } from './importacao.service';
import { SanItensService } from './itens.service';
import { MotorSaneamento } from './motor.provider';
import { SanOrquestracaoService } from './orquestracao.service';
import { motorDeAnalisadores, type ImportadorPort, type ItemImportado } from './portas';
import { criarPrismaFalso } from './prisma-falso';
import { SanProjetoService } from './projeto.service';
import { SanVersoesService } from './versoes.service';

const USER = { email: 'consultor@fal.test' };
const item = (codigo: string, extra: Partial<ItemImportado> = {}, linha = 1): ItemImportado => ({
  codigo, estabelecimento: null, descricao: `Produto ${codigo}`, unidade: 'UN', ncm: '31010000', grupo: 'Adubos', ativo: true, saldo: null,
  ultimaMovimentacao: null, fabricante: null, referencia: null, finalidade: null, campos: {}, linha, ...extra,
});
const ARQ = { buffer: Buffer.from('x'), nome: 'cadastro.xlsx' };

function montar(opcoes: { analisadores?: AnalisadorCamada[]; catalogos?: ReturnType<typeof criarCatalogos>; motorReal?: boolean } = {}) {
  const { prisma, db } = criarPrismaFalso({
    projetoDiagnostico: [{ id: 'D1', servico_consultoria: 'saneamento-estoques', empresa_ids: ['E1'], periodo_inicio: new Date('2026-12-31T00:00:00Z') }],
    empresa: [{ id: 'E1', erp: 'SAP', cnae_principal: '4683400', cnae_descricao: 'Defensivos', cnaes_secundarios: [], dados_publicos_em: new Date('2026-10-01T00:00:00Z') }],
  });
  const fila: { itens: ItemImportado[] } = { itens: [] };
  const importador: ImportadorPort = { ler: async () => ({ itens: fila.itens, mapeamento: {}, relatorio: { aceitas: fila.itens.length, rejeitadas: 0, pendentes: 0, linhasRejeitadas: [], linhasPendentes: [] } }) };
  const cat = opcoes.catalogos;
  const projetos = new SanProjetoService(prisma as never);
  const casos = new SanCasosService(prisma as never, projetos, cat ? ({ carregar: async () => cat } as never) : undefined);
  const importacao = new SanImportacaoService(prisma as never, projetos, importador);
  const motor = opcoes.motorReal ? new MotorSaneamento(prisma as never, { carregar: async () => cat! } as never) : motorDeAnalisadores(opcoes.analisadores ?? []);
  return { prisma, db, fila, projetos, casos, importacao, itens: new SanItensService(prisma as never), versoes: new SanVersoesService(prisma as never), orq: new SanOrquestracaoService(prisma as never, projetos, casos, motor) };
}
type Ctx = ReturnType<typeof montar>;

async function pronto(c: Ctx, itens: ItemImportado[] = [item('A1', {}, 1), item('A2', {}, 2), item('S1', { grupo: 'Sementes' }, 3)]) {
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
const status = async (p: Promise<unknown>) => { try { await p; return 200; } catch (e) { return (e as { getStatus?: () => number }).getStatus?.() ?? 500; } };
const codigo = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return ((e as { response?: { codigo?: string } }).response?.codigo) ?? 'SEM_CODIGO'; } };

describe('A1/A2: versão liberada é uma foto congelada', () => {
  it('guarda casos, impactos e vínculos de então; aprovar depois não muda a versão', async () => {
    const c = montar();
    const { projetoId, ids } = await pronto(c);
    await c.casos.registrarResultado(projetoId, res('NCM', [caso('NCM', 'NCM_FORMATO', [ids.A1], { ncm: '31010000' }, { ncm: '31051000' })]));
    const v1 = await c.versoes.criar(projetoId, { rotulo: 'Entrega 1' }, USER);
    await c.casos.aprovar(c.db.sanCaso[0].id, { versao: 1 }, USER);
    const exp1 = await c.versoes.exportar(projetoId, v1.id);
    expect(exp1.casos[0]).toMatchObject({ situacao: 'PROPOSTO' });
    expect(exp1.itens.find((i) => i.codigo === 'A1')).toMatchObject({ trabalho: { ncm: '31010000' } }); // item como era
    expect(exp1.decisoes).toHaveLength(0);
    // a entrega liberada não mostra o impacto de caso ainda não decidido
    expect(construirModelo(exp1).impactos).toHaveLength(0);
    // a base de agora já tem o caso aprovado e as decisões
    const agora = await c.versoes.exportarAtual(projetoId);
    expect(agora.casos[0]).toMatchObject({ situacao: 'APROVADO' });
    expect(agora.decisoes.length).toBeGreaterThan(0);
    expect(construirModelo(agora).impactos.length).toBeGreaterThan(0);
    // nova exportação da v1: igual à primeira
    expect((await c.versoes.exportar(projetoId, v1.id)).casos[0]).toMatchObject({ situacao: 'PROPOSTO' });
  });

  it('libera com aviso (não bloqueio) quando há células "revisar" e a linha sai como "Aguardando revisão"', async () => {
    const c = montar();
    const { projetoId, ids } = await pronto(c);
    c.db.sanCelula.find((x) => x.item_id === ids.A1 && x.camada === 'TRIBUTARIO')!.revisar = true;
    const v = await c.versoes.criar(projetoId, { rotulo: 'V' }, USER);
    expect(v.aviso).toMatchObject({ celulasRevisar: 1, porCamada: { TRIBUTARIO: 1 } });
    expect(v.resumo).toMatchObject({ celulasRevisar: 1 });
    const m = construirModelo(await c.versoes.exportar(projetoId, v.id));
    const linhas = (await import('../entregaveis/modelo')).linhasDeCenario(m, m.itens.find((i) => i.codigo === 'A1')!);
    expect(linhas[0].situacao).toBe('Aguardando revisão');
  });
});

describe('C-ALTO-1: impacto no SPED gravado ligado ao caso', () => {
  it('aprovar caso de mudança de NCM grava linhas de impacto; é idempotente; reabrir remove', async () => {
    const c = montar();
    const { projetoId, ids } = await pronto(c);
    await c.casos.registrarResultado(projetoId, res('NCM', [caso('NCM', 'NCM_FORMATO', [ids.A1, ids.A2], { ncm: '31010000' }, { ncm: '31051000' })]));
    const casoId = c.db.sanCaso[0].id;
    const proposto = c.db.sanImpactoSped.length;
    expect(proposto).toBeGreaterThan(0); // o proposto já aparece (exportação para revisão)
    await c.casos.aprovar(casoId, { versao: 1 }, USER);
    const n = c.db.sanImpactoSped.length;
    expect(n).toBe(proposto);
    expect(c.db.sanImpactoSped.every((i) => i.caso_id === casoId && i.registro && i.obrigacao && i.tipo_ajuste)).toBe(true);
    expect(c.db.sanImpactoSped.some((i) => i.registro === '0200')).toBe(true);
    expect(c.db.sanImpactoSped[0].evidencia).toContain('Itens afetados: 2');
    await c.casos.aprovar(casoId, { versao: 1 }, USER); // idempotente
    expect(c.db.sanImpactoSped).toHaveLength(n);
    const lista = await new (await import('./impactos.service')).SanImpactosService(c.prisma as never).listarImpactos(projetoId);
    expect(lista.linhas).toHaveLength(n);
    expect(lista.total).toBe(n);
    await c.casos.reabrir(casoId, { versao: 2 }, USER);
    expect(c.db.sanImpactoSped.filter((i) => i.caso_id === casoId).length).toBe(n); // proposto de novo: volta a ser só proposto
    await c.casos.rejeitar(casoId, { versao: 3, justificativa: 'mantém o NCM' }, USER);
    expect(c.db.sanImpactoSped).toHaveLength(0);
  });

  it('executar a camada OBRIGACOES (re)grava os impactos de todos os casos', async () => {
    const c = montar({ analisadores: [{ camada: 'OBRIGACOES', analisar: (itens) => ({ camada: 'OBRIGACOES', analisados: itens.length, semDados: null, casos: [], semProblema: [] }) }] });
    const { projetoId, ids } = await pronto(c);
    await c.casos.registrarResultado(projetoId, res('NCM', [caso('NCM', 'NCM_FORMATO', [ids.A1], { ncm: '31010000' }, { ncm: '31051000' })]));
    c.db.sanImpactoSped.length = 0;
    await c.orq.executarCamada(projetoId, 'OBRIGACOES');
    expect(c.db.sanImpactoSped.length).toBeGreaterThan(0);
  });
});

describe('M1: exclusão sem órfãos', () => {
  it('apaga o projeto de saneamento e todos os filhos', async () => {
    const c = montar();
    const { projetoId, ids } = await pronto(c);
    await c.casos.registrarResultado(projetoId, res('NCM', [caso('NCM', 'NCM_FORMATO', [ids.A1], { ncm: '31010000' }, { ncm: '31051000' })]));
    await c.casos.aprovar(c.db.sanCaso[0].id, { versao: 1 }, USER);
    await c.versoes.criar(projetoId, { rotulo: 'V' }, USER);
    await c.prisma.$transaction(async (tx: never) => { await apagarSaneamento(tx, { diagnostico_id: 'D1' }); });
    for (const m of ['sanProjeto', 'sanAtividade', 'sanImportacao', 'sanItem', 'sanCelula', 'sanCaso', 'sanDecisao', 'sanVersao', 'sanVersaoSnapshot', 'sanImpactoSped', 'sanVinculoCodigo'] as const) {
      expect(c.db[m], m).toHaveLength(0);
    }
  });
});

describe('M2/M3/M5/A5: decisão segura', () => {
  it('aprovar confere o valor atual (409 PROPOSTA_DESATUALIZADA) e aceita a confirmação; grava a justificativa', async () => {
    const c = montar();
    const { projetoId, ids } = await pronto(c);
    await c.casos.registrarResultado(projetoId, res('NCM', [caso('NCM', 'NCM_FORMATO', [ids.A1], { ncm: '31010000' }, { ncm: '31051000' })]));
    c.db.sanItem.find((i) => i.id === ids.A1)!.trabalho.ncm = '99999999'; // mudou depois da proposta
    const id = c.db.sanCaso[0].id;
    let corpo: { campos?: unknown; codigo?: string } = {};
    try { await c.casos.aprovar(id, { versao: 1 }, USER); } catch (e) { corpo = (e as { response: typeof corpo }).response; }
    expect(corpo.codigo).toBe('PROPOSTA_DESATUALIZADA');
    expect(corpo.campos).toEqual([{ campo: 'ncm', atual: '99999999', esperado: '31010000' }]);
    await c.casos.aprovar(id, { versao: 1, confirmarDivergencia: true, justificativa: 'Conferido com o cliente' }, USER);
    expect(c.db.sanCaso[0]).toMatchObject({ situacao: 'APROVADO', justificativa: 'Conferido com o cliente' });
    expect(c.db.sanDecisao.find((d) => d.campo === 'ncm')!.fundamento).toBe('Conferido com o cliente');
  });

  it('valida a forma: chave perigosa, NCM sem 8 dígitos, tipos errados, origem e itens do resultado', async () => {
    const c = montar();
    const { projetoId, ids } = await pronto(c);
    const reg = (cs: ReturnType<typeof caso>[]) => c.casos.registrarResultado(projetoId, res('NCM', cs));
    expect(await status(reg([caso('NCM', 'T', [ids.A1], {}, JSON.parse('{"__proto__": 1}'))]))).toBe(400);
    expect(await status(reg([caso('NCM', 'T', [ids.A1], {}, { constructor: 'x' })]))).toBe(400);
    expect(await status(reg([caso('NCM', 'T', [ids.A1], {}, { ncm: '3105' })]))).toBe(400);
    expect(await status(reg([caso('NCM', 'T', [ids.A1], {}, { ativo: 'sim' })]))).toBe(400);
    expect(await status(reg([caso('NCM', 'T', [ids.A1], {}, { saldo: '10' })]))).toBe(400);
    expect(await status(reg([caso('NCM', 'T', [ids.A1], {}, { campos_x: 'a'.repeat(3000) })]))).toBe(400);
    expect(await status(reg([caso('NCM', 'T', [ids.A1], {}, { ncm: '31051000' }, { origem: 'HUMANO' })]))).toBe(400);
    expect(await status(reg([caso('NCM', 'T', [ids.A1], [] as never, {})]))).toBe(400);
    expect(await status(reg([caso('NCM', '', [ids.A1], {}, {})]))).toBe(400);
    expect(await status(c.casos.registrarResultado(projetoId, { camada: 'NCM', casos: 'x' } as never))).toBe(400);
    // proposta de rascunho com chave perigosa
    await reg([caso('NCM', 'OK', [ids.A1, ids.A1], { ncm: '31010000' }, { ncm: '31051000' })]);
    expect(c.db.sanCaso[0].itens).toEqual([ids.A1]); // itens repetidos viram um só
    expect(await status(c.casos.salvarRascunho(c.db.sanCaso[0].id, { versao: 1, proposta: { 'campos.__proto__': 1 } }, USER))).toBe(400);
    await c.casos.salvarRascunho(c.db.sanCaso[0].id, { versao: 1, proposta: { 'campos.cor': 'azul', ncm: '31051000' } }, USER);
    await c.casos.aprovar(c.db.sanCaso[0].id, { versao: 2 }, USER);
    expect(c.db.sanItem.find((i) => i.id === ids.A1)!.trabalho.campos).toEqual({ cor: 'azul' });
  });

  it('código novo não pode repetir o de outro item', async () => {
    const c = montar();
    const { projetoId, ids } = await pronto(c);
    await c.casos.registrarResultado(projetoId, res('IDENTIFICACAO', [caso('IDENTIFICACAO', 'CODIGO', [ids.A1], { codigo: 'A1' }, { codigo: 'A2' })]));
    expect(await codigo(c.casos.aprovar(c.db.sanCaso[0].id, { versao: 1 }, USER))).toBe('CODIGO_JA_EXISTE');
  });

  it('não aprova caso "aguardando" nem conversão de unidade sem fator; fator da descrição exige confirmação; editar o fator libera', async () => {
    const c = montar();
    const { projetoId, ids } = await pronto(c);
    await c.casos.registrarResultado(projetoId, res('NOMES_UNIDADES', [
      caso('NOMES_UNIDADES', 'UNIDADE_SEM_FATOR', [ids.A1], { unidade: 'UN' }, { unidade: 'KG', unidadeCompra: 'SC', fatorConversao: null, fatorSituacao: 'INFORMAR' }),
      caso('NOMES_UNIDADES', 'UNIDADE_FATOR_DESCRICAO', [ids.A2], { unidade: 'UN' }, { unidade: 'KG', unidadeCompra: 'SC', fatorConversao: 50, fatorSituacao: 'CONFIRMAR' }),
    ]));
    const [semFator, daDescricao] = c.db.sanCaso;
    expect(await codigo(c.casos.aprovar(semFator.id, { versao: 1 }, USER))).toBe('FATOR_AUSENTE');
    expect(await codigo(c.casos.aprovar(daDescricao.id, { versao: 1 }, USER))).toBe('FATOR_A_CONFIRMAR');
    const previa = await c.casos.lotePrevia(projetoId, { filtro: { camada: 'NOMES_UNIDADES' } });
    expect(previa.aprovaveis).toHaveLength(0);
    expect(previa.excecoes).toHaveLength(2);
    await c.casos.aprovar(daDescricao.id, { versao: 1, confirmarFator: true }, USER);
    await c.casos.salvarRascunho(semFator.id, { versao: 1, proposta: { unidade: 'KG', unidadeCompra: 'SC', fatorConversao: 25, fatorSituacao: 'INFORMAR' } }, USER);
    expect(c.db.sanCaso[0].proposta.fatorSituacao).toBe('INFORMADO');
    await c.casos.aprovar(semFator.id, { versao: 2 }, USER);
    expect(c.db.sanItem.find((i) => i.id === ids.A1)!.trabalho.campos).toMatchObject({ fatorConversao: 25 });
    // caso AGUARDANDO nunca se aprova
    await c.casos.registrarResultado(projetoId, res('TRIBUTARIO', [caso('TRIBUTARIO', 'AGUARDANDO_NCM', [ids.S1], {}, { cClassTrib: '000001' })]));
    const ag = c.db.sanCaso.find((x) => x.tipo === 'AGUARDANDO_NCM')!;
    expect(ag.situacao).toBe('AGUARDANDO_INFORMACAO');
    expect(await codigo(c.casos.aprovar(ag.id, { versao: 1 }, USER))).toBe('FALTA_INFORMACAO');
  });

  it('afeta é recalculado pela proposta ao aprovar; reabrir marca as dependências como revisar', async () => {
    const c = montar();
    const { projetoId, ids } = await pronto(c);
    await c.casos.registrarResultado(projetoId, res('NCM', [caso('NCM', 'NCM_FORMATO', [ids.A1], { ncm: '31010000' }, { ncm: '31051000' }, { afeta: [] })]));
    c.db.sanCelula.filter((x) => x.item_id === ids.A1 && ['TRIBUTARIO', 'OBRIGACOES'].includes(x.camada)).forEach((x) => { x.situacao = 'SEM_PROBLEMA'; });
    await c.casos.aprovar(c.db.sanCaso[0].id, { versao: 1 }, USER);
    expect(c.db.sanCaso[0].afeta).toEqual(['TRIBUTARIO', 'OBRIGACOES']);
    c.db.sanCelula.forEach((x) => { x.revisar = false; });
    await c.casos.reabrir(c.db.sanCaso[0].id, { versao: 2 }, USER);
    expect(c.db.sanCelula.filter((x) => x.item_id === ids.A1 && x.revisar).map((x) => x.camada).sort()).toEqual(['OBRIGACOES', 'TRIBUTARIO']);
  });

  it('vínculo de código antigo usado por dois casos: desfazer um não apaga o do outro', async () => {
    const c = montar();
    const { projetoId, ids } = await pronto(c);
    const dup = (tipo: string) => caso('DUPLICIDADE', tipo, [ids.A1, ids.A2], {}, { decisao: 'PROPOR_CONSOLIDACAO', manter: 'A1', consolidar: 'A2' });
    await c.casos.registrarResultado(projetoId, res('DUPLICIDADE', [dup('DUPLICIDADE_EXATA'), dup('DUPLICIDADE_PARECIDA')]));
    const [a, b] = c.db.sanCaso;
    await c.casos.aprovar(a.id, { versao: 1 }, USER);
    await c.casos.aprovar(b.id, { versao: 1 }, USER);
    expect(c.db.sanVinculoCodigo).toHaveLength(1);
    await c.casos.reabrir(a.id, { versao: 2 }, USER);
    expect(c.db.sanVinculoCodigo).toHaveLength(1);
    await c.casos.reabrir(b.id, { versao: 2 }, USER);
    expect(c.db.sanVinculoCodigo).toHaveLength(0);
  });

  it('CODIGO_ANTIGO aprovado grava o vínculo antigo → atual; duplicidade com saldo fica fora do lote e a prévia mostra os vínculos', async () => {
    const c = montar();
    const { projetoId, ids } = await pronto(c);
    await c.casos.registrarResultado(projetoId, res('IDENTIFICACAO', [caso('IDENTIFICACAO', 'CODIGO_ANTIGO', [ids.S1], { codigo: 'S1', codigoAntigo: 'OLD-9' }, {})]));
    await c.casos.registrarResultado(projetoId, res('DUPLICIDADE', [
      caso('DUPLICIDADE', 'DUPLICIDADE_COM_SALDO', [ids.A1, ids.A2], {}, { decisao: 'PROPOR_CONSOLIDACAO', manter: 'A1', consolidar: 'A2' }),
      caso('DUPLICIDADE', 'DUPLICIDADE_EXATA', [ids.A1, ids.S1], {}, { decisao: 'PROPOR_CONSOLIDACAO', manter: 'A1', consolidar: 'S1' }),
    ]));
    const pr = await c.casos.lotePrevia(projetoId, { filtro: { camada: 'DUPLICIDADE' } });
    expect(pr.excecoes.map((e) => e.motivo)[0]).toContain('saldo');
    expect(pr.aprovaveis).toHaveLength(1);
    expect(pr.aprovaveis[0].vinculos).toEqual([{ de: 'S1', para: 'A1' }]);
    await c.casos.aprovar(c.db.sanCaso.find((x) => x.tipo === 'CODIGO_ANTIGO')!.id, { versao: 1 }, USER);
    expect(c.db.sanVinculoCodigo.map((v) => [v.de, v.para])).toEqual([['OLD-9', 'S1']]);
  });
});

describe('M4/M6/M7/M8: lote com orçamento, parecer, obsoleto e data-base', () => {
  it('o lote devolve os casos que não couberam no orçamento de tempo', async () => {
    const c = montar();
    const { projetoId, ids } = await pronto(c);
    await c.casos.registrarResultado(projetoId, res('NCM', [caso('NCM', 'A', [ids.A1], { ncm: '31010000' }, { ncm: '31051000' }), caso('NCM', 'B', [ids.A2], { ncm: '31010000' }, { ncm: '31051000' })]));
    const p = await c.casos.lotePrevia(projetoId, { filtro: { camada: 'NCM' } });
    const versoes = Object.fromEntries(p.aprovaveis.map((a) => [a.casoId, a.versao]));
    // O relógio anda 1 s a cada consulta: com orçamento de 1 ms nada cabe (orçamento negativo agora é 400).
    let agora = Date.now();
    const relogio = vi.spyOn(Date, 'now').mockImplementation(() => (agora += 1000));
    const r = await c.casos.loteAprovar(projetoId, { filtro: { camada: 'NCM' }, versoes, orcamentoMs: 1 }, USER);
    relogio.mockRestore();
    expect(r).toMatchObject({ aprovados: 0 });
    expect(r.restantes).toHaveLength(2);
    const r2 = await c.casos.loteAprovar(projetoId, { filtro: { camada: 'NCM' }, versoes }, USER);
    expect(r2).toMatchObject({ aprovados: 2, restantes: [] });
  });

  it('o parecer da IA só grava em caso aberto e sobe a versão', async () => {
    const c = montar();
    const { projetoId, ids } = await pronto(c);
    await c.casos.registrarResultado(projetoId, res('NCM', [caso('NCM', 'A', [ids.A1], { ncm: '31010000' }, { ncm: '31051000' })]));
    const id = c.db.sanCaso[0].id;
    const parecer = { recomendacao: 'ok', confianca: 'alta', aFavor: [], contra: [], oQueConfirmar: [], fontes: [], praticaDeMercado: null, geradoEm: 'x' } as never;
    expect(await c.casos.definirParecerIa(id, parecer)).toEqual({ gravado: true });
    expect(c.db.sanCaso[0].versao).toBe(2);
    await c.casos.aprovar(id, { versao: 2 }, USER);
    const r = await c.casos.definirParecerIa(id, parecer);
    expect(r.gravado).toBe(false);
    expect(r.motivo).toContain('APROVADO');
    expect(await status(c.casos.definirParecerIa('nao-existe', parecer))).toBe(404);
  });

  it('reexecutar a camada: caso aberto que a análise não produz mais vira OBSOLETO (célula coerente, fora do lote); volta se for produzido de novo', async () => {
    let saida: (ids: string[]) => ResultadoCamada = () => res('NCM', []) as never;
    const c = montar({ analisadores: [{ camada: 'NCM', analisar: (itens) => saida(itens.map((i) => i.id)) }] });
    const { projetoId } = await pronto(c);
    saida = (ids) => res('NCM', [caso('NCM', 'A', [ids[0]], { ncm: '31010000' }, { ncm: '31051000' }), caso('NCM', 'B', [ids[1]], { ncm: '31010000' }, { ncm: '31051000' })]) as never;
    await c.orq.executarCamada(projetoId, 'NCM');
    // a exceção manual e o caso editado não ficam obsoletos
    await c.casos.salvarRascunho(c.db.sanCaso.find((x) => x.tipo === 'B')!.id, { versao: 1, justificativa: 'editei' }, USER);
    saida = (ids) => res('NCM', [], { semProblema: [ids[0]] }) as never;
    const r = await c.orq.executarCamada(projetoId, 'NCM');
    expect(r.casosObsoletos).toBe(1);
    const a = c.db.sanCaso.find((x) => x.tipo === 'A')!;
    expect(a.situacao).toBe('OBSOLETO');
    expect(c.db.sanCaso.find((x) => x.tipo === 'B')!.situacao).toBe('RASCUNHO');
    expect((await c.casos.lotePrevia(projetoId, { filtro: { camada: 'NCM' } })).aprovaveis.map((x) => x.tipo)).toEqual(['B']);
    expect(await codigo(c.casos.aprovar(a.id, { versao: a.versao }, USER))).toBe('CASO_OBSOLETO');
    // a lista "em aberto" não mostra o obsoleto
    expect((await c.casos.listar(projetoId, { situacao: 'PROPOSTO,RASCUNHO' })).casos.map((x) => x.tipo)).toEqual(['B']);
    saida = (ids) => res('NCM', [caso('NCM', 'A', [ids[0]], { ncm: '31010000' }, { ncm: '31051000' })]) as never;
    await c.orq.executarCamada(projetoId, 'NCM');
    expect(c.db.sanCaso.find((x) => x.tipo === 'A')!.situacao).toBe('PROPOSTO');
  });

  it('a data-base vem do projeto de consultoria (fonte única)', async () => {
    const c = montar();
    const { projetoId } = await pronto(c);
    c.db.projetoDiagnostico[0].periodo_inicio = new Date('2027-03-31T00:00:00Z');
    expect(await c.projetos.dataBase(projetoId)).toBe('2027-03-31');
    expect((await c.projetos.obter(projetoId)).data_base.toISOString().slice(0, 10)).toBe('2027-03-31');
  });
});

describe('projeto: atividades, parâmetros e módulos', () => {
  it('atividade manual só da lista fechada ou CNAE de 7 dígitos; mapa de atividades; confirmar atualiza a versão do CNPJ', async () => {
    const c = montar();
    const p = await c.projetos.criar('D1', USER);
    expect(await status(c.projetos.adicionarAtividade(p.id, { codigo: 'MANUAL1', descricao: 'x' }))).toBe(400);
    await c.projetos.adicionarAtividade(p.id, { codigo: '4681-8/01', descricao: 'Atacado' }).catch(() => null);
    await c.projetos.adicionarAtividade(p.id, { codigo: 'ARMAZENAGEM', descricao: 'Armazém' });
    c.db.empresa[0].dados_publicos_em = new Date('2026-11-01T00:00:00Z');
    expect((await c.projetos.obter(p.id)).cnpjDesatualizado).toBe(true);
    await c.projetos.confirmarAtividades(p.id, 1, USER);
    const o = await c.projetos.obter(p.id);
    expect(o.cnpjDesatualizado).toBe(false);
    expect(o.mapaAtividades.mapeadas.some((x) => x.atividade === 'ARMAZENAGEM')).toBe(true);
    expect(o.mapaAtividades.mapeadas.length + o.mapaAtividades.semMapeamento.length).toBeGreaterThanOrEqual(2);
  });

  it('configurar mescla os parâmetros (não apaga o motor) e ligar a conciliação cria as células de ESTOQUE', async () => {
    const c = montar();
    const { projetoId } = await pronto(c);
    await c.projetos.configurar(projetoId, { versao: c.db.sanProjeto[0].versao, parametros: { corteMovimentacao: '2025-01-01', motor: { exigeEstabelecimento: true } } });
    await c.projetos.configurar(projetoId, { versao: c.db.sanProjeto[0].versao, parametros: { corteMovimentacao: '2025-06-01' } });
    expect(c.db.sanProjeto[0].parametros).toEqual({ corteMovimentacao: '2025-06-01', competenciaEntregue: null, motor: { exigeEstabelecimento: true } });
    expect(c.db.sanCelula.some((x) => x.camada === 'ESTOQUE')).toBe(false);
    await c.projetos.configurar(projetoId, { versao: c.db.sanProjeto[0].versao, modulos: { conciliacao: true } });
    expect(c.db.sanCelula.filter((x) => x.camada === 'ESTOQUE')).toHaveLength(3);
  });

  it('parâmetros de consulta em formato errado viram 400', async () => {
    const c = montar();
    const { projetoId } = await pronto(c);
    expect(await status(c.itens.listar(projetoId, { camada: ['NCM', 'QUALIDADE'] as never }))).toBe(400);
    expect(await status(c.itens.listar(projetoId, { limite: 'abc' }))).toBe(400);
    expect(await status(c.casos.listar(projetoId, { situacao: { x: 1 } as never }))).toBe(400);
    expect(await status(c.casos.listar(projetoId, { limite: '1.5' }))).toBe(400);
  });
});

describe('reimportação: P2002 vira 409', () => {
  it('abrir o mesmo projeto duas vezes na corrida devolve 409 claro', async () => {
    const c = montar();
    const { prisma } = c;
    const original = (prisma as never as { sanProjeto: { create: unknown } }).sanProjeto.create;
    (prisma as never as { sanProjeto: { create: unknown } }).sanProjeto.create = async () => { throw Object.assign(new Error('x'), { code: 'P2002' }); };
    expect(await status(c.projetos.criar('D1', USER))).toBe(409);
    (prisma as never as { sanProjeto: { create: unknown } }).sanProjeto.create = original;
  });
});

describe('tributário: exceção aprovada, enquadramento conferido e validação da exceção manual', () => {
  const classe = (cClassTrib: string, cst: string, reducao: number) => ({ cClassTrib, cst, descricao: `Classe ${cClassTrib}`, pctReducaoIbs: reducao, pctReducaoCbs: reducao, vigenciaInicio: '2026-01-01', vigenciaFim: null, ativa: true, fonte: 'fixture' });
  const catalogos = () => criarCatalogos({
    correlacao: [{ ncm: '38089329', c_class_trib: '200100', anexo: 'IX', item_lei: 7, descricao_produto: 'Herbicidas (fixture)' }],
    classes: [classe('000001', '000', 0), classe('200100', '200', 0.6), classe('200200', '200', 1)],
    ncms: null, dispositivos: [{ norma: 'lcp-214-2025', caminho: 'art-47' }],
  });

  it('o item que já tem a classe certa ganha um caso de enquadramento conferido (aprovado pelo sistema) e a exceção aprovada não é reproposta', async () => {
    const cat = catalogos();
    const c = montar({ motorReal: true, catalogos: cat });
    const itens = [
      item('H1', { ncm: '38089329', finalidade: 'REVENDA', campos: { cClassTrib: '200100' } }, 1),
      item('H2', { ncm: '38089329', finalidade: 'REVENDA', campos: { cClassTrib: '200100' } }, 2),
      item('H3', { ncm: '38089329', finalidade: 'REVENDA', campos: {} }, 3),
    ];
    const { projetoId, ids } = await pronto(c, itens);
    await c.orq.executarCamada(projetoId, 'TRIBUTARIO');
    const conf = c.db.sanCaso.find((x) => x.tipo === 'ENQUADRAMENTO_CONFERIDO')!;
    expect(conf).toMatchObject({ situacao: 'APROVADO', itens: [ids.H1, ids.H2] });
    expect(conf.proposta).toMatchObject({ cClassTrib: '200100', cst: '200' });
    expect(c.db.sanCelula.find((x) => x.item_id === ids.H1 && x.camada === 'TRIBUTARIO')!.situacao).toBe('SEM_PROBLEMA');
    expect(c.db.sanImpactoSped.some((i) => i.caso_id === conf.id)).toBe(false); // conferir não é ajuste
    // exceção manual do H3, aprovada: grava cClassTrib/CST no item e a reexecução não a repropõe nem a joga de volta no conjunto
    await c.casos.registrarResultado(projetoId, res('TRIBUTARIO', [caso('TRIBUTARIO', 'EXCECAO_MANUAL', [ids.H3], { cClassTrib: null }, { cClassTrib: '200200', cst: '200', origem: 'EXCECAO' }, { justificativa: 'Produto de uso exclusivo' })]));
    const ex = c.db.sanCaso.find((x) => x.tipo === 'EXCECAO_MANUAL')!;
    await c.casos.aprovar(ex.id, { versao: 1 }, USER);
    expect(c.db.sanItem.find((i) => i.id === ids.H3)!.trabalho.campos).toMatchObject({ cClassTrib: '200200', cst: '200' });
    await c.orq.executarCamada(projetoId, 'TRIBUTARIO');
    expect(c.db.sanCaso.filter((x) => x.camada === 'TRIBUTARIO' && x.situacao === 'PROPOSTO')).toHaveLength(0);
    expect(c.db.sanCelula.find((x) => x.item_id === ids.H3 && x.camada === 'TRIBUTARIO')!.situacao).toBe('APROVADO');
  });

  it('exceção manual: motivo de ao menos 5 caracteres, classe existente e vigente, CST coerente', async () => {
    const c = montar({ catalogos: catalogos() });
    const { projetoId, ids } = await pronto(c);
    const exc = (p: Record<string, unknown>, extra: Record<string, unknown> = {}) => c.casos.registrarResultado(projetoId, res('TRIBUTARIO', [caso('TRIBUTARIO', 'EXCECAO_MANUAL', [ids.A1], {}, p, extra)]));
    expect(await codigo(exc({ cClassTrib: '200100' }, { justificativa: 'ok' }))).toBe('MOTIVO_CURTO');
    expect(await codigo(exc({ cClassTrib: '999999' }))).toBe('CLASSE_INVALIDA');
    expect(await codigo(exc({ cClassTrib: '200100', cst: '000' }))).toBe('CST_INCOERENTE');
    expect(await status(exc({ cClassTrib: '200100', cst: '200', origem: 'EXCECAO' }))).toBe(200);
  });

  it('reexecução inteira: o "aguardando" que o motor criou e não produz mais vira OBSOLETO (sem duplicar AGUARDANDO_NCM); o aguardando por pedido do consultor fica', async () => {
    const cat = catalogos();
    const c = montar({ motorReal: true, catalogos: cat });
    const itens = [
      item('H1', { ncm: '38089329', grupo: 'Herbicidas' }, 1), item('H2', { ncm: '38089329', grupo: 'Herbicidas' }, 2),
      item('N1', { ncm: null, grupo: 'Herbicidas' }, 3), item('N2', { ncm: null, grupo: 'Embalagens' }, 4),
      item('P1', { ncm: '31010000', grupo: 'Embalagens' }, 5),
    ];
    const { projetoId, ids } = await pronto(c, itens);
    await c.orq.executarCamada(projetoId, 'TRIBUTARIO');
    const trib = () => c.db.sanCaso.filter((x) => x.camada === 'TRIBUTARIO');
    const finH = trib().find((x) => x.tipo === 'AGUARDANDO_FINALIDADE' && x.itens.includes(ids.H1))!;
    const finP = trib().find((x) => x.tipo === 'AGUARDANDO_FINALIDADE' && x.itens.includes(ids.P1))!;
    const ncmAntigo = trib().find((x) => x.tipo === 'AGUARDANDO_NCM')!;
    expect([finH.situacao, finP.situacao, ncmAntigo.situacao]).toEqual(['AGUARDANDO_INFORMACAO', 'AGUARDANDO_INFORMACAO', 'AGUARDANDO_INFORMACAO']);
    expect([...ncmAntigo.itens].sort()).toEqual([ids.N1, ids.N2].sort());
    // O consultor reabre o aguardando do P1 e pede uma informação: esse não fica obsoleto.
    const reaberto = await c.casos.reabrir(finP.id, { versao: finP.versao }, USER);
    await c.casos.pedirInformacao(finP.id, { versao: reaberto!.versao, motivo: 'Pedir ao cliente a ficha técnica do P1' });
    // Finalidades aprovadas (Herbicidas = revenda, Embalagens = embalagem).
    const porGrupo: Record<string, { itens: string[]; finalidade: string }> = { Herbicidas: { itens: [ids.H1, ids.H2, ids.N1], finalidade: 'REVENDA' }, Embalagens: { itens: [ids.N2, ids.P1], finalidade: 'EMBALAGEM' } };
    await c.casos.registrarResultado(projetoId, res('GRUPOS_FINALIDADE', Object.values(porGrupo).map((g) => caso('GRUPOS_FINALIDADE', 'FINALIDADE_GRUPO', g.itens, { finalidade: null }, { finalidade: g.finalidade }))));
    for (const f of c.db.sanCaso.filter((x) => x.tipo === 'FINALIDADE_GRUPO')) await c.casos.aprovar(f.id, { versao: f.versao }, USER);
    expect(c.db.sanItem.every((i) => (i.trabalho as { finalidade?: string }).finalidade)).toBe(true);

    const r = await c.orq.executarCamada(projetoId, 'TRIBUTARIO');
    expect(r.casosObsoletos).toBe(2);
    expect(trib().find((x) => x.id === finH.id)!.situacao).toBe('OBSOLETO');
    expect(trib().find((x) => x.id === ncmAntigo.id)!.situacao).toBe('OBSOLETO');
    expect(trib().find((x) => x.id === finP.id)).toMatchObject({ situacao: 'AGUARDANDO_INFORMACAO', motivo: 'Pedir ao cliente a ficha técnica do P1' });
    // Só os AGUARDANDO_NCM novos (um por finalidade) estão vivos, sem sobrepor itens.
    const ncmVivos = trib().filter((x) => x.tipo === 'AGUARDANDO_NCM' && x.situacao !== 'OBSOLETO');
    expect(ncmVivos.map((x) => x.itens).flat().sort()).toEqual([ids.N1, ids.N2].sort());
    expect(ncmVivos).toHaveLength(2);
    expect(trib().filter((x) => x.tipo === 'AGUARDANDO_FINALIDADE' && x.situacao !== 'OBSOLETO').map((x) => x.id)).toEqual([finP.id]);
    // As células não apontam mais para os casos obsoletos.
    const celulas = c.db.sanCelula.filter((x) => x.camada === 'TRIBUTARIO');
    expect(celulas.some((x) => x.caso_id === finH.id || x.caso_id === ncmAntigo.id)).toBe(false);
    expect(celulas.find((x) => x.item_id === ids.H1)!.situacao).not.toBe('AGUARDANDO_INFORMACAO');
  });

  it('reexecução inteira: o "aguardando" do motor com decisão registrada ou em escopo de regra não vira obsoleto', async () => {
    let saida: (ids: string[]) => ResultadoCamada = () => res('NCM', []) as never;
    const c = montar({ analisadores: [{ camada: 'NCM', analisar: (itens) => saida(itens.map((i) => i.id)) }] });
    const { projetoId, ids } = await pronto(c);
    await c.casos.registrarResultado(projetoId, res('NCM', [caso('NCM', 'AGUARDANDO_NCM', [ids.A1], {}, {}), caso('NCM', 'AGUARDANDO_NCM', [ids.A2], {}, {})]));
    const [a1, a2] = ['A1', 'A2'].map((k) => c.db.sanCaso.find((x) => x.itens.includes(ids[k]))!);
    c.db.sanDecisao.push({ id: 'd1', projeto_id: projetoId, item_id: ids.A1, caso_id: a1.id, campo: 'caso:AGUARDANDO_NCM', antes: null, depois: null, fundamento: 'nota', usuario: 'x', tipo: 'nota', quando: new Date() } as never);
    // reanálise de escopo (Diretrizes) não mexe no aguardando
    await c.casos.registrarResultado(projetoId, res('NCM', []), { completo: true, escopo: new Set([ids.A2]) });
    expect(a2.situacao).toBe('AGUARDANDO_INFORMACAO');
    saida = () => res('NCM', []) as never;
    const r = await c.orq.executarCamada(projetoId, 'NCM');
    expect(r.casosObsoletos).toBe(1);
    expect([a1.situacao, a2.situacao]).toEqual(['AGUARDANDO_INFORMACAO', 'OBSOLETO']);
  });
});
