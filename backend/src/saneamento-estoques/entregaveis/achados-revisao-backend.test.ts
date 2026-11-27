/**
 * Achados da revisão do backend do Saneamento (entregáveis): a política de uma versão da Fase 1 sem conteúdo tributário (e com os módulos
 * da foto), a chave "Executado no ERP" conferida contra o caso (com código que tem "|" e limite de marcas) e o caso de impacto no SPED da
 * entrega da Fase 1 só com os ajustes da Fase 1.
 */
import { describe, expect, it } from 'vitest';
import { PdfService } from '../../pdf/pdf.service';
import type { ResultadoCamada } from '../tipos';
import { SanCasosService } from '../dados/casos.service';
import { SanImportacaoService } from '../dados/importacao.service';
import { SanOrquestracaoService } from '../dados/orquestracao.service';
import { motorDeAnalisadores, type ImportadorPort, type ItemImportado } from '../dados/portas';
import { criarPrismaFalso } from '../dados/prisma-falso';
import { SanProjetoService } from '../dados/projeto.service';
import { SanVersoesService } from '../dados/versoes.service';
import { SanDiretrizesService } from '../diretrizes/diretrizes.service';
import { ROTULO_CAMADA } from '../rotulos';
import { dadosBase, type Linha } from './__fixtures__/dados';
import { EntregaveisService, MAX_EXECUTADAS, cabeMaisUmaExecutada } from './entregaveis.service';
import { construirModelo } from './modelo';
import { chaveDaLinha, partesDaChave } from './unificacoes';

const USER = { email: 'consultor@fal.test', role: 'user' };
const item = (codigo: string, linha: number, extra: Partial<ItemImportado> = {}): ItemImportado => ({
  codigo, estabelecimento: null, descricao: `Produto ${codigo}`, unidade: 'UN', ncm: '31010000', grupo: 'G1', ativo: true, saldo: 1,
  ultimaMovimentacao: null, fabricante: null, referencia: null, finalidade: null, campos: {}, linha, ...extra,
});

async function montar(itens: ItemImportado[]) {
  const { prisma, db } = criarPrismaFalso({
    projetoDiagnostico: [{ id: 'D1', servico_consultoria: 'saneamento-estoques', empresa_ids: ['E1'], periodo_inicio: new Date('2026-12-31T00:00:00Z'), responsavel: 'Ana' }],
    empresa: [{ id: 'E1', razao_social: 'Cliente Teste', erp: 'SAP B1', cnae_principal: '4683400', cnae_descricao: 'Comércio', cnaes_secundarios: [], dados_publicos_em: new Date('2026-10-01T00:00:00Z') }],
  });
  const importador: ImportadorPort = { ler: async () => ({ itens, mapeamento: { codigo: 'Código' }, relatorio: { aceitas: itens.length, rejeitadas: 0, pendentes: 0, linhasRejeitadas: [], linhasPendentes: [] } }) };
  const projetos = new SanProjetoService(prisma as never);
  const casos = new SanCasosService(prisma as never, projetos);
  const versoes = new SanVersoesService(prisma as never);
  const orq = new SanOrquestracaoService(prisma as never, projetos, casos, motorDeAnalisadores([]));
  const diretrizes = new SanDiretrizesService(prisma as never, orq, versoes);
  const entregas = new EntregaveisService(new PdfService(), {} as never, prisma as never);
  const p = await projetos.criar('D1', USER);
  await projetos.confirmarAtividades(p.id, 1, USER);
  await new SanImportacaoService(prisma as never, projetos, importador).confirmar(p.id, { buffer: Buffer.from('x'), nome: 'cadastro.xlsx' }, undefined, [], USER);
  const id = Object.fromEntries(db.sanItem.map((i) => [i.codigo, i.id])) as Record<string, string>;
  return { prisma, db, projetos, casos, versoes, diretrizes, entregas, pid: p.id, id };
}

describe('política de uma versão da Fase 1: sem conteúdo tributário', () => {
  it('sem regras do aspecto Fiscal (seção 3 e quadro), sem os critérios das camadas da Fase 2 e com os módulos congelados na versão', async () => {
    const c = await montar([item('1', 1), item('2', 2)]);
    await c.diretrizes.criarRegra(c.pid, { aspecto: 'NOMES', nome: 'Nomes', abrangencia: { todos: true }, alteracoes: { capitalizacao: 'MAIUSCULAS' } }, USER);
    await c.diretrizes.criarRegra(c.pid, { aspecto: 'FISCAL', nome: 'Fiscal', abrangencia: { todos: true }, alteracoes: {} }, USER);
    c.db.sanProjeto[0].modulos = { ...c.db.sanProjeto[0].modulos, conciliacao: true };
    const v = await c.versoes.criar(c.pid, { rotulo: 'Cadastro saneado', fase: 'FASE1' }, USER);
    // Depois da versão, o módulo de conciliação é desligado: a política da versão segue com os módulos da foto.
    c.db.sanProjeto[0].modulos = { ...c.db.sanProjeto[0].modulos, conciliacao: false };
    const pdf = await c.diretrizes.dadosPdfPolitica(c.pid, v.id);
    expect(pdf.fiscal.fase2).toBe(false);
    expect(pdf.regras.map((r) => r.aspecto)).toContain('NOMES');
    expect(pdf.regras.map((r) => r.aspecto)).not.toContain('FISCAL');
    expect(pdf.quadro.every((q) => !('FISCAL' in q.codigos))).toBe(true);
    expect(pdf.quadro[0].codigos).toHaveProperty('NOMES');
    expect(pdf.pendencias.gruposSemRegra.some((g) => g.aspecto === 'FISCAL')).toBe(false);
    const camadas = pdf.criterios.map((x) => x.camada);
    for (const fase2 of ['FINALIDADE', 'NCM_CLASSIFICACAO', 'TRIBUTARIO'] as const) expect(camadas, fase2).not.toContain(ROTULO_CAMADA[fase2]);
    expect(camadas).toContain(ROTULO_CAMADA.ESTOQUE);
    // Sem versão e sem decisão tributária aprovada: também sem a parte fiscal; os módulos são os de agora.
    const agora = await c.diretrizes.dadosPdfPolitica(c.pid);
    expect(agora.regras.map((r) => r.aspecto)).not.toContain('FISCAL');
    expect(agora.criterios.map((x) => x.camada)).not.toContain(ROTULO_CAMADA.ESTOQUE);
    // Versão da Fase 2: a parte fiscal volta.
    c.db.sanVersao.push({ id: 'v2', projeto_id: c.pid, numero: 9, rotulo: 'Tributário', usuario: 'x', resumo: { fase: 'FASE2' }, createdAt: new Date() });
    c.db.sanVersaoSnapshot.push({ ...c.db.sanVersaoSnapshot.find((s) => s.versao_id === v.id)!, versao_id: 'v2' });
    const f2 = await c.diretrizes.dadosPdfPolitica(c.pid, 'v2');
    expect(f2.regras.map((r) => r.aspecto)).toContain('FISCAL');
    expect(f2.criterios.map((x) => x.camada)).toContain(ROTULO_CAMADA.TRIBUTARIO);
  });
});

describe('"Executado no ERP": chave conferida contra o caso', () => {
  async function comUnificacao(codigos: [string, string]) {
    const c = await montar([item(codigos[0], 1), item(codigos[1], 2), item('X9', 3)]);
    const dup: ResultadoCamada = { camada: 'DUPLICIDADE', analisados: 3, semDados: null, semProblema: [], casos: [
      { camada: 'DUPLICIDADE', tipo: 'DUPLICIDADE_EXATA', itens: [c.id[codigos[0]], c.id[codigos[1]]], problema: 'Duplicados', evidencia: [], atual: {}, proposta: { decisao: 'PROPOR_CONSOLIDACAO', manter: codigos[0], consolidar: codigos[1] }, justificativa: 'Mesmo produto.', fundamento: null, impactos: [], origem: 'REGRA', afeta: [] },
    ] };
    await c.casos.registrarResultado(c.pid, dup);
    const unif = c.db.sanCaso.find((x) => x.tipo === 'DUPLICIDADE_EXATA')!;
    await c.casos.aprovar(unif.id, { versao: unif.versao }, USER);
    return { ...c, unif };
  }

  it('código e estabelecimento têm de ser de um item do caso; a chave da linha do mapa passa', async () => {
    const c = await comUnificacao(['100', '200']);
    const linha = (await c.entregas.unificacoes(c.pid)).linhas.find((l) => l.tipo === 'UNIFICACAO')!;
    expect(linha.chave).toBe(`${c.unif.id}|200|`);
    await expect(c.entregas.marcarExecutada(c.pid, `${c.unif.id}|X9|`, USER)).rejects.toThrow('não pertence ao caso');
    await expect(c.entregas.marcarExecutada(c.pid, `${c.unif.id}|200|filial-2`, USER)).rejects.toThrow('não pertence ao caso');
    await expect(c.entregas.marcarExecutada(c.pid, `${c.unif.id}||`, USER)).rejects.toThrow('Linha do mapa inválida');
    expect((await c.entregas.marcarExecutada(c.pid, linha.chave, USER)).chave).toBe(linha.chave);
    expect(Object.keys(c.db.sanProjeto[0].parametros.acoesExecutadas)).toEqual([linha.chave]);
  });

  it('código com "|" não quebra a chave (escapado); código sem "|" fica com a chave de antes', async () => {
    expect(chaveDaLinha({ tipo: 'UNIFICACAO', casoId: 'k1', morre: { codigo: 'AB|12', estab: 'E\\1', descricao: '', unidade: '', saldo: null }, fica: null })).toBe('k1|AB\\|12|E\\\\1');
    expect(partesDaChave('k1|AB\\|12|E\\\\1')).toEqual(['k1', 'AB|12', 'E\\1']);
    expect(partesDaChave('k1|200|')).toEqual(['k1', '200', '']);
    // Inativação (Qualidade) de um item cujo código tem "|".
    const c = await montar([item('100', 1, { saldo: 0 })]);
    const it = c.db.sanItem[0];
    it.codigo = 'AB|12'; it.trabalho = { ...it.trabalho, codigo: 'AB|12' };
    await c.casos.registrarResultado(c.pid, { camada: 'QUALIDADE', analisados: 1, semDados: null, semProblema: [], casos: [
      { camada: 'QUALIDADE', tipo: 'SEM_MOVIMENTACAO', itens: [it.id], problema: 'Sem movimento', evidencia: [], atual: {}, proposta: { decisao: 'PROPOR_INATIVACAO', ativo: false }, justificativa: 'j', fundamento: null, impactos: [], origem: 'REGRA', afeta: [] },
    ] });
    const inat = c.db.sanCaso[0];
    await c.casos.aprovar(inat.id, { versao: inat.versao }, USER);
    const linha = (await c.entregas.unificacoes(c.pid)).linhas.find((l) => l.tipo === 'INATIVACAO')!;
    expect(linha.chave).toBe(`${inat.id}|AB\\|12|`);
    expect((await c.entregas.marcarExecutada(c.pid, linha.chave, USER)).chave).toBe(linha.chave);
    expect((await c.entregas.unificacoes(c.pid)).linhas.find((l) => l.chave === linha.chave)!.executado).toMatchObject({ por: USER.email });
  });

  it(`limite de ${MAX_EXECUTADAS} marcas por projeto: a linha nova é recusada; remarcar a mesma continua`, async () => {
    const marca = { em: '2026-11-01T00:00:00.000Z', por: 'a' };
    expect(cabeMaisUmaExecutada({ a: marca }, 'b', 2)).toBe(true);
    expect(cabeMaisUmaExecutada({ a: marca, b: marca }, 'c', 2)).toBe(false);
    expect(cabeMaisUmaExecutada({ a: marca, b: marca }, 'a', 2)).toBe(true);
    // No serviço, com o projeto no limite.
    const c = await comUnificacao(['100', '200']);
    const linha = (await c.entregas.unificacoes(c.pid)).linhas.find((l) => l.tipo === 'UNIFICACAO')!;
    const cheio: Linha = {};
    for (let i = 0; i < MAX_EXECUTADAS; i++) cheio[`x${i}`] = marca;
    c.db.sanProjeto[0].parametros = { ...c.db.sanProjeto[0].parametros, acoesExecutadas: cheio };
    await expect(c.entregas.marcarExecutada(c.pid, linha.chave, USER)).rejects.toThrow('o limite');
  });
});

describe('entrega da Fase 1: impacto no SPED só com os ajustes da Fase 1', () => {
  it('"Mudou NCM" vindo de Classificação NCM (Fase 2) sai do caso de impacto; vindo de Validar NCM (Fase 1) fica', () => {
    const d = (s: string) => new Date(s);
    const base = dadosBase(true);
    const caso = (id: string, camada: string, tipo: string, itens: string[], proposta: Linha) => ({
      id, projeto_id: 'P1', camada, tipo, itens, problema: tipo, evidencia: [], atual: {}, proposta, justificativa: 'j', fundamento: null, situacao: 'APROVADO',
      responsavel: null, decidido_por: 'ana@fal.test', decidido_em: d('2026-11-12T12:00:00Z'), createdAt: d('2026-11-09T12:00:00Z'),
    });
    const dados = {
      ...base,
      casos: [
        ...base.casos,
        caso('c-ncm-f1', 'NCM', 'NCM_FORMATO', ['i1'], { ncm: '31052090' }),
        caso('c-ncm-f2', 'NCM_CLASSIFICACAO', 'NCM_INCOMPATIVEL_DESCRICAO', ['i2'], { ncm: '12019001' }),
        caso('c-imp', 'OBRIGACOES', 'IMPACTO_MUDOU_NCM', ['i1', 'i2'], { valorProposto: 'varia' }),
        caso('c-imp-f2', 'OBRIGACOES', 'IMPACTO_MUDOU_NCM', ['i2'], {}),
      ],
    };
    const f1 = construirModelo({ ...dados, fase: 'FASE1' });
    expect(f1.casos.find((c) => c.id === 'c-imp')!.itens).toEqual(['i1']);
    expect(f1.casos.some((c) => c.id === 'c-imp-f2')).toBe(false); // nenhum item com o ajuste vindo da Fase 1
    expect(f1.casos.some((c) => c.id === 'c-ncm-f2')).toBe(false);
    // Entrega completa (ou da Fase 2): o caso de impacto inteiro.
    const tudo = construirModelo(dados);
    expect(tudo.casos.find((c) => c.id === 'c-imp')!.itens).toEqual(['i1', 'i2']);
    expect(tudo.casos.some((c) => c.id === 'c-imp-f2')).toBe(true);
  });
});
