/** Achados A1, A2 e A15 da avaliação com a base real da Crestani (docs/avaliacao-saneamento-crestani.md). */
import { describe, expect, it } from 'vitest';
import { conferirBase, detectarEscalaDoSaldo, sugerirMapeamento } from './index';
import { escalaDaBase } from '../motor/conjuntos';
import { mapaDeAtividades, sugerirAtividades } from '../fiscal/atividades';
import { CARGA_ERPS } from '../../erps/carga';
import { lerEscalaSaldo } from '../dados/importacao.service';

const CAB = ['Código do Item', 'Descrição do Item', 'Depósito Última Compra', 'Unidade de Medida de Estoque', 'Código da Unidade de Medida', 'Código NCM', 'Descrição do Grupo de Itens', 'Quantidade em Estoque', 'Data Última Movimentação'];
const AMOSTRA = [
  ['118', 'ANEL ELASTICO 9100-0345', '01', 'UNIDADE', 'UN', '40169300', 'MANUTENCAO', '24000000', '2025-03-01'],
  ['12320', 'CONECTOR 8 VIAS', '02', 'UNIDADE', 'UN', '85366990', 'MANUTENCAO', '2000000', '2024-11-10'],
  ['2186', 'ADUBO', '01', 'QUILOGRAM', 'KG', '31052000', 'INSUMOS', '0', ''],
  ['77', 'LONA', '03', 'METRO QUA', 'M2', '39211900', 'USO', '9070000', ''],
];

describe('A1: mapeamento do export SAP em português', () => {
  const s = sugerirMapeamento(CAB, AMOSTRA[0], undefined, AMOSTRA);
  it('unidade: a coluna do código (até 6 caracteres) vence a do nome; a do nome vira campo adicional', () => {
    expect(s.mapeamento.unidade).toBe(4);
    expect(s.colunas[3].campo).toBeNull();
  });
  it('sem a coluna do código, o nome continua sugerido', () => {
    const so = sugerirMapeamento(CAB.slice(0, 4), AMOSTRA[0], undefined, AMOSTRA.map((l) => l.slice(0, 4)));
    expect(so.mapeamento.unidade).toBe(3);
  });
  it('pelos valores: entre duas colunas de unidade, vale a que cabe em 6 caracteres, qualquer que seja o nome', () => {
    const r = sugerirMapeamento(['Codigo', 'Descricao', 'Unidade', 'Unid. de estoque'], [], undefined, [['1', 'x', 'QUILOGRAMA', 'KG'], ['2', 'y', 'UNIDADE', 'UN']]);
    expect(r.mapeamento.unidade).toBe(3);
  });
  it('estabelecimento: nunca "Depósito Última Compra" (nem "Depósito padrão"); "Depósito" continua', () => {
    expect(s.mapeamento.estabelecimento).toBeUndefined();
    expect(s.colunas[2].campo).toBeNull();
    expect(sugerirMapeamento(['Codigo', 'Descricao', 'Depósito padrão']).mapeamento.estabelecimento).toBeUndefined();
    expect(sugerirMapeamento(['Codigo', 'Descricao', 'Depósito']).mapeamento.estabelecimento).toBe(2);
  });
  it('exemplos: até 3 valores distintos de cada coluna', () => {
    expect(s.colunas[4].exemplos).toEqual(['UN', 'KG', 'M2']);
    expect(s.colunas[6].exemplos).toEqual(['MANUTENCAO', 'INSUMOS', 'USO']);
    expect(sugerirMapeamento(['A'], ['x']).colunas[0].exemplos).toEqual(['x']);
  });
  it('perfil SAP B1: o código da unidade (UomCode) vem antes do nome (InvntryUom) e a consulta traz o código', () => {
    const sap = CARGA_ERPS.find((e) => e.id === 'erp-sap-b1')!;
    const colunas: Record<string, string[]> = {};
    for (const i of sap.itens) if (i.tipo === 'COLUNA_EXPORT' && i.campo_erp) (colunas[i.chave] ??= []).push(i.campo_erp);
    expect(colunas.unidade).toEqual(['UomCode', 'InvntryUom']);
    const r = sugerirMapeamento(['ItemCode', 'ItemName', 'InvntryUom', 'UomCode'], [], { erp: 'SAP Business One', colunas });
    expect(r.mapeamento.unidade).toBe(3);
    expect(sap.itens.find((i) => i.tipo === 'CONSULTA_EXTRACAO' && /OITM/.test(i.texto))?.texto).toMatch(/T6\."UomCode"[\s\S]*LEFT JOIN "OUOM"/);
  });
});

describe('A2: saldo exportado ×1.000.000', () => {
  it('detecta a maior potência de 10 comum a todos os saldos não nulos (mínimo de valores)', () => {
    expect(detectarEscalaDoSaldo([24e6, 2e6, 0, null, 9.07e6])).toBe(1e6); // 9.070.000 = 9,07: nenhum saldo entre zero e um milhão
    expect(detectarEscalaDoSaldo([24e6, 2e6, 9e6])).toBe(1e6);
    expect(detectarEscalaDoSaldo([-24e6, 2e6, 9e6])).toBe(1e6);
    expect(detectarEscalaDoSaldo([24e6, 2e6])).toBe(1); // poucos valores
    expect(detectarEscalaDoSaldo([24e6, 2e6, 12.5])).toBe(1);
    expect(detectarEscalaDoSaldo([24e6, 5e5, 3e6])).toBe(1); // meio item (500.000) não é milhão
    expect(detectarEscalaDoSaldo(Array(10).fill(3000))).toBe(1e3);
    expect(detectarEscalaDoSaldo(Array(9).fill(3000))).toBe(1); // mil por acaso, base pequena
  });
  const linhas = [['A', 'x', '24000000'], ['B', 'y', '2000000'], ['C', 'z', '0'], ['D', 'w', '9070000']];
  const base = { cabecalho: ['Codigo', 'Descricao', 'Saldo'], linhas, ncmNumerico: [false, false, true] };
  const arq = { nome: 'a.xlsx', buffer: Buffer.from('x'), formato: 'xlsx' as const };
  const MAP = { mapeamento: { codigo: 0, descricao: 1, saldo: 2 }, colunasExtras: 'nenhuma' as const };
  it('a prévia avisa (detectada) e nada é dividido sem a escolha', () => {
    const r = conferirBase(base, MAP, arq);
    expect(r.relatorio.escalaSaldo).toMatchObject({ coluna: 'Saldo', detectada: 1e6, aplicada: 1, naoNulos: 3, exemplo: 24e6 });
    expect(r.itens.map((i) => i.saldo)).toEqual([24e6, 2e6, 0, 9.07e6]);
  });
  it('com a escolha "dividir por 1.000.000": saldos divididos, registro no relatório e a escala posterior dá 1 (não divide duas vezes)', () => {
    const r = conferirBase(base, { ...MAP, escalaSaldo: 1e6 }, arq);
    expect(r.itens.map((i) => i.saldo)).toEqual([24, 2, 0, 9.07]);
    expect(r.relatorio.escalaSaldo).toMatchObject({ detectada: 1e6, aplicada: 1e6 });
    expect(escalaDaBase(r.itens)).toBe(1);
    // Sem dividir, a detecção posterior continua achando a escala (o comportamento de antes).
    expect(escalaDaBase(conferirBase({ ...base, linhas: [...linhas.slice(0, 3), ['D', 'w', '5000000']] }, MAP, arq).itens)).toBe(1e6);
  });
  it('divisor que não cabe no arquivo, inválido ou sem coluna de saldo: recusado', () => {
    expect(() => conferirBase({ ...base, linhas: [...linhas, ['E', 'v', '12']] }, { ...MAP, escalaSaldo: 1e6 }, arq)).toThrow(/não estão na escala de 1\.000\.000/);
    expect(() => conferirBase(base, { ...MAP, escalaSaldo: 7 }, arq)).toThrow(/potência de 10/);
    expect(() => conferirBase(base, { mapeamento: { codigo: 0, descricao: 1 }, escalaSaldo: 1e6 }, arq)).toThrow(/Sem coluna de saldo/);
    expect(conferirBase(base, { mapeamento: { codigo: 0, descricao: 1 } }, arq).relatorio.escalaSaldo).toBeNull();
  });
  it('o serviço lê a escolha do formulário (vazio = 1)', () => {
    expect(lerEscalaSaldo(undefined)).toBe(1);
    expect(lerEscalaSaldo('')).toBe(1);
    expect(lerEscalaSaldo('1000000')).toBe(1e6);
    expect(() => lerEscalaSaldo('abc')).toThrow(/inteiro positivo/);
  });
});

describe('A15: CNAE 52.50-8 e transporte de carga', () => {
  it('52.50-8/04 (organização logística) vira Transporte de cargas e Armazenagem', () => {
    expect(sugerirAtividades('5250804').sugestoes.map((s) => s.atividade)).toEqual(['TRANSPORTE', 'ARMAZENAGEM']);
    expect(mapaDeAtividades(['5250-8/04']).semMapeamento).toEqual([]);
  });
  it('afins: OTM e agenciamento de cargas = transporte; despachante = serviço; ferroviário, aquaviário e aéreo de carga = transporte', () => {
    const at = (c: string) => sugerirAtividades(c).sugestoes.map((s) => s.atividade);
    expect(at('5250805')).toEqual(['TRANSPORTE']);
    expect(at('5250803')).toEqual(['TRANSPORTE']);
    expect(at('5250802')).toEqual(['PRESTACAO_SERVICO']);
    for (const c of ['4911600', '5011401', '5021101', '5120000', '4940000']) expect(at(c)).toEqual(['TRANSPORTE']);
  });
});
