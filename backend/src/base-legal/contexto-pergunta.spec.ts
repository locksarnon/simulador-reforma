import { describe, expect, it } from 'vitest';
import { ncmsDaPergunta, palavrasDaDescricao, textoDoContexto, trechoRelevante, ufsDaPergunta, variantesNcm } from './contexto-pergunta';
import { promptResposta, REGRAS_PERGUNTA_LEIGA } from './base-legal.assistente';

describe('UF na pergunta, do jeito que o usuário escreve', () => {
  it.each([
    ['o NCM 1201.90.00 tem incidência de ICMS no Pará?', ['PA']],
    ['soja paga icms no para?', ['PA']],
    ['qual o icms do milho em MT', ['MT']],
    ['e no mato grosso do sul? e em mato grosso?', ['MS', 'MT']],
    ['venda de gado de goias pra minas', ['GO', 'MG']],
    ['ICMS SP x BA na venda interestadual', ['SP', 'BA']],
    ['isso serve para quem vende soja?', []],
    ['preciso disso para a empresa', []],
    // Sigla em minúsculas, como o leigo escreve (em produção, "qual a aliquota do icms do adubo no ms" saía sem UF)
    ['qual a aliquota do icms do adubo no ms', ['MS']],
    ['icms do milho em mt e go', ['MT', 'GO']],
    ['vendo pro pr ou pra sc', ['PR', 'SC']],
    ['soja no pa tem icms?', ['PA']],
    ['tem diferimento no ma?', ['MA']],
    ['em se tratando de soja, tem icms?', []],
    ['o que diz a lei ao pé da letra', []],
    ['agiu de ma fe na venda', []],
  ])('%s → %j', (pergunta, ufs) => {
    expect(ufsDaPergunta(pergunta)).toEqual(ufs);
  });
});

describe('NCM na pergunta, em qualquer formato', () => {
  it('8 dígitos com ou sem pontos, subposição e posição com a palavra NCM', () => {
    expect(ncmsDaPergunta('o NCM 1201.90.00 tem ICMS?')).toEqual([{ codigo: '12019000', nivel: 'item' }]);
    expect(ncmsDaPergunta('ncm 12019000 no MT')).toEqual([{ codigo: '12019000', nivel: 'item' }]);
    expect(ncmsDaPergunta('e o 1005.90?')).toEqual([{ codigo: '100590', nivel: 'subposicao' }]);
    expect(ncmsDaPergunta('NCM 1201 é isento?')).toEqual([{ codigo: '1201', nivel: 'posicao' }]);
    expect(ncmsDaPergunta('a lei 10.925 de 2004')).toEqual([]);
    expect(ncmsDaPergunta('R$ 1.201,90 de imposto')).toEqual([]);
  });

  it('variantes para achar o código nos textos, do mais específico ao mais geral', () => {
    expect(variantesNcm({ codigo: '12019000', nivel: 'item' })).toEqual(['1201.90.00', '12019000', '1201.90.0', '1201.90', '1201.9', '12.01', '1201']);
    expect(variantesNcm({ codigo: '1201', nivel: 'posicao' })).toEqual(['12.01', '1201']);
  });

  it('palavras de busca da descrição do NCM', () => {
    expect(palavrasDaDescricao('Soja, mesmo triturada, exceto para semeadura')).toEqual(['soja', 'triturada', 'semeadura']);
  });
});

describe('anexo longo: a IA recebe o trecho que importa', () => {
  const anexo = ['ANEXO II', 'DA REDUÇÃO DE BASE DE CÁLCULO', 'Item | Descrição | NCM', ...Array.from({ length: 50 }, (_, i) => `${i + 1} | Produto ${i + 1} | 0000.00.${String(i).padStart(2, '0')}`), '51 | Soja em grão | 1201.90.00', '52 | Farelo | 2304.00.10'].join('\n');

  it('cabeçalho do anexo e as linhas que citam o código ou o produto, com a vizinha', () => {
    const t = trechoRelevante(anexo, ['1201.90.00', 'soja'])!;
    expect(t.startsWith('ANEXO II\nDA REDUÇÃO DE BASE DE CÁLCULO')).toBe(true);
    expect(t).toContain('51 | Soja em grão | 1201.90.00');
    expect(t).toContain('52 | Farelo | 2304.00.10');
    expect(t).not.toContain('Produto 10 |');
  });

  it('nada que cite a pergunta: o anexo fica de fora', () => {
    expect(trechoRelevante(anexo, ['algodão'])).toBeNull();
  });
});

describe('o que a IA recebe', () => {
  it('contexto com o estado e o NCM (com a descrição da tabela) e o aviso quando a base não tem o estado', () => {
    const t = textoDoContexto(['PA', 'AC'], [{ codigo: '12019000', descricao: 'Soja, mesmo triturada' }, { codigo: '99999999', descricao: null }], ['PA', 'MT']);
    expect(t).toContain('Estado citado: PA (Pará). A base tem a legislação do ICMS deste estado');
    expect(t).toContain('Estado citado: AC (Acre). A base NÃO tem a legislação do ICMS deste estado');
    expect(t).toContain('NCM citado: 1201.90.00 — Soja, mesmo triturada');
    expect(t).toContain('9999.99.99 — o código não está na tabela NCM do InTAX');
  });

  it('o prompt traz o contexto e as regras para quem não é da área', () => {
    const p = promptResposta('soja tem icms no para?', [{ chave: 'pa-dec-4676-2001', numero: 'Decreto 4.676/2001 (PA)', rotulo: 'Art. 3º', caminho: 'art-3', secao: null, texto: 'Art. 3º ...' }], 'Contexto identificado na pergunta:\n- Estado citado: PA (Pará).');
    expect(p).toContain('Contexto identificado na pergunta:');
    expect(p).toContain(REGRAS_PERGUNTA_LEIGA);
    expect(p).toContain('Comece SEMPRE pela resposta direta');
    expect(p).toContain('Para confirmar no seu caso:');
  });
});
