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

  it('palavras do assunto da base inteira (IBS, CBS, incidência) sozinhas não casam cartão', () => {
    // O cartão do Simples ("Comprar de fornecedor do Simples gera crédito de IBS e CBS?") não responde sobre soja.
    const simples = base.filter((c) => /Simples/.test(c.pergunta));
    expect(simples.length).toBeGreaterThan(0);
    expect(buscarCartoes('venda de soja tem incidência de IBS e CBS?', base).map((c) => c.pergunta)).not.toContain(simples[0].pergunta);
    expect(buscarCartoes('tem incidência de IBS e CBS?', base)).toEqual([]);
    // e o que depende dessas palavras junto de outras continua achando
    expect(topo('split payment com cartão parcelado')).toContain('vendas parceladas');
  });

  describe('peso por raridade e cobertura da pergunta (sem lista de palavras)', () => {
    const c = (id: string, pergunta: string, resposta: string, sinonimos = '', tema = 'Geral') => ({ id, pergunta, sinonimos, resposta, tema });
    // IBS e CBS estão em todos os cartões (como na base real): sozinhas não podem casar nada.
    const pequena = [
      c('1', 'Como funciona o split payment do IBS e da CBS?', 'O split payment separa o IBS e a CBS no pagamento.', 'pagamento dividido'),
      c('2', 'Qual o limite de receita do produtor rural no IBS e na CBS?', 'O produtor rural fora do IBS e da CBS tem limite de receita.', 'teto agricultor'),
      c('3', 'Comprar do Simples gera crédito de IBS e CBS?', 'O adquirente apropria crédito de IBS e CBS.', 'fornecedor simples'),
      c('4', 'O que é o Imposto Seletivo e como entra na conta de IBS e CBS?', 'O Imposto Seletivo recai sobre produtos nocivos, fora da base do IBS e da CBS.', 'seletivo nocivo'),
      c('5', 'Quais produtos têm alíquota zero de IBS e CBS na cesta básica?', 'A cesta básica tem alíquota zero de IBS e CBS.', 'arroz feijão'),
    ];
    it('assunto que nenhum cartão tem não casa por causa das palavras comuns (qualquer assunto, não só soja)', () => {
      for (const q of ['venda de soja tem incidência de IBS e CBS?', 'frete de café paga IBS e CBS?', 'venda de gado tem IBS e CBS?', 'exportação de minério tem IBS e CBS?']) {
        expect(buscarCartoes(q, pequena), q).toEqual([]);
      }
    });
    it('pergunta só com palavras comuns à base inteira não casa nada', () => {
      expect(buscarCartoes('tem incidência de IBS e CBS?', pequena)).toEqual([]);
      expect(buscarCartoes('IBS e CBS', pequena)).toEqual([]);
    });
    it('cartão que explica a pergunta inteira continua sendo achado, com palavras diferentes das do cartão', () => {
      expect(buscarCartoes('como é o split payment?', pequena)[0]?.id).toBe('1');
      expect(buscarCartoes('teto do agricultor no IBS', pequena)[0]?.id).toBe('2');
      expect(buscarCartoes('fornecedor do Simples dá crédito?', pequena)[0]?.id).toBe('3');
    });
    it('palavra que o cartão não tem derruba a cobertura (o assunto da pergunta é outro)', () => {
      // "split payment" existe, mas "soja" não: o cartão não responde à pergunta inteira.
      expect(buscarCartoes('split payment na venda de soja', pequena)).toEqual([]);
    });
  });

  it('não devolve nada para pergunta fora do assunto', () => {
    expect(buscarCartoes('carros voadores em Marte', base)).toEqual([]);
    expect(buscarCartoes('', base)).toEqual([]);
  });
});
