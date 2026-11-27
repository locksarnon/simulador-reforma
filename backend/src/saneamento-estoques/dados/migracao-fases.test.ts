/** Migração da divisão em fases (boot): casos de finalidade e de reclassificação de NCM mudam de camada, células novas e datas de análise. */
import { describe, expect, it } from 'vitest';
import { SanItensService } from './itens.service';
import { chaveCaso } from './constantes';
import { SanMigracaoFasesService, casoDaCelula } from './migracao-fases';
import { criarPrismaFalso } from './prisma-falso';

const ANTIGAS = ['IDENTIFICACAO', 'QUALIDADE', 'DUPLICIDADE', 'GRUPOS_FINALIDADE', 'NOMES_UNIDADES', 'NCM', 'TRIBUTARIO', 'OBRIGACOES'];
const d = (s: string) => new Date(s);

/** Projeto salvo antes da divisão: 3 itens, só as 8 camadas antigas, casos de finalidade em GRUPOS_FINALIDADE e de reclassificação em NCM. */
function antigo() {
  const itens = ['i1', 'i2', 'i3'].map((id) => ({ id, projeto_id: 'P1', codigo: id.toUpperCase(), estabelecimento: '', grupo: 'Adubos', trabalho: {}, versao: 1 }));
  const celulas: Record<string, unknown>[] = [];
  for (const i of itens) for (const camada of ANTIGAS) celulas.push({ id: `c-${i.id}-${camada}`, projeto_id: 'P1', item_id: i.id, camada, grupo: 'Adubos', situacao: 'SEM_PROBLEMA', revisar: false, revisar_causa: null, caso_id: null });
  const cel = (item: string, camada: string) => celulas.find((c) => c.item_id === item && c.camada === camada)!;
  const casos = [
    // grupo: i1 está num caso de grupo E num de finalidade (a célula antiga aponta para o de finalidade, gravado depois)
    { id: 'k-grupo', camada: 'GRUPOS_FINALIDADE', tipo: 'ITEM_DESLOCADO', itens: ['i1'], situacao: 'PROPOSTO', createdAt: d('2026-11-01T10:00:00Z') },
    { id: 'k-fin', camada: 'GRUPOS_FINALIDADE', tipo: 'FINALIDADE_GRUPO', itens: ['i1', 'i2'], situacao: 'APROVADO', createdAt: d('2026-11-01T11:00:00Z') },
    { id: 'k-exc', camada: 'GRUPOS_FINALIDADE', tipo: 'FINALIDADE_EXCECAO', itens: ['i3'], situacao: 'PROPOSTO', createdAt: d('2026-11-01T11:00:00Z') },
    { id: 'k-ncm', camada: 'NCM', tipo: 'NCM_FORMATO', itens: ['i2'], situacao: 'PROPOSTO', createdAt: d('2026-11-01T10:00:00Z') },
    { id: 'k-info', camada: 'NCM', tipo: 'NCM_INFO_INSUFICIENTE', itens: ['i2', 'i3'], situacao: 'AGUARDANDO_INFORMACAO', createdAt: d('2026-11-01T12:00:00Z') },
  ].map((c) => ({ projeto_id: 'P1', chave: chaveCaso(c.camada, c.tipo, c.itens), problema: 'p', justificativa: 'j', origem: 'REGRA', versao: 1, proposta: {}, ...c }));
  Object.assign(cel('i1', 'GRUPOS_FINALIDADE'), { situacao: 'APROVADO', caso_id: 'k-fin', revisar: true, revisar_causa: 'Revisar: NCM mudou' });
  Object.assign(cel('i2', 'GRUPOS_FINALIDADE'), { situacao: 'APROVADO', caso_id: 'k-fin' });
  Object.assign(cel('i3', 'GRUPOS_FINALIDADE'), { situacao: 'PROPOSTO', caso_id: 'k-exc' });
  Object.assign(cel('i2', 'NCM'), { situacao: 'AGUARDANDO_INFORMACAO', caso_id: 'k-info' });
  Object.assign(cel('i3', 'NCM'), { situacao: 'AGUARDANDO_INFORMACAO', caso_id: 'k-info' });
  const { prisma, db } = criarPrismaFalso({
    sanProjeto: [{ id: 'P1', diagnostico_id: 'D1', modulos: {}, parametros: { corteMovimentacao: null, execucoes: { GRUPOS_FINALIDADE: '2026-11-01T11:00:00.000Z', NCM: '2026-11-01T12:00:00.000Z', TRIBUTARIO: '2026-11-02T00:00:00.000Z' } } }],
    sanItem: itens, sanCelula: celulas as never, sanCaso: casos as never,
    sanDecisao: [{ id: 'dec1', projeto_id: 'P1', item_id: 'i1', caso_id: 'k-fin', campo: 'finalidade', antes: null, depois: 'REVENDA', usuario: 'x', tipo: 'aprovar', quando: d('2026-11-01T12:00:00Z') }],
    sanImpactoSped: [{ id: 'imp1', projeto_id: 'P1', caso_id: 'k-fin', motivo: 'x' }],
  });
  return { prisma, db, cel: (item: string, camada: string) => db.sanCelula.find((c) => c.item_id === item && c.camada === camada)! };
}

describe('migração da divisão em fases', () => {
  it('move os casos (id fica, chave recalculada), passa o estado das células e devolve a célula antiga ao caso que sobrou', async () => {
    const { prisma, db, cel } = antigo();
    const r = await new SanMigracaoFasesService(prisma as never).migrar();
    expect(r).toMatchObject({ projetos: 1, migrados: 1, casosMovidos: 3, celulasCriadas: 6, execucoesCopiadas: 2 });
    const caso = (id: string) => db.sanCaso.find((c) => c.id === id)!;
    expect([caso('k-fin').camada, caso('k-exc').camada, caso('k-info').camada]).toEqual(['FINALIDADE', 'FINALIDADE', 'NCM_CLASSIFICACAO']);
    expect([caso('k-grupo').camada, caso('k-ncm').camada]).toEqual(['GRUPOS_FINALIDADE', 'NCM']);
    expect(caso('k-fin').chave).toBe(chaveCaso('FINALIDADE', 'FINALIDADE_GRUPO', ['i1', 'i2']));
    expect(caso('k-info').chave).toBe(chaveCaso('NCM_CLASSIFICACAO', 'NCM_INFO_INSUFICIENTE', ['i2', 'i3']));
    // Decisões e linhas de impacto apontam para o id do caso, que não mudou.
    expect(db.sanDecisao[0].caso_id).toBe('k-fin'); expect(db.sanImpactoSped[0].caso_id).toBe('k-fin');
    // Células novas: o estado que estava na antiga (com o "revisar").
    expect(cel('i1', 'FINALIDADE')).toMatchObject({ situacao: 'APROVADO', caso_id: 'k-fin', revisar: true, revisar_causa: 'Revisar: NCM mudou' });
    expect(cel('i3', 'FINALIDADE')).toMatchObject({ situacao: 'PROPOSTO', caso_id: 'k-exc' });
    expect(cel('i2', 'NCM_CLASSIFICACAO')).toMatchObject({ situacao: 'AGUARDANDO_INFORMACAO', caso_id: 'k-info' });
    // i1 não tinha caso de NCM: a análise antiga já dizia "sem problema" para as duas partes.
    expect(cel('i1', 'NCM_CLASSIFICACAO')).toMatchObject({ situacao: 'SEM_PROBLEMA', caso_id: null });
    // Células antigas: i1 volta ao caso de grupo vivo; i2 (sem outro caso, camada analisada) fica sem problema; i2 no NCM volta ao NCM_FORMATO.
    expect(cel('i1', 'GRUPOS_FINALIDADE')).toMatchObject({ situacao: 'PROPOSTO', caso_id: 'k-grupo', revisar: false });
    expect(cel('i2', 'GRUPOS_FINALIDADE')).toMatchObject({ situacao: 'SEM_PROBLEMA', caso_id: null });
    expect(cel('i2', 'NCM')).toMatchObject({ situacao: 'PROPOSTO', caso_id: 'k-ncm' });
    expect(cel('i3', 'NCM')).toMatchObject({ situacao: 'SEM_PROBLEMA', caso_id: null });
    // Datas de análise copiadas para as camadas novas, sem mexer no resto dos parâmetros.
    expect(db.sanProjeto[0].parametros.execucoes).toEqual({
      GRUPOS_FINALIDADE: '2026-11-01T11:00:00.000Z', NCM: '2026-11-01T12:00:00.000Z', TRIBUTARIO: '2026-11-02T00:00:00.000Z',
      FINALIDADE: '2026-11-01T11:00:00.000Z', NCM_CLASSIFICACAO: '2026-11-01T12:00:00.000Z',
    });
    expect(db.sanProjeto[0].parametros.corteMovimentacao).toBeNull();
    // Visão geral com as camadas novas.
    const v = await new SanItensService(prisma as never).visaoGeral('P1');
    expect(v.grupos[0].camadas.FINALIDADE).toMatchObject({ APROVADO: 2, PROPOSTO: 1 });
    expect(v.grupos[0].camadas.NCM_CLASSIFICACAO).toMatchObject({ AGUARDANDO_INFORMACAO: 2, SEM_PROBLEMA: 1 });
  });

  it('é idempotente: a segunda rodada não muda nada', async () => {
    const { prisma, db } = antigo();
    const m = new SanMigracaoFasesService(prisma as never);
    await m.migrar();
    const foto = JSON.stringify([db.sanCaso, db.sanCelula, db.sanProjeto]);
    expect(await m.migrar()).toEqual({ projetos: 1, migrados: 0, casosMovidos: 0, celulasCriadas: 0, execucoesCopiadas: 0 });
    expect(JSON.stringify([db.sanCaso, db.sanCelula, db.sanProjeto])).toBe(foto);
  });

  it('banco vazio, projeto sem itens e projeto já nascido com as camadas novas: nada a fazer', async () => {
    const vazio = criarPrismaFalso();
    expect(await new SanMigracaoFasesService(vazio.prisma as never).migrar()).toEqual({ projetos: 0, migrados: 0, casosMovidos: 0, celulasCriadas: 0, execucoesCopiadas: 0 });
    const novo = criarPrismaFalso({
      sanProjeto: [{ id: 'P0', diagnostico_id: 'D0', parametros: {} }, { id: 'P2', diagnostico_id: 'D2', parametros: { execucoes: { GRUPOS_FINALIDADE: '2026-11-27T00:00:00.000Z' } } }],
      sanItem: [{ id: 'n1', projeto_id: 'P2', codigo: 'N1', grupo: 'G' }],
      sanCelula: ['GRUPOS_FINALIDADE', 'FINALIDADE', 'NCM_CLASSIFICACAO'].map((camada) => ({ id: `x${camada}`, projeto_id: 'P2', item_id: 'n1', camada, grupo: 'G', situacao: camada === 'GRUPOS_FINALIDADE' ? 'SEM_PROBLEMA' : 'PENDENTE', revisar: false, caso_id: null })),
    });
    expect(await new SanMigracaoFasesService(novo.prisma as never).migrar()).toMatchObject({ projetos: 2, migrados: 0 });
    // Projeto aberto depois da divisão: a data da análise de Grupos não vira data da Finalidade, nem o "sem problema" dela.
    expect(novo.db.sanProjeto[1].parametros.execucoes).toEqual({ GRUPOS_FINALIDADE: '2026-11-27T00:00:00.000Z' });
    expect(novo.db.sanCelula.find((c) => c.camada === 'FINALIDADE')!.situacao).toBe('PENDENTE');
  });

  it('chave que já existe na camada nova (análise nova antes da migração) não colide', async () => {
    const { prisma, db } = antigo();
    db.sanCaso.push({ id: 'k-novo', projeto_id: 'P1', camada: 'FINALIDADE', tipo: 'FINALIDADE_GRUPO', itens: ['i1', 'i2'], chave: chaveCaso('FINALIDADE', 'FINALIDADE_GRUPO', ['i1', 'i2']), situacao: 'PROPOSTO', createdAt: d('2026-11-03T00:00:00Z') });
    await new SanMigracaoFasesService(prisma as never).migrar();
    const chaves = db.sanCaso.map((c) => c.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
    expect(db.sanCaso.find((c) => c.id === 'k-fin')!.camada).toBe('FINALIDADE');
  });

  it('colisão de chave: a célula da camada nova continua com o caso que já estava nela; a conferência de chave é uma consulta por lote', async () => {
    const { prisma, db, cel } = antigo();
    db.sanCaso.push({ id: 'k-novo', projeto_id: 'P1', camada: 'FINALIDADE', tipo: 'FINALIDADE_GRUPO', itens: ['i1', 'i2'], chave: chaveCaso('FINALIDADE', 'FINALIDADE_GRUPO', ['i1', 'i2']), situacao: 'PROPOSTO', createdAt: d('2026-11-03T00:00:00Z') });
    // A análise nova já rodou: as células das camadas novas existem e as de i1 e i2 em FINALIDADE apontam para o caso novo.
    for (const i of ['i1', 'i2', 'i3']) for (const camada of ['FINALIDADE', 'NCM_CLASSIFICACAO']) {
      const doNovo = camada === 'FINALIDADE' && i !== 'i3';
      db.sanCelula.push({ id: `n-${i}-${camada}`, projeto_id: 'P1', item_id: i, camada, grupo: 'Adubos', situacao: doNovo ? 'PROPOSTO' : 'PENDENTE', revisar: false, revisar_causa: null, caso_id: doNovo ? 'k-novo' : null });
    }
    let porChave = 0; let porUm = 0;
    const findMany = prisma.sanCaso.findMany; const findFirst = prisma.sanCaso.findFirst;
    prisma.sanCaso.findMany = async (a: { where?: { chave?: unknown } }) => { if (a?.where?.chave) porChave++; return findMany(a); };
    prisma.sanCaso.findFirst = async (a: unknown) => { porUm++; return findFirst(a); };
    await new SanMigracaoFasesService(prisma as never).migrar();
    expect(db.sanCaso.find((c) => c.id === 'k-fin')).toMatchObject({ camada: 'FINALIDADE', chave: `${chaveCaso('FINALIDADE', 'FINALIDADE_GRUPO', ['i1', 'i2'])}:k-fin` });
    expect(cel('i1', 'FINALIDADE')).toMatchObject({ situacao: 'PROPOSTO', caso_id: 'k-novo' });
    expect(cel('i2', 'FINALIDADE')).toMatchObject({ situacao: 'PROPOSTO', caso_id: 'k-novo' });
    // Sem colisão (k-exc, i3): o estado vai para a célula nova, como antes.
    expect(cel('i3', 'FINALIDADE')).toMatchObject({ situacao: 'PROPOSTO', caso_id: 'k-exc' });
    expect(porChave).toBe(2); // uma por camada nova (FINALIDADE e NCM_CLASSIFICACAO), não uma por caso
    expect(porUm).toBe(0);
  });

  it('as datas de análise copiadas entram em parametros.execucoes sem apagar o que outra rotina gravou no meio', async () => {
    const { prisma, db } = antigo();
    // Outra rotina grava em parametros no meio da migração do projeto (depois que ela já leu os parâmetros).
    const contar = prisma.sanItem.count;
    prisma.sanItem.count = async (a: unknown) => {
      const p = db.sanProjeto[0];
      p.parametros = { ...p.parametros, acoesExecutadas: { k: { em: 'x', por: 'y' } } };
      return contar(a);
    };
    await new SanMigracaoFasesService(prisma as never).migrar();
    expect(db.sanProjeto[0].parametros.acoesExecutadas).toEqual({ k: { em: 'x', por: 'y' } });
    expect(db.sanProjeto[0].parametros.execucoes).toMatchObject({ FINALIDADE: '2026-11-01T11:00:00.000Z', NCM_CLASSIFICACAO: '2026-11-01T12:00:00.000Z' });
  });

  it('casoDaCelula: exceção viva vale mais; depois, o mais recente', () => {
    const m = casoDaCelula([
      { id: 'a', tipo: 'FINALIDADE_GRUPO', itens: ['x', 'y'], situacao: 'PROPOSTO', createdAt: d('2026-01-03') },
      { id: 'b', tipo: 'FINALIDADE_EXCECAO', itens: ['x'], situacao: 'PROPOSTO', createdAt: d('2026-01-01') },
      { id: 'c', tipo: 'ITEM_DESLOCADO', itens: ['y'], situacao: 'PROPOSTO', createdAt: d('2026-01-02') },
    ]);
    expect([m.get('x')!.id, m.get('y')!.id]).toEqual(['b', 'a']);
  });
});
