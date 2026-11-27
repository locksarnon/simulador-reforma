/**
 * Achados da revisão do backend do Saneamento: trava da Fase 2 nas decisões (tela, lote e planilha), Configuração sem sobrescrever
 * `parametros` gravados ao mesmo tempo, uma análise por projeto de cada vez, a análise em segundo plano só com contagens (e fora da memória
 * depois de 30 min) e o agrupamento de casos reaproveitado entre páginas.
 */
import { describe, expect, it } from 'vitest';
import type { AnalisadorCamada, ResultadoCamada } from '../tipos';
import { SanDiretrizesService } from '../diretrizes/diretrizes.service';
import { SanCasosService } from './casos.service';
import { SanImportacaoService } from './importacao.service';
import { RETER_EXECUCAO_MS, SanOrquestracaoService } from './orquestracao.service';
import { SanPlanilhaDecisaoService } from './planilha-decisao.service';
import { motorDeAnalisadores, type ImportadorPort, type ItemImportado } from './portas';
import { criarPrismaFalso, liberarFase2 } from './prisma-falso';
import { SanProjetoService, gravarChavesDosParametros } from './projeto.service';
import { SanVersoesService } from './versoes.service';

const USER = { email: 'consultor@fal.test' };
const ARQ = { buffer: Buffer.from('x'), nome: 'cadastro.xlsx' };
const item = (codigo: string, linha: number, grupo = 'Adubos'): ItemImportado => ({
  codigo, estabelecimento: null, descricao: `Produto ${codigo}`, unidade: 'UN', ncm: '31010000', grupo, ativo: true, saldo: null,
  ultimaMovimentacao: null, fabricante: null, referencia: null, finalidade: null, campos: {}, linha,
});
const codigoErro = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return ((e as { response?: { codigo?: string } }).response?.codigo) ?? (e as Error).message; } };

async function montar(analisadores: AnalisadorCamada[] = []) {
  const { prisma, db } = criarPrismaFalso({
    projetoDiagnostico: [{ id: 'D1', servico_consultoria: 'saneamento-estoques', empresa_ids: ['E1'], periodo_inicio: new Date('2026-12-31T00:00:00Z') }],
    empresa: [{ id: 'E1', razao_social: 'Cliente Teste', erp: 'SAP B1', cnae_principal: '4683400', cnae_descricao: 'Defensivos', cnaes_secundarios: [], dados_publicos_em: new Date('2026-10-01T00:00:00Z') }],
  });
  const itens = [item('A1', 1), item('A2', 2), item('A3', 3, 'Sementes')];
  const importador: ImportadorPort = { ler: async () => ({ itens, mapeamento: {}, relatorio: { aceitas: itens.length, rejeitadas: 0, pendentes: 0, linhasRejeitadas: [], linhasPendentes: [] } }) };
  const projetos = new SanProjetoService(prisma as never);
  const casos = new SanCasosService(prisma as never, projetos);
  const orq = new SanOrquestracaoService(prisma as never, projetos, casos, motorDeAnalisadores(analisadores));
  const versoes = new SanVersoesService(prisma as never);
  const planilha = new SanPlanilhaDecisaoService(prisma as never, projetos, casos);
  const diretrizes = new SanDiretrizesService(prisma as never, orq, versoes);
  const p = await projetos.criar('D1', USER);
  await projetos.confirmarAtividades(p.id, 1, USER);
  await new SanImportacaoService(prisma as never, projetos, importador).confirmar(p.id, ARQ, undefined, [], USER);
  const id = Object.fromEntries(db.sanItem.map((i) => [i.codigo, i.id])) as Record<string, string>;
  return { prisma, db, projetos, casos, orq, versoes, planilha, diretrizes, pid: p.id, id };
}
const caso = (camada: ResultadoCamada['camada'], tipo: string, itens: string[], proposta: Record<string, unknown>) => ({
  camada, tipo, itens, problema: `Problema ${tipo}`, evidencia: [], atual: {}, proposta, justificativa: 'j', fundamento: null, impactos: [], origem: 'REGRA' as const, afeta: [],
});
const resultado = (camada: ResultadoCamada['camada'], casos: ReturnType<typeof caso>[]): ResultadoCamada => ({ camada, analisados: 3, semDados: null, semProblema: [], casos });

describe('trava da Fase 2 nas decisões', () => {
  it('aprovar, rejeitar, pedir informação, rascunho, lotes e planilha recusam caso da Fase 2 travada; ler continua livre', async () => {
    const c = await montar();
    liberarFase2(c.db, c.pid);
    await c.casos.registrarResultado(c.pid, resultado('FINALIDADE', [caso('FINALIDADE', 'FINALIDADE_GRUPO', [c.id.A1], { finalidade: 'REVENDA' })]));
    await c.casos.registrarResultado(c.pid, resultado('NCM', [caso('NCM', 'NCM_FORMATO', [c.id.A2], { ncm: '31051000' })]));
    // A Fase 1 deixa de estar liberada (ex.: projeto restaurado): a Fase 2 volta a travar.
    c.db.sanVersao.length = 0;
    const fin = c.db.sanCaso.find((x) => x.camada === 'FINALIDADE')!;
    const ncm = c.db.sanCaso.find((x) => x.camada === 'NCM')!;
    const trava = 'FASE1_NAO_LIBERADA';
    expect(await codigoErro(c.casos.aprovar(fin.id, { versao: fin.versao }, USER))).toBe(trava);
    expect(await codigoErro(c.casos.rejeitar(fin.id, { versao: fin.versao, justificativa: 'não serve' }, USER))).toBe(trava);
    expect(await codigoErro(c.casos.pedirInformacao(fin.id, { versao: fin.versao, motivo: 'falta a nota' }))).toBe(trava);
    expect(await codigoErro(c.casos.salvarRascunho(fin.id, { versao: fin.versao, justificativa: 'rascunho' }, USER))).toBe(trava);
    // Lote com um caso travado: o lote inteiro é recusado (o caso da Fase 1 também fica como estava).
    const versoes = { [fin.id]: fin.versao, [ncm.id]: ncm.versao };
    expect(await codigoErro(c.casos.loteAprovar(c.pid, { ids: [fin.id, ncm.id], versoes }, USER))).toBe(trava);
    expect(await codigoErro(c.casos.loteDecidir(c.pid, 'rejeitar', { ids: [fin.id, ncm.id], versoes, texto: 'não serve' }, USER))).toBe(trava);
    expect(await codigoErro(c.casos.loteDecidir(c.pid, 'pedir', { ids: [fin.id, ncm.id], versoes, texto: 'falta' }, USER))).toBe(trava);
    expect(c.db.sanCaso.map((x) => x.situacao)).toEqual(['PROPOSTO', 'PROPOSTO']);
    // Planilha de decisão: baixar e aplicar recusam; a camada da Fase 1 segue livre.
    expect(await codigoErro(c.planilha.baixar(c.pid, 'FINALIDADE'))).toBe(trava);
    expect(await codigoErro(c.planilha.aplicar(c.pid, 'FINALIDADE', { buffer: Buffer.from('x'), nome: 'p.xlsx' }, USER, { confirmar: true }))).toBe(trava);
    expect(await codigoErro(c.planilha.baixar(c.pid, 'NCM'))).toBeNull();
    // Ler é livre: lista, agrupados e detalhe.
    expect((await c.casos.listar(c.pid, { camada: 'FINALIDADE' })).casos).toHaveLength(1);
    expect((await c.casos.agrupados(c.pid, { camada: 'FINALIDADE' })).totalCasos).toBe(1);
    expect((await c.casos.obter(fin.id)).id).toBe(fin.id);
    // O caso da Fase 1 decide normalmente, e com a fase liberada de novo o da Fase 2 também.
    expect((await c.casos.aprovar(ncm.id, { versao: ncm.versao }, USER)).jaAplicado).toBe(false);
    liberarFase2(c.db, c.pid);
    expect((await c.casos.pedirInformacao(fin.id, { versao: fin.versao, motivo: 'falta a nota' }))!.situacao).toBe('AGUARDANDO_INFORMACAO');
  });
});

describe('Configuração grava só as chaves dela em parametros', () => {
  it('uma gravação concorrente (datas das análises, marca "Executado no ERP") entre a leitura e a escrita não se perde', async () => {
    const c = await montar();
    c.db.sanProjeto[0].parametros = { execucoes: { NCM: '2026-11-01T00:00:00.000Z' }, motor: { x: 1 } };
    const original = c.prisma.$transaction;
    let uma = true;
    c.prisma.$transaction = async (fn: never, ...r: unknown[]) => {
      // Outra rotina grava no meio (depois que a Configuração já leu os parâmetros).
      if (uma) { uma = false; const p = c.db.sanProjeto[0]; p.parametros = { ...p.parametros, execucoes: { ...p.parametros.execucoes, QUALIDADE: '2026-11-02T00:00:00.000Z' }, acoesExecutadas: { k: { em: 'x', por: 'y' } } }; }
      return original(fn, ...r);
    };
    await c.projetos.configurar(c.pid, { versao: c.db.sanProjeto[0].versao, parametros: { corteMovimentacao: '2025-01-01', motor: null }, regimeCliente: 'REGULAR' });
    expect(c.db.sanProjeto[0].parametros).toEqual({
      execucoes: { NCM: '2026-11-01T00:00:00.000Z', QUALIDADE: '2026-11-02T00:00:00.000Z' }, acoesExecutadas: { k: { em: 'x', por: 'y' } },
      corteMovimentacao: '2025-01-01', competenciaEntregue: null, regimeCliente: 'REGULAR',
    });
    // Tirar o regime apaga só a chave dele.
    await c.projetos.configurar(c.pid, { versao: c.db.sanProjeto[0].versao, regimeCliente: null });
    expect(c.db.sanProjeto[0].parametros).not.toHaveProperty('regimeCliente');
    expect(c.db.sanProjeto[0].parametros.execucoes).toHaveProperty('QUALIDADE');
  });

  it('no Postgres, uma instrução só: jsonb || com as chaves e - com as removidas (sem regravar o objeto)', async () => {
    const chamadas: { sql: string; valores: unknown[] }[] = [];
    const tx = { sanProjeto: {} as never, $executeRaw: async (partes: TemplateStringsArray, ...valores: unknown[]) => { chamadas.push({ sql: partes.join('?'), valores }); return 1; } };
    await gravarChavesDosParametros(tx, 'P1', { corteMovimentacao: '2025-01-01' }, ['motor']);
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].sql).toContain('COALESCE("parametros", \'{}\'::jsonb) || ?::jsonb) - ?::text[]');
    expect(chamadas[0].valores).toEqual([JSON.stringify({ corteMovimentacao: '2025-01-01' }), ['motor'], 'P1']);
  });
});

describe('uma análise por projeto de cada vez', () => {
  const vazio = (camada: string): ResultadoCamada => ({ camada: camada as never, analisados: 3, semDados: null, semProblema: [], casos: [] });
  it('com a análise em segundo plano rodando, a camada avulsa, a reanálise das Diretrizes e outra análise são recusadas (409)', async () => {
    let soltar!: () => void;
    const segura = new Promise<void>((ok) => { soltar = ok; });
    const c = await montar([{ camada: 'QUALIDADE', analisar: () => vazio('QUALIDADE') }, { camada: 'NCM', analisar: () => vazio('NCM') }]);
    const original = c.orq.executarCamada.bind(c.orq);
    c.orq.executarCamada = (async (...a: Parameters<typeof original>) => { await segura; return original(...a); }) as typeof original;
    await c.orq.iniciarExecucao(c.pid, ['QUALIDADE']);
    c.orq.executarCamada = original;
    expect(await codigoErro(c.orq.executarCamada(c.pid, 'NCM'))).toBe('ANALISE_EM_ANDAMENTO');
    expect(await codigoErro(c.diretrizes.aplicarVarias(c.pid, { regras: [] }, USER))).toBe('ANALISE_EM_ANDAMENTO');
    soltar();
    for (let n = 0; n < 400 && c.orq.execucao(c.pid)?.rodando; n++) await new Promise((ok) => setTimeout(ok, 5));
    expect(await codigoErro(c.orq.executarCamada(c.pid, 'NCM'))).toBeNull();
  });

  it('com uma análise síncrona em curso, a análise em segundo plano e outra camada avulsa são recusadas; terminada, liberam', async () => {
    const c = await montar([{ camada: 'NCM', analisar: () => vazio('NCM') }]);
    let soltar!: () => void;
    const emCurso = c.orq.comTravaDeAnalise(c.pid, () => new Promise<void>((ok) => { soltar = ok; }));
    expect(c.orq.analiseRodando(c.pid)).toBe(true);
    expect(await codigoErro(c.orq.iniciarExecucao(c.pid, ['NCM']))).toBe('ANALISE_EM_ANDAMENTO');
    expect(await codigoErro(c.orq.executarCamada(c.pid, 'NCM'))).toBe('ANALISE_EM_ANDAMENTO');
    soltar(); await emCurso;
    expect(c.orq.analiseRodando(c.pid)).toBe(false);
    expect(await codigoErro(c.orq.executarCamada(c.pid, 'NCM'))).toBeNull();
    // Falha dentro da trava também libera o projeto.
    await expect(c.orq.comTravaDeAnalise(c.pid, async () => { throw new Error('falhou'); })).rejects.toThrow('falhou');
    expect(c.orq.analiseRodando(c.pid)).toBe(false);
  });

  it('a análise em segundo plano guarda só contagens e sai da memória 30 min depois de terminar', async () => {
    let n = 0;
    const c = await montar([{ camada: 'NCM', analisar: () => resultado('NCM', [caso('NCM', 'NCM_FORMATO', [c.id.A1], { ncm: n++ ? '31052000' : '31051000' })]) }]);
    await c.orq.executarCamada(c.pid, 'NCM'); // caso gravado; a segunda análise o renova (casosAtualizados)
    await c.orq.iniciarExecucao(c.pid, ['NCM']);
    for (let i = 0; i < 400 && c.orq.execucao(c.pid)?.rodando; i++) await new Promise((ok) => setTimeout(ok, 5));
    const ex = c.orq.execucao(c.pid)!;
    expect(ex.erro).toBeNull();
    expect(typeof ex.feitas[0].casosAtualizados).toBe('number');
    expect(JSON.stringify(ex.feitas)).not.toContain(c.id.A1); // nenhuma linha de caso (com itens) fica guardada
    ex.terminadaEm = new Date(Date.now() - RETER_EXECUCAO_MS - 1000).toISOString();
    expect(c.orq.execucao(c.pid)).toBeNull();
  });
});

describe('casos agrupados: o agrupamento é reaproveitado enquanto nada muda', () => {
  it('a segunda página e o detalhe não releem os casos; decidir um caso refaz o agrupamento', async () => {
    const c = await montar();
    await c.casos.registrarResultado(c.pid, resultado('NCM', [
      caso('NCM', 'NCM_FORMATO', [c.id.A1], { ncm: '31051000' }), caso('NCM', 'NCM_FORMATO', [c.id.A2], { ncm: '31051000' }), caso('NCM', 'NCM_FORMATO', [c.id.A3], { ncm: '31059000' }),
    ]));
    let leituras = 0;
    const findMany = c.prisma.sanCaso.findMany;
    c.prisma.sanCaso.findMany = async (a: { select?: { problema?: boolean } }) => { if (a?.select?.problema && !('versao' in (a.select as object))) leituras++; return findMany(a); };
    const p1 = await c.casos.agrupados(c.pid, { camada: 'NCM', limite: 1 });
    expect(p1.totalGrupos).toBe(2);
    expect(leituras).toBe(1);
    const p2 = await c.casos.agrupados(c.pid, { camada: 'NCM', limite: 1, cursor: p1.proximo });
    expect(p2.grupos[0].chave).not.toBe(p1.grupos[0].chave);
    const detalhe = await c.casos.agrupados(c.pid, { camada: 'NCM', chave: p1.grupos[0].chave });
    expect(detalhe.grupo.todosIds).toHaveLength(2);
    expect(leituras).toBe(1);
    // Outro filtro: outro agrupamento.
    await c.casos.agrupados(c.pid, { camada: 'NCM', grupo: 'Sementes' });
    expect(leituras).toBe(2);
    // Decidir um caso muda a marca: o agrupamento é refeito e mostra a situação nova.
    const um = c.db.sanCaso.find((x) => x.itens[0] === c.id.A1)!;
    await c.casos.aprovar(um.id, { versao: um.versao }, USER);
    const depois = await c.casos.agrupados(c.pid, { camada: 'NCM' });
    expect(leituras).toBe(3);
    expect(depois.grupos.find((g) => g.chave === p1.grupos[0].chave)!.situacoes).toEqual({ APROVADO: 1, PROPOSTO: 1 });
  });
});
