import { describe, it, expect } from 'vitest';
import { parseXml, getFirst, getAll, getText, getFirstDeep, getTextDeep, getAttr, identificarTipoXml } from './xml-parser';

describe('parseXml', () => {
  it('rejeita conteúdo vazio', () => {
    expect(() => parseXml('')).toThrow();
  });

  it('rejeita XML maior que o limite de tamanho', () => {
    const grande = '<a>' + 'x'.repeat(3 * 1024 * 1024) + '</a>';
    expect(() => parseXml(grande)).toThrow();
  });

  it('parseia XML bem-formado', () => {
    const doc = parseXml('<a><b>texto</b></a>');
    expect(doc.documentElement.localName).toBe('a');
  });
});

describe('getFirst / getAll / getText', () => {
  const doc = parseXml('<root><item>1</item><item>2</item><Outro>x</Outro></root>');
  const root = doc.documentElement;

  it('getFirst busca por localName case-insensitive', () => {
    expect(getText(root, 'outro')).toBe('x');
  });

  it('getAll retorna todos os filhos com o mesmo nome', () => {
    expect(getAll(root, 'item')).toHaveLength(2);
  });

  it('getText retorna string vazia quando o elemento não existe', () => {
    expect(getText(root, 'inexistente')).toBe('');
  });
});

describe('getFirstDeep / getTextDeep', () => {
  it('encontra elemento aninhado em qualquer profundidade (ex: ICMS > ICMS00 > pICMS)', () => {
    const doc = parseXml('<imposto><ICMS><ICMS00><pICMS>18.0000</pICMS></ICMS00></ICMS></imposto>');
    expect(getTextDeep(doc.documentElement, 'pICMS')).toBe('18.0000');
  });

  it('retorna vazio quando não encontra em nenhuma profundidade', () => {
    const doc = parseXml('<a><b><c>x</c></b></a>');
    expect(getTextDeep(doc.documentElement, 'naoexiste')).toBe('');
  });
});

describe('getAttr', () => {
  it('lê atributo case-insensitive', () => {
    const doc = parseXml('<infNFe Id="NFe123"><x/></infNFe>');
    expect(getAttr(doc.documentElement, 'id')).toBe('NFe123');
  });
});

describe('identificarTipoXml', () => {
  const tipoDe = (xml: string) => identificarTipoXml(parseXml(xml));

  it('reconhece NF-e processada e NF-e avulsa', () => {
    expect(tipoDe('<nfeProc><NFe/></nfeProc>')).toBe('NFE_PROC');
    expect(tipoDe('<NFe><infNFe/></NFe>')).toBe('NFE');
  });

  it('distingue evento de cancelamento de carta de correção pelo tpEvento', () => {
    expect(tipoDe('<procEventoNFe><evento><infEvento><tpEvento>110111</tpEvento></infEvento></evento></procEventoNFe>')).toBe('EVENTO_CANCELAMENTO');
    expect(tipoDe('<procEventoNFe><evento><infEvento><tpEvento>110110</tpEvento></infEvento></evento></procEventoNFe>')).toBe('EVENTO_CARTA_CORRECAO');
    expect(tipoDe('<procEventoNFe><evento><infEvento><tpEvento>999999</tpEvento></infEvento></evento></procEventoNFe>')).toBe('EVENTO_OUTRO');
  });

  it('reconhece CT-e, MDF-e e NFS-e nacional pela raiz (sem extrair itens)', () => {
    expect(tipoDe('<cteProc><CTe/></cteProc>')).toBe('CTE');
    expect(tipoDe('<CTe><infCte/></CTe>')).toBe('CTE');
    expect(tipoDe('<mdfeProc><MDFe/></mdfeProc>')).toBe('MDFE');
    expect(tipoDe('<MDFe><infMDFe/></MDFe>')).toBe('MDFE');
    expect(tipoDe('<NFSe><infNFSe/></NFSe>')).toBe('NFSE');
  });

  it('classifica qualquer outra raiz como desconhecida', () => {
    expect(tipoDe('<algumaCoisaAleatoria/>')).toBe('XML_DESCONHECIDO');
  });
});
