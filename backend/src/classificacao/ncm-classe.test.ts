import { describe, expect, it } from 'vitest';
import { avaliarNcm, prepararLista, CorrelacaoNcmRow } from './ncm-classe';

const linha = (anexo: string, item_lei: number, ncm: string, c_class_trib: string, excecao = false): CorrelacaoNcmRow =>
  ({ anexo, item_lei, ncm, c_class_trib, descricao_produto: null, excecao });

describe('correlação NCM × anexos: exceções e ressalvas da lei', () => {
  const lista = prepararLista([
    linha('I', 19, '02.07', '200003'), linha('I', 19, '0207.43.00', '200003', true), linha('I', 19, '0207.53.00', '200003', true),
    linha('XV', 2, '07.09', '200014'), linha('XV', 2, '0709.5', '200014', true),
    linha('VII', 4, '11.02', '200034'), linha('I', 6, '1102.20.00', '200003'),
    linha('VII', 14, '07', '200034'), linha('VII', 14, '07.11', '200034', true),
  ]);
  it('código que a lei exclui ("exceto") não recebe a classe do item', () => {
    expect(avaliarNcm('0207.43.00', lista).encontrado).toBe(false);
    expect(avaliarNcm('0207.11.00', lista).esperado).toBe('200003');
    expect(avaliarNcm('0709.51.00', lista).classes).not.toContain('200014');
  });
  it('linha de exceção nunca vira sugestão', () => {
    expect(lista.some((l) => l.excecao)).toBe(false);
  });
  it('Anexo XII: códigos excluídos pelo texto do item (1.3 e 11) não recebem a classe', () => {
    const xii = prepararLista([
      linha('XII', 1, '9018.19.80', '200004'), linha('XII', 1, '9018.14.10', '200004', true), linha('XII', 1, '9018.19.10', '200004', true),
      linha('XII', 11, '9022.21.90', '200004'), linha('XII', 11, '9022.21.10', '200004', true), linha('XII', 11, '9022.21.20', '200004', true),
    ]);
    expect(avaliarNcm('9018.19.80', xii).esperado).toBe('200004');
    expect(avaliarNcm('9018.14.10', xii).encontrado).toBe(false);
    expect(avaliarNcm('9018.19.10', xii).encontrado).toBe(false);
    expect(avaliarNcm('9022.21.90', xii).esperado).toBe('200004');
    expect(avaliarNcm('9022.21.10', xii).encontrado).toBe(false);
    expect(avaliarNcm('9022.21.20', xii).encontrado).toBe(false);
  });
  it('Anexo VII cede ao Anexo I ("ressalvados os produtos relacionados no Anexo I")', () => {
    expect(avaliarNcm('1102.20.00', lista).classes).toEqual(['200003']);
    expect(avaliarNcm('1102.90.00', lista).esperado).toBe('200034');
  });
  it('Anexo VII item 14: 07.11 excetuada e o Anexo XV prevalece', () => {
    expect(avaliarNcm('0711.20.10', lista).encontrado).toBe(false);
    expect(avaliarNcm('0709.20.00', lista).classes).toEqual(['200014']);
  });
});
