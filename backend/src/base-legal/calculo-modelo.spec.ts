import { describe, expect, it } from 'vitest';
import type { Candidato } from './base-legal.assistente';
import { avaliarConta, calculoEmTexto, conferirCalculo, conferirPratica, formatarValor, numerosDoTexto } from './calculo-modelo';

const MS: Candidato = {
  chave: 'ms-ricms-anexo-i', numero: 'Anexo I do RICMS (MS)', rotulo: 'Art. 59-A', caminho: 'art-59-a', secao: null,
  texto: 'Art. 59-A. Fica reduzida a base de cálculo do ICMS nas operações com adubos e fertilizantes, de forma que a carga tributária seja equivalente a 4% (quatro por cento) do valor da operação. § 1º A redução é de 60% (sessenta por cento) e a alíquota interna é de 18% (dezoito por cento), até o limite anual de R$ 3.600.000,00.',
};
const valores = (o: Record<string, number>) => new Map(Object.entries(o));
const conta = (linhas: unknown[], extra: Record<string, unknown> = {}) => ({
  formula: 'ICMS = valor da operação × carga efetiva',
  premissas: [{ id: 'P1', descricao: 'Valor da venda (exemplo)', valor: 100000, unidade: 'R$' }],
  parametros: [{ id: 'A1', descricao: 'Carga efetiva do ICMS', valor: 4, unidade: '%', fundamento: 'ms-ricms-anexo-i/art-59-a' }],
  linhas, ...extra,
});

describe('conta do cálculo modelo (só P#, A#, L#, + - * / e parênteses)', () => {
  it('respeita a precedência, os parênteses e o sinal', () => {
    expect(avaliarConta('P1 + P2 * A1', valores({ P1: 10, P2: 5, A1: 2 }))).toBe(20);
    expect(avaliarConta('(P1 + P2) * A1', valores({ P1: 10, P2: 5, A1: 2 }))).toBe(30);
    expect(avaliarConta('-P1 + 1', valores({ P1: 3 }))).toBe(-2);
    expect(avaliarConta('P1 × (1 − A1) ÷ P2', valores({ P1: 100, A1: 0.6, P2: 2 }))).toBeCloseTo(20);
  });

  it('número direto na conta só o 1; o resto precisa ser premissa ou parâmetro com o artigo', () => {
    expect(() => avaliarConta('P1 * 0.04', valores({ P1: 100 }))).toThrow('o número 0.04 entrou direto na conta');
    expect(() => avaliarConta('P1 * A1 / 100', valores({ P1: 100, A1: 0.04 }))).toThrow('o número 100');
  });

  it('recusa conta com referência desconhecida, divisão por zero ou mal formada', () => {
    expect(() => avaliarConta('P1 * A9', valores({ P1: 1 }))).toThrow('A9, que não foi definido antes');
    expect(() => avaliarConta('P1 / P2', valores({ P1: 1, P2: 0 }))).toThrow('divide por zero');
    expect(() => avaliarConta('(P1 * P2', valores({ P1: 1, P2: 2 }))).toThrow('parêntese');
    expect(() => avaliarConta('P1 ** P2', valores({ P1: 1, P2: 2 }))).toThrow();
    expect(() => avaliarConta('Math.max(P1)', valores({ P1: 1 }))).toThrow('não é permitido');
  });
});

describe('cálculo modelo conferido pelo InTAX', () => {
  it('refaz a conta, mostra os valores como o leitor lê e liga o parâmetro ao artigo', () => {
    const { calculo, motivo } = conferirCalculo(conta([{ id: 'L1', descricao: 'ICMS da operação', expressao: 'P1 * A1', unidade: 'R$', resultado: 4000 }]), [MS]);
    expect(motivo).toBeNull();
    expect(calculo!.linhas[0]).toMatchObject({ resultado: 4000, valor_texto: 'R$ 4.000,00', conta: 'R$ 100.000,00 × 4%' });
    expect(calculo!.parametros[0].fundamento).toEqual({ norma: 'ms-ricms-anexo-i', numero: 'Anexo I do RICMS (MS)', rotulo: 'Art. 59-A', caminho: 'art-59-a' });
    expect(calculo!.ajustes).toEqual([]);
  });

  it('encadeia linhas: percentual que sobra da redução (em %) e base reduzida (em R$)', () => {
    const bruto = {
      formula: 'ICMS = valor × (1 − redução) × alíquota',
      premissas: [{ id: 'P1', descricao: 'Valor da venda (exemplo)', valor: 100000, unidade: 'R$' }],
      parametros: [
        { id: 'A1', descricao: 'Redução da base de cálculo', valor: 60, unidade: '%', fundamento: 'ms-ricms-anexo-i/art-59-a' },
        { id: 'A2', descricao: 'Alíquota interna', valor: 18, unidade: '%', fundamento: 'ms-ricms-anexo-i/art-59-a' },
      ],
      linhas: [
        { id: 'L1', descricao: 'Parte da base que fica', expressao: '1 - A1', unidade: '%', resultado: 40 },
        { id: 'L2', descricao: 'Base reduzida', expressao: 'P1 * L1', unidade: 'R$', resultado: 40000 },
        { id: 'L3', descricao: 'ICMS devido', expressao: 'L2 * A2', unidade: 'R$', resultado: 7200 },
      ],
    };
    const { calculo, motivo } = conferirCalculo(bruto, [MS]);
    expect(motivo).toBeNull();
    expect(calculo!.linhas.map((l) => [l.valor_texto, l.conta])).toEqual([
      ['40%', '100% − 60%'],
      ['R$ 40.000,00', 'R$ 100.000,00 × 40%'],
      ['R$ 7.200,00', 'R$ 40.000,00 × 18%'],
    ]);
  });

  it('conta que o modelo errou vale a do InTAX, com o ajuste dito (até 5 centavos é arredondamento)', () => {
    const errada = conferirCalculo(conta([{ id: 'L1', descricao: 'ICMS da operação', expressao: 'P1 * A1', unidade: 'R$', resultado: 4500 }]), [MS]);
    expect(errada.calculo!.linhas[0].resultado).toBe(4000);
    expect(errada.calculo!.ajustes).toEqual(['ICMS da operação: o modelo chegou a R$ 4.500,00; a conta dá R$ 4.000,00 e vale a do InTAX.']);
    const arredondada = conferirCalculo(conta([{ id: 'L1', descricao: 'ICMS da operação', expressao: 'P1 * A1', unidade: 'R$', resultado: 4000.03 }]), [MS]);
    expect(arredondada.calculo!.ajustes).toEqual([]);
  });

  it('percentual tratado como inteiro (resultado 100 vezes maior) derruba o cálculo em vez de "corrigir"', () => {
    const r = conferirCalculo(conta([{ id: 'L1', descricao: 'ICMS da operação', expressao: 'P1 * A1', unidade: 'R$', resultado: 400000 }]), [MS]);
    expect(r.calculo).toBeNull();
    expect(r.motivo).toContain('percentual tratado como número inteiro');
  });

  it('número da lei que não está no texto do artigo citado derruba o cálculo inteiro', () => {
    const r = conferirCalculo(conta([{ id: 'L1', descricao: 'ICMS', expressao: 'P1 * A1', unidade: 'R$' }], {
      parametros: [{ id: 'A1', descricao: 'Alíquota interna', valor: 17, unidade: '%', fundamento: 'ms-ricms-anexo-i/art-59-a' }],
    }), [MS]);
    expect(r.calculo).toBeNull();
    expect(r.motivo).toBe('o número 17% ("Alíquota interna") não está no texto de Anexo I do RICMS (MS), Art. 59-A');
  });

  it('parâmetro sem dispositivo consultado, premissa incompleta ou conta sem linhas não viram cálculo', () => {
    expect(conferirCalculo(conta([{ id: 'L1', descricao: 'x', expressao: 'P1 * A1' }], {
      parametros: [{ id: 'A1', descricao: 'Alíquota', valor: 4, unidade: '%', fundamento: 'lcp-87-1996/art-12' }],
    }), [MS]).motivo).toContain('não veio com um dos dispositivos consultados');
    expect(conferirCalculo(conta([{ id: 'L1', descricao: 'x', expressao: 'P1' }], { premissas: [{ id: 'P1', descricao: '', valor: 1 }] }), [MS]).motivo).toContain('premissa');
    expect(conferirCalculo(conta([]), [MS]).motivo).toContain('sem as contas');
    expect(conferirCalculo(conta([{ id: 'L1', descricao: 'ICMS', expressao: 'P1 * 0.04', unidade: 'R$' }]), [MS]).motivo).toContain('ICMS: o número 0.04 entrou direto na conta');
  });
});

describe('parte prática da resposta', () => {
  it('passos limpos e, sem número da lei, o motivo de não haver cálculo', () => {
    const p = conferirPratica({ passos: ['  Confira o NCM na nota.  ', '', 'Emita a NF-e com o CST do diferimento.'], calculo: null, sem_calculo: 'A alíquota interna não está nos dispositivos fornecidos.' }, [MS]);
    expect(p).toEqual({ passos: ['Confira o NCM na nota.', 'Emita a NF-e com o CST do diferimento.'], calculo: null, sem_calculo: 'A alíquota interna não está nos dispositivos fornecidos.' });
  });

  it('cálculo descartado vira explicação; pergunta só conceitual fica sem parte prática', () => {
    const p = conferirPratica({ passos: ['Passo.'], calculo: conta([{ id: 'L1', descricao: 'ICMS', expressao: 'P1 * 0.17', unidade: 'R$' }]) }, [MS]);
    expect(p!.calculo).toBeNull();
    expect(p!.sem_calculo).toContain('O cálculo modelo não foi exibido porque ICMS: o número 0.17 entrou direto na conta');
    expect(p!.sem_calculo).toContain('Nenhum número sem base legal vai para a tela');
    expect(conferirPratica(null, [MS])).toBeNull();
    expect(conferirPratica({ passos: [], calculo: null, sem_calculo: null }, [MS])).toBeNull();
  });

  it('cálculo em texto, para copiar e para o e-mail', () => {
    const { calculo } = conferirCalculo(conta([{ id: 'L1', descricao: 'ICMS da operação', expressao: 'P1 * A1', unidade: 'R$', resultado: 4000 }]), [MS]);
    expect(calculoEmTexto(calculo!)).toEqual([
      'Fórmula: ICMS = valor da operação × carga efetiva',
      'Valor da venda (exemplo): R$ 100.000,00 (exemplo)',
      'Carga efetiva do ICMS: 4% (Anexo I do RICMS (MS), Art. 59-A)',
      'ICMS da operação: R$ 100.000,00 × 4% = R$ 4.000,00',
    ]);
  });
});

describe('números e formato', () => {
  it('lê os números do texto da lei no padrão brasileiro', () => {
    expect(numerosDoTexto('carga de 4% e 1,6%, limite de R$ 3.600.000,00 em 12 meses')).toEqual([4, 1.6, 3600000, 12]);
  });

  it('formata moeda, percentual e quantidade como o leitor lê', () => {
    expect(formatarValor(1234.5, 'R$')).toBe('R$ 1.234,50');
    expect(formatarValor(1.6, '%')).toBe('1,6%');
    expect(formatarValor(12, '')).toBe('12');
  });
});
