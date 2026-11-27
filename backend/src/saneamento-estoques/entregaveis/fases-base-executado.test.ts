/**
 * Entregáveis por fase (docs/saneamento-fases.md): a entrega da Fase 1 sem a parte tributária; a base completa antes × depois no Cadastro
 * saneado (todas as colunas do ERP, célula alterada pintada, camada que alterou); e a marca "Executado no ERP" das ações do mapa.
 */
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { PdfService } from '../../pdf/pdf.service';
import { decidirAcesso } from '../../permissoes/permissoes';
import { PERMISSAO_KEY } from '../../permissoes/permissao.decorator';
import type { ResultadoCamada } from '../tipos';
import { SanCasosService } from '../dados/casos.service';
import { SanImportacaoService } from '../dados/importacao.service';
import type { DadosEntrega, ImportadorPort, ItemImportado } from '../dados/portas';
import { criarPrismaFalso } from '../dados/prisma-falso';
import { SanProjetoService } from '../dados/projeto.service';
import { EntregaveisController } from './entregaveis.controller';
import { EntregaveisService, faseDoFiltro } from './entregaveis.service';
import { NOMES_ABAS_FASE1, VERDE_CLARO, gerarExcelDeDados, gerarExcelMapa } from './excel';
import { cel, dadosBase, VERSAO, type Linha } from './__fixtures__/dados';
import { TEXTO_FASE2_SEPARADA, construirModelo, origemDaFinalidade } from './modelo';
import { montarRelatorio } from './relatorio';

const USER = { email: 'consultor@fal.test' };
async function abrir(buf: Buffer) { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf as never); return wb; }
const cabecalhos = (ws: ExcelJS.Worksheet) => (ws.getRow(1).values as unknown[]).slice(1).map(String);
const coluna = (ws: ExcelJS.Worksheet, nome: string) => cabecalhos(ws).indexOf(nome) + 1;
const valores = (ws: ExcelJS.Worksheet, nome: string) => { const c = coluna(ws, nome); const r: unknown[] = []; for (let i = 2; i <= ws.rowCount; i++) r.push(ws.getRow(i).getCell(c).value); return r; };
const textoDaAba = (ws: ExcelJS.Worksheet) => { const t: string[] = []; ws.eachRow((r) => r.eachCell((c) => t.push(String(c.value ?? '')))); return t.join('\n'); };
const fundo = (c: ExcelJS.Cell) => (c.fill as { fgColor?: { argb?: string } } | undefined)?.fgColor?.argb;
const textoDoPdf = (d: DadosEntrega) => JSON.stringify(montarRelatorio(d));

describe('entrega da Fase 1: sem a parte tributária', () => {
  it('Excel liberado da Fase 1: sem a aba de cenários, sem finalidade, sem as camadas tributárias e sem impactos de tratamento; uma linha diz que a Fase 2 vem em separado', async () => {
    const wb = await abrir(await gerarExcelDeDados({ ...dadosBase(true), fase: 'FASE1' }));
    expect(wb.worksheets.map((w) => w.name)).toEqual([...NOMES_ABAS_FASE1]);
    const resumo = textoDaAba(wb.getWorksheet('Resumo da entrega')!);
    expect(resumo).toContain(TEXTO_FASE2_SEPARADA);
    for (const x of ['Cenários tributários', 'Atividades confirmadas por', 'Tratamento tributário', 'foco em IBS e CBS']) expect(resumo, x).not.toContain(x);
    const cad = wb.getWorksheet('Cadastro saneado')!;
    for (const x of ['Finalidade', 'Origem da finalidade', 'Também usado como', 'Tratamento tributário', 'cClassTrib', 'cClassTrib (como ficou)', 'CST', 'Enquadramento legal', 'Artigo']) expect(cabecalhos(cad), x).not.toContain(x);
    // A decisão tributária não conta como campo alterado nem como camada que alterou.
    expect(valores(cad, 'Campos alterados')[0]).toBe('Descrição');
    expect(valores(cad, 'Camada que alterou')[0]).toBe('Nomes e unidades');
    // Impactos: só os do saneamento (a linha do caso tributário c-trib2 sai).
    const imp = wb.getWorksheet('Impactos no SPED')!;
    expect(valores(imp, 'Registro')).toEqual(['0200']);
    // Pendências e histórico: sem o caso tributário e sem a decisão do cClassTrib.
    const pend = textoDaAba(wb.getWorksheet('Pendências e histórico')!);
    expect(pend).not.toContain('Tratamento tributário');
    expect(pend).not.toContain('cClassTrib');
  });

  it('Excel para revisão com fase=FASE1 também omite a parte tributária; sem fase (versão antiga), tudo como antes', async () => {
    const rev = await abrir(await gerarExcelDeDados({ ...dadosBase(false), fase: 'FASE1' }));
    expect(rev.worksheets.map((w) => w.name)).not.toContain('Cenários tributários');
    expect(cabecalhos(rev.getWorksheet('Cadastro saneado')!)).not.toContain('Finalidade');
    expect(String(valores(rev.getWorksheet('Cadastro saneado')!, 'Propostas não aprovadas')[1] ?? '')).not.toContain('cClassTrib');
    const antiga = await abrir(await gerarExcelDeDados(dadosBase(true)));
    expect(antiga.worksheets.map((w) => w.name)).toContain('Cenários tributários');
    expect(cabecalhos(antiga.getWorksheet('Cadastro saneado')!)).toContain('Finalidade');
    expect(textoDaAba(antiga.getWorksheet('Resumo da entrega')!)).not.toContain(TEXTO_FASE2_SEPARADA);
  });

  it('relatório PDF da Fase 1: sem finalidade, enquadramento nem cenários, com a linha da Fase 2 em separado', () => {
    const fase1 = textoDoPdf({ ...dadosBase(true), fase: 'FASE1' });
    expect(fase1).toContain(TEXTO_FASE2_SEPARADA);
    for (const x of ['Finalidade definida', 'Enquadramento tributário', 'cenários tributários', 'Tratamento tributário', 'sem finalidade confirmada', 'tratamento tributário dos itens']) expect(fase1, x).not.toContain(x);
    const antigo = textoDoPdf(dadosBase(true));
    expect(antigo).toContain('Finalidade definida');
    expect(antigo).not.toContain(TEXTO_FASE2_SEPARADA);
  });

  it('a fase vem da versão (resumo.fase); na revisão, do filtro (só FASE1 ou FASE2)', async () => {
    const d = dadosBase(true);
    const versoes = { exportar: async () => ({ ...d }), exportarAtual: async () => ({ ...dadosBase(false) }) };
    const prisma = { sanVersao: { findFirst: async () => ({ resumo: { fase: 'FASE1', itens: 3 } }) }, empresa: { findUnique: async () => null }, projetoDiagnostico: { findUnique: async () => null }, sanProjeto: { findUnique: async () => ({ erp_id: null }) } };
    const svc = new EntregaveisService(new PdfService(), versoes as never, prisma as never);
    expect((await svc.dados('P1', 'V1')).fase).toBe('FASE1');
    expect((await svc.dados('P1')).fase).toBeNull();
    expect((await svc.dados('P1', undefined, 'FASE1')).fase).toBe('FASE1');
    const ctrl = new EntregaveisController(svc);
    const arq = await ctrl.excel('P1', undefined, 'FASE1');
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(arq.getStream().read() as never);
    expect(wb.worksheets.map((w) => w.name)).not.toContain('Cenários tributários');
    expect(() => faseDoFiltro('FASE3')).toThrow('Fase inválida');
    expect(faseDoFiltro('')).toBeNull();
    // Versão antiga (resumo sem fase): tudo.
    prisma.sanVersao.findFirst = async () => ({ resumo: { itens: 3 } });
    expect((await svc.dados('P1', 'V1')).fase).toBeNull();
  });

  it('leitores aceitam a finalidade da camada nova (FINALIDADE) e a reclassificação de NCM da camada nova como da Fase 2', () => {
    const d = dadosBase(true);
    d.casos.push({ id: 'c-fin', camada: 'FINALIDADE', tipo: 'FINALIDADE_GRUPO', itens: ['i2'], problema: 'Finalidade do grupo', evidencia: [], atual: {}, proposta: { finalidade: 'REVENDA' }, justificativa: 'Grupo de revenda', fundamento: null, situacao: 'APROVADO', decidido_por: 'ana', decidido_em: new Date('2026-11-12T12:00:00Z'), createdAt: new Date('2026-11-09T12:00:00Z') });
    d.casos.push({ id: 'c-ncmc', camada: 'NCM_CLASSIFICACAO', tipo: 'NCM_INCOMPATIVEL_DESCRICAO', itens: ['i3'], problema: 'NCM incompatível', evidencia: [], atual: {}, proposta: {}, justificativa: 'Conferir', fundamento: null, situacao: 'PROPOSTO', createdAt: new Date('2026-11-09T12:00:00Z') });
    for (const id of ['i1', 'i2', 'i3']) { d.celulas.push(cel(id, 'FINALIDADE', 'APROVADO')); d.celulas.push(cel(id, 'NCM_CLASSIFICACAO', 'PENDENTE')); }
    const m = construirModelo(d);
    expect(origemDaFinalidade(m, m.porId.get('i2')!)).toBe('Informada pelo cliente, confirmada no grupo');
    const m1 = construirModelo({ ...d, fase: 'FASE1' });
    expect(m1.casos.map((c) => c.id)).not.toContain('c-fin');
    expect(m1.casos.map((c) => c.id)).not.toContain('c-ncmc');
    expect(m1.camadas as string[]).not.toContain('FINALIDADE');
    expect(m1.camadas as string[]).not.toContain('NCM_CLASSIFICACAO');
    // Foto antiga (sem as células novas): as camadas novas não aparecem.
    expect(construirModelo(dadosBase(true)).camadas as string[]).not.toContain('FINALIDADE');
  });
});

describe('base completa antes × depois', () => {
  const comBase = (liberada: boolean): DadosEntrega => {
    const d = dadosBase(liberada);
    // Colunas do ERP que o saneamento não usa (campos adicionais) e uma unidade trocada pela camada Nomes e unidades.
    for (const [k, it] of d.itens.entries()) { const t = it.trabalho as Linha; t.campos = { ...(t.campos as Linha), 'Cor': ['azul', 'verde', ''][k], 'Peso bruto': [1.5, 2, 3][k] }; }
    (d.itens[1].trabalho as Linha).unidade = 'SC';
    d.decisoes.push({ id: 'd3', projeto_id: 'P1', item_id: 'i2', caso_id: 'c-desc', campo: 'unidade', antes: 'KG', depois: 'SC', fundamento: 'Unidade', usuario: 'ana@fal.test', tipo: 'aprovar', quando: new Date('2026-11-10T13:00:00Z') });
    // Reimportação não é ajuste do saneamento: não vira "como era".
    d.decisoes.push({ id: 'd4', projeto_id: 'P1', item_id: 'i3', caso_id: null, campo: 'campos.Cor', antes: 'roxo', depois: '', fundamento: 'Reimportação', usuario: 'ana@fal.test', tipo: 'importar', quando: new Date('2026-11-10T14:00:00Z') });
    return d;
  };

  it('todas as colunas do ERP (também as que o saneamento não usa), par como era × como ficou só nas colunas alteradas, célula alterada em verde suave e a camada que alterou', async () => {
    const wb = await abrir(await gerarExcelDeDados(comBase(false)));
    const ws = wb.getWorksheet('Cadastro saneado')!;
    const cab = cabecalhos(ws);
    expect(cab).toEqual(expect.arrayContaining(['Cor', 'Peso bruto', 'Unidade (como era)', 'Unidade (como ficou)', 'Descrição (como era)', 'Descrição (como ficou)', 'NCM', 'Grupo', 'Camada que alterou']));
    expect(cab).not.toContain('Unidade');
    expect(cab).not.toContain('Cor (como era)');
    expect(cab.indexOf('Unidade (como ficou)')).toBe(cab.indexOf('Unidade (como era)') + 1);
    expect(valores(ws, 'Cor')).toEqual(['azul', 'verde', null]);
    expect(valores(ws, 'Peso bruto')).toEqual([1.5, 2, 3]);
    expect(valores(ws, 'Unidade (como era)')).toEqual(['KG', 'KG', 'KG']);
    expect(valores(ws, 'Unidade (como ficou)')).toEqual(['KG', 'SC', 'KG']);
    // Pintura: só a célula "como ficou" do item alterado.
    expect(fundo(ws.getRow(3).getCell(coluna(ws, 'Unidade (como ficou)')))).toBe(VERDE_CLARO);
    expect(fundo(ws.getRow(2).getCell(coluna(ws, 'Unidade (como ficou)')))).not.toBe(VERDE_CLARO);
    expect(fundo(ws.getRow(2).getCell(coluna(ws, 'Descrição (como ficou)')))).toBe(VERDE_CLARO);
    expect(fundo(ws.getRow(2).getCell(coluna(ws, 'Descrição (como era)')))).toBeUndefined();
    expect(valores(ws, 'Camada que alterou')).toEqual(['Nomes e unidades, Tratamento tributário', 'Nomes e unidades', null]);
    // Arial (Padrão FAL) no cabeçalho e nos dados.
    expect(ws.getRow(1).getCell(1).font?.name).toBe('Arial');
    expect(ws.getRow(2).getCell(1).font?.name).toBe('Arial');
  });

  it('itens unificados e inativados continuam na base, com a situação e o código de destino', async () => {
    const d = comBase(true);
    d.casos.push({ id: 'c-inat', projeto_id: 'P1', camada: 'QUALIDADE', tipo: 'SEM_MOVIMENTACAO', itens: ['i3'], problema: 'Sem movimento', evidencia: [], atual: {}, proposta: { decisao: 'PROPOR_INATIVACAO', ativo: false }, justificativa: 'Parado', fundamento: null, situacao: 'APROVADO', decidido_por: 'ana', decidido_em: new Date('2026-11-11T12:00:00Z'), createdAt: new Date('2026-11-09T12:00:00Z') });
    (d.itens[2].trabalho as Linha).saldo = 0;
    d.projeto = { ...d.projeto, parametros: { acoesExecutadas: { 'c-dup|000456|': { em: '2026-11-15T12:00:00.000Z', por: 'Ana' } } } };
    const ws = (await abrir(await gerarExcelDeDados(d))).getWorksheet('Cadastro saneado')!;
    expect(valores(ws, 'Código')).toEqual(['00123', '000456', '0789']);
    expect(valores(ws, 'Situação do item')).toEqual(['Ativo', 'Unificado em outro código — executado no ERP', 'Inativado']);
    expect(valores(ws, 'Código de destino')).toEqual([null, '00123', null]);
    expect(ws.getRow(3).getCell(coluna(ws, 'Código de destino')).numFmt).toBe('@');
  });

  // Medido em 27/11/2026 com a máquina a 100% de CPU (outros processos): ~12 s de CPU e ~18 s de relógio para 30 mil itens × 48 colunas e
  // as demais abas, o mesmo custo de escrever 30 mil × 45 células de texto puras no ExcelJS. O limite abaixo é folgado para a máquina carregada.
  it('desempenho: 30 mil itens × 40 colunas do ERP em fluxo, no custo da escrita pura do ExcelJS', async () => {
    const N = 30_000; const EXTRAS = 28;
    const itens: Linha[] = []; const celulas: Linha[] = []; const decisoes: Linha[] = [];
    for (let i = 0; i < N; i++) {
      const campos: Linha = {}; for (let k = 0; k < EXTRAS; k++) campos[`Coluna ERP ${k + 1}`] = k % 3 ? `valor ${i}-${k}` : i * k;
      const id = `i${i}`;
      itens.push({ id, codigo: String(i).padStart(6, '0'), estabelecimento: '', grupo: `G${i % 50}`, finalidade: null, ativo: true, trabalho: { descricao: `ITEM ${i}`, unidade: i % 7 ? 'UN' : 'CX', ncm: '73181500', grupo: `G${i % 50}`, ativo: true, saldo: i % 13, ultimaMovimentacao: '2026-01-10', fabricante: 'FAB', referencia: `R${i}`, campos } });
      for (const c of ['IDENTIFICACAO', 'QUALIDADE', 'DUPLICIDADE', 'GRUPOS_FINALIDADE', 'NOMES_UNIDADES', 'NCM', 'OBRIGACOES']) celulas.push({ item_id: id, camada: c, situacao: 'SEM_PROBLEMA', revisar: false, caso_id: null });
      if (i % 3 === 0) decisoes.push({ item_id: id, caso_id: 'c-n', campo: 'descricao', antes: `ITEM ${i} ANTIGO`, depois: `ITEM ${i}`, usuario: 'ana', tipo: 'aprovar', quando: new Date('2026-11-10T12:00:00Z') });
    }
    const d: DadosEntrega = {
      projeto: { id: 'P', data_base: '2026-12-31', modulos: {}, parametros: {} }, versao: VERSAO, liberada: true, fase: 'FASE1', itens, celulas,
      casos: [{ id: 'c-n', camada: 'NOMES_UNIDADES', tipo: 'DESCRICAO_FORA_DO_PADRAO', itens: [], situacao: 'APROVADO' }], decisoes, impactosSped: [], vinculos: [], importacoes: [],
    };
    const t0 = performance.now(); const c0 = process.cpuUsage();
    const buf = await gerarExcelDeDados(d, { consumir: true });
    const ms = performance.now() - t0; const cpu = process.cpuUsage(c0); const cpuMs = (cpu.user + cpu.system) / 1000;
    console.log(`[desempenho] base antes × depois: ${N} itens × ${12 + EXTRAS} colunas do ERP em ${Math.round(ms)} ms (CPU ${Math.round(cpuMs)} ms, ${(buf.length / 1024 / 1024).toFixed(1)} MB)`);
    expect(buf.length).toBeGreaterThan(1000);
    expect(cpuMs).toBeLessThan(40_000);
  }, 120_000);
});

// ── Executado no ERP ──

const item = (codigo: string, extra: Partial<ItemImportado> = {}, linha = 1): ItemImportado => ({
  codigo, estabelecimento: null, descricao: `PARAFUSO SEXTAVADO ${codigo}`, unidade: 'UN', ncm: '73181500', grupo: 'Ferragens', ativo: true, saldo: 0,
  ultimaMovimentacao: '2026-10-01', fabricante: null, referencia: null, finalidade: null, campos: {}, linha, ...extra,
});
async function montar() {
  const { prisma, db } = criarPrismaFalso({
    projetoDiagnostico: [{ id: 'D1', servico_consultoria: 'saneamento-estoques', empresa_ids: ['E1'], periodo_inicio: new Date('2026-12-31T00:00:00Z'), responsavel: 'Ana' }, { id: 'D2', servico_consultoria: 'saneamento-estoques', empresa_ids: ['E1'], periodo_inicio: new Date('2026-12-31T00:00:00Z'), responsavel: 'Ana' }],
    empresa: [{ id: 'E1', razao_social: 'Agropecuária Teste Ltda', erp: 'SAP B1', erp_versao: '10', cnae_principal: '4683400', cnae_descricao: 'Comércio', cnaes_secundarios: [], dados_publicos_em: new Date('2026-10-01T00:00:00Z') }],
  });
  const fila: { itens: ItemImportado[] } = { itens: [] };
  const importador: ImportadorPort = { ler: async () => ({ itens: fila.itens, mapeamento: { codigo: 'Código' }, relatorio: { aceitas: fila.itens.length, rejeitadas: 0, pendentes: 0, linhasRejeitadas: [], linhasPendentes: [] } }) };
  const projetos = new SanProjetoService(prisma as never);
  const casos = new SanCasosService(prisma as never, projetos);
  const importacao = new SanImportacaoService(prisma as never, projetos, importador);
  const entregas = new EntregaveisService(new PdfService(), {} as never, prisma as never);
  const p = await projetos.criar('D1', USER);
  await projetos.confirmarAtividades(p.id, 1, USER);
  fila.itens = [item('100', { saldo: 5 }, 1), item('200', { saldo: 2 }, 2), item('300', {}, 3)];
  await importacao.confirmar(p.id, { buffer: Buffer.from('x'), nome: 'cadastro.xlsx' }, undefined, [], USER);
  const id = Object.fromEntries(db.sanItem.map((i) => [i.codigo, i.id]));
  const dup: ResultadoCamada = { camada: 'DUPLICIDADE', analisados: 3, semDados: null, semProblema: [], casos: [
    { camada: 'DUPLICIDADE', tipo: 'DUPLICIDADE_EXATA', itens: [id['100'], id['200']], problema: 'Duplicados', evidencia: [], atual: {}, proposta: { decisao: 'PROPOR_CONSOLIDACAO', manter: '100', consolidar: '200' }, justificativa: 'Mesmo produto.', fundamento: null, impactos: [], origem: 'REGRA', afeta: ['OBRIGACOES'] },
    { camada: 'DUPLICIDADE', tipo: 'APRESENTACOES_DISTINTAS', itens: [id['100'], id['300']], problema: 'Apresentações', evidencia: [], atual: {}, proposta: { decisao: 'RELACIONAR_APRESENTACOES', fatorConversao: 12 }, justificativa: 'Caixa e unidade.', fundamento: null, impactos: [], origem: 'REGRA', afeta: [] },
  ] };
  await casos.registrarResultado(p.id, dup);
  return { prisma, db, projetos, casos, entregas, p, id };
}

describe('ações no ERP: marca "Executado no ERP"', () => {
  it('marca e desmarca a linha aprovada (quem e quando), conta "X de Y executadas" por lista e leva a coluna ao Excel do mapa', async () => {
    const c = await montar();
    const unif = c.db.sanCaso.find((x) => x.tipo === 'DUPLICIDADE_EXATA')!;
    let tela = await c.entregas.unificacoes(c.p.id);
    const linha = tela.linhas.find((l) => l.tipo === 'UNIFICACAO')!;
    expect(linha.chave).toBe(`${unif.id}|200|`);
    expect(linha.executado).toBeNull();
    // Proposta ainda não aprovada: não pode ser marcada.
    await expect(c.entregas.marcarExecutada(c.p.id, linha.chave, USER)).rejects.toThrow('Só a ação aprovada');
    expect(tela.executadasPorLista.UNIFICACOES).toEqual({ executadas: 0, total: 0 });

    await c.casos.aprovar(unif.id, { versao: unif.versao }, USER);
    const versaoAntes = c.db.sanProjeto[0].versao;
    const r = await c.entregas.marcarExecutada(c.p.id, linha.chave, USER);
    expect(r.executado.por).toBe('consultor@fal.test');
    expect(Number.isNaN(Date.parse(r.executado.em))).toBe(false);
    // Guardado nos parâmetros do projeto, sem mexer na versão do projeto (a Configuração não recebe conflito).
    expect((c.db.sanProjeto[0].parametros as Linha).acoesExecutadas).toEqual({ [linha.chave]: r.executado });
    expect(c.db.sanProjeto[0].versao).toBe(versaoAntes);
    // A tela do projeto não recebe a lista de marcas (pode ter milhares de linhas).
    expect((await c.projetos.obter(c.p.id)).parametros).not.toHaveProperty('acoesExecutadas');
    tela = await c.entregas.unificacoes(c.p.id);
    expect(tela.linhas.find((l) => l.chave === linha.chave)!.executado).toMatchObject({ por: 'consultor@fal.test' });
    expect(tela.executadasPorLista.UNIFICACOES).toEqual({ executadas: 1, total: 1 });
    expect(tela.executadasPorLista.EQUIVALENCIAS).toEqual({ executadas: 0, total: 0 });

    // Excel do mapa: Executado no ERP, em e por.
    const { buffer } = await c.entregas.excelUnificacoes(c.p.id, {});
    const ws = (await abrir(buffer)).getWorksheet('Unificações')!;
    expect(valores(ws, 'Executado no ERP')).toEqual(['Sim']);
    expect(valores(ws, 'Executado por')).toEqual(['consultor@fal.test']);
    expect(valores(ws, 'Executado em')[0]).toBeInstanceOf(Date);

    // Configurar o projeto depois não apaga a marca.
    await c.projetos.configurar(c.p.id, { versao: c.db.sanProjeto[0].versao, parametros: { corteMovimentacao: '2025-01-01' } });
    expect(Object.keys((c.db.sanProjeto[0].parametros as Linha).acoesExecutadas as Linha)).toEqual([linha.chave]);

    await c.entregas.desmarcarExecutada(c.p.id, linha.chave);
    expect((await c.entregas.unificacoes(c.p.id)).executadasPorLista.UNIFICACOES).toEqual({ executadas: 0, total: 1 });
  });

  it('valida: chave vazia, caso de outro projeto, caso fora do mapa e troca de código inexistente', async () => {
    const c = await montar();
    await expect(c.entregas.marcarExecutada(c.p.id, '', USER)).rejects.toThrow('Informe a linha do mapa');
    await expect(c.entregas.marcarExecutada(c.p.id, 'nao-existe|200|', USER)).rejects.toThrow('não pertence ao mapa');
    await expect(c.entregas.marcarExecutada(c.p.id, 'vinculo|1|2', USER)).rejects.toThrow('não pertence a este projeto');
    await expect(c.entregas.marcarExecutada(c.p.id, 'a|b', USER)).rejects.toThrow('Linha do mapa inválida');
    await expect(c.entregas.marcarExecutada('outro-projeto', 'x', USER)).rejects.toThrow('Projeto de saneamento não encontrado');
    // Caso de outro projeto.
    const outro = await c.projetos.criar('D2', USER);
    const unif = c.db.sanCaso.find((x) => x.tipo === 'DUPLICIDADE_EXATA')!;
    await c.casos.aprovar(unif.id, { versao: unif.versao }, USER);
    await expect(c.entregas.marcarExecutada(outro.id, `${unif.id}|200|`, USER)).rejects.toThrow('não pertence ao mapa');
    // Caso de camada que não está no mapa.
    c.db.sanCaso.push({ ...unif, id: 'c-nomes', camada: 'NOMES_UNIDADES', chave: 'x' });
    await expect(c.entregas.marcarExecutada(c.p.id, 'c-nomes', USER)).rejects.toThrow('não pertence ao mapa');
  });

  it('rotas: marcar exige "Alterar dados"; desmarcar também (e não "Excluir registros")', async () => {
    const somenteVer = { role: 'user', permissoes: { telas: ['carteira-diagnostico'], funcoes: [] } } as never;
    const consultor = { role: 'user', permissoes: { telas: ['carteira-diagnostico'], funcoes: ['alterar'] } } as never;
    const rota = 'saneamento-estoques/projetos/:id/unificacoes/executadas';
    expect(decidirAcesso(somenteVer, { metodo: 'POST', rota }).ok).toBe(false);
    expect(decidirAcesso(consultor, { metodo: 'POST', rota }).ok).toBe(true);
    const funcoes = Reflect.getMetadata(PERMISSAO_KEY, EntregaveisController.prototype.desmarcarExecutada) as never;
    expect(funcoes).toEqual(['alterar']);
    expect(decidirAcesso(consultor, { metodo: 'DELETE', rota, funcoes }).ok).toBe(true);
    expect(decidirAcesso(somenteVer, { metodo: 'DELETE', rota, funcoes }).ok).toBe(false);
    // Pelo controller.
    const c = await montar();
    const unif = c.db.sanCaso.find((x) => x.tipo === 'DUPLICIDADE_EXATA')!;
    await c.casos.aprovar(unif.id, { versao: unif.versao }, USER);
    const ctrl = new EntregaveisController(c.entregas);
    expect((await ctrl.marcarExecutada(USER as never, c.p.id, { chave: `${unif.id}|200|` })).executado.por).toBe('consultor@fal.test');
    expect((await ctrl.desmarcarExecutada(c.p.id, `${unif.id}|200|`)).executado).toBeNull();
  });

  it('Excel do mapa: "Não" na linha aprovada sem marca e vazio na proposta', async () => {
    const buf = await gerarExcelMapa([
      { tipo: 'INATIVACAO', situacao: 'APROVADA', casoId: 'c1', origem: 'QUALIDADE', rotuloTipo: 'Inativação (sem movimentação)', morre: { codigo: '1', estab: '', descricao: 'A', unidade: 'UN', saldo: 0 }, fica: null, saldoEntra: null, saldoConsolidado: null, acao: 'Inativar 1', inicio: null, justificativa: '', alertas: [], responsavel: '', decididoEm: null, chave: 'c1|1|', executado: null },
      { tipo: 'INATIVACAO', situacao: 'PROPOSTA', casoId: 'c2', origem: 'QUALIDADE', rotuloTipo: 'Inativação (sem movimentação)', morre: { codigo: '2', estab: '', descricao: 'B', unidade: 'UN', saldo: 0 }, fica: null, saldoEntra: null, saldoConsolidado: null, acao: 'Inativar 2', inicio: null, justificativa: '', alertas: [], responsavel: '', decididoEm: null, chave: 'c2|2|', executado: null },
    ]);
    const ws = (await abrir(buf)).getWorksheet('Inativações')!;
    expect(valores(ws, 'Executado no ERP')).toEqual(['Não', null]);
  });
});
