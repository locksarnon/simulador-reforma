import { describe, expect, it } from 'vitest';
import { achatarItem, compararBases, type EntradaAtual, type EntradaNova } from './reimportacao';

const atual = (campos: EntradaAtual['campos'], camposComDecisao: string[] = []): EntradaAtual => ({ campos, camposComDecisao });

describe('reimportação: compararBases', () => {
  const atuais = new Map<string, EntradaAtual>([
    ['0:|B', atual({ descricao: 'Parafuso', ncm: '73181500', unidade: 'UN' })],
    ['0:|A', atual({ descricao: 'Porca', ncm: '73181600', unidade: 'UN' }, ['ncm'])],
    ['0:|C', atual({ descricao: 'Arruela', ncm: '73182200', unidade: 'UN' }, ['ncm'])],
    ['0:|Z', atual({ descricao: 'Sumiu', ncm: '00000000', unidade: 'UN' })],
  ]);
  const novos = new Map<string, EntradaNova>([
    ['0:|B', { campos: { descricao: 'Parafuso', ncm: '73181500', unidade: 'UN' } }], // inalterado
    ['0:|A', { campos: { descricao: 'Porca M10', ncm: '73181690', unidade: 'UN' } }], // descrição muda; NCM tem decisão: conflito
    ['0:|C', { campos: { descricao: 'Arruela', ncm: '73182200', unidade: 'PC' } }], // só unidade muda (sem decisão)
    ['0:|N', { campos: { descricao: 'Novo', ncm: '12345678', unidade: 'KG' } }],
  ]);
  const r = compararBases(atuais, novos, { camposComparados: ['descricao', 'ncm', 'unidade'] });

  it('separa novos, ausentes, inalterados e alterados por campo', () => {
    expect(r.novos.map((n) => n.chave)).toEqual(['0:|N']);
    expect(r.ausentes).toEqual(['0:|Z']); // nunca removidos automaticamente
    expect(r.inalterados).toEqual(['0:|B']);
    expect(r.alterados.map((a) => a.chave)).toEqual(['0:|A', '0:|C']); // ordenado pela chave
    expect(r.alterados[0].mudancas).toEqual([
      { campo: 'descricao', antes: 'Porca', depois: 'Porca M10', comDecisao: false },
      { campo: 'ncm', antes: '73181600', depois: '73181690', comDecisao: true },
    ]);
    expect(r.alterados[1].mudancas).toEqual([{ campo: 'unidade', antes: 'UN', depois: 'PC', comDecisao: false }]);
  });
  it('conflito = campo com decisão aprovada que o arquivo novo altera', () => {
    expect(r.conflitos).toEqual([{ chave: '0:|A', campo: 'ncm', antes: '73181600', depois: '73181690' }]);
    expect(r.resumo).toEqual({ novos: 1, ausentes: 1, inalterados: 1, alterados: 2, conflitos: 1 });
  });
  it('campo com decisão que NÃO muda não é conflito', () => {
    const x = compararBases(new Map([['k', atual({ ncm: '1' }, ['ncm'])]]), new Map([['k', { campos: { ncm: '1' } }]]), { camposComparados: ['ncm'] });
    expect(x.conflitos).toEqual([]);
    expect(x.inalterados).toEqual(['k']);
  });
  it('é determinístico (independe da ordem de inserção) e serializável', () => {
    const inv = compararBases(new Map([...atuais].reverse()), new Map([...novos].reverse()), { camposComparados: ['descricao', 'ncm', 'unidade'] });
    expect(JSON.stringify(inv)).toBe(JSON.stringify(r));
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });
  it('vazio, nulo e espaços são iguais; zeros à esquerda contam; sem camposComparados usa a união', () => {
    const x = compararBases(
      new Map([['k', atual({ a: null, b: '00123', c: '  x  ' })]]),
      new Map([['k', { campos: { a: '', b: '123', c: 'x', d: 'novo' } }]]),
    );
    expect(x.alterados[0].mudancas.map((m) => m.campo)).toEqual(['b', 'd']);
  });
  it('achatarItem leva os campos adicionais com prefixo', () => {
    const p = achatarItem({ descricao: 'X', unidade: null, ncm: '01012100', grupo: null, ativo: true, saldo: 3, ultimaMovimentacao: null, fabricante: null, referencia: null, finalidade: null, campos: { Cor: 'azul' } });
    expect(p).toMatchObject({ ncm: '01012100', 'campos.Cor': 'azul', ativo: true });
  });
});
