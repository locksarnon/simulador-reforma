import { describe, expect, it } from 'vitest';
import { compararItem, montarPedido, situacaoDaNota } from './conferencia';
import { lerNotaIbsCbs } from './leitor-ibscbs';

const item = (n: number, ncm: string, cst: string, ct: string, vBC: string, vUF: string, vCBS: string, extra = '') => `
<det nItem="${n}"><prod><cProd>${n}</cProd><xProd>Produto ${n}</xProd><NCM>${ncm}</NCM><CFOP>5102</CFOP><vProd>1000.00</vProd></prod>
<imposto><ICMS><ICMS00><orig>0</orig><CST>00</CST><vBC>1000.00</vBC><pICMS>12.00</pICMS><vICMS>120.00</vICMS></ICMS00></ICMS>
<PIS><PISAliq><CST>01</CST><vBC>1000.00</vBC><pPIS>1.65</pPIS><vPIS>16.50</vPIS></PISAliq></PIS>
<COFINS><COFINSAliq><CST>01</CST><vBC>1000.00</vBC><pCOFINS>7.60</pCOFINS><vCOFINS>76.00</vCOFINS></COFINSAliq></COFINS>
<IBSCBS><CST>${cst}</CST><cClassTrib>${ct}</cClassTrib><gIBSCBS><vBC>${vBC}</vBC>
<gIBSUF><pIBSUF>0.10</pIBSUF>${extra}<vIBSUF>${vUF}</vIBSUF></gIBSUF><gIBSMun><pIBSMun>0.00</pIBSMun><vIBSMun>0.00</vIBSMun></gIBSMun><vIBS>${vUF}</vIBS>
<gCBS><pCBS>0.90</pCBS>${extra}<vCBS>${vCBS}</vCBS></gCBS></gIBSCBS></IBSCBS></imposto></det>`;
const XML = `<?xml version="1.0"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe Id="NFe41261100000000000191550010000000011000000011" versao="4.00">
<ide><cUF>41</cUF><mod>55</mod><serie>1</serie><nNF>1</nNF><dhEmi>2026-10-10T10:00:00-03:00</dhEmi><tpNF>1</tpNF><cMunFG>4106902</cMunFG><tpAmb>1</tpAmb></ide>
<emit><CNPJ>00000000000191</CNPJ><xNome>EMPRESA</xNome></emit>
${item(1, '84714900', '000', '000001', '787.50', '0.79', '7.09')}
${item(2, '84714900', '000', '000001', '1000.00', '1.00', '9.00')}
${item(3, '02074300', '200', '200003', '787.50', '0.00', '0.00', '<gRed><pRedAliq>100.00</pRedAliq><pAliqEfet>0.00</pAliqEfet></gRed>')}
</infNFe></NFe></nfeProc>`;

describe('leitura do grupo IBS/CBS da NF-e', () => {
  it('lê cabeçalho, componentes da base e o grupo de cada item', () => {
    const n = lerNotaIbsCbs(XML);
    expect(n).toMatchObject({ chave: '41261100000000000191550010000000011000000011', modelo: '55', municipio: '4106902', emitente: '00000000000191', ambiente: '1' });
    expect(n.itens).toHaveLength(3);
    expect(n.itens[0].componentes).toMatchObject({ vProd: 1000, vICMS: 120, vPIS: 16.5, vCOFINS: 76 });
    expect(n.itens[2].ibscbs).toMatchObject({ cst: '200', cClassTrib: '200003', vBC: 787.5 });
    expect(n.itens[2].ibscbs!.cbs).toMatchObject({ aliquota: 0.9, valor: 0, pRedAliq: 100 });
  });
  it('o pedido leva os componentes (a calculadora calcula a base) e, em 2026, nenhuma alíquota informada', () => {
    const p = montarPedido(lerNotaIbsCbs(XML));
    expect(p).toMatchObject({ dhFatoGerador: '2026-10-10T10:00:00-03:00', municipio: 4106902, tpDoc: 55 });
    expect(p.itens[0]).toEqual({ numero: 1, ncm: '84714900', cst: '000', cClassTrib: '000001', gComponentesBC: { vProd: 1000, vPIS: 16.5, vCOFINS: 76, vICMS: 120 } });
  });
});

describe('comparação com o resultado oficial', () => {
  const nota = lerNotaIbsCbs(XML);
  const ok = (n: number) => ({ nObj: n, estadoItem: 'CALCULADO', tribCalc: { IBSCBS: { gIBSCBS: { vBC: '787.50', gIBSUF: { vIBSUF: '0.79' }, gIBSMun: { vIBSMun: '0.00' }, vIBS: '0.79', gCBS: { vCBS: '7.09' } } } } });
  it('confere quando base e valores batem (tolerância de 1 centavo)', () => {
    expect(compararItem(nota.itens[0], ok(1), new Set()).situacao).toBe('CONFERE');
  });
  it('base sem tirar ICMS, PIS e Cofins (art. 12): divergente, com os campos', () => {
    const r = compararItem(nota.itens[1], ok(2), new Set());
    expect(r.situacao).toBe('DIVERGENTE');
    expect(r.campos.map((c) => c.campo)).toEqual(['Base de cálculo', 'IBS estadual', 'CBS']);
    expect(r.campos[0]).toEqual({ campo: 'Base de cálculo', nota: 1000, oficial: 787.5 });
  });
  it('NCM fora do anexo: enquadramento, com o código e a mensagem oficiais', () => {
    const r = compararItem(nota.itens[2], { nObj: 3, estadoItem: 'INCONSISTENCIA_ENTRADA', erros: [{ code: 'REG-011', title: 'NCM não vinculada', detail: 'NCM de código 02074300 não vinculada…' }] }, new Set());
    expect(r).toMatchObject({ situacao: 'ENQUADRAMENTO', erros: [{ codigo: 'REG-011', mensagem: 'NCM de código 02074300 não vinculada…' }] });
  });
  it('cClassTrib vigente na tabela oficial mas ausente na versão da calculadora: não coberto (não é erro da nota)', () => {
    const r = compararItem(nota.itens[0], { nObj: 1, estadoItem: 'INCONSISTENCIA_ENTRADA', erros: [{ code: 'REG-005' }] }, new Set(['000001']));
    expect(r.situacao).toBe('NAO_COBERTO');
  });
  it('diferença de 1 centavo é arredondamento da nota, não divergência', () => {
    const o = { nObj: 1, estadoItem: 'CALCULADO', tribCalc: { IBSCBS: { gIBSCBS: { vBC: '787.51', gIBSUF: { vIBSUF: '0.79' }, gIBSMun: { vIBSMun: '0.00' }, vIBS: '0.79', gCBS: { vCBS: '7.09' } } } } };
    expect(compararItem(nota.itens[0], o, new Set()).situacao).toBe('CONFERE');
    const dois = { ...o, tribCalc: { IBSCBS: { gIBSCBS: { ...o.tribCalc.IBSCBS.gIBSCBS, vBC: '787.52' } } } };
    expect(compararItem(nota.itens[0], dois, new Set()).situacao).toBe('DIVERGENTE');
  });
  it('a nota fica com a situação do pior item', () => {
    const itens = [compararItem(nota.itens[0], ok(1), new Set()), compararItem(nota.itens[1], ok(2), new Set())];
    expect(situacaoDaNota(itens)).toBe('DIVERGENTE');
  });
});
