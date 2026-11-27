import ExcelJS from 'exceljs';
import { describe, expect, it, vi } from 'vitest';
import { PdfService } from '../../pdf/pdf.service';
import type { ResultadoCamada } from '../tipos';
import { SanCasosService } from '../dados/casos.service';
import { SanImportacaoService } from '../dados/importacao.service';
import { MotorSaneamento } from '../dados/motor.provider';
import { SanOrquestracaoService } from '../dados/orquestracao.service';
import type { ImportadorPort, ItemImportado } from '../dados/portas';
import { criarPrismaFalso } from '../dados/prisma-falso';
import { SanProjetoService } from '../dados/projeto.service';
import { EntregaveisController } from './entregaveis.controller';
import { EntregaveisService } from './entregaveis.service';
import { gerarExcelMapa, gerarExcelDeDados, notaDaEscala } from './excel';
import { escalaDaBase } from '../motor/conjuntos';
import { dadosBase } from './__fixtures__/dados';
import { construirModelo, mapaDoModelo } from './modelo';
import { montarRelatorio } from './relatorio';
import { conflitosDoMapa, contarMapa, conversaoDoSaldo, filtrarMapa, montarMapa, type CasoMapa, type ItemMapa } from './unificacoes';

const USER = { email: 'consultor@fal.test' };
const it_ = (id: string, codigo: string, o: Partial<ItemMapa> = {}): ItemMapa => ({ id, codigo, estab: '', descricao: `ITEM ${codigo}`, unidade: 'KG', saldo: 0, ...o });
const caso = (o: Partial<CasoMapa>): CasoMapa => ({ id: 'c1', camada: 'DUPLICIDADE', tipo: 'DUPLICIDADE_EXATA', itens: [], proposta: {}, justificativa: 'Mesmo produto.', motivo: '', situacao: 'APROVADO', decididoPor: 'ana@fal.test', decididoEm: new Date('2026-11-20T12:00:00Z'), ...o });
const mapa = (itens: ItemMapa[], casos: CasoMapa[], liberada = false, vinculos: Parameters<typeof montarMapa>[0]['vinculos'] = []) => {
  const porId = new Map(itens.map((i) => [i.id, i]));
  return montarMapa({ liberada, dataBase: new Date('2026-12-31T00:00:00Z'), casos, item: (id) => porId.get(id), vinculos });
};

describe('mapa de unificações (puro)', () => {
  it('por item que morre: o que fica, saldo atual, saldo que entra, consolidado por estabelecimento e ação no ERP', () => {
    const itens = [it_('a', '100', { saldo: 10 }), it_('b', '200', { saldo: 4 }), it_('c', '300', { saldo: 0 })];
    const l = mapa(itens, [caso({ itens: ['a', 'b', 'c'], proposta: { decisao: 'PROPOR_CONSOLIDACAO', manter: '100', consolidar: '200 | 300' } })]);
    expect(l.map((x) => [x.tipo, x.morre?.codigo, x.fica?.codigo, x.fica?.saldo, x.saldoEntra, x.saldoConsolidado, x.situacao])).toEqual([
      ['UNIFICACAO', '200', '100', 10, 4, 14, 'APROVADA'], ['UNIFICACAO', '300', '100', 10, 0, 14, 'APROVADA'],
    ]);
    expect(l[0].acao).toBe('Transferir o saldo de 200 para 100 e inativar 200');
    // Sem saldo no código que sai: só inativar (sem saída e entrada de mercadoria).
    expect(l[1].acao).toBe('Inativar o código que sai (300): sem saldo a transferir para 100');
    expect(l[0].inicio?.toISOString().slice(0, 10)).toBe('2026-12-31'); // sem vínculo com data: a data-base
  });

  it('unidades diferentes: sem fator aprovado não soma (converter antes); com fator, converte', () => {
    const itens = [it_('a', '100', { saldo: 10, unidade: 'KG' }), it_('b', '200', { saldo: 3, unidade: 'SC' })];
    const sem = mapa(itens, [caso({ itens: ['a', 'b'], proposta: { decisao: 'PROPOR_CONSOLIDACAO', manter: '100', consolidar: '200' } })])[0];
    expect([sem.saldoEntra, sem.saldoConsolidado]).toEqual([null, null]);
    expect(sem.alertas.join(' ')).toContain('Unidades diferentes (SC × KG): saldo não somável direto; converter antes de somar');
    expect(sem.acao).toContain('Converter o saldo de 200 para a unidade de 100 (KG)');
    const com = mapa(itens, [caso({ itens: ['a', 'b'], proposta: { decisao: 'PROPOR_CONSOLIDACAO', manter: '100', consolidar: '200', fatorConversao: 50, fatorDe: 'SC', fatorPara: 'KG' } })])[0];
    expect([com.saldoEntra, com.saldoConsolidado]).toEqual([150, 160]);
    expect(com.alertas.join(' ')).toContain('saldo convertido pelo fator aprovado (1 SC = 50 KG)');
    // Grafias da mesma unidade não são unidades diferentes.
    const kg = mapa([it_('a', '100', { saldo: 1, unidade: 'KG' }), it_('b', '200', { saldo: 2, unidade: 'kg.' })], [caso({ itens: ['a', 'b'], proposta: { decisao: 'PROPOR_CONSOLIDACAO', manter: '100', consolidar: '200' } })])[0];
    expect([kg.saldoEntra, kg.saldoConsolidado, kg.alertas]).toEqual([2, 3, []]);
  });

  it('coerência: saldo que falta, código que fica ausente no estabelecimento, código que morre fora da base', () => {
    const itens = [it_('a', '100', { saldo: 5, estab: 'M' }), it_('b', '200', { saldo: null, estab: 'M' }), it_('c', '200', { saldo: 2, estab: 'F' })];
    const l = mapa(itens, [caso({ itens: ['a', 'b', 'c'], proposta: { decisao: 'PROPOR_CONSOLIDACAO', manter: '100', consolidar: '200|999' } })]);
    const m = l.find((x) => x.morre?.estab === 'M')!; const f = l.find((x) => x.morre?.estab === 'F')!; const fora = l.find((x) => x.morre?.codigo === '999')!;
    expect(m.alertas.join(' ')).toContain('Saldo de 200 não informado na base');
    expect(m.saldoConsolidado).toBeNull();
    expect(m.acao).toContain('Conferir o saldo de 200 no ERP');
    expect(f.alertas.join(' ')).toContain('não está cadastrado no estabelecimento F');
    expect(f.fica?.saldo).toBeNull();
    expect(fora.alertas).toEqual(['O código que sai (999) não foi encontrado na base.']);
  });

  it('situação: liberada só aprovadas; revisão traz propostas e aguardando; rejeitado e obsoleto nunca', () => {
    const itens = [it_('a', '100'), it_('b', '200'), it_('c', '300'), it_('d', '400')];
    const casos = [
      caso({ id: 'c1', itens: ['a', 'b'], proposta: { decisao: 'PROPOR_CONSOLIDACAO', manter: '100', consolidar: '200' }, situacao: 'PROPOSTO' }),
      caso({ id: 'c2', itens: ['c'], camada: 'QUALIDADE', tipo: 'SEM_MOVIMENTACAO', proposta: { decisao: 'PROPOR_INATIVACAO', ativo: false }, situacao: 'APROVADO' }),
      caso({ id: 'c3', itens: ['d'], camada: 'QUALIDADE', tipo: 'SEM_MOVIMENTACAO', proposta: { decisao: 'PROPOR_INATIVACAO', ativo: false }, situacao: 'REJEITADO' }),
      caso({ id: 'c4', itens: ['a', 'd'], proposta: { decisao: 'PROPOR_CONSOLIDACAO', manter: '100', consolidar: '400' }, situacao: 'OBSOLETO' }),
    ];
    expect(mapa(itens, casos, true).map((l) => [l.tipo, l.morre?.codigo, l.situacao, l.acao])).toEqual([['INATIVACAO', '300', 'APROVADA', 'Inativar 300']]);
    expect(mapa(itens, casos).map((l) => [l.tipo, l.situacao])).toEqual([['UNIFICACAO', 'PROPOSTA'], ['INATIVACAO', 'APROVADA']]);
  });

  it('inativação com saldo (mudou depois da proposta) pede regularizar; vínculos que não vêm de unificação viram troca de código, sem etiqueta interna', () => {
    const l = mapa([it_('a', '100', { saldo: 3 })], [caso({ itens: ['a'], camada: 'QUALIDADE', tipo: 'SEM_MOVIMENTACAO', proposta: { decisao: 'PROPOR_INATIVACAO', ativo: false } })], false,
      [{ de: 'OLD', para: 'NEW', inicio: null, justificativa: '[caso:abc] Troca aprovada', criadoPor: 'sistema' }]);
    expect(l[0].acao).toBe('Regularizar o saldo de 100 antes de inativar');
    expect(l[0].alertas[0]).toContain('100 tem saldo (3 KG)');
    expect(l[1]).toMatchObject({ tipo: 'TROCA_CODIGO', situacao: 'REGISTRADA', justificativa: 'Troca aprovada', responsavel: '' });
    expect(l[1].acao).toContain('Registrar OLD como código anterior de NEW');
  });

  it('exceção viva na mesma camada tira o item do caso de inativação', () => {
    const l = mapa([it_('a', '100'), it_('b', '200')], [
      caso({ id: 'c1', itens: ['a', 'b'], camada: 'QUALIDADE', tipo: 'SEM_MOVIMENTACAO', proposta: { decisao: 'PROPOR_INATIVACAO', ativo: false } }),
      caso({ id: 'c2', itens: ['b'], camada: 'QUALIDADE', tipo: 'EXCECAO_MANUAL', proposta: { ativo: true }, situacao: 'APROVADO' }),
    ]);
    expect(l.map((x) => x.morre?.codigo)).toEqual(['100']);
  });

  it('filtro por situação, tipo e código; contagem', () => {
    const itens = [it_('a', '100'), it_('b', '200'), it_('c', '300')];
    const l = mapa(itens, [
      caso({ id: 'c1', itens: ['a', 'b'], proposta: { decisao: 'PROPOR_CONSOLIDACAO', manter: '100', consolidar: '200' }, situacao: 'PROPOSTO' }),
      caso({ id: 'c2', itens: ['c'], camada: 'QUALIDADE', tipo: 'SEM_MOVIMENTACAO', proposta: { decisao: 'PROPOR_INATIVACAO', ativo: false } }),
    ]);
    expect(filtrarMapa(l, { situacao: 'APROVADA' }).map((x) => x.morre?.codigo)).toEqual(['300']);
    expect(filtrarMapa(l, { tipo: 'UNIFICACAO' }).map((x) => x.morre?.codigo)).toEqual(['200']);
    expect(filtrarMapa(l, { busca: '10' }).map((x) => x.morre?.codigo)).toEqual(['200']); // acha pelo código que fica
    expect(contarMapa(l)).toMatchObject({ porSituacao: { PROPOSTA: 1, APROVADA: 1 }, porTipo: { UNIFICACAO: 1, INATIVACAO: 1 } });
  });

  it('30 mil itens em memória: 10 mil unificações de 3 códigos + 10 mil inativações num caso só; Excel do mapa em fluxo', async () => {
    const itens: ItemMapa[] = []; const casos: CasoMapa[] = [];
    for (let k = 0; k < 10_000; k++) {
      const ids = [0, 1, 2].map((j) => `u${k}-${j}`);
      for (let j = 0; j < 3; j++) itens.push(it_(ids[j], `${String(k).padStart(5, '0')}-${j}`, { saldo: j }));
      casos.push(caso({ id: `cu${k}`, itens: ids, proposta: { decisao: 'PROPOR_CONSOLIDACAO', manter: `${String(k).padStart(5, '0')}-0`, consolidar: `${String(k).padStart(5, '0')}-1 | ${String(k).padStart(5, '0')}-2` }, situacao: k % 2 ? 'APROVADO' : 'PROPOSTO' }));
    }
    const inat: string[] = [];
    for (let k = 0; k < 10_000; k++) { itens.push(it_(`n${k}`, `N${String(k).padStart(5, '0')}`)); inat.push(`n${k}`); }
    casos.push(caso({ id: 'ci', itens: inat, camada: 'QUALIDADE', tipo: 'SEM_MOVIMENTACAO', proposta: { decisao: 'PROPOR_INATIVACAO', ativo: false } }));
    const inicio = Date.now();
    const l = mapa(itens, casos);
    expect(l).toHaveLength(30_000);
    expect(l[0]).toMatchObject({ tipo: 'UNIFICACAO', saldoConsolidado: 3 });
    expect(contarMapa(l).porTipo).toMatchObject({ UNIFICACAO: 20_000, INATIVACAO: 10_000 });
    expect(Date.now() - inicio).toBeLessThan(5000);
    const buf = await gerarExcelMapa(l);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf as never);
    // Uma aba por lista, cada uma com as suas colunas.
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Unificações', 'Inativações']);
    const ws = wb.getWorksheet('Unificações')!;
    expect(ws.rowCount).toBe(20_001);
    expect(ws.getRow(2).getCell(2).value).toBe('00000-1');
    expect(wb.getWorksheet('Inativações')!.rowCount).toBe(10_001);
  }, 120_000);
});

// ── Ponta a ponta com o banco falso: corte → Qualidade → aprovar inativação → mapa, SPED e consulta da tela ──

const item = (codigo: string, extra: Partial<ItemImportado> = {}, linha = 1): ItemImportado => ({
  codigo, estabelecimento: null, descricao: `PARAFUSO SEXTAVADO ${codigo}`, unidade: 'UN', ncm: '73181500', grupo: 'Ferragens', ativo: true, saldo: 0,
  ultimaMovimentacao: '2020-01-10', fabricante: null, referencia: null, finalidade: null, campos: {}, linha, ...extra,
});
function montar() {
  const { prisma, db } = criarPrismaFalso({
    projetoDiagnostico: [{ id: 'D1', servico_consultoria: 'saneamento-estoques', empresa_ids: ['E1'], periodo_inicio: new Date('2026-12-31T00:00:00Z'), responsavel: 'Ana' }],
    empresa: [{ id: 'E1', razao_social: 'Agropecuária Teste Ltda', erp: 'SAP B1', erp_versao: '10', cnae_principal: '4683400', cnae_descricao: 'Comércio de defensivos', cnaes_secundarios: [], dados_publicos_em: new Date('2026-10-01T00:00:00Z') }],
  });
  const fila: { itens: ItemImportado[] } = { itens: [] };
  const importador: ImportadorPort = { ler: async () => ({ itens: fila.itens, mapeamento: { codigo: 'Código' }, relatorio: { aceitas: fila.itens.length, rejeitadas: 0, pendentes: 0, linhasRejeitadas: [], linhasPendentes: [] } }) };
  const projetos = new SanProjetoService(prisma as never);
  const casos = new SanCasosService(prisma as never, projetos);
  const importacao = new SanImportacaoService(prisma as never, projetos, importador);
  const orquestracao = new SanOrquestracaoService(prisma as never, projetos, casos, new MotorSaneamento(prisma as never, {} as never));
  const entregas = new EntregaveisService(new PdfService(), {} as never, prisma as never);
  return { prisma, db, fila, projetos, casos, importacao, orquestracao, entregas };
}

describe('sem movimentação e unificações: fluxo com o banco falso', () => {
  it('sem corte: nada é proposto e a execução avisa; com corte: inativa por grupo, poupa o código que fica e o com saldo', async () => {
    const c = montar();
    const p = await c.projetos.criar('D1', USER);
    await c.projetos.confirmarAtividades(p.id, 1, USER);
    c.fila.itens = [item('100', {}, 1), item('200', {}, 2), item('300', { saldo: 7 }, 3), item('400', {}, 4), item('500', { ultimaMovimentacao: '2026-10-01' }, 5)];
    await c.importacao.confirmar(p.id, { buffer: Buffer.from('x'), nome: 'cadastro.xlsx' }, undefined, [], USER);
    const id = Object.fromEntries(c.db.sanItem.map((i) => [i.codigo, i.id]));

    const semCorte = await c.orquestracao.executarCamada(p.id, 'QUALIDADE');
    expect(semCorte.semDados?.motivo).toContain('Corte de movimentação não definido na configuração');
    expect(c.db.sanCaso.filter((x) => x.tipo.startsWith('SEM_MOVIMENTACAO'))).toHaveLength(0);
    expect((await c.entregas.unificacoes(p.id)).corteDefinido).toBe(false);

    // Unificação proposta: 100 fica, 200 sai (os dois sem movimento).
    const dup: ResultadoCamada = { camada: 'DUPLICIDADE', analisados: 5, semDados: null, semProblema: [], casos: [{ camada: 'DUPLICIDADE', tipo: 'DUPLICIDADE_EXATA', itens: [id['100'], id['200']], problema: 'Duplicados', evidencia: [], atual: {}, proposta: { decisao: 'PROPOR_CONSOLIDACAO', manter: '100', consolidar: '200' }, justificativa: 'Mesmo produto.', fundamento: null, impactos: [], origem: 'REGRA', afeta: ['OBRIGACOES'] }] };
    await c.casos.registrarResultado(p.id, dup);
    const proj = c.db.sanProjeto[0];
    await c.projetos.configurar(p.id, { versao: proj.versao, parametros: { corteMovimentacao: '2025-01-01' } });
    await c.orquestracao.executarCamada(p.id, 'QUALIDADE');

    const inat = c.db.sanCaso.find((x) => x.tipo === 'SEM_MOVIMENTACAO')!;
    expect(inat.itens).toEqual([id['400']]); // 100 fica na unificação, 200 sai nela, 300 tem saldo, 500 é recente
    expect(c.db.sanCaso.find((x) => x.tipo === 'SEM_MOVIMENTACAO_COM_SALDO')!.itens).toEqual([id['300']]);
    expect(JSON.stringify(inat.evidencia)).toContain('100 (código que fica na unificação, recebe 200)');

    // Aprovar a inativação: o item fica inativo, o checklist SPED ganha 0200/H010 e o mapa mostra "Inativar 400" aprovada.
    await c.casos.aprovar(inat.id, { versao: inat.versao }, USER);
    expect((c.db.sanItem.find((i) => i.id === id['400'])!.trabalho as { ativo: boolean }).ativo).toBe(false);
    const registros = c.db.sanImpactoSped.filter((l) => l.caso_id === inat.id).map((l) => l.registro);
    expect(registros).toEqual(expect.arrayContaining(['0200', 'H010']));

    const tela = await c.entregas.unificacoes(p.id);
    expect(tela.corteDefinido).toBe(true);
    expect(tela.linhas.map((l) => [l.tipo, l.morre?.codigo, l.fica?.codigo ?? null, l.situacao])).toEqual([['UNIFICACAO', '200', '100', 'PROPOSTA'], ['INATIVACAO', '400', null, 'APROVADA']]);
    expect(tela.linhas[1].acao).toBe('Inativar 400');
    expect((await c.entregas.unificacoes(p.id, { situacao: 'APROVADA' })).linhas).toHaveLength(1);
    expect((await c.entregas.unificacoes(p.id, { busca: '20', limite: '1', pagina: '1' })).total).toBe(1);
    await expect(c.entregas.unificacoes(p.id, { situacao: 'QUALQUER' })).rejects.toThrow('Valor inválido');

    // Excel só do mapa, pela rota.
    const ctrl = new EntregaveisController(c.entregas);
    const arq = await ctrl.unificacoesExcel(p.id, { situacao: 'APROVADA' });
    expect(arq.getHeaders().disposition).toMatch(/^attachment; filename="unificacoes-e-inativacoes_agropecuaria-teste-ltda_\d{2}-\d{2}-\d{4}\.xlsx"$/);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(arq.getStream().read() as never);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Inativações']);
    const ws = wb.getWorksheet('Inativações')!;
    expect(ws.rowCount).toBe(2);
    expect((ws.getRow(1).values as unknown[]).slice(1)).toEqual(['Origem', 'Código', 'Descrição', 'Unidade', 'Saldo', 'Situação', 'Ação no ERP', 'Início da vigência', 'Justificativa', 'Responsável', 'Data da decisão', 'Executado no ERP']); // sem Marca: nenhuma linha aberta no filtro
    expect(ws.getRow(2).getCell(7).value).toBe('Inativar 400');
  });
});

// ── Revisão final: escala do saldo, cruzamento unificação × inativação, origem da inativação, direção do fator, código de trabalho ──

const consolida = (manter: string, consolidar: string, o: Record<string, unknown> = {}) => ({ decisao: 'PROPOR_CONSOLIDACAO', manter, consolidar, ...o });
const semMov = (id: string, itens: string[], situacao = 'PROPOSTO') => caso({ id, itens, camada: 'QUALIDADE', tipo: 'SEM_MOVIMENTACAO', proposta: { decisao: 'PROPOR_INATIVACAO', ativo: false }, situacao });

describe('mapa: escala do saldo da base (achado 2)', () => {
  it('base ×1.000.000: mapa, alerta da inativação e consolidado mostram 3, não 3.000.000 (mesma detecção da Duplicidade)', () => {
    const itens = [it_('a', '100', { saldo: 10_000_000 }), it_('b', '200', { saldo: 3_000_000 }), it_('c', '300', { saldo: 2_000_000 })];
    expect(escalaDaBase(itens)).toBe(1e6);
    const porId = new Map(itens.map((i) => [i.id, i]));
    const l = montarMapa({ liberada: false, dataBase: null, item: (id) => porId.get(id), vinculos: [], escala: escalaDaBase(itens),
      casos: [caso({ id: 'u', itens: ['a', 'b'], proposta: consolida('100', '200') }), semMov('q', ['c'])] });
    const u = l.find((x) => x.tipo === 'UNIFICACAO')!; const q = l.find((x) => x.tipo === 'INATIVACAO')!;
    expect([u.morre?.saldo, u.fica?.saldo, u.saldoEntra, u.saldoConsolidado]).toEqual([3, 10, 3, 13]);
    expect(q.morre?.saldo).toBe(2);
    expect(q.alertas[0]).toContain('300 tem saldo (2 KG)');
    expect(JSON.stringify(l)).not.toContain('000000');
    // Sem escala detectada (menos de 3 saldos múltiplos de 1.000.000), os valores ficam como estão.
    expect(escalaDaBase([it_('a', '1', { saldo: 3_000_000 }), it_('b', '2', { saldo: 7 })])).toBe(1);
  });
});

describe('mapa: nota da escala do saldo no Excel (revisão, achado 5)', () => {
  const textos = (ws: ExcelJS.Worksheet) => { const t: string[] = []; ws.eachRow((r) => r.eachCell((c) => t.push(String(c.value ?? '')))); return t; };
  it('Excel do mapa: com escala, nota abaixo da lista e cabeçalho dos saldos com o divisor; sem escala, nada', async () => {
    const itens = [it_('a', '100', { saldo: 10_000_000 }), it_('b', '200', { saldo: 3_000_000 }), it_('c', '300', { saldo: 2_000_000 })];
    const porId = new Map(itens.map((i) => [i.id, i]));
    const l = montarMapa({ liberada: false, dataBase: null, item: (id) => porId.get(id), vinculos: [], escala: 1e6, casos: [caso({ id: 'u', itens: ['a', 'b'], proposta: consolida('100', '200') })] });
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load((await gerarExcelMapa(l, { escala: 1e6 })) as never);
    const ws = wb.getWorksheet('Unificações')!;
    expect(notaDaEscala(1e6)).toBe('Saldos divididos por 1.000.000 (escala detectada na base: o ERP mostra os valores multiplicados)');
    expect(textos(ws)).toContain(notaDaEscala(1e6));
    const cab = (ws.getRow(1).values as unknown[]).slice(1).map(String);
    expect(cab).toContain('Saldo (código que sai) ÷ 1.000.000');
    expect(cab).toContain('Saldo consolidado ÷ 1.000.000');
    expect(ws.getRow(2).getCell(cab.indexOf('Saldo (código que sai) ÷ 1.000.000') + 1).value).toBe(3);
    const sem = new ExcelJS.Workbook(); await sem.xlsx.load((await gerarExcelMapa(l)) as never);
    expect(textos(sem.getWorksheet('Unificações')!).join(' ')).not.toMatch(/Saldos divididos|÷/);
  });
  it('aba De para e equivalências da entrega: a mesma nota quando a base tem a escala', async () => {
    const d = dadosBase(false);
    for (const [n, i] of (d.itens as Record<string, unknown>[]).entries()) i.trabalho = { ...(i.trabalho as Record<string, unknown>), saldo: (n + 2) * 1_000_000 };
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load((await gerarExcelDeDados(d)) as never);
    expect(textos(wb.getWorksheet('De para e equivalências')!)).toContain(notaDaEscala(1e6));
  });
});

describe('mapa: unificação × inativação (achado 3a)', () => {
  it('inativação APROVADA nunca some: com a unificação só proposta, as duas linhas ficam e o conflito vai nas duas', () => {
    const itens = [it_('a', '100'), it_('b', '200'), it_('c', '300')];
    const l = mapa(itens, [caso({ id: 'u', itens: ['a', 'b'], proposta: consolida('100', '200'), situacao: 'PROPOSTO' }), semMov('q', ['a', 'b', 'c'], 'APROVADO')]);
    expect(l.map((x) => [x.tipo, x.morre?.codigo, x.situacao])).toEqual([['UNIFICACAO', '200', 'PROPOSTA'], ['INATIVACAO', '100', 'APROVADA'], ['INATIVACAO', '200', 'APROVADA'], ['INATIVACAO', '300', 'APROVADA']]);
    expect(l[0].alertas.join(' ')).toContain('Conflito: o código que fica (100) tem inativação aprovada (Qualidade, sem movimentação): a inativação também está neste mapa');
    expect(l[1].alertas.join(' ')).toContain('Conflito: 100 é o código que fica numa unificação proposta (recebe 200)');
    expect(l[2].alertas.join(' ')).toContain('200 também sai numa unificação proposta (para 100)');
    expect(l[3].alertas).toEqual([]);
  });
  it('unificação APROVADA cobre a inativação só proposta: a inativação sai e a unificação leva o conflito', () => {
    const itens = [it_('a', '100'), it_('b', '200'), it_('c', '300')];
    const l = mapa(itens, [caso({ id: 'u', itens: ['a', 'b'], proposta: consolida('100', '200'), situacao: 'APROVADO' }), semMov('q', ['a', 'b', 'c'], 'PROPOSTO')]);
    expect(l.map((x) => [x.tipo, x.morre?.codigo])).toEqual([['UNIFICACAO', '200'], ['INATIVACAO', '300']]); // 100 (fica) e 200 (já morre na unificação aprovada) saem
    expect(l[0].alertas.join(' ')).toContain('Conflito: o código que fica (100) tem inativação proposta (Qualidade, sem movimentação): a inativação ficou fora deste mapa');
  });
  it('as duas aprovadas: nenhuma some (decisão aprovada fica), com o conflito', () => {
    const itens = [it_('a', '100'), it_('b', '200')];
    const l = mapa(itens, [caso({ id: 'u', itens: ['a', 'b'], proposta: consolida('100', '200'), situacao: 'APROVADO' }), semMov('q', ['a'], 'APROVADO')]);
    expect(l.map((x) => [x.tipo, x.morre?.codigo])).toEqual([['UNIFICACAO', '200'], ['INATIVACAO', '100']]);
    expect(l[1].alertas.join(' ')).toContain('Conflito: 100 é o código que fica numa unificação aprovada');
  });
  it('o código que fica já inativo (ativo = não) também gera o conflito', () => {
    const l = mapa([it_('a', '100', { ativo: false }), it_('b', '200')], [caso({ itens: ['a', 'b'], proposta: consolida('100', '200') })]);
    expect(l[0].alertas.join(' ')).toContain('Conflito: o código que fica (100) está inativo');
    expect(conflitosDoMapa(l)).toEqual([{ sai: '200', fica: '100', situacaoUnificacao: 'APROVADA', inativacao: { codigo: '100', situacao: 'INATIVO_NA_BASE', origem: null } }]);
  });
  it('o par em conflito vai uma vez só para a contagem, a tela e a aba "Conflitos" do Excel do mapa', async () => {
    const itens = [it_('a', '100'), it_('b', '200'), it_('c', '300')];
    const l = mapa(itens, [caso({ id: 'u', itens: ['a', 'b'], proposta: consolida('100', '200'), situacao: 'PROPOSTO' }), semMov('q', ['a', 'c'], 'APROVADO')]);
    const pares = contarMapa(l).conflitos;
    expect(pares).toEqual([{ sai: '200', fica: '100', situacaoUnificacao: 'PROPOSTA', inativacao: { codigo: '100', situacao: 'APROVADA', origem: 'QUALIDADE' } }]);
    expect(contarMapa(l).porLista).toEqual({ UNIFICACOES: 1, INATIVACOES: 2, EQUIVALENCIAS: 0 });
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load((await gerarExcelMapa(l)) as never);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Conflitos', 'Unificações', 'Inativações']);
    const ws = wb.getWorksheet('Conflitos')!;
    expect((ws.getRow(1).values as unknown[]).slice(1)).toEqual(['Código que sai', 'Código que fica', 'Situação da unificação', 'Código inativado', 'Situação da inativação', 'Origem da inativação', 'O que fazer']);
    expect((ws.getRow(2).values as unknown[]).slice(1, 7)).toEqual(['200', '100', 'Proposta', '100', 'Aprovada', 'Inativação (sem movimentação)']);
    expect(String(ws.getRow(2).getCell(7).value)).toContain('rejeitar ou reabrir um dos dois casos');
  });
});

describe('mapa: unificação sem saldo (avaliação A13)', () => {
  it('saldo 0 nos dois códigos: "Inativar o código que sai", sem saída e entrada de mercadoria (OIGE/OIGN), mesmo com perfil SAP', () => {
    const itens = [it_('a', '100', { saldo: 0 }), it_('b', '200', { saldo: 0, unidade: 'CX' })];
    const porId = new Map(itens.map((i) => [i.id, i]));
    const perfilErp = { id: 'sap', nome: 'SAP Business One', situacao: 'DESENVOLVIDO', itens: [
      { id: 'x1', tipo: 'ACAO_NO_ERP', tipo_ajuste: 'CONSOLIDOU_INATIVOU', chave: 'Unificação', texto: 'Saída de mercadoria (OIGE) de {sai}; entrada (OIGN) em {fica}; depois inativar {sai}', campo_erp: null, fonte_url: null, grau: 'CONFIRMADO', ordem: 1, ativo: true },
      { id: 'x2', tipo: 'ACAO_NO_ERP', tipo_ajuste: 'INATIVOU', chave: 'Inativação', texto: 'Inativar {sai} no cadastro (frozenFor = Y)', campo_erp: null, fonte_url: null, grau: 'CONFIRMADO', ordem: 2, ativo: true },
    ] } as never;
    const [u] = montarMapa({ liberada: false, dataBase: null, item: (id) => porId.get(id), vinculos: [], perfilErp, casos: [caso({ itens: ['a', 'b'], proposta: consolida('100', '200') })] });
    expect(u.acao).toContain('Inativar o código que sai (200): sem saldo a transferir para 100');
    expect(u.acao).not.toMatch(/OIGE|OIGN/);
    // Sem saldo, a unidade diferente não pede fator.
    expect(u.alertas).toEqual([]);
    expect([u.saldoEntra, u.saldoConsolidado]).toEqual([0, 0]);
  });
});

describe('mapa: origem da inativação (achado 7)', () => {
  it('inativação vinda de Duplicidades × sem movimentação: rótulo e contagem separados', () => {
    const itens = [it_('a', '100'), it_('b', '200'), it_('c', '300')];
    const l = mapa(itens, [
      caso({ id: 'd', itens: ['a', 'b'], proposta: { decisao: 'PROPOR_INATIVACAO', manter: '100', consolidar: '200' } }),
      semMov('q', ['c']),
    ]);
    expect(l.map((x) => [x.morre?.codigo, x.origem, x.rotuloTipo])).toEqual([['200', 'DUPLICIDADE', 'Inativação (duplicidade)'], ['300', 'QUALIDADE', 'Inativação (sem movimentação)']]);
    expect(contarMapa(l).inativacoesPorOrigem).toEqual({ DUPLICIDADE: 1, QUALIDADE: 1 });
  });
  it('relatório: a Qualidade conta só as inativações sem movimentação; a de Duplicidades vai na Duplicidade', () => {
    const d = dadosBase(true);
    d.casos = (d.casos as Record<string, unknown>[]).filter((c) => c.id !== 'c-dup');
    d.casos.push({ id: 'c-inat', projeto_id: 'P1', camada: 'DUPLICIDADE', tipo: 'DUPLICIDADE_EXATA', itens: ['i1', 'i2'], problema: 'Duplicados', evidencia: [], atual: {}, proposta: { decisao: 'PROPOR_INATIVACAO', manter: '00123', consolidar: '000456' }, justificativa: 'Inativar o duplicado', fundamento: null, situacao: 'APROVADO', responsavel: 'ana', decidido_por: 'ana@fal.test', decidido_em: new Date('2026-11-11T12:00:00Z'), createdAt: new Date('2026-11-09T12:30:00Z') });
    const texto = JSON.stringify(montarRelatorio(d));
    expect(texto).toContain('1 código duplicado será inativado sem unificação');
    expect(texto).not.toContain('sem movimentação desde o corte e sem saldo será inativado');
  });
});

describe('mapa: direção do fator de conversão (achado 8)', () => {
  it('UN 1 L → CX 5 L: fator 5 sem direção não soma (converter antes); com as unidades do fator, converte na direção certa', () => {
    const itens = [it_('cx', 'CX5L', { unidade: 'CX', saldo: 4, descricao: 'OLEO 5L' }), it_('un', 'UN1L', { unidade: 'UN', saldo: 10, descricao: 'OLEO 1L' })];
    const sem = mapa(itens, [caso({ tipo: 'APRESENTACOES_DISTINTAS', itens: ['cx', 'un'], proposta: consolida('CX5L', 'UN1L', { fatorConversao: 5 }) })])[0];
    expect([sem.saldoEntra, sem.saldoConsolidado]).toEqual([null, null]);
    expect(sem.alertas.join(' ')).toContain('o fator 5 não diz de qual unidade para qual; converter antes de somar');
    expect(sem.acao).toContain('Converter o saldo de UN1L para a unidade de CX5L (CX)');
    // 1 CX = 5 UN: o saldo de 10 UN entra como 2 CX.
    const com = mapa(itens, [caso({ itens: ['cx', 'un'], proposta: consolida('CX5L', 'UN1L', { fatorConversao: 5, fatorDe: 'CX', fatorPara: 'UN' }) })])[0];
    expect([com.saldoEntra, com.saldoConsolidado]).toEqual([2, 6]);
    expect(com.alertas.join(' ')).toContain('1 UN = 0,2 CX');
    // Unidades do fator que não são as dos itens: sem direção.
    expect(conversaoDoSaldo({ fatorConversao: 5, fatorDe: 'PC', fatorPara: 'UN' }, 'UN', 'CX')).toEqual({ falta: 'DIRECAO', fator: 5 });
    // Medidas da mesma grandeza: a tabela dá a direção (G → KG com fator 1000 = inverso).
    expect(conversaoDoSaldo({ fatorConversao: 1000 }, 'G', 'KG')).toEqual({ multiplicador: 0.001 });
    expect(conversaoDoSaldo({ fatorConversao: 0.001 }, 'G', 'KG')).toEqual({ multiplicador: 0.001 });
  });
});

describe('modelo: código de trabalho primeiro (achado 6)', () => {
  it('item com código trocado por decisão e depois unificado: o modelo e o mapa usam o código de trabalho', () => {
    const d = dadosBase(false);
    const i2 = (d.itens as Record<string, unknown>[]).find((i) => i.id === 'i2')!;
    i2.trabalho = { ...(i2.trabalho as Record<string, unknown>), codigo: '000999' };
    const dup = (d.casos as Record<string, unknown>[]).find((c) => c.id === 'c-dup')!;
    dup.proposta = { decisao: 'PROPOR_CONSOLIDACAO', manter: '00123', consolidar: '000999' };
    const m = construirModelo(d);
    expect(m.porId.get('i2')!.codigo).toBe('000999');
    const u = mapaDoModelo(m).find((l) => l.tipo === 'UNIFICACAO')!;
    expect(u.morre).toMatchObject({ codigo: '000999', descricao: 'SEMENTE SOJA' });
    expect(u.alertas.join(' ')).not.toContain('não foi encontrado na base');
  });
});

describe('aprovar inativação sem movimentação: "revisar" na Duplicidade só de quem tem caso de Duplicidade (revisão, achado 6)', () => {
  it('itens sem duplicata (SEM_PROBLEMA) não ganham "revisar"; os que estão em caso aberto ou aprovado de Duplicidade ganham', async () => {
    const c = montar();
    const p = await c.projetos.criar('D1', USER);
    await c.projetos.confirmarAtividades(p.id, 1, USER);
    c.fila.itens = [item('100', {}, 1), item('200', {}, 2), item('300', {}, 3), item('400', {}, 4)];
    await c.importacao.confirmar(p.id, { buffer: Buffer.from('x'), nome: 'cadastro.xlsx' }, undefined, [], USER);
    const id = Object.fromEntries(c.db.sanItem.map((i) => [i.codigo, i.id]));
    await c.projetos.configurar(p.id, { versao: c.db.sanProjeto[0].versao, parametros: { corteMovimentacao: '2025-01-01' } });
    await c.orquestracao.executarCamada(p.id, 'QUALIDADE');
    // Duplicidade: 300 e 400 num caso aberto (manter distintos, sem efeito no cadastro); 100 e 200 sem duplicata.
    await c.casos.registrarResultado(p.id, { camada: 'DUPLICIDADE', analisados: 4, semDados: null, semProblema: [id['100'], id['200']], casos: [{ camada: 'DUPLICIDADE', tipo: 'DUPLICIDADE_INDICACAO_POSSIVEL', itens: [id['300'], id['400']], problema: 'Possível duplicidade', evidencia: [], atual: {}, proposta: { decisao: 'SOLICITAR_INFORMACAO' }, justificativa: 'Confirmar.', fundamento: null, impactos: [], origem: 'REGRA', afeta: [] }] });
    const dupCel = (cod: string) => c.db.sanCelula.find((x) => x.item_id === id[cod] && x.camada === 'DUPLICIDADE')!;
    for (const cod of ['100', '200', '300', '400']) dupCel(cod).revisar = false;
    expect(dupCel('100').situacao).toBe('SEM_PROBLEMA');
    const inat = c.db.sanCaso.find((x) => x.tipo === 'SEM_MOVIMENTACAO')!;
    expect([...inat.itens].sort()).toEqual([id['100'], id['200'], id['300'], id['400']].sort());
    await c.casos.aprovar(inat.id, { versao: inat.versao }, USER);
    expect(['100', '200', '300', '400'].map((cod) => dupCel(cod).revisar)).toEqual([false, false, true, true]);
  });
});

describe('fluxo: propor e aprovar unificação marca a Qualidade como "revisar" (achado 3c)', () => {
  it('a inativação veio antes: a unificação proposta e a aprovada marcam a célula da Qualidade dos itens', async () => {
    const c = montar();
    const p = await c.projetos.criar('D1', USER);
    await c.projetos.confirmarAtividades(p.id, 1, USER);
    c.fila.itens = [item('100', {}, 1), item('200', {}, 2)];
    await c.importacao.confirmar(p.id, { buffer: Buffer.from('x'), nome: 'cadastro.xlsx' }, undefined, [], USER);
    const id = Object.fromEntries(c.db.sanItem.map((i) => [i.codigo, i.id]));
    await c.projetos.configurar(p.id, { versao: c.db.sanProjeto[0].versao, parametros: { corteMovimentacao: '2025-01-01' } });
    await c.orquestracao.executarCamada(p.id, 'QUALIDADE'); // Qualidade antes: 100 e 200 entram em SEM_MOVIMENTACAO
    const cel = (cod: string) => c.db.sanCelula.find((x) => x.item_id === id[cod] && x.camada === 'QUALIDADE')!;
    expect(cel('100')).toMatchObject({ situacao: 'PROPOSTO', revisar: false });
    const dup: ResultadoCamada = { camada: 'DUPLICIDADE', analisados: 2, semDados: null, semProblema: [], casos: [{ camada: 'DUPLICIDADE', tipo: 'DUPLICIDADE_EXATA', itens: [id['100'], id['200']], problema: 'Duplicados', evidencia: [], atual: {}, proposta: { decisao: 'PROPOR_CONSOLIDACAO', manter: '100', consolidar: '200' }, justificativa: 'Mesmo produto.', fundamento: null, impactos: [], origem: 'REGRA', afeta: ['OBRIGACOES'] }] };
    await c.casos.registrarResultado(p.id, dup);
    expect(cel('100').revisar).toBe(true);
    expect(cel('100').revisar_causa).toContain('o código que fica não pode ser inativado');
    // O mapa: com a unificação só proposta, as inativações de 100 (o que fica) e de 200 (que morre) continuam, com o alerta; a unificação traz o conflito.
    const tela = await c.entregas.unificacoes(p.id);
    expect(tela.linhas.map((l) => [l.tipo, l.morre?.codigo])).toEqual([['UNIFICACAO', '200'], ['INATIVACAO', '100'], ['INATIVACAO', '200']]);
    expect(tela.linhas.slice(1).every((l) => l.alertas.length === 1)).toBe(true);
    expect(tela.linhas[0].alertas.join(' ')).toContain('Conflito: o código que fica (100)');
    // Aprovar a unificação também marca (regra de dependências: consolidação → Qualidade).
    cel('100').revisar = false;
    const u = c.db.sanCaso.find((x) => x.camada === 'DUPLICIDADE')!;
    await c.casos.aprovar(u.id, { versao: u.versao }, USER);
    expect(cel('100').revisar).toBe(true);
  });

  it('mapa da tela com base ×1.000.000: saldo na escala de toda a base (não só dos itens citados)', async () => {
    const c = montar();
    const p = await c.projetos.criar('D1', USER);
    await c.projetos.confirmarAtividades(p.id, 1, USER);
    c.fila.itens = [item('100', { saldo: 10_000_000 }, 1), item('200', { saldo: 3_000_000 }, 2), item('300', { saldo: 4_000_000 }, 3), item('400', { saldo: 6_000_000 }, 4)];
    await c.importacao.confirmar(p.id, { buffer: Buffer.from('x'), nome: 'cadastro.xlsx' }, undefined, [], USER);
    const id = Object.fromEntries(c.db.sanItem.map((i) => [i.codigo, i.id]));
    const dup: ResultadoCamada = { camada: 'DUPLICIDADE', analisados: 4, semDados: null, semProblema: [], casos: [{ camada: 'DUPLICIDADE', tipo: 'DUPLICIDADE_COM_SALDO', itens: [id['100'], id['200']], problema: 'Duplicados', evidencia: [], atual: {}, proposta: { decisao: 'PROPOR_CONSOLIDACAO', manter: '100', consolidar: '200' }, justificativa: 'Mesmo produto.', fundamento: null, impactos: [], origem: 'REGRA', afeta: ['OBRIGACOES'] }] };
    await c.casos.registrarResultado(p.id, dup);
    const tela = await c.entregas.unificacoes(p.id);
    expect(tela.escalaSaldo).toBe(1e6);
    expect(tela.linhas[0]).toMatchObject({ saldoEntra: 3, saldoConsolidado: 13 });
    expect(tela.linhas[0].morre?.saldo).toBe(3);
  });
  it('mapa da tela no Postgres: código e saldo de todos os itens numa consulta que extrai os campos do JSON; o trabalho inteiro só dos itens citados', async () => {
    const c = montar();
    const p = await c.projetos.criar('D1', USER);
    await c.projetos.confirmarAtividades(p.id, 1, USER);
    c.fila.itens = [item('100', { saldo: 10_000_000 }, 1), item('200', { saldo: 3_000_000 }, 2), item('300', { saldo: 4_000_000 }, 3), item('400', { saldo: 6_000_000 }, 4)];
    await c.importacao.confirmar(p.id, { buffer: Buffer.from('x'), nome: 'cadastro.xlsx' }, undefined, [], USER);
    const id = Object.fromEntries(c.db.sanItem.map((i) => [i.codigo, i.id]));
    await c.casos.registrarResultado(p.id, { camada: 'DUPLICIDADE', analisados: 4, semDados: null, semProblema: [], casos: [{ camada: 'DUPLICIDADE', tipo: 'DUPLICIDADE_COM_SALDO', itens: [id['100'], id['200']], problema: 'Duplicados', evidencia: [], atual: {}, proposta: { decisao: 'PROPOR_CONSOLIDACAO', manter: '100', consolidar: '200' }, justificativa: 'Mesmo produto.', fundamento: null, impactos: [], origem: 'REGRA', afeta: ['OBRIGACOES'] }] });
    // Emula o SELECT ... "trabalho"->>'codigo', "trabalho"->>'saldo' (o Postgres devolve texto).
    const sql: string[] = [];
    (c.prisma as Record<string, unknown>).$queryRaw = vi.fn(async (q: { sql: string }) => { sql.push(q.sql); return c.db.sanItem.map((i) => ({ id: i.id, codigo: i.trabalho.codigo ?? i.codigo, saldo: i.trabalho.saldo == null ? null : String(i.trabalho.saldo) })); });
    const findMany = vi.spyOn(c.prisma.sanItem, 'findMany');
    const tela = await c.entregas.unificacoes(p.id);
    expect(sql).toHaveLength(1);
    expect(sql[0]).toMatch(/"trabalho"->>'codigo'.*"trabalho"->>'saldo'/);
    expect(sql[0]).not.toContain(", \"trabalho\",");
    // Os findMany de itens são só dos citados (id in [...]), nunca de todos.
    for (const [a] of findMany.mock.calls) expect((a as { where: { id?: { in: string[] } } }).where.id?.in?.sort()).toEqual([id['100'], id['200']].sort());
    expect(tela.escalaSaldo).toBe(1e6);
    expect(tela.linhas[0]).toMatchObject({ saldoEntra: 3, saldoConsolidado: 13 });
  });
});

describe('fator de conversão lido como número ou texto brasileiro (lerFator)', () => {
  it('equivalência mostra o fator 0,001 (número) e o "0,5" (texto); a conversão do saldo usa os mesmos valores', () => {
    const itens = [it_('a', '100', { unidade: 'G' }), it_('b', '200', { unidade: 'KG' })];
    const eq = (f: unknown) => mapa(itens, [caso({ tipo: 'APRESENTACOES_DISTINTAS', itens: ['a', 'b'], proposta: { decisao: 'RELACIONAR_APRESENTACOES', fatorConversao: f } })])[0].acao;
    expect(eq(0.001)).toContain('(fator 0,001)');
    expect(eq('0,5')).toContain('(fator 0,5)');
    expect(conversaoDoSaldo({ fatorConversao: '0.001' }, 'G', 'KG')).toEqual({ multiplicador: 0.001 });
  });
  it('aprovar aceita o fator digitado em texto brasileiro ("0,5"); sem fator, FATOR_AUSENTE', async () => {
    const c = montar();
    const p = await c.projetos.criar('D1', USER);
    await c.projetos.confirmarAtividades(p.id, 1, USER);
    c.fila.itens = [item('100', { unidade: 'CX' }, 1)];
    await c.importacao.confirmar(p.id, { buffer: Buffer.from('x'), nome: 'cadastro.xlsx' }, undefined, [], USER);
    const id = c.db.sanItem[0].id;
    const r = (fator: unknown): ResultadoCamada => ({ camada: 'NOMES_UNIDADES', analisados: 1, semDados: null, semProblema: [], casos: [{ camada: 'NOMES_UNIDADES', tipo: 'UNIDADE_CONVERSAO', itens: [id], problema: 'Conversão', evidencia: [], atual: { unidade: 'CX' }, proposta: { unidade: 'UN', unidadeCompra: 'CX', fatorConversao: fator as never, fatorSituacao: 'DEFINIDO' }, justificativa: 'Caixa', fundamento: null, impactos: [], origem: 'REGRA', afeta: [] }] });
    await c.casos.registrarResultado(p.id, r('0,5'));
    const caso1 = c.db.sanCaso[0];
    await c.casos.aprovar(caso1.id, { versao: caso1.versao }, USER);
    expect(c.db.sanCaso[0].situacao).toBe('APROVADO');
  });
});
