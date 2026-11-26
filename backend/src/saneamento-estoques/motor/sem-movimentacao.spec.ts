import { describe, expect, it } from 'vitest';
import type { ContextoAnalise, ItemTrabalho } from '../tipos';
import { papeisDeUnificacao } from '../dados/motor.provider';
import { ajustesDosCasos, tiposDeAjusteDoCaso } from '../dados/ajustes';
import { validarResultado } from '../dados/validacao';
import { AnalisadorQualidade, type ContextoMotor } from './index';

let n = 0;
const item = (codigo: string, extra: Partial<ItemTrabalho> = {}): ItemTrabalho => ({
  id: `i${++n}`, codigo, estabelecimento: null, descricao: `PARAFUSO SEXTAVADO ${codigo} ACO 10MM`, unidade: 'UN', ncm: '73181500', grupo: 'Ferragens', ativo: true, saldo: 0,
  ultimaMovimentacao: '2020-03-01', fabricante: null, referencia: null, finalidade: null, campos: {}, ...extra,
});
const ctx = (o: Partial<ContextoMotor> = {}): ContextoAnalise => ({ dataBase: '2026-12-31', atividades: [], erp: null, corteMovimentacao: '2024-01-01', ...o } as ContextoAnalise);
const doTipo = (r: { casos: { tipo: string }[] }, t: string) => r.casos.filter((c) => c.tipo === t);

describe('QUALIDADE: itens sem movimentação a longa data', () => {
  it('sem saldo (zero ou nulo) → um caso por grupo propondo inativar; ativo desconhecido entra; inativo, recente e sem data não', () => {
    const a = item('A'); const b = item('B', { saldo: null, ativo: null }); const c = item('C', { grupo: 'Sementes' });
    const inativo = item('D', { ativo: false }); const recente = item('E', { ultimaMovimentacao: '2025-06-01' }); const semData = item('F', { ultimaMovimentacao: null });
    const r = new AnalisadorQualidade().analisar([a, b, c, inativo, recente, semData], ctx());
    const casos = doTipo(r, 'SEM_MOVIMENTACAO');
    expect(casos.map((x) => x.itens)).toEqual(expect.arrayContaining([[a.id, b.id], [c.id]]));
    expect(casos).toHaveLength(2);
    const ferragens = casos.find((x) => x.itens.length === 2)!;
    expect(ferragens.proposta).toEqual({ decisao: 'PROPOR_INATIVACAO', ativo: false });
    expect(ferragens.afeta).toEqual(['OBRIGACOES']);
    expect(ferragens.problema).toContain('2 itens do grupo "Ferragens" sem movimentação desde 01/01/2024 e sem saldo');
    expect(ferragens.evidencia.find((e) => e.rotulo === 'Saldo não informado')?.valor).toContain('1 item(ns)');
    expect(ferragens.atual).toEqual({ ativo: 'varia por item' });
    // A proposta passa na validação do servidor (ativo booleano).
    expect(() => validarResultado(r)).not.toThrow();
    expect(r.semProblema).toEqual(expect.arrayContaining([inativo.id, recente.id]));
  });

  it('com saldo → não propõe inativar: pede regularizar o saldo antes, mostrando o saldo (negativo também)', () => {
    const a = item('A', { saldo: 12.5 }); const b = item('B', { saldo: -3 });
    const r = new AnalisadorQualidade().analisar([a, b], ctx());
    expect(doTipo(r, 'SEM_MOVIMENTACAO')).toHaveLength(0);
    const [c] = doTipo(r, 'SEM_MOVIMENTACAO_COM_SALDO');
    expect(c.itens).toEqual([a.id, b.id]);
    expect(c.proposta).toEqual({ decisao: 'REGULARIZAR_SALDO' });
    expect(c.evidencia.map((e) => e.valor).join(' ')).toContain('saldo 12,5');
    expect(c.evidencia.find((e) => e.rotulo.startsWith('Saldo somado'))?.valor).toBe('9,5');
    expect(tiposDeAjusteDoCaso(c)).toEqual([]); // aprovar só registra a ciência: nenhum ajuste no SPED
  });

  it('código que fica (ou que sai) numa unificação proposta/aprovada não é proposto para inativar; a evidência explica', () => {
    const fica = item('100'); const sai = item('200'); const livre = item('300');
    const unificacoes = papeisDeUnificacao([{ itens: [fica.id, sai.id], proposta: { decisao: 'PROPOR_CONSOLIDACAO', manter: '100', consolidar: '200' } }], [fica, sai, livre]);
    expect(unificacoes.get(fica.id)).toEqual({ papel: 'FICA', outro: '200' });
    expect(unificacoes.get(sai.id)).toEqual({ papel: 'SAI', outro: '100' });
    const r = new AnalisadorQualidade().analisar([fica, sai, livre], ctx({ unificacoes }));
    const [c] = doTipo(r, 'SEM_MOVIMENTACAO');
    expect(c.itens).toEqual([livre.id]);
    const fora = c.evidencia.find((e) => e.rotulo === 'Fora desta proposta')!.valor;
    expect(fora).toContain('100 (código que fica na unificação, recebe 200)');
    expect(fora).toContain('200 (sai na unificação para 100)');
    // Decisão que não é de consolidação não define papel.
    expect(papeisDeUnificacao([{ itens: [fica.id, sai.id], proposta: { decisao: 'MANTER_DISTINTOS', manter: '100', consolidar: '200' } }], [fica, sai]).size).toBe(0);
  });

  it('sem corte → nenhum caso, e a cobertura diz que o critério não foi aplicado', () => {
    const r = new AnalisadorQualidade().analisar([item('A'), item('B')], ctx({ corteMovimentacao: null }));
    expect(doTipo(r, 'SEM_MOVIMENTACAO')).toHaveLength(0);
    expect(r.semDados?.motivo).toContain('Corte de movimentação não definido na configuração');
    expect(r.semDados?.motivo).toContain('não foi aplicado a 2 item(ns)');
    // Com corte, a mensagem some.
    expect(new AnalisadorQualidade().analisar([item('A')], ctx()).semDados).toBeNull();
  });

  it('inativação gera o ajuste "consolidou/inativou" por item (0200 e H010 no checklist)', () => {
    const a = item('A'); const b = item('B');
    const [c] = doTipo(new AnalisadorQualidade().analisar([a, b], ctx()), 'SEM_MOVIMENTACAO');
    expect(tiposDeAjusteDoCaso(c)).toEqual(['CONSOLIDOU_INATIVOU']);
    const ajustes = ajustesDosCasos([{ ...c, situacao: 'APROVADO' }], { dataBase: '2026-12-31' });
    expect(ajustes.map((x) => [x.tipo, x.itemId, x.status])).toEqual([['CONSOLIDOU_INATIVOU', a.id, 'APROVADO'], ['CONSOLIDOU_INATIVOU', b.id, 'APROVADO']]);
  });

  it('30 mil itens parados em 30 grupos: 30 casos (conjunto), sem estourar a pilha', () => {
    const itens: ItemTrabalho[] = [];
    for (let i = 0; i < 30_000; i++) itens.push(item(String(i).padStart(6, '0'), { grupo: `G${i % 30}`, saldo: i % 7 === 0 ? 5 : 0 }));
    const r = new AnalisadorQualidade().analisar(itens, ctx());
    expect(doTipo(r, 'SEM_MOVIMENTACAO')).toHaveLength(30);
    expect(doTipo(r, 'SEM_MOVIMENTACAO_COM_SALDO')).toHaveLength(30);
    expect(doTipo(r, 'SEM_MOVIMENTACAO').reduce((s, c) => s + c.itens.length, 0)).toBe(30_000 - Math.ceil(30_000 / 7));
  });
});
