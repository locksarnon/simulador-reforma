import { describe, expect, it } from 'vitest';
import { buscarCartoes, radicais } from './cartoes.busca';
import { CARTOES_INICIAIS } from './cartoes-iniciais';

const base = CARTOES_INICIAIS.map((c, i) => ({ id: String(i), pergunta: c.pergunta, sinonimos: c.sinonimos, resposta: c.resposta, tema: c.tema }));
const topo = (q: string) => buscarCartoes(q, base)[0]?.pergunta ?? null;

describe('busca de cartões de perguntas frequentes', () => {
  it('ignora acento, plural e palavras vazias', () => {
    expect(radicais('Até quanto os PRODUTORES rurais são contribuíntes?')).toEqual(['produt', 'rurais', 'contri']);
  });

  it('acha o cartão certo com palavras diferentes das da pergunta cadastrada', () => {
    expect(topo('até quanto de faturamento o agricultor fica fora do IBS')).toContain('limite de receita para o produtor rural');
    expect(topo('produtor passou do teto no meio do ano vira contribuinte quando')).toContain('ultrapassar o limite');
    expect(topo('split payment com cartão parcelado')).toContain('vendas parceladas');
    expect(topo('imposto seletivo mineração alíquota máxima')).toContain('Imposto Seletivo');
    expect(topo('cesta básica alíquota zero arroz feijão')).toContain('Cesta Básica');
    expect(topo('restaurante crédito para quem compra')).toContain('bares e restaurantes');
  });

  it('não devolve nada para pergunta fora do assunto', () => {
    expect(buscarCartoes('carros voadores em Marte', base)).toEqual([]);
    expect(buscarCartoes('', base)).toEqual([]);
  });
});
