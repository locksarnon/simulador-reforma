/** Diretrizes: serviço com o Prisma em memória (regressão, aplicar/aprovar/revisar, sobreposição, biblioteca, transformar, foto, 30 mil itens). */
import { describe, expect, it } from 'vitest';
import { decidirAcesso } from '../../permissoes/permissoes';
import { SanCasosService } from '../dados/casos.service';
import { apagarSaneamento } from '../dados/exclusao';
import { SanImportacaoService } from '../dados/importacao.service';
import { SanOrquestracaoService } from '../dados/orquestracao.service';
import { motorDeAnalisadores, type ImportadorPort, type ItemImportado } from '../dados/portas';
import { criarPrismaFalso } from '../dados/prisma-falso';
import { SanProjetoService } from '../dados/projeto.service';
import { SanVersoesService, gzipDaFoto } from '../dados/versoes.service';
import { prepararConfig, conferirLinhaPreparada, sugerirMapeamento } from '../importacao';
import { AnalisadorNcm } from '../motor/ncm';
import { AnalisadorNomesUnidades } from '../motor/nomes-unidades';
import { AnalisadorQualidade } from '../motor/qualidade';
import { SanBibliotecaDiretrizesService } from './biblioteca.service';
import { BIBLIOTECA_INICIAL, MODELOS } from './conteudo/biblioteca';
import { SanDiretrizesService } from './diretrizes.service';
import type { RegraBiblioteca } from './tipos';

const USER = { email: 'consultor@fal.test', role: 'user' };
const ADMIN = { email: 'admin@fal.test', role: 'admin' };
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
  const versoes = new SanVersoesService(prisma as never);
  const diretrizes = new SanDiretrizesService(prisma as never, orq, versoes);
  const biblioteca = new SanBibliotecaDiretrizesService(prisma as never);
  return { prisma, db, fila, projetos, casos, importacao, orq, versoes, diretrizes, biblioteca };
}
type Ctx = ReturnType<typeof montar>;
async function pronto(c: Ctx, itens: ItemImportado[], motor?: Record<string, unknown>) {
  const p = await c.projetos.criar('D1', USER);
  await c.projetos.confirmarAtividades(p.id, 1, USER);
  if (motor) c.db.sanProjeto[0].parametros = { motor };
  c.fila.itens = itens;
  await c.importacao.confirmar(p.id, ARQ, undefined, [], USER);
  return { pid: p.id, ids: Object.fromEntries(c.db.sanItem.map((i) => [i.codigo, i.id])) as Record<string, string> };
}
/** Retrato comparável da análise: casos vivos (itens por código) e células, em ordem estável. `semRegra` tira a linha "Regra" da evidência. */
function retrato(c: Ctx, semRegra = false) {
  const cod = new Map(c.db.sanItem.map((i) => [i.id, i.codigo]));
  const casos = c.db.sanCaso.filter((x) => x.situacao !== 'OBSOLETO').map((x) => JSON.stringify({
    camada: x.camada, tipo: x.tipo, situacao: x.situacao, itens: x.itens.map((i: string) => cod.get(i)).sort(), problema: x.problema, atual: x.atual, proposta: x.proposta, afeta: x.afeta,
    evidencia: semRegra ? x.evidencia.filter((e: { rotulo: string }) => e.rotulo !== 'Regra') : x.evidencia,
  })).sort();
  const celulas = c.db.sanCelula.map((x) => `${cod.get(x.item_id)}|${x.camada}|${x.situacao}|${x.revisar}`).sort();
  return { casos, celulas };
}
const BASE = [
  item('1', { descricao: 'parafuso  sextavado 10mm', unidade: 'KGS', grupo: 'G1' }, 1),
  item('2', { descricao: 'ROLAMENTO 6205 ESQ', unidade: 'KG', grupo: 'G1' }, 2),
  item('3', { descricao: 'oleo lubrificante muito comprido para o campo', unidade: 'ROLO', grupo: 'G2' }, 3),
  item('4', { descricao: 'Material diversos', unidade: 'TONELADA', grupo: 'G2' }, 4),
  item('5', { descricao: 'Sem grupo', unidade: 'UN', grupo: null }, 5),
];

describe('regressão: sem diretrizes = igual a hoje', () => {
  it('abrir as Diretrizes sem parâmetros antigos cria só a regra padrão de limites, não aplicada: a análise fica idêntica (até a evidência)', async () => {
    const a = montar(); const pa = await pronto(a, BASE);
    const b = montar(); const pb = await pronto(b, BASE);
    const d = await b.diretrizes.obter(pb.pid);
    expect(d.regras.map((r) => [r.codigo, r.aspecto, r.aplicada, r.situacao])).toEqual([['L01', 'LIMITES', false, 'RASCUNHO']]);
    expect(d.regras[0].conteudoEfetivo).toMatchObject({ aspecto: 'LIMITES' });
    expect((d.regras[0].conteudoEfetivo as { linhas: unknown[] }).linhas.length).toBeGreaterThan(0); // linhas oficiais
    for (const cam of ['QUALIDADE', 'NOMES_UNIDADES', 'NCM']) { await a.orq.executarCamada(pa.pid, cam); await b.orq.executarCamada(pb.pid, cam); }
    expect(retrato(b)).toEqual(retrato(a));
  });
  it('projeto com parâmetros antigos: a conversão em regras "Todos os grupos" não muda casos nem células', async () => {
    const motor = { limites: { descricao: 25 }, abreviacoesAprovadas: { ESQ: 'ESQUERDO' }, padronizarCaixaAlta: true, politicaUnidade: { ativa: true, regras: { rolo: { manter: true } } } };
    const a = montar(); const pa = await pronto(a, BASE, motor);
    const b = montar(); const pb = await pronto(b, BASE, motor);
    const d = await b.diretrizes.obter(pb.pid);
    expect(d.regras.map((r) => [r.codigo, r.aspecto, r.legado, r.aplicada, r.pendenteAplicar])).toEqual([['L01', 'LIMITES', true, true, false], ['N01', 'NOMES', true, true, false], ['U01', 'UNIDADES', true, true, false]]);
    expect(b.db.sanDiretrizHistorico.filter((h) => h.acao === 'CONVERTER')).toHaveLength(3);
    await b.diretrizes.obter(pb.pid); // segunda leitura não converte de novo
    expect(b.db.sanDiretrizRegra).toHaveLength(3);
    for (const cam of ['QUALIDADE', 'NOMES_UNIDADES', 'NCM']) { await a.orq.executarCamada(pa.pid, cam); await b.orq.executarCamada(pb.pid, cam); }
    expect(retrato(b, true)).toEqual(retrato(a));
    expect(retrato(a).casos.some((x) => x.includes('TAMANHO_EXCEDIDO'))).toBe(true);
    // Casos de grupos com regra levam a referência.
    expect(b.db.sanCaso.filter((x) => x.camada === 'NOMES_UNIDADES').every((x) => x.evidencia.some((e: { rotulo: string }) => e.rotulo === 'Regra'))).toBe(true);
  });
});

describe('fluxo: criar, aplicar e reanalisar, sobreposição, aprovar, revisar', () => {
  it('reanalisa só os itens afetados; sobreposição bloqueia até confirmar a transferência; aprovar exige aplicada; mudar aprovada volta a rascunho e marca revisar', async () => {
    const c = montar(); const { pid, ids } = await pronto(c, BASE);
    await c.orq.executarCamada(pid, 'NOMES_UNIDADES');
    // Marca de revisão numa célula de G2: aplicar regra de G1 não pode tocá-la.
    const casosG2 = () => c.db.sanCaso.filter((x) => x.itens.some((i: string) => i === ids['3'] || i === ids['4'])).map((x) => `${x.id}|${x.situacao}|${x.versao}`).sort();
    const casosG2Antes = casosG2();
    expect(casosG2Antes.length).toBeGreaterThan(0);
    const celG2 = c.db.sanCelula.find((x) => x.item_id === ids['3'] && x.camada === 'NOMES_UNIDADES')!;
    celG2.revisar = true; celG2.revisar_causa = 'marca anterior';
    const r = await c.diretrizes.criarRegra(pid, { aspecto: 'NOMES', nome: 'Nomes G1', abrangencia: { todos: false, grupos: ['G1'] }, alteracoes: { capitalizacao: 'MAIUSCULAS', termosProibidos: [{ termo: 'ESQ', substituicao: 'ESQUERDO' }] } }, USER);
    expect(r).toMatchObject({ codigo: 'N01', situacao: 'RASCUNHO', aplicada: false, pendenteAplicar: true });
    const pv = await c.diretrizes.previa(r.id);
    expect(pv).toMatchObject({ grupos: ['G1'], itens: 2, sobreposicoes: [], camadas: ['NOMES_UNIDADES'] });
    expect(await erro(c.diretrizes.aprovar(r.id, { versao: r.versao }, USER))).toBe('REGRA_NAO_APLICADA');
    expect(await erro(c.diretrizes.aplicar(r.id, { versao: r.versao + 5 }, USER))).toBe('CONFLITO_VERSAO');
    const ap = await c.diretrizes.aplicar(r.id, { versao: r.versao }, USER);
    expect(ap.reanalise.camadas).toEqual([expect.objectContaining({ camada: 'NOMES_UNIDADES', executada: true })]);
    expect(ap.regra).toMatchObject({ aplicada: true, pendenteAplicar: false });
    expect(ap).toMatchObject({ id: r.id, versao: r.versao + 1 }); // gravação devolve id e versao no topo
    const ex = await c.diretrizes.exemplos(r.id);
    expect(ex.itens.find((x) => x.codigo === '2')).toMatchObject({ descricaoAtual: 'ROLAMENTO 6205 ESQ', descricaoProposta: 'ROLAMENTO 6205 ESQUERDO' });
    const novos = c.db.sanCaso.filter((x) => x.tipo === 'DESCRICAO_FORA_PADRAO' && x.situacao === 'PROPOSTO');
    expect(novos.map((x) => x.itens[0]).sort()).toEqual([ids['1'], ids['2']].sort());
    expect(novos.find((x) => x.itens[0] === ids['2'])!.proposta).toEqual({ descricao: 'ROLAMENTO 6205 ESQUERDO' });
    expect(c.db.sanCaso.find((x) => x.tipo === 'DESCRICAO_FORA_DO_PADRAO' && x.itens.includes(ids['1']))!.situacao).toBe('OBSOLETO');
    expect(celG2.revisar).toBe(true);
    expect(casosG2()).toEqual(casosG2Antes);

    // Segunda regra para G1: sobreposição → 409 até confirmar; a transferência fica no histórico das duas.
    const r2 = await c.diretrizes.criarRegra(pid, { aspecto: 'NOMES', nome: 'Nomes G1 e G2', abrangencia: { todos: false, grupos: ['G1', 'G2'] } }, USER);
    expect(r2.codigo).toBe('N02');
    expect((await c.diretrizes.previa(r2.id)).sobreposicoes).toEqual([{ grupo: 'G1', regraAtual: 'N01' }]);
    expect(await erro(c.diretrizes.aplicar(r2.id, { versao: r2.versao }, USER))).toBe('SOBREPOSICAO');
    await c.diretrizes.aplicar(r2.id, { versao: r2.versao, confirmarTransferencia: true }, USER);
    const r1 = c.db.sanDiretrizRegra.find((x) => x.id === r.id)!;
    expect(r1.abrangencia).toEqual({ todos: false, grupos: [] });
    expect(r1.aplicacao.abrangencia).toEqual({ todos: false, grupos: [] });
    expect(c.db.sanDiretrizHistorico.filter((h) => h.regra_id === r.id).map((h) => h.acao)).toEqual(['CRIAR', 'APLICAR', 'TRANSFERIR']);
    const d = await c.diretrizes.obter(pid);
    expect(d.regras.find((x) => x.id === r.id)!.ativa).toBe(false);
    expect(d.gruposSemRegra.find((g) => g.aspecto === 'NOMES')!.grupos).toEqual(['(sem grupo)']);

    // Aprovar (um aprovador) e mudar depois: volta a rascunho, marca "revisar" nas células da camada dos itens da regra.
    const atual = (await c.diretrizes.obter(pid)).regras.find((x) => x.id === r2.id)!;
    const aprovada = await c.diretrizes.aprovar(r2.id, { versao: atual.versao }, USER);
    expect(aprovada).toMatchObject({ situacao: 'APROVADA', aprovadaPor: USER.email });
    expect((await c.diretrizes.obter(pid)).cabecalho.situacao).toBe('RASCUNHO'); // L01 padrão e N01 inativa não contam; L01 não aprovada
    for (const x of c.db.sanCelula) if (x.camada === 'NOMES_UNIDADES') { x.revisar = false; x.revisar_causa = null; }
    const alterada = await c.diretrizes.atualizarRegra(r2.id, { versao: aprovada.versao, alteracoes: { capitalizacao: 'MINUSCULAS' } }, USER);
    expect(alterada).toMatchObject({ situacao: 'RASCUNHO', revisar: true, aprovadaPor: null, pendenteAplicar: true });
    const marcadas = c.db.sanCelula.filter((x) => x.camada === 'NOMES_UNIDADES' && x.revisar).map((x) => x.item_id).sort();
    expect(marcadas).toEqual([ids['1'], ids['2'], ids['3'], ids['4']].sort());
    const hist = (await c.diretrizes.historico(r2.id)).linhas;
    expect(hist.map((h) => h.acao)).toEqual(['ALTEROU', 'APROVOU', 'APLICOU', 'CRIOU']);
    expect(hist[0].antes).toMatchObject({ situacao: 'APROVADA' });
    expect(hist[0].depois).toMatchObject({ situacao: 'RASCUNHO', revisar: true });
    // Cabeçalho: vigência com versão.
    const cab = (await c.diretrizes.obter(pid)).cabecalho;
    expect(await erro(c.diretrizes.atualizarCabecalho(pid, { versao: cab.versao, vigencia: '2026-13-01' }))).toBe('VIGENCIA_INVALIDA');
    expect(await c.diretrizes.atualizarCabecalho(pid, { versao: cab.versao, vigencia: '2027-01-01' })).toMatchObject({ vigencia: '2027-01-01', versao: cab.versao + 1 });
    expect(await erro(c.diretrizes.atualizarCabecalho(pid, { versao: cab.versao, vigencia: '2027-02-01' }))).toBe('CONFLITO_VERSAO');
  });

  it('subgrupo: a regra de um subgrupo vale só para os itens dele', async () => {
    const c = montar();
    const { pid, ids } = await pronto(c, [item('1', { descricao: 'abc def', campos: { subgrupo: 'S1' } }, 1), item('2', { descricao: 'abc def', campos: { subgrupo: 'S2' } }, 2)]);
    const r = await c.diretrizes.criarRegra(pid, { aspecto: 'NOMES', nome: 'S1', abrangencia: { todos: false, grupos: ['G1'], subgrupos: ['S1'] }, alteracoes: { capitalizacao: 'MAIUSCULAS' } }, USER);
    expect((await c.diretrizes.obter(pid)).grupos).toEqual([{ grupo: 'G1', subgrupos: ['S1', 'S2'], itens: 2 }]);
    await c.diretrizes.aplicar(r.id, { versao: r.versao }, USER);
    expect(c.db.sanCaso.filter((x) => x.tipo === 'DESCRICAO_FORA_PADRAO').map((x) => x.itens)).toEqual([[ids['1']]]);
  });
});

describe('biblioteca, modelo, adotar versão e transformar', () => {
  const modelo = (versaoNome = 'Peças'): RegraBiblioteca => ({ id: 'bib-teste-nomes', aspecto: 'NOMES', nome: versaoNome, indicadaPara: 'Peças', observacao: null, versao: 1, ativa: true,
    conteudo: { aspecto: 'NOMES', componentes: ['NOME', 'REFERENCIA'], obrigatorios: ['NOME'], separador: ' ', capitalizacao: 'MAIUSCULAS', removerEspacosDuplicados: true, abreviacoes: [], termosProibidos: [] } });
  it('carga idempotente com id fixo; mudança da carga = versão nova; o que o administrador editou não se sobrescreve; escrita só admin', async () => {
    const c = montar();
    expect(await c.biblioteca.aplicarCarga([modelo()])).toMatchObject({ criadas: 1, atualizadas: 0 });
    expect(await c.biblioteca.aplicarCarga([modelo()])).toMatchObject({ criadas: 0, atualizadas: 0 });
    expect(await c.biblioteca.aplicarCarga([modelo('Peças v2')])).toMatchObject({ atualizadas: 1 });
    expect((await c.biblioteca.obter('bib-teste-nomes')).versao).toBe(2);
    expect(await erro(c.biblioteca.atualizar('bib-teste-nomes', { versao: 2, nome: 'X' }, USER))).toBe(403);
    expect(await erro(c.biblioteca.atualizar('bib-teste-nomes', { versao: 1, nome: 'X' }, ADMIN))).toBe('CONFLITO_VERSAO');
    await c.biblioteca.atualizar('bib-teste-nomes', { versao: 2, nome: 'Peças (FAL)' }, ADMIN);
    expect(await c.biblioteca.aplicarCarga([modelo('Peças v3')])).toMatchObject({ atualizadas: 0 });
    const h = await c.biblioteca.historico('bib-teste-nomes');
    expect(h.map((x) => [x.versao, x.acao, x.nome])).toEqual([[3, 'ALTEROU', 'Peças (FAL)'], [2, 'CARGA', 'Peças v2'], [1, 'CARGA', 'Peças']]);
    expect(await c.biblioteca.aplicarCarga([{ ...modelo(), id: 'bib-ruim', conteudo: { aspecto: 'NOMES' } as never }])).toMatchObject({ criadas: 0, ignoradas: [expect.objectContaining({ id: 'bib-ruim' })] });
    expect(await erro(c.biblioteca.criar({ aspecto: 'NOMES', nome: 'x', conteudo: modelo().conteudo }, USER))).toBe(403);
  });
  it('a carga real (conteúdo + limites oficiais) entra inteira e o modelo da Crestani cria as regras sem duplicar', async () => {
    const c = montar(); const { pid } = await pronto(c, BASE);
    const carga = await c.biblioteca.aplicarCarga();
    expect(carga.ignoradas).toEqual([]);
    expect(carga.criadas).toBe(BIBLIOTECA_INICIAL.length + 1);
    const m = MODELOS[0];
    const r1 = await c.diretrizes.aplicarModelo(pid, { modeloId: m.id }, USER);
    expect(r1.faltando).toEqual([]);
    expect(r1.criadas).toBe(m.atribuicoes.length);
    const r2 = await c.diretrizes.aplicarModelo(pid, { modeloId: m.id }, USER);
    expect(r2.criadas).toBe(0);
    expect(r2.jaExistiam).toBe(m.atribuicoes.length);
    // Na abertura, a regra padrão de limites aponta para a regra-modelo oficial.
    expect(c.db.sanDiretrizRegra.find((x) => x.codigo === 'L01')!.biblioteca_id).toBe('bib-limites-oficiais');
  });
  it('regra da biblioteca: projeto vê a versão nova, adota com antes/depois; aprovada volta a rascunho', async () => {
    const c = montar(); const { pid } = await pronto(c, BASE);
    await c.biblioteca.aplicarCarga([modelo()]);
    let r = await c.diretrizes.criarRegra(pid, { aspecto: 'NOMES', nome: 'Da biblioteca', abrangencia: { todos: true }, bibliotecaId: 'bib-teste-nomes', alteracoes: { capitalizacao: 'PRESERVAR' } }, USER);
    expect(r.conteudoEfetivo).toMatchObject({ componentes: ['NOME', 'REFERENCIA'], capitalizacao: 'PRESERVAR' });
    r = (await c.diretrizes.aplicar(r.id, { versao: r.versao }, USER)).regra;
    r = await c.diretrizes.aprovar(r.id, { versao: r.versao }, USER);
    expect(await erro(c.diretrizes.adotarVersao(r.id, { versao: r.versao }, USER))).toBe('SEM_VERSAO_NOVA');
    await c.biblioteca.atualizar('bib-teste-nomes', { versao: 1, conteudo: { ...modelo().conteudo, componentes: ['NOME', 'REFERENCIA', 'MARCA'] } }, ADMIN);
    expect((await c.diretrizes.obter(pid)).atualizacoesBiblioteca).toEqual([{ regraId: r.id, versaoNova: 2 }]);
    expect(r.conteudoEfetivo).toMatchObject({ componentes: ['NOME', 'REFERENCIA'] }); // nada muda sozinho
    const ad = await c.diretrizes.adotarVersao(r.id, { versao: r.versao }, USER);
    expect(ad.antes).toMatchObject({ componentes: ['NOME', 'REFERENCIA'] });
    expect(ad.depois).toMatchObject({ componentes: ['NOME', 'REFERENCIA', 'MARCA'], capitalizacao: 'PRESERVAR' });
    expect(ad.regra).toMatchObject({ bibliotecaVersao: 2, situacao: 'RASCUNHO', revisar: true, pendenteAplicar: true });
    expect(ad.previa.itens).toBe(5);
  });
  it('transformar em regra: conversão aprovada de um caso vira regra de unidades (rascunho) com prévia; biblioteca só admin', async () => {
    const c = montar(); const { pid } = await pronto(c, BASE);
    await c.orq.executarCamada(pid, 'NOMES_UNIDADES');
    const caso = c.db.sanCaso.find((x) => x.tipo === 'UNIDADE_CONVERSAO' && x.proposta.fatorConversao === 1000)!;
    expect(await erro(c.diretrizes.transformar(pid, { casoId: caso.id, aspecto: 'UNIDADES', nome: 'X', abrangencia: { todos: true }, destino: 'BIBLIOTECA' }, USER))).toBe(403);
    expect(await erro(c.diretrizes.transformar(pid, { casoId: 'nao-existe', aspecto: 'UNIDADES', nome: 'X', abrangencia: { todos: true }, destino: 'PROJETO' }, USER))).toBe(404);
    const t = await c.diretrizes.transformar(pid, { casoId: caso.id, aspecto: 'UNIDADES', nome: 'Toneladas', abrangencia: { todos: false, grupos: ['G2'] }, destino: 'PROJETO' }, USER);
    expect(t.regra).toMatchObject({ situacao: 'RASCUNHO', aplicada: false, codigo: 'U01' });
    expect(t.regra.conteudoEfetivo).toMatchObject({ conversoes: [{ origem: 'TONELADA', destino: 'KG', fator: 1000, abrangencia: 'GRUPO' }] });
    expect(t.previa).toMatchObject({ grupos: ['G2'], itens: 2 });
    expect(c.db.sanDiretrizHistorico.find((h) => h.regra_id === t.regra.id)!.acao).toBe('TRANSFORMAR');
    const tb = await c.diretrizes.transformar(pid, { casoId: caso.id, aspecto: 'UNIDADES', nome: 'Toneladas FAL', abrangencia: { todos: true }, destino: 'BIBLIOTECA' }, ADMIN);
    expect(tb.regra.bibliotecaId).toMatch(/^bib-/);
    expect((await c.biblioteca.obter(tb.regra.bibliotecaId!)).conteudo).toMatchObject({ conversoes: [{ origem: 'TONELADA', fator: 1000 }] });
  });
});

describe('versões: as Diretrizes entram na foto', () => {
  it('liberar versão congela as regras com conteúdo efetivo, situação e aprovador; a política da versão é reproduzível; foto antiga = null', async () => {
    const c = montar(); const { pid } = await pronto(c, BASE);
    let r = await c.diretrizes.criarRegra(pid, { aspecto: 'NOMES', nome: 'Nomes', abrangencia: { todos: true }, alteracoes: { capitalizacao: 'MAIUSCULAS' } }, USER);
    r = (await c.diretrizes.aplicar(r.id, { versao: r.versao }, USER)).regra;
    r = await c.diretrizes.aprovar(r.id, { versao: r.versao }, USER);
    const v = await c.versoes.criar(pid, { rotulo: 'Entrega 1' }, USER);
    await c.diretrizes.atualizarRegra(r.id, { versao: r.versao, nome: 'Nomes (mudado)' }, USER);
    const { diretrizes } = await c.versoes.diretrizesDaVersao(pid, v.id);
    const n01 = (diretrizes!.regras as { codigo: string; nome: string; situacao: string; aprovadaPor: string; conteudoEfetivo: unknown }[]).find((x) => x.codigo === 'N01')!;
    expect(n01).toMatchObject({ nome: 'Nomes', situacao: 'APROVADA', aprovadaPor: USER.email, conteudoEfetivo: { capitalizacao: 'MAIUSCULAS' } });
    const pol = await c.diretrizes.dadosDaPolitica(pid, v.id);
    expect(pol.regras.find((x) => x.codigo === 'N01')).toMatchObject({ nome: 'Nomes' });
    expect(pol.quadro.find((q) => q.grupo === 'G1')).toMatchObject({ NOMES: 'N01', LIMITES: 'L01' });
    expect(pol.rascunho).toBe(true); // L01 (padrão) não aprovada
    expect(pol.pendencias.regrasNaoAprovadas.map((x) => x.codigo)).toEqual(['L01']);
    const pdf = await c.diretrizes.dadosPdfPolitica(pid, v.id);
    expect(pdf.identificacao).toMatchObject({ situacao: 'RASCUNHO', versao: { numero: 1, rotulo: 'Entrega 1' }, aprovador: USER.email });
    expect(pdf.regras.find((x) => x.codigo === 'N01')).toMatchObject({ nome: 'Nomes', situacao: 'APROVADA', conteudo: { capitalizacao: 'MAIUSCULAS' } });
    expect(pdf.quadro.find((q) => q.grupo === 'G1')!.codigos).toEqual({ NOMES: 'N01', LIMITES: 'L01' });
    expect(pdf.procedimentos).toBeDefined();
    const agora = await c.diretrizes.dadosDaPolitica(pid);
    expect(agora.regras.find((x) => x.codigo === 'N01')).toMatchObject({ nome: 'Nomes (mudado)', situacao: 'RASCUNHO' });
    expect((await c.versoes.foto(pid, v.id)).foto.diretrizes).toMatchObject({ formato: 1 });
    // Foto antiga (sem a chave): continua legível, Diretrizes null.
    const velha = await c.prisma.sanVersao.create({ data: { projeto_id: pid, numero: 99, rotulo: 'antiga', usuario: 'x', resumo: {} } });
    await c.prisma.sanVersaoSnapshot.create({ data: { versao_id: velha.id, itens: 0, dados: await gzipDaFoto({ formato: 2, projeto: {}, itens: [], celulas: [], casos: [], decisoes: [], impactosSped: [], vinculos: [], importacoes: [] }) } });
    expect((await c.versoes.diretrizesDaVersao(pid, velha.id)).diretrizes).toBeNull();
    expect((await c.versoes.foto(pid, velha.id)).foto.diretrizes).toBeNull();
  });
});

describe('importação, permissões e exclusão', () => {
  it('a coluna Subgrupo é mapeada (opcional) e vai para campos.subgrupo', () => {
    const cab = ['Código', 'Descrição', 'Grupo', 'Subgrupo'];
    const s = sugerirMapeamento(cab);
    expect(s.mapeamento).toMatchObject({ codigo: 0, descricao: 1, grupo: 2, subgrupo: 3 });
    const l = conferirLinhaPreparada(prepararConfig(cab, { mapeamento: s.mapeamento, colunasExtras: 'demais' }), ['10', 'Parafuso', 'Fixadores', 'Sextavados'], 2);
    expect(l.item).toMatchObject({ grupo: 'Fixadores', campos: { subgrupo: 'Sextavados' } });
    expect((l.item as unknown as Record<string, unknown>).subgrupo).toBeUndefined();
  });
  it('biblioteca: leitura livre para quem está logado; Diretrizes do projeto pela tela da Consultoria', () => {
    const leitor = { role: 'user', nivel: 'SOMENTE_LEITURA', permissoes: { telas: [], funcoes: [] } } as never;
    expect(decidirAcesso(leitor, { metodo: 'GET', rota: 'saneamento-estoques/biblioteca' })).toEqual({ ok: true });
    expect(decidirAcesso(leitor, { metodo: 'GET', rota: 'saneamento-estoques/biblioteca/:id/historico' })).toEqual({ ok: true });
    expect(decidirAcesso(leitor, { metodo: 'GET', rota: 'saneamento-estoques/projetos/:id/diretrizes' }).ok).toBe(false);
  });
  it('excluir o projeto apaga as Diretrizes (sem órfãos)', async () => {
    const c = montar(); const { pid } = await pronto(c, BASE);
    await c.diretrizes.obter(pid);
    expect(c.db.sanDiretrizes).toHaveLength(1);
    await apagarSaneamento(c.prisma as never, { diagnostico_id: 'D1' });
    expect([c.db.sanDiretrizes.length, c.db.sanDiretrizRegra.length, c.db.sanDiretrizHistorico.length]).toEqual([0, 0, 0]);
  });
});

describe('30 mil itens', () => {
  it('aplicar uma regra de um grupo reanalisa só os 10 mil itens dele, sem tocar o resto', async () => {
    const c = montar();
    const p = await c.projetos.criar('D1', USER);
    await c.projetos.confirmarAtividades(p.id, 1, USER);
    // Base semeada direto no banco em memória (a importação do Prisma em memória confere unicidade linha a linha: O(n²) com 30 mil).
    for (let i = 0; i < 30_000; i++) {
      const grupo = `G${i % 3}`; const id = `it${i}`;
      const trabalho = { codigo: String(100000 + i), descricao: `ROLAMENTO ${i % 2 ? 'BLINDADO' : 'ABERTO'} ${i}`, unidade: 'UN', ncm: '31010000', grupo, ativo: true, saldo: null, ultimaMovimentacao: null, fabricante: null, referencia: null, finalidade: null, campos: {} };
      c.db.sanItem.push({ id, projeto_id: p.id, codigo: trabalho.codigo, estabelecimento: '', linha: i + 1, original: trabalho, lido: trabalho, trabalho, descricao: trabalho.descricao, grupo, finalidade: null, tambem_usado_como: [], conjunto_chave: null, ativo: true, versao: 1 });
      c.db.sanCelula.push({ id: `cel${i}`, projeto_id: p.id, item_id: id, camada: 'NOMES_UNIDADES', situacao: 'PENDENTE', revisar: false, revisar_causa: null, caso_id: null, grupo });
    }
    const pid = p.id;
    await c.orq.executarCamada(pid, 'NOMES_UNIDADES');
    const antes = new Map(c.db.sanCelula.map((x) => [x.item_id, `${x.situacao}|${x.caso_id}|${x.revisar}`]));
    expect([...antes.values()].every((v) => v.startsWith('SEM_PROBLEMA'))).toBe(true);
    for (const x of c.db.sanCelula) if (x.grupo === 'G2') x.revisar = true; // marca que a reanálise de G1 não pode tirar
    const r = await c.diretrizes.criarRegra(pid, { aspecto: 'NOMES', nome: 'G1', abrangencia: { todos: false, grupos: ['G1'] }, alteracoes: { termosProibidos: [{ termo: 'blindado', substituicao: null }], capitalizacao: 'MAIUSCULAS' } }, USER);
    const t0 = Date.now();
    const ap = await c.diretrizes.aplicar(r.id, { versao: r.versao }, USER);
    const ms = Date.now() - t0;
    expect(ap.previa.itens).toBe(10_000);
    expect(ap.reanalise.camadas).toEqual([expect.objectContaining({ executada: true })]);
    let mudouFora = 0; let g2Revisar = 0;
    for (const x of c.db.sanCelula) {
      if (x.grupo !== 'G1' && `${x.situacao}|${x.caso_id}` !== antes.get(x.item_id)!.split('|').slice(0, 2).join('|')) mudouFora++;
      if (x.grupo === 'G2' && x.revisar) g2Revisar++;
    }
    expect(mudouFora).toBe(0);
    expect(g2Revisar).toBe(10_000);
    const termo = c.db.sanCaso.filter((x) => x.tipo === 'TERMO_PROIBIDO');
    expect(termo).toHaveLength(1);
    expect(termo[0].itens).toHaveLength(5_000);
    expect(c.db.sanCelula.filter((x) => x.grupo === 'G1' && x.situacao === 'PROPOSTO')).toHaveLength(5_000);
    expect(ms).toBeLessThan(60_000);
  }, 300_000);
});

describe('revisão independente (serviço)', () => {
  const MOTOR_ANTIGO = { abreviacoesAprovadas: { ESQ: 'ESQUERDO' }, padronizarCaixaAlta: true, politicaUnidade: { ativa: true, regras: { rolo: { manter: true } } } };
  it('renomear N01/U01 convertidas (a tela antiga mandava o conteúdo inteiro) mantém o legado e o resultado idêntico; mudar o conteúdo tira o legado', async () => {
    const c = montar(); const { pid } = await pronto(c, BASE, MOTOR_ANTIGO);
    const d = await c.diretrizes.obter(pid);
    for (const cam of ['NOMES_UNIDADES', 'QUALIDADE']) await c.orq.executarCamada(pid, cam);
    const antes = retrato(c);
    const n01 = d.regras.find((r) => r.codigo === 'N01')!; const u01 = d.regras.find((r) => r.codigo === 'U01')!;
    expect(n01.conteudoEfetivo).toMatchObject({ abreviacoes: [{ completa: 'ESQUERDO', abreviacao: 'ESQ' }] });
    const n = await c.diretrizes.atualizarRegra(n01.id, { versao: n01.versao, nome: 'Nomes (renomeada)', observacao: 'só o nome', alteracoes: n01.conteudoEfetivo }, USER);
    const u = await c.diretrizes.atualizarRegra(u01.id, { versao: u01.versao, nome: 'Unidades (renomeada)' }, USER);
    for (const r of [n, u]) expect(r).toMatchObject({ legado: true, pendenteAplicar: false });
    expect(c.db.sanDiretrizRegra.find((x) => x.id === n01.id)!.parametros_legados).toEqual({ abreviacoesAprovadas: MOTOR_ANTIGO.abreviacoesAprovadas, padronizarCaixaAlta: true });
    // Grupos (abrangência) também não tiram o legado.
    const n2 = await c.diretrizes.atualizarRegra(n01.id, { versao: n.versao, abrangencia: { todos: false, grupos: ['G1', 'G2', '(sem grupo)'] } }, USER);
    expect(n2.legado).toBe(true);
    for (const cam of ['NOMES_UNIDADES', 'QUALIDADE']) await c.orq.executarCamada(pid, cam);
    expect(retrato(c)).toEqual(antes);
    const editada = await c.diretrizes.atualizarRegra(n01.id, { versao: n2.versao, alteracoes: { ...n01.conteudoEfetivo, capitalizacao: 'PRESERVAR' } }, USER);
    expect(editada).toMatchObject({ legado: false, pendenteAplicar: true });
  });
  it('conversão gravada invertida antes da correção: tela e política leem no sentido certo, sem "aplicar pendente"', async () => {
    const c = montar(); const { pid } = await pronto(c, BASE, MOTOR_ANTIGO);
    await c.diretrizes.obter(pid);
    const linhaN = c.db.sanDiretrizRegra.find((x) => x.codigo === 'N01')!;
    const inverter = (o: { abreviacoes: { completa: string; abreviacao: string }[] }) => ({ ...o, abreviacoes: o.abreviacoes.map((a) => ({ completa: a.abreviacao, abreviacao: a.completa })) });
    linhaN.alteracoes = inverter(linhaN.alteracoes); linhaN.aplicacao = { ...linhaN.aplicacao, conteudo: inverter(linhaN.aplicacao.conteudo) };
    const n = (await c.diretrizes.obter(pid)).regras.find((x) => x.codigo === 'N01')!;
    expect(n.conteudoEfetivo).toMatchObject({ abreviacoes: [{ completa: 'ESQUERDO', abreviacao: 'ESQ' }] });
    expect(n.pendenteAplicar).toBe(false);
    const pol = await c.diretrizes.dadosPdfPolitica(pid);
    expect(pol.regras.find((x) => x.codigo === 'N01')!.conteudo).toMatchObject({ abreviacoes: [{ completa: 'ESQUERDO', abreviacao: 'ESQ' }] });
  });
  it('regra de NOMES só em G1: o caso de unidade de 4 itens (2 em G1, 2 em G2) não fica obsoleto e G2 não muda; a prévia mostra os itens que podem mudar', async () => {
    const c = montar();
    const { pid, ids } = await pronto(c, [
      item('1', { descricao: 'Lona preta', unidade: 'ROLO', grupo: 'G1' }, 1), item('2', { descricao: 'Lona azul', unidade: 'ROLO', grupo: 'G1' }, 2),
      item('3', { descricao: 'Fita crepe', unidade: 'ROLO', grupo: 'G2' }, 3), item('4', { descricao: 'Fita dupla  face', unidade: 'ROLO', grupo: 'G2' }, 4),
    ]);
    await c.orq.executarCamada(pid, 'NOMES_UNIDADES');
    const caso = c.db.sanCaso.find((x) => x.tipo === 'UNIDADE_SEM_REGRA')!;
    expect(caso.itens).toHaveLength(4);
    const g2 = () => c.db.sanCaso.filter((x) => x.itens.some((i: string) => i === ids['3'] || i === ids['4'])).map((x) => `${x.id}|${x.tipo}|${x.situacao}|${x.versao}`).sort();
    const g2Antes = g2();
    const r = await c.diretrizes.criarRegra(pid, { aspecto: 'NOMES', nome: 'Nomes G1', abrangencia: { todos: false, grupos: ['G1'] }, alteracoes: { capitalizacao: 'MAIUSCULAS' } }, USER);
    expect(await c.diretrizes.previa(r.id)).toMatchObject({ grupos: ['G1'], itens: 2 });
    await c.diretrizes.aplicar(r.id, { versao: r.versao }, USER);
    expect(c.db.sanCaso.find((x) => x.id === caso.id)!.situacao).toBe('PROPOSTO');
    expect(g2()).toEqual(g2Antes);
    // Regra de UNIDADES em G1 mexe no conjunto: a prévia inclui os itens de G2 que dividem o caso aberto com G1.
    const u = await c.diretrizes.criarRegra(pid, { aspecto: 'UNIDADES', nome: 'Unidades G1', abrangencia: { todos: false, grupos: ['G1'] }, alteracoes: { criterioEstoque: 'DEFINIDA', unidadeDefinida: 'M' } }, USER);
    expect(await c.diretrizes.previa(u.id)).toMatchObject({ grupos: ['G1', 'G2'], itens: 4 });
  });
  it('transformar para a biblioteca: a regra-modelo não leva código de item do cliente; a exceção fica na regra do projeto (rascunho)', async () => {
    const c = montar(); const { pid, ids } = await pronto(c, BASE);
    await c.diretrizes.obter(pid);
    c.db.sanCaso.push({ id: 'caso-ncm', projeto_id: pid, camada: 'NCM', tipo: 'NCM_INEXISTENTE', situacao: 'REJEITADO', itens: [ids['1']], proposta: {}, motivo: 'Uso interno, sem NCM na compra', justificativa: null, evidencia: [], versao: 2 });
    const t = await c.diretrizes.transformar(pid, { casoId: 'caso-ncm', aspecto: 'FISCAL', nome: 'Fiscal FAL', abrangencia: { todos: true }, destino: 'BIBLIOTECA' }, ADMIN);
    const lib = await c.biblioteca.obter(t.regra.bibliotecaId!);
    expect(lib.conteudo).toMatchObject({ excecoesNcm: [] });
    expect(JSON.stringify(lib)).not.toContain('caso-ncm');
    expect(t.regra).toMatchObject({ situacao: 'RASCUNHO', aplicada: false, alteracoes: { excecoesNcm: [{ alvo: '1', justificativa: 'Uso interno, sem NCM na compra' }] } });
    expect(t.regra.conteudoEfetivo).toMatchObject({ excecoesNcm: [{ alvo: '1' }] });
  });
  it('L01 padrão aponta para os limites oficiais e deriva as linhas do ERP do projeto na leitura; trocar o ERP muda o rascunho, não a análise; cópia antiga continua', async () => {
    const c = montar(); const { pid } = await pronto(c, BASE);
    await c.biblioteca.aplicarCarga();
    const erp = (id: string, nome: string, limite: number) => {
      c.db.erp.push({ id, nome, fabricante: null, produto: null, versoes: [], situacao: 'COMPLETO', ativo: true });
      c.db.erpConhecimento.push({ id: `${id}-d`, erp_id: id, tipo: 'LIMITE_CAMPO', tipo_ajuste: null, chave: 'descricao', texto: `${limite} caracteres`, campo_erp: 'Descr', fonte_url: null, grau: 'CONFIRMADO', ordem: 0, ativo: true });
    };
    erp('erp-a', 'ERP A', 80); erp('erp-b', 'ERP B', 60);
    c.db.sanProjeto[0].erp_id = 'erp-a';
    const l01 = (await c.diretrizes.obter(pid)).regras.find((x) => x.codigo === 'L01')!;
    const linha = c.db.sanDiretrizRegra.find((x) => x.id === l01.id)!;
    expect([linha.biblioteca_id, linha.alteracoes ?? null]).toEqual(['bib-limites-oficiais', null]);
    const doErp = (r: typeof l01) => (r.conteudoEfetivo as { linhas: { origem: string; destino: string; limite: number }[] }).linhas.filter((x) => x.origem === 'ERP').map((x) => [x.destino, x.limite]);
    expect(doErp(l01)).toEqual([['ERP A', 80]]);
    c.db.sanProjeto[0].erp_id = 'erp-b';
    const depois = (await c.diretrizes.obter(pid)).regras.find((x) => x.codigo === 'L01')!;
    expect(doErp(depois)).toEqual([['ERP B', 60]]);
    expect(depois.aplicada).toBe(false); // nada aplicado sozinho
    // Projeto com a L01 em cópia (primeiras versões): fica como está.
    linha.alteracoes = { linhas: [{ destino: 'Cópia', campo: 'x', campoItem: 'descricao', limite: 50, origem: 'ERP', referencia: null, url: null, confirmado: true, tratamento: 'SOLICITAR_REVISAO', preservar: [] }] };
    expect(doErp((await c.diretrizes.obter(pid)).regras.find((x) => x.codigo === 'L01')!)).toEqual([['Cópia', 50]]);
  });
  it('PDF de versão liberada: procedimentos congelados na foto; grupos com espaços repetidos não se duplicam; foto sem procedimentos usa os atuais com nota', async () => {
    const c = montar(); const { pid } = await pronto(c, [item('1', { grupo: 'PARAFUSOS E FIXADORES' }, 1), item('2', { grupo: 'PARAFUSOS  E FIXADORES' }, 2)]);
    await c.diretrizes.obter(pid);
    const v = await c.versoes.criar(pid, { rotulo: 'Entrega' }, USER);
    const { diretrizes } = await c.versoes.diretrizesDaVersao(pid, v.id);
    expect(Array.isArray(diretrizes!.procedimentos)).toBe(true);
    const pol = await c.diretrizes.dadosDaPolitica(pid, v.id);
    expect(pol.quadro.map((q) => q.grupo)).toEqual(['PARAFUSOS E FIXADORES']);
    expect(pol.notaProcedimentos).toBeNull();
    expect(pol.procedimentos).toEqual(diretrizes!.procedimentos);
    // Foto anterior ao congelamento: procedimentos de agora, com nota.
    const foto = JSON.parse(JSON.stringify((await c.versoes.foto(pid, v.id)).foto));
    delete foto.diretrizes.procedimentos;
    const antiga = await c.prisma.sanVersao.create({ data: { projeto_id: pid, numero: 98, rotulo: 'antes do congelamento', usuario: 'x', resumo: {} } });
    await c.prisma.sanVersaoSnapshot.create({ data: { versao_id: antiga.id, itens: 2, dados: await gzipDaFoto(foto) } });
    const velha = await c.diretrizes.dadosPdfPolitica(pid, antiga.id);
    expect(velha.notaProcedimentos).toMatch(/redação vigente/);
    expect(velha.procedimentos.length).toBeGreaterThan(0);
  });
  it('base antiga com a coluna "Subgrupo" como extra: a resolução lê o subgrupo sem reimportar e a reimportação não acusa diferença falsa', async () => {
    const c = montar(); const { pid, ids } = await pronto(c, [item('1', { descricao: 'abc', campos: { Subgrupo: 'S1' } }, 1), item('2', { descricao: 'abc', campos: { Subgrupo: 'S2' } }, 2)]);
    expect((await c.diretrizes.obter(pid)).grupos).toEqual([{ grupo: 'G1', subgrupos: ['S1', 'S2'], itens: 2 }]);
    const r = await c.diretrizes.criarRegra(pid, { aspecto: 'NOMES', nome: 'S1', abrangencia: { todos: false, grupos: ['G1'], subgrupos: ['S1'] }, alteracoes: { capitalizacao: 'MAIUSCULAS' } }, USER);
    await c.diretrizes.aplicar(r.id, { versao: r.versao }, USER);
    expect(c.db.sanCaso.filter((x) => x.tipo === 'DESCRICAO_FORA_PADRAO').map((x) => x.itens)).toEqual([[ids['1']]]);
    // Reimportação com o subgrupo mapeado (campos.subgrupo): mesmo valor = sem diferença; valor novo = diferença só em "subgrupo".
    c.fila.itens = [item('1', { descricao: 'abc', campos: { subgrupo: 'S1' } }, 1), item('2', { descricao: 'abc', campos: { subgrupo: 'S9' } }, 2)];
    const pv = await c.importacao.previa(pid, ARQ);
    expect(pv.diferencas.map((x) => [x.codigo, x.campos.map((y) => [y.campo, y.antes, y.depois])])).toEqual([['2', [['subgrupo', 'S2', 'S9']]]]);
  });
});
