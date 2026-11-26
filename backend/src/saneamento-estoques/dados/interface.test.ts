import { describe, expect, it } from 'vitest';
import { SanCasosService } from './casos.service';
import { SanImportacaoService } from './importacao.service';
import { ImportadorPlanilha } from './importador.provider';
import { SanItensService } from './itens.service';
import { criarPrismaFalso } from './prisma-falso';
import { SanProjetoService } from './projeto.service';

const USER = { email: 'consultor@fal.test' };
const CSV = ['Código;Descrição;Unidade;NCM;Grupo', 'A1;ADUBO NPK;SC;31051000;Adubos', 'A2;ADUBO UREIA;SC;31021000;Adubos', 'S1;SEMENTE SOJA;SC;12019000;Sementes'].join('\n');

async function pronto() {
  const { prisma, db } = criarPrismaFalso({
    projetoDiagnostico: [{ id: 'D1', servico_consultoria: 'saneamento-estoques', empresa_ids: ['E1'], periodo_inicio: new Date('2026-12-31T00:00:00Z') }],
    empresa: [{ id: 'E1', cnae_principal: '4683400', cnaes_secundarios: [] }],
  });
  const projetos = new SanProjetoService(prisma as never);
  const casos = new SanCasosService(prisma as never, projetos);
  const importacao = new SanImportacaoService(prisma as never, projetos, new ImportadorPlanilha());
  const itens = new SanItensService(prisma as never);
  const p = await projetos.criar('D1', USER);
  await projetos.confirmarAtividades(p.id, 1, USER);
  const arquivo = { buffer: Buffer.from(CSV), nome: 'cad.csv' };
  await importacao.confirmar(p.id, arquivo, undefined, [], USER);
  const id = (cod: string) => db.sanItem.find((i) => i.codigo === cod)!.id;
  return { db, casos, itens, importacao, projetoId: p.id, arquivo, id };
}
const caso = (tipo: string, itens: string[], proposta: Record<string, unknown>, camada = 'TRIBUTARIO') => ({
  camada, tipo, itens, problema: 'p', evidencia: [], atual: {}, proposta, justificativa: 'motivo da exceção', fundamento: null, impactos: [], origem: 'REGRA' as const, afeta: [],
});
const res = (camada: string, casos: ReturnType<typeof caso>[]) => ({ camada: camada as never, analisados: 1, semDados: null, semProblema: [], casos: casos as never });
const status = async (p: Promise<unknown>) => { try { await p; return 200; } catch (e) { return (e as { getStatus?: () => number }).getStatus?.() ?? 500; } };

describe('prévia da importação para a tela de mapeamento', () => {
  it('devolve colunas, sugestão por coluna e as linhas normalizadas, junto de mapeamento, relatório e comparação', async () => {
    const c = await pronto();
    const p = await c.importacao.previa(c.projetoId, c.arquivo);
    expect(p.colunas.map((x) => x.nome)).toEqual(['Código', 'Descrição', 'Unidade', 'NCM', 'Grupo']);
    expect(p.colunas[1]).toEqual({ indice: 1, nome: 'Descrição' });
    const cod = p.sugestao.colunas.find((x) => x.campo === 'codigo')!;
    expect(cod).toMatchObject({ indice: 0, nome: 'Código' });
    expect(['ALTA', 'MEDIA']).toContain(cod.certeza);
    expect(cod.motivo).toBeTruthy();
    expect(p.amostra).toHaveLength(3);
    expect(p.amostra[0]).toMatchObject({ linhaOrigem: 2, situacao: 'ACEITA', item: { codigo: 'A1' } });
    expect(p.mapeamento.codigo).toBe('Código');
    expect(p.relatorio.aceitas).toBe(3);
    expect(p).toMatchObject({ novos: 0, inalterados: 3, alterados: 0 });
  });
});

describe('GET itens: enquadramento e origem', () => {
  it('traz o enquadramento do conjunto (herdado) e a exceção do item; exceção ganha do conjunto', async () => {
    const c = await pronto();
    const a1 = c.id('A1'); const a2 = c.id('A2');
    await c.casos.registrarResultado(c.projetoId, res('TRIBUTARIO', [caso('ENQUADRAMENTO_CONJUNTO', [a1, a2], { cClassTrib: '200100', cst: '200', enquadramentoLegal: 'Redução de 60%', artigo: 'art. 138', origem: 'HERDADO' })]));
    await c.casos.registrarResultado(c.projetoId, res('TRIBUTARIO', [caso('EXCECAO_MANUAL', [a1], { cClassTrib: '000001', cst: '000', origem: 'EXCECAO' })]));
    const l = await c.itens.listar(c.projetoId, { limite: 10 });
    const por = Object.fromEntries(l.itens.map((i) => [i.codigo, i.enquadramento]));
    expect(por.A2).toMatchObject({ cClassTrib: '200100', enquadramentoLegal: 'Redução de 60%', artigo: 'art. 138', origem: 'HERDADO', situacao: 'PROPOSTO' });
    expect(por.A1).toMatchObject({ cClassTrib: '000001', origem: 'EXCECAO' });
    expect(por.S1).toBeNull();
  });
});

describe('GET casos: filtro por grupo e várias situações', () => {
  it('filtra pelos casos dos itens do grupo e aceita lista de situações separada por vírgula', async () => {
    const c = await pronto();
    await c.casos.registrarResultado(c.projetoId, res('NCM', [caso('A', [c.id('A1')], { ncm: '31051001' }, 'NCM'), caso('B', [c.id('S1')], { ncm: '12019001' }, 'NCM'), caso('C', [c.id('A2')], { ncm: '31021001' }, 'NCM')]));
    const b = c.db.sanCaso.find((x) => x.tipo === 'B')!;
    await c.casos.rejeitar(b.id, { versao: 1, justificativa: 'mantém' }, USER);
    const c2 = c.db.sanCaso.find((x) => x.tipo === 'C')!;
    await c.casos.pedirInformacao(c2.id, { versao: 1, motivo: 'falta' });
    const tipos = async (f: Record<string, string>) => (await c.casos.listar(c.projetoId, f)).casos.map((x) => x.tipo).sort();
    expect(await tipos({ grupo: 'Adubos' })).toEqual(['A', 'C']);
    expect(await tipos({ grupo: 'Sementes' })).toEqual(['B']);
    expect(await tipos({ grupo: 'Adubos', situacao: 'PROPOSTO,RASCUNHO,AGUARDANDO_INFORMACAO' })).toEqual(['A', 'C']);
    expect(await tipos({ situacao: 'PROPOSTO,AGUARDANDO_INFORMACAO' })).toEqual(['A', 'C']);
    expect(await tipos({ situacao: 'REJEITADO' })).toEqual(['B']);
    expect(await tipos({ grupo: 'Inexistente' })).toEqual([]);
  });
});

describe('exceção manual repetida', () => {
  it('atualiza o caso aberto (proposta e justificativa), sobe a versão e devolve o caso atualizado', async () => {
    const c = await pronto();
    const a1 = c.id('A1');
    const r1 = await c.casos.registrarResultado(c.projetoId, res('TRIBUTARIO', [caso('EXCECAO_MANUAL', [a1], { cClassTrib: '200100' })]));
    expect(r1).toMatchObject({ casosNovos: 1, casosAtualizados: [] });
    const nova = { ...caso('EXCECAO_MANUAL', [a1], { cClassTrib: '200200' }), justificativa: 'novo motivo' };
    const r2 = await c.casos.registrarResultado(c.projetoId, res('TRIBUTARIO', [nova]));
    expect(r2).toMatchObject({ casosNovos: 0, casosJaExistentes: 0 });
    expect(r2.casosAtualizados).toHaveLength(1);
    expect(r2.casosAtualizados[0]).toMatchObject({ proposta: { cClassTrib: '200200' }, justificativa: 'novo motivo', versao: 2, situacao: 'PROPOSTO' });
    expect(c.db.sanCaso).toHaveLength(1);
  });

  it('com a versão informada vale o bloqueio otimista; caso já decidido não é alterado em silêncio', async () => {
    const c = await pronto();
    const a1 = c.id('A1');
    await c.casos.registrarResultado(c.projetoId, res('TRIBUTARIO', [caso('EXCECAO_MANUAL', [a1], { cClassTrib: '200100' })]));
    const velho = { ...caso('EXCECAO_MANUAL', [a1], { cClassTrib: '9' }), versao: 7 };
    expect(await status(c.casos.registrarResultado(c.projetoId, res('TRIBUTARIO', [velho as never])))).toBe(409);
    expect(c.db.sanCaso[0].proposta).toEqual({ cClassTrib: '200100' });
    const certo = { ...caso('EXCECAO_MANUAL', [a1], { cClassTrib: '8' }), versao: 1 };
    await c.casos.registrarResultado(c.projetoId, res('TRIBUTARIO', [certo as never]));
    expect(c.db.sanCaso[0].proposta).toEqual({ cClassTrib: '8' });
    await c.casos.aprovar(c.db.sanCaso[0].id, { versao: 2 }, USER);
    expect(await status(c.casos.registrarResultado(c.projetoId, res('TRIBUTARIO', [caso('EXCECAO_MANUAL', [a1], { cClassTrib: '5' })])))).toBe(409);
    expect(c.db.sanCaso[0].proposta).toEqual({ cClassTrib: '8' });
  });
});
