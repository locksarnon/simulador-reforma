/** Avaliação A9 e A12: data única (São Paulo, dd/mm/aaaa), nome do usuário no lugar do e-mail, nome da política e anexo/diferença das regras. */
import { describe, expect, it } from 'vitest';
import { SanDiretrizesController } from '../diretrizes/diretrizes.controller';
import { dadosBase } from './__fixtures__/dados';
import { dataBr, dataDoArquivo, dataExcel } from './formato';
import { REGRAS_CRESTANI, dadosCrestani } from './politica/__fixtures__/crestani';
import { diferencaDaPadrao, tabelasDoAnexo, topicosDaRegra } from './politica/topicos';
import { regraPadrao } from './politica/pdf';
import { comNomesDeUsuarios, nomeDe, politicaComNomesDeUsuarios } from './usuarios';

const prismaComUsuarios = (usuarios: { email: string; name: string | null }[]) => ({
  user: { findMany: async (a: { where: { email: { in: string[] } } }) => usuarios.filter((u) => a.where.email.in.includes(u.email.toLowerCase())) },
});

describe('data única dos entregáveis (São Paulo, dd/mm/aaaa)', () => {
  it('momento: relógio de São Paulo (23h50 de 26/11 é 26/11, nunca 27/11)', () => {
    expect(dataBr('2026-11-27T02:50:00Z')).toBe('26/11/2026');
    expect(dataBr(new Date('2026-11-27T02:50:00Z'), { hora: true })).toBe('26/11/2026 23:50');
    expect(dataDoArquivo(new Date('2026-11-27T02:50:00Z'))).toBe('26-11-2026');
  });
  it('data de calendário (data-base, vigência): o próprio dia, sem fuso nem hora', () => {
    expect(dataBr('2026-10-31')).toBe('31/10/2026');
    expect(dataBr(new Date('2026-10-31T00:00:00Z'), { hora: true })).toBe('31/10/2026');
    expect(dataExcel('2026-10-31')!.toISOString()).toBe('2026-10-31T00:00:00.000Z');
  });
  it('Excel recebe o relógio de São Paulo; vazio e inválido não quebram', () => {
    expect(dataExcel('2026-11-27T02:50:00Z')!.toISOString()).toBe('2026-11-26T23:50:00.000Z');
    expect(dataBr(null)).toBe('');
    expect(dataBr('não é data')).toBe('');
    expect(dataExcel(undefined)).toBeNull();
  });
});

describe('nome do usuário no lugar do e-mail', () => {
  it('troca onde o cadastro tem nome; sem nome, fica o e-mail', async () => {
    const prisma = prismaComUsuarios([{ email: 'ana@fal.test', name: 'Ana Souza' }, { email: 'bia@fal.test', name: null }]);
    const d = dadosBase(true);
    (d.decisoes[1] as Record<string, unknown>).usuario = 'bia@fal.test';
    const r = await comNomesDeUsuarios(prisma, d);
    expect(r.decisoes.map((x) => x.usuario)).toEqual(['Ana Souza', 'bia@fal.test']);
    expect(r.casos.find((c) => c.id === 'c-desc')!.decidido_por).toBe('Ana Souza');
    expect(r.projeto.atividades_confirmadas_por).toBe('Ana Souza');
    expect(r.vinculos[0].criado_por).toBe('Ana Souza');
    expect(r.importacoes[0].usuario).toBe('Ana Souza');
    // Os dados de entrada não mudam (cópia).
    expect(d.decisoes[0].usuario).toBe('ana@fal.test');
    expect(nomeDe(new Map(), 'sistema')).toBe('Sistema');
    // Sem a tabela de usuários (testes antigos), nada muda.
    expect(await comNomesDeUsuarios({}, d)).toBe(d);
  });
  it('política: aprovador e "Aprovada por" pelo nome', async () => {
    const d = dadosCrestani({ identificacao: { ...dadosCrestani().identificacao, aprovador: 'ana@fal.test, bia@fal.test' }, regras: REGRAS_CRESTANI.map((r) => ({ ...r, aprovadaPor: r.aprovadaPor ? 'ana@fal.test' : null })) });
    const r = await politicaComNomesDeUsuarios(prismaComUsuarios([{ email: 'ana@fal.test', name: 'Ana Souza' }]), d);
    expect(r.identificacao.aprovador).toBe('Ana Souza, bia@fal.test');
    expect(r.regras.filter((x) => x.aprovadaPor).every((x) => x.aprovadaPor === 'Ana Souza')).toBe(true);
  });
  it('rota da política: arquivo com cliente e versão; sem versão, a data de hoje', async () => {
    const fake = (versao: unknown) => ({ dadosPdfPolitica: async () => ({ ...dadosCrestani(), identificacao: { ...dadosCrestani().identificacao, versao } }) });
    const comVersao = await new SanDiretrizesController(fake({ numero: 2, rotulo: 'Onda 1', liberadaEm: '2026-11-24T12:00:00Z' }) as never, {} as never, prismaComUsuarios([]) as never).politicaPdf('P1', 'V2');
    expect(comVersao.getHeaders().disposition).toBe('attachment; filename="politica-estoques_agropecuaria-crestani-ltda_v2.pdf"');
    const sem = await new SanDiretrizesController(fake(null) as never, {} as never, prismaComUsuarios([]) as never).politicaPdf('P1');
    expect(sem.getHeaders().disposition).toMatch(/^attachment; filename="politica-estoques_agropecuaria-crestani-ltda_revisao_\d{2}-\d{2}-\d{4}\.pdf"$/);
  }, 60000);
});

describe('política: anexo único e regra só com o que difere da padrão', () => {
  it('abreviações e termos uma vez só, com as regras em que valem', () => {
    const [abrev, termos] = tabelasDoAnexo(REGRAS_CRESTANI);
    expect(abrev.cabecalho).toEqual(['Expressão completa', 'Abreviação aprovada', 'Regras']);
    expect(abrev.linhas.find((l) => l[0] === 'GALÃO')).toEqual(['GALÃO', 'GL', 'N01, N02']);
    expect(new Set(abrev.linhas.map((l) => `${l[0]}|${l[1]}`)).size).toBe(abrev.linhas.length);
    expect(termos.titulo).toBe('Termos que não podem ser usados');
    // A regra de nomes não traz mais a tabela; o tópico remete ao Anexo.
    const n01 = topicosDaRegra(REGRAS_CRESTANI.find((r) => r.codigo === 'N01')!.conteudo);
    expect(n01.tabelas).toEqual([]);
    expect(n01.topicos).toContain('Só as abreviações aprovadas (Anexo); outras abreviações não são usadas');
  });
  it('padrão = a de todos os grupos; as demais mostram só a diferença', () => {
    const padrao = regraPadrao(REGRAS_CRESTANI, 'NOMES')!;
    expect(padrao.codigo).toBe('N01');
    const n02 = REGRAS_CRESTANI.find((r) => r.codigo === 'N02')!;
    const dif = diferencaDaPadrao(topicosDaRegra(n02.conteudo), topicosDaRegra(padrao.conteudo));
    expect(dif.topicos).toEqual(['Estrutura: nome + característica técnica + apresentação', 'Componentes obrigatórios: nome e apresentação']);
    expect(diferencaDaPadrao(topicosDaRegra(padrao.conteudo), topicosDaRegra(padrao.conteudo))).toEqual({ topicos: [], tabelas: [] });
  });
});
