import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
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
import { gerarExcelMapa } from './excel';
import { contarMapa, filtrarMapa, montarMapa, type CasoMapa, type ItemMapa } from './unificacoes';

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
    expect(l[1].acao).toBe('Inativar 300 (sem saldo a transferir); o código que fica é 100');
    expect(l[0].inicio?.toISOString().slice(0, 10)).toBe('2026-12-31'); // sem vínculo com data: a data-base
  });

  it('unidades diferentes: sem fator aprovado não soma (converter antes); com fator, converte', () => {
    const itens = [it_('a', '100', { saldo: 10, unidade: 'KG' }), it_('b', '200', { saldo: 3, unidade: 'SC' })];
    const sem = mapa(itens, [caso({ itens: ['a', 'b'], proposta: { decisao: 'PROPOR_CONSOLIDACAO', manter: '100', consolidar: '200' } })])[0];
    expect([sem.saldoEntra, sem.saldoConsolidado]).toEqual([null, null]);
    expect(sem.alertas.join(' ')).toContain('Unidades diferentes (SC × KG): saldo não somável direto; converter antes de somar');
    expect(sem.acao).toContain('Converter o saldo de 200 para a unidade de 100 (KG)');
    const com = mapa(itens, [caso({ itens: ['a', 'b'], proposta: { decisao: 'PROPOR_CONSOLIDACAO', manter: '100', consolidar: '200', fatorConversao: 50 } })])[0];
    expect([com.saldoEntra, com.saldoConsolidado]).toEqual([150, 160]);
    expect(com.alertas.join(' ')).toContain('saldo convertido pelo fator aprovado 50');
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
    expect(fora.alertas).toEqual(['O código que morre (999) não foi encontrado na base.']);
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
    const ws = wb.getWorksheet('Unificações e inativações')!;
    expect(ws.rowCount).toBe(30_001);
    expect(ws.getRow(2).getCell(2).value).toBe('00000-1');
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
    expect(arq.getHeaders().disposition).toMatch(/^attachment; filename="unificacoes-e-inativacoes_agropecuaria-teste-ltda_\d{4}-\d{2}-\d{2}\.xlsx"$/);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(arq.getStream().read() as never);
    const ws = wb.getWorksheet('Unificações e inativações')!;
    expect(ws.rowCount).toBe(2);
    expect(ws.getRow(2).getCell(14).value).toBe('Inativar 400');
  });
});
