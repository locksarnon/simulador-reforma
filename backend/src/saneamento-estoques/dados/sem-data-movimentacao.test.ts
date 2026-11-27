/**
 * Tratamento para itens sem data de última movimentação: escolha obrigatória em toda importação (400 sem ela), gravada no projeto e no
 * relatório da importação, lida pela Qualidade ("Considerar sem movimentação" × "Deixar para tratar depois"), editável na Configuração
 * (desatualiza Qualidade e Duplicidades) e mostrada em "O que foi considerado" e na política.
 */
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { criteriosParaPolitica } from '../criterios/politica';
import { SanCriteriosService } from '../criterios/criterios.service';
import { AnalisadorQualidade } from '../motor/qualidade';
import type { ContextoMotor } from '../motor/contexto';
import { chavesDaEscolhaSemData, textoTratamentoSemData } from '../sem-data-movimentacao';
import type { ItemTrabalho } from '../tipos';
import { SanCasosService } from './casos.service';
import { SanImportacaoService, contarSemData, exigirTratamentoSemData } from './importacao.service';
import { SanOrquestracaoService, parametrosDoMotor } from './orquestracao.service';
import { motorDeAnalisadores, type ImportadorPort, type ItemImportado } from './portas';
import { criarPrismaFalso } from './prisma-falso';
import { SanProjetoService } from './projeto.service';
import { SaneamentoEstoquesController } from './saneamento-estoques.controller';

const USER = { email: 'consultor@fal.test' };
const ARQ = { buffer: Buffer.from('x'), nome: 'cadastro.xlsx' };
const item = (codigo: string, extra: Partial<ItemImportado> = {}, linha = 1): ItemImportado => ({
  codigo, estabelecimento: null, descricao: `PARAFUSO SEXTAVADO ${codigo} MM`, unidade: 'UN', ncm: '73181500', grupo: 'Ferragens', ativo: true, saldo: null,
  ultimaMovimentacao: null, fabricante: null, referencia: null, finalidade: null, campos: {}, linha, ...extra,
});
// A: sem data e sem saldo; B: sem data e com saldo; C: movimentou depois do corte (a base tem data).
const BASE = [item('A', {}, 1), item('B', { saldo: 5 }, 2), item('C', { ultimaMovimentacao: '2026-10-01' }, 3)];

async function montar() {
  const { prisma, db } = criarPrismaFalso({
    projetoDiagnostico: [{ id: 'D1', servico_consultoria: 'saneamento-estoques', empresa_ids: ['E1'], periodo_inicio: new Date('2026-12-31T00:00:00Z') }],
    empresa: [{ id: 'E1', erp: 'SAP', cnae_principal: '4683400', cnae_descricao: 'Defensivos', cnaes_secundarios: [], dados_publicos_em: new Date('2026-10-01T00:00:00Z') }],
  });
  const fila: { itens: ItemImportado[] } = { itens: BASE };
  const importador: ImportadorPort = {
    ler: async (e) => ({ itens: fila.itens, mapeamento: { codigo: 'Cod', descricao: 'Desc', ...(e.mapeamento ?? { ultimaMovimentacao: 'Data Última Movimentação' }) }, relatorio: { aceitas: fila.itens.length, rejeitadas: 0, pendentes: 0, linhasRejeitadas: [], linhasPendentes: [] } }),
  };
  const projetos = new SanProjetoService(prisma as never);
  const casos = new SanCasosService(prisma as never, projetos);
  const importacao = new SanImportacaoService(prisma as never, projetos, importador);
  const orq = new SanOrquestracaoService(prisma as never, projetos, casos, motorDeAnalisadores([new AnalisadorQualidade()]));
  const p = await projetos.criar('D1', USER);
  return { prisma, db, fila, projetos, importacao, orq, projetoId: p.id };
}
type Ctx = Awaited<ReturnType<typeof montar>>;
const parametros = (c: Ctx) => c.db.sanProjeto.find((x: { id: string }) => x.id === c.projetoId)!.parametros as Record<string, unknown>;
async function configurar(c: Ctx, par: Record<string, unknown>) {
  const p = await c.projetos.obter(c.projetoId);
  return c.projetos.configurar(c.projetoId, { versao: p.versao, parametros: par as never }, USER);
}
const casosQualidade = (c: Ctx) => c.db.sanCaso.filter((x: { camada: string; situacao: string }) => x.camada === 'QUALIDADE' && x.situacao === 'PROPOSTO') as { tipo: string; itens: string[]; evidencia: { rotulo: string; valor: unknown }[] }[];
const idDe = (c: Ctx, codigo: string) => c.db.sanItem.find((i: { codigo: string }) => i.codigo === codigo)!.id as string;

describe('importação: tratamento dos itens sem data é obrigatório', () => {
  it('a API responde 400 sem a escolha ou com valor inválido, antes de ler o arquivo; com ela, repassa ao serviço', async () => {
    const confirmar = vi.fn(async () => ({ ok: true }));
    const ctrl = new SaneamentoEstoquesController({} as never, { confirmar } as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    const f = { buffer: Buffer.from('x'), originalname: 'a.xlsx' } as Express.Multer.File;
    expect(() => ctrl.importar({ email: 'a@b.c' } as never, 'p1', f, undefined, undefined, undefined, undefined)).toThrow(BadRequestException);
    expect(() => ctrl.importar({ email: 'a@b.c' } as never, 'p1', f, undefined, undefined, undefined, '')).toThrow(/Considerar sem movimentação ou Deixar para tratar depois/);
    try { ctrl.importar({ email: 'a@b.c' } as never, 'p1', f, undefined, undefined, undefined, 'TALVEZ'); } catch (e) { expect((e as BadRequestException).getStatus()).toBe(400); }
    expect(confirmar).not.toHaveBeenCalled();
    await ctrl.importar({ email: 'a@b.c' } as never, 'p1', f, undefined, undefined, undefined, 'DEPOIS');
    expect(confirmar).toHaveBeenCalledWith('p1', expect.anything(), undefined, [], expect.anything(), undefined, 'DEPOIS');
  });

  it('exigirTratamentoSemData e contarSemData', () => {
    expect(exigirTratamentoSemData(' SEM_MOVIMENTACAO ')).toBe('SEM_MOVIMENTACAO');
    expect(() => exigirTratamentoSemData(null)).toThrow(BadRequestException);
    expect(contarSemData([{ ultimaMovimentacao: null }, { ultimaMovimentacao: ' ' }, { ultimaMovimentacao: '2026-01-01' }, {}])).toBe(3);
  });

  it('prévia: quantos itens estão sem data, se a coluna foi mapeada e a escolha atual do projeto (sem pré-selecionar)', async () => {
    const c = await montar();
    const r = await c.importacao.previa(c.projetoId, ARQ);
    expect(r.semDataMovimentacao).toEqual({ itens: 2, colunaMapeada: true, tratamentoAtual: null });
    const semColuna = await c.importacao.previa(c.projetoId, ARQ, { codigo: 'Cod' });
    expect(semColuna.semDataMovimentacao.colunaMapeada).toBe(false);
  });

  it('confirmar grava a escolha no projeto (quem, quando, origem) e no relatório da importação', async () => {
    const c = await montar();
    const r = await c.importacao.confirmar(c.projetoId, ARQ, undefined, [], USER, undefined, 'SEM_MOVIMENTACAO');
    expect(r.semDataMovimentacao).toMatchObject({ tratamento: 'SEM_MOVIMENTACAO', rotulo: 'Considerar sem movimentação', itens: 2, por: USER.email, alterouAnalise: true });
    const par = parametros(c);
    expect(par.semDataMovimentacao).toBe('SEM_MOVIMENTACAO');
    expect(par.semDataMovimentacaoDecisao).toMatchObject({ tratamento: 'SEM_MOVIMENTACAO', por: USER.email, origem: 'IMPORTACAO', arquivo: 'cadastro.xlsx' });
    expect((c.db.sanImportacao[0].relatorio as { semDataMovimentacao: { tratamento: string } }).semDataMovimentacao.tratamento).toBe('SEM_MOVIMENTACAO');
    await expect(c.importacao.confirmar(c.projetoId, ARQ, undefined, [], USER, undefined, 'X')).rejects.toThrow(BadRequestException);
    // A prévia seguinte lembra a escolha atual do projeto.
    expect((await c.importacao.previa(c.projetoId, ARQ)).semDataMovimentacao.tratamentoAtual).toBe('SEM_MOVIMENTACAO');
  });

  it('reimportar com a mesma escolha mantém a decisão original (quem e quando)', async () => {
    const c = await montar();
    await c.importacao.confirmar(c.projetoId, ARQ, undefined, [], USER, undefined, 'DEPOIS');
    const antes = parametros(c).semDataMovimentacaoDecisao;
    expect(parametros(c).semDataMovimentacaoAlteradaEm).toBeUndefined(); // "depois" é o comportamento de sempre: nada muda na análise
    await c.importacao.confirmar(c.projetoId, ARQ, undefined, [], { email: 'outro@fal.test' }, undefined, 'DEPOIS');
    expect(parametros(c).semDataMovimentacaoDecisao).toEqual(antes);
  });
});

describe('Qualidade: os dois tratamentos, com e sem saldo', () => {
  it('"Considerar sem movimentação": sem saldo propõe inativar; com saldo pede regularizar; evidência diz quem decidiu', async () => {
    const c = await montar();
    await configurar(c, { corteMovimentacao: '2026-01-01' });
    await c.importacao.confirmar(c.projetoId, ARQ, undefined, [], USER, undefined, 'SEM_MOVIMENTACAO');
    await c.orq.executarCamada(c.projetoId, 'QUALIDADE');
    const cs = casosQualidade(c);
    expect(cs.map((x) => x.tipo)).not.toContain('SEM_DATA_MOVIMENTACAO');
    const inativar = cs.find((x) => x.tipo === 'SEM_MOVIMENTACAO')!;
    expect(inativar.itens).toEqual([idDe(c, 'A')]);
    const regularizar = cs.find((x) => x.tipo === 'SEM_MOVIMENTACAO_COM_SALDO')!;
    expect(regularizar.itens).toEqual([idDe(c, 'B')]);
    const ev = inativar.evidencia.find((e) => e.rotulo === 'Sem data de movimentação')!;
    expect(String(ev.valor)).toContain('sem data de movimentação na base; tratado como sem movimentação por decisão na importação, por consultor@fal.test, em ');
    expect(inativar.evidencia.find((e) => e.rotulo === 'Última movimentação')!.valor).toBe('sem data');
    expect(cs.some((x) => x.itens.includes(idDe(c, 'C')))).toBe(false); // movimentou depois do corte
  });

  it('"Deixar para tratar depois": caso "sem data" à parte, fora do corte, e a Cobertura diz que ficou pendente', async () => {
    const c = await montar();
    await configurar(c, { corteMovimentacao: '2026-01-01' });
    await c.importacao.confirmar(c.projetoId, ARQ, undefined, [], USER, undefined, 'DEPOIS');
    const r = await c.orq.executarCamada(c.projetoId, 'QUALIDADE');
    const cs = casosQualidade(c);
    expect(cs.filter((x) => x.tipo === 'SEM_DATA_MOVIMENTACAO').flatMap((x) => x.itens).sort()).toEqual([idDe(c, 'A'), idDe(c, 'B')].sort());
    expect(cs.map((x) => x.tipo)).not.toContain('SEM_MOVIMENTACAO');
    expect(cs.map((x) => x.tipo)).not.toContain('SEM_MOVIMENTACAO_COM_SALDO');
    expect(String(cs.find((x) => x.tipo === 'SEM_DATA_MOVIMENTACAO')!.evidencia.find((e) => e.rotulo === 'Tratamento dos itens sem data')!.valor)).toContain('Deixar para tratar depois: pendente');
    expect(JSON.stringify(r)).toContain('deixados para tratar depois (pendentes)');
  });

  it('motor puro: sem corte, o item sem data considerado parado entra no aviso de corte não definido; item inativo fica fora', () => {
    const it = (id: string, extra: Partial<ItemTrabalho> = {}) => ({ ...item(id), id, ...extra }) as ItemTrabalho;
    const itens = [it('a'), it('b', { ativo: false }), it('c', { ultimaMovimentacao: '2026-10-01' })];
    const semCorte = new AnalisadorQualidade().analisar(itens, { dataBase: '2026-12-31', atividades: [], erp: null, corteMovimentacao: null, parametros: { semDataMovimentacao: 'SEM_MOVIMENTACAO' } } as unknown as ContextoMotor);
    expect(semCorte.semDados?.motivo).toContain('com data ou considerados sem movimentação');
    const comCorte = new AnalisadorQualidade().analisar(itens, { dataBase: '2026-12-31', atividades: [], erp: null, corteMovimentacao: '2026-01-01', parametros: { semDataMovimentacao: 'SEM_MOVIMENTACAO' } } as unknown as ContextoMotor);
    expect(comCorte.casos.find((x) => x.tipo === 'SEM_MOVIMENTACAO')!.itens).toEqual(['a']);
  });

  it('parametrosDoMotor: a escolha do projeto vale sobre a de parametros.motor (DEPOIS = SINALIZAR)', () => {
    expect(parametrosDoMotor({ semDataMovimentacao: 'SEM_MOVIMENTACAO', motor: { semDataMovimentacao: 'ANTERIOR_AO_CORTE' } }).parametros).toMatchObject({ semDataMovimentacao: 'SEM_MOVIMENTACAO' });
    expect(parametrosDoMotor({ semDataMovimentacao: 'DEPOIS' }).parametros).toMatchObject({ semDataMovimentacao: 'SINALIZAR' });
    expect(parametrosDoMotor({})).toEqual({});
  });
});

describe('Configuração: mudar a escolha desatualiza Qualidade e Duplicidades', () => {
  it('troca em 1.1 Dados do projeto: grava quem e onde, marca as camadas desatualizadas; a mesma escolha não marca', async () => {
    const c = await montar();
    await configurar(c, { corteMovimentacao: '2026-01-01' });
    await c.importacao.confirmar(c.projetoId, ARQ, undefined, [], USER, undefined, 'DEPOIS');
    await c.orq.executarCamada(c.projetoId, 'QUALIDADE');
    await new Promise((r) => setTimeout(r, 5));
    await configurar(c, { ...parametros(c), semDataMovimentacao: 'DEPOIS' }); // a tela devolve os parâmetros inteiros
    expect((await c.orq.estadoDasCamadas(c.projetoId)).camadas.find((x) => x.camada === 'QUALIDADE')!.desatualizada).toBeNull();
    await configurar(c, { semDataMovimentacao: 'SEM_MOVIMENTACAO' });
    expect(parametros(c).semDataMovimentacaoDecisao).toMatchObject({ tratamento: 'SEM_MOVIMENTACAO', origem: 'CONFIGURACAO', por: USER.email });
    const q = (await c.orq.estadoDasCamadas(c.projetoId)).camadas.find((x) => x.camada === 'QUALIDADE')!;
    expect(q.desatualizada).toMatchObject({ criterio: true });
    await expect(configurar(c, { semDataMovimentacao: 'NUNCA' })).rejects.toThrow(BadRequestException);
    await expect(configurar(c, { semDataMovimentacao: null })).rejects.toThrow(BadRequestException);
    // Analisar de novo tira o aviso.
    await new Promise((r) => setTimeout(r, 5));
    await c.orq.executarCamada(c.projetoId, 'QUALIDADE');
    expect((await c.orq.estadoDasCamadas(c.projetoId)).camadas.find((x) => x.camada === 'QUALIDADE')!.desatualizada).toBeNull();
  });

  it('chavesDaEscolhaSemData: primeira escolha "depois" não muda a análise; troca marca a data', () => {
    const d = { por: 'a', em: '2026-11-27T10:00:00.000Z', origem: 'IMPORTACAO' as const };
    expect(chavesDaEscolhaSemData({}, 'DEPOIS', d)).not.toHaveProperty('semDataMovimentacaoAlteradaEm');
    expect(chavesDaEscolhaSemData({}, 'SEM_MOVIMENTACAO', d)).toHaveProperty('semDataMovimentacaoAlteradaEm', d.em);
  });
});

describe('O que foi considerado e política: como os itens sem data foram tratados', () => {
  it('critério da Qualidade com o texto da escolha (quem e quando) e a política diz o mesmo', async () => {
    const c = await montar();
    await c.importacao.confirmar(c.projetoId, ARQ, undefined, [], USER, undefined, 'SEM_MOVIMENTACAO');
    const lista = await new SanCriteriosService(c.prisma as never).listar(c.projetoId);
    const crit = lista.camadas.find((x) => x.camada === 'QUALIDADE')!.criterios.find((x) => x.id === 'q-sem-data')!;
    expect(crit).toMatchObject({ origem: 'CONFIGURACAO', valorConfiguracao: 'SEM_MOVIMENTACAO' });
    expect((crit as { textoConfiguracao?: string }).textoConfiguracao).toContain('considerados sem movimentação desde o corte (escolha na importação, por consultor@fal.test');
    const pol = criteriosParaPolitica(parametros(c), ['QUALIDADE']);
    expect(pol[0].itens.map((i) => i.texto).join(' | ')).toContain('Itens sem data de última movimentação (escolha feita na importação): considerados sem movimentação');
    expect(textoTratamentoSemData({ semDataMovimentacao: 'DEPOIS' })).toContain('deixados para tratar depois');
    expect(textoTratamentoSemData({})).toContain('não escolhido');
  });
});
